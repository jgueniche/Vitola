-- =============================================================================
-- VITOLA — 0010 : le fil, l'abonnement, la braise, le blocage (§5.6)
-- -----------------------------------------------------------------------------
-- Applique l'ADR 0007, acceptée le 23 août 2026 :
--   docs/adr/0007-le-fil-social-et-ce-qui-le-lit.md
--
-- Les cinq décisions qu'elle a prises, et où elles vivent dans ce fichier :
--   D1  Abonnement libre, asymétrique, révocable des deux côtés        → §2, §9
--   D2  Le fil est `posts` ; le carnet y entre par une publication     → §2, §5
--   D3  Le keyset est un objet de schéma, pas une clause               → §4, §6
--   D4  Le blocage est une policy RESTRICTIVE                          → §3, §9
--   D5  `show_humidor` ouvre les caves, jamais le grand livre ni le prix → §3, §7, §9
--
-- Et les trois dettes que cette migration referme :
--   1. La branche `followers` de la policy SELECT de `reviews`          → §9
--   2. `privacy.show_humidor`, lu pour la première fois                 → §3, §9
--   3. `privacy.show_reviews` / `show_country`, que l'écran de profil lit
--      (côté application : la RLS n'a rien à dire d'un champ d'affichage)
--
-- Ordre de lecture, qui est aussi l'ordre des dépendances :
--   §1  Enums
--   §2  Tables
--   §3  Accesseurs SECURITY DEFINER
--   §4  Index — dont les deux du keyset
--   §5  Triggers
--   §6  feed_page() — le keyset, en SECURITY INVOKER
--   §7  shared_humidor_shelf() — la projection, en SECURITY DEFINER
--   §8  Grants
--   §9  Row Level Security
--   §10 mod.reports — deux cibles de plus
--   §11 Auto-contrôle
--
-- Ce que ce fichier ne fait PAS, et pourquoi :
--   `clubs`, `events`, `conversations` et `messages` (§5.6) ne sont pas créés.
--   Le §9 borne P3 à « profils, follows, feed, publications, braises,
--   commentaires » et son critère de sortie ne parle que du fil. Chacun est une
--   table et des écrans à part entière ; la messagerie est en outre un régime de
--   données différent — un message privé sur une donnée art. 9 n'est pas une
--   publication. Voir la question ouverte de l'ADR 0007.
-- =============================================================================

begin;

-- =============================================================================
-- §1 · ENUMS
-- =============================================================================

-- Les quatre types du §5.6. `post` est la note libre ; `session` est le « je
-- fume » du moment, qui n'est pas le carnet — le carnet est rétrospectif et
-- privé par défaut, une session est un présent qu'on annonce ; `review_share`
-- pointe une entrée de carnet ; `question` s'adresse à ceux qui savent.
create type public.post_kind as enum ('post', 'session', 'review_share', 'question');

-- « Réaction principale nommée braise plutôt que like » (§5.6). « Principale »
-- suppose qu'il y en aura d'autres : l'enum existe pour cela, avec une seule
-- valeur. Elle n'apparaît dans aucune policy, donc en ajouter une plus tard ne
-- coûtera pas les deux migrations qu'a coûté `review_visibility`.
create type public.reaction_kind as enum ('ember');

create type public.notification_kind as enum (
  'follow',        -- quelqu'un s'est abonné à vous
  'ember',         -- quelqu'un a braisé votre publication
  'post_comment',  -- quelqu'un a commenté votre publication
  'review_share'   -- quelqu'un vous a nommé sur une entrée de son carnet
);

-- De quoi parle une page du fil. Ce n'est pas une portée de lecture — la RLS
-- s'en charge — c'est le sujet de l'onglet. Voir §6.
create type public.feed_scope as enum ('following', 'discover');

-- =============================================================================
-- §2 · TABLES
-- =============================================================================

-- --- public.follows ----------------------------------------------------------
-- ADR 0007, D1 : les deux colonnes du §5.6, plus l'horodatage qu'un journal
-- demande. Aucun état : un abonnement est libre et immédiat. Ce qui remplace la
-- file d'approbation est une policy DELETE de plus, au §9 — le suivi retire un
-- abonné exactement comme l'abonné se désabonne.
create table public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),

  primary key (follower_id, followee_id),
  constraint follows_not_self check (follower_id <> followee_id)
);

comment on table public.follows is
  'Free, asymmetric, immediate (ADR 0007 D1). Removable from both ends: the '
  'followee has a DELETE policy of their own. No pending state — an approval '
  'ages, a removal stays true.';

-- --- public.blocks -----------------------------------------------------------
-- Lue par `blocks_between()` et par personne d'autre en pratique. La table est
-- volontairement pauvre : un blocage n'a pas de motif à donner à celui qui le
-- subit, et un motif stocké finirait par lui être montré.
create table public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

comment on table public.blocks is
  'Mutual invisibility, applied by RESTRICTIVE policies through '
  'public.blocks_between(). Blocking also deletes any follow in either '
  'direction (trigger), so no follow row can exist between blocked parties.';

-- --- public.posts ------------------------------------------------------------
-- ADR 0007, D2. Le fil est une table, et une seule.
create table public.posts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references auth.users(id) on delete cascade,

  kind       public.post_kind not null default 'post',

  -- Le même enum que `reviews`, donc directement comparable à la portée de
  -- l'entrée pointée — c'est ce qui rend la contrainte de l'ADR 0004 écrivable.
  -- Mais borné à deux valeurs : publier, c'est s'adresser à quelqu'un. Écrire
  -- pour soi seul, c'est le carnet, dont c'est déjà le défaut.
  visibility public.review_visibility not null default 'followers',

  body       text,

  -- Le contexte facultatif du §5.6. `venue_id` arrivera avec P5 ; l'ajouter
  -- maintenant serait une colonne que rien ne remplit et qu'aucune policy ne lit.
  cigar_id   uuid references ref.cigars(id) on delete set null,
  review_id  uuid references public.reviews(id) on delete cascade,

  -- Dénormalisées, recalculées par un count() et jamais par un delta — la règle
  -- de `humidor_items.qty` (ADR 0006). Hors de tout GRANT UPDATE : §8.
  ember_count   integer not null default 0,
  comment_count integer not null default 0,

  -- Modération, sur le modèle de `public.comments` (0004) : les trois ensemble
  -- ou aucune, et hors de tout grant. Masquer est un acte de modération, écrit
  -- par du code à clé de service.
  hidden_at     timestamptz,
  hidden_by     uuid references auth.users(id) on delete set null,
  hidden_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint posts_visibility_publishable check (visibility in ('followers', 'public')),
  constraint posts_body_len check (body is null or length(body) <= 4000),

  -- Une publication dit quelque chose : un texte, ou un objet qu'elle montre.
  constraint posts_has_substance check (
    (body is not null and length(btrim(body)) > 0)
    or cigar_id is not null
    or review_id is not null
  ),

  -- Le discriminant tient sa promesse dans les deux sens : `review_share` sans
  -- entrée est un lien mort, et une entrée sur un autre type serait une seconde
  -- façon de partager son carnet, donc une seconde règle d'audience.
  constraint posts_review_share_shape check (
    (kind = 'review_share') = (review_id is not null)
  ),
  constraint posts_session_has_cigar check (kind <> 'session' or cigar_id is not null),

  constraint posts_counts_nonneg check (ember_count >= 0 and comment_count >= 0),
  constraint posts_hidden_complete check (
    (hidden_at is null and hidden_by is null and hidden_reason is null)
    or (hidden_at is not null and hidden_by is not null and hidden_reason is not null)
  ),
  constraint posts_hidden_reason_len check (hidden_reason is null or length(hidden_reason) <= 2000)
);

comment on table public.posts is
  'The feed (§5.6), and the only feed source (ADR 0007 D2). A notebook entry '
  'reaches it as a review_share post whose visibility a trigger keeps equal to '
  'the entry''s — the constraint ADR 0004 asked P3 to pose.';

create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.tg_set_updated_at();

-- --- public.post_reactions ---------------------------------------------------
-- Le §5.6 dit `reactions`. Le nom est préfixé parce qu'il y aura des réactions
-- ailleurs, et parce qu'une table générique aurait une cible polymorphe — le
-- coût que l'ADR 0004 a refusé de payer pour `humidor_events.review_id`.
create table public.post_reactions (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       public.reaction_kind not null default 'ember',
  created_at timestamptz not null default now(),

  primary key (post_id, user_id, kind)
);

comment on table public.post_reactions is
  'La braise (§5.6). One row per person per post per kind; the count on posts '
  'is recomputed from here by trigger, never incremented.';

-- --- public.post_comments ----------------------------------------------------
-- Le §5.6 dit `comments` ; `public.comments` est déjà pris par l'ADR 0005 et
-- porte les commentaires de fiche, publics par construction. Une seule table
-- pour les deux aurait deux régimes de visibilité dans une même policy.
create table public.post_comments (
  id        uuid primary key default gen_random_uuid(),
  post_id   uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body      text not null,

  hidden_at     timestamptz,
  hidden_by     uuid references auth.users(id) on delete set null,
  hidden_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint post_comments_body_len check (length(btrim(body)) between 1 and 2000),
  constraint post_comments_hidden_complete check (
    (hidden_at is null and hidden_by is null and hidden_reason is null)
    or (hidden_at is not null and hidden_by is not null and hidden_reason is not null)
  ),
  constraint post_comments_hidden_reason_len check (
    hidden_reason is null or length(hidden_reason) <= 2000
  )
);

comment on table public.post_comments is
  'Comments on a feed post. Their audience is the post''s, derived by an EXISTS '
  'subject to its RLS rather than restated — the mechanism of ref.cigar_images '
  'in migration 0001.';

create trigger post_comments_set_updated_at
  before update on public.post_comments
  for each row execute function public.tg_set_updated_at();

-- --- public.notifications ----------------------------------------------------
-- Écrites par des triggers SECURITY DEFINER et par rien d'autre : aucun grant
-- INSERT n'existe. Une notification qu'un client peut fabriquer est une
-- notification qui ment.
create table public.notifications (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users(id) on delete cascade,
  kind      public.notification_kind not null,
  actor_id  uuid references auth.users(id) on delete cascade,

  post_id   uuid references public.posts(id)   on delete cascade,
  review_id uuid references public.reviews(id) on delete cascade,

  created_at timestamptz not null default now(),
  read_at    timestamptz,

  constraint notifications_not_self check (actor_id is null or actor_id <> user_id)
);

comment on table public.notifications is
  'Written exclusively by SECURITY DEFINER triggers — no INSERT grant exists. '
  'The only writable column is read_at.';

-- =============================================================================
-- §3 · ACCESSEURS SECURITY DEFINER
-- -----------------------------------------------------------------------------
-- Deux fonctions, un même motif, déjà rencontré deux fois : `current_app_role()`
-- en 0001 et `owns_review()` en 0003. Une policy a besoin de lire une table que
-- son appelant ne peut pas lire — non par privilège manquant, mais parce que la
-- RLS de cette table est justement ce qui la rend muette au tiers.
--
-- Elles vivent SOUS les tables et non au-dessus, alors que l'ordre habituel des
-- sections met les fonctions partagées avant : une fonction `language sql` est
-- validée à sa création et ne peut pas référencer une table définie plus bas
-- dans le même fichier (`supabase/CLAUDE.md`). `blocks_between()` lit `blocks`.
--
-- Les deux ne répondent que sur leur appelant, donc elles ne divulguent rien
-- qu'il ne puisse déjà déduire : `blocks_between` dit « vous et cette personne
-- ne vous voyez pas », ce que l'absence de contenu dirait de toute façon ;
-- `shows_humidor` dit ce que la personne a choisi de montrer.
-- =============================================================================

-- ADR 0007, D4. `blocks` n'est lisible que de ses deux parties, et un blocage
-- doit s'appliquer DANS LE SENS QUE LA PERSONNE BLOQUÉE NE VOIT PAS — sans quoi
-- bloquer quelqu'un ne ferait que se cacher soi-même de lui. La symétrie est
-- donc dans la fonction, pas dans la table.
-- Elle rend un TABLEAU, et pas un prédicat, pour une raison mesurée. Un
-- prédicat `blocks_between(author_id)` dans une policy est appelé UNE FOIS PAR
-- LIGNE examinée : sur le fil des abonnements, où le LATERAL du §6 examine
-- `abonnements × n` lignes, cela faisait 2 420 appels de fonction SECURITY
-- DEFINER pour rendre vingt lignes — **29 ms**, l'essentiel du coût de la page.
--
-- Un tableau sans argument s'évalue une seule fois par requête, en InitPlan,
-- dès qu'on l'enveloppe dans `(select …)` — le même geste que
-- `(select auth.uid())` de la 0003, et pour la même raison. Le prédicat devient
-- une comparaison à un tableau de quelques éléments. **2 ms.**
create or replace function public.blocked_user_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(s.other), '{}'::uuid[])
    from (
      select b.blocked_id as other from public.blocks b
       where b.blocker_id = (select auth.uid())
      union
      select b.blocker_id from public.blocks b
       where b.blocked_id = (select auth.uid())
    ) s
$$;

comment on function public.blocked_user_ids() is
  'Everyone the caller cannot see, either direction. SECURITY DEFINER because '
  'blocks is readable only by its two parties, and a block must apply in the '
  'direction the blocked person cannot see. Returns a set rather than a '
  'predicate so a policy evaluates it once per query, not once per row.';

-- Le prédicat reste offert, pour les endroits où l'on interroge une seule
-- personne — s'abonner, ouvrir une cave. Il n'est pas SECURITY DEFINER : il
-- n'en a pas besoin, puisqu'il délègue. Une seule définition du blocage.
create or replace function public.blocks_between(other uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select other = any (public.blocked_user_ids())
$$;

comment on function public.blocks_between(uuid) is
  'True when a block exists between the caller and `other`, either way. A thin '
  'wrapper over blocked_user_ids() so the rule has one definition; use it for a '
  'single subject, and the array form inside a policy.';

-- ADR 0006, D4 avait nommé cette fonction avant qu'elle existe : « la branche de
-- P3 aura besoin d'un accesseur SECURITY DEFINER ». La raison est que
-- `profile_settings` n'est lisible que de son propriétaire — une policy qui
-- lirait `privacy->>'show_humidor'` chez autrui ne renverrait jamais rien. Pas
-- une erreur : un silence, donc une cave qu'on a choisi de montrer et qui reste
-- invisible.
--
-- Repli fermé : une ligne absente, une clé absente, une valeur illisible valent
-- toutes `false`. Le `->>` rend du texte, et un cast de texte en booléen lève
-- `22P02` sur n'importe quoi d'autre que les littéraux booléens — d'où le test
-- explicite plutôt qu'un cast.
create or replace function public.shows_humidor(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.privacy->>'show_humidor' = 'true'
       from public.profile_settings s
      where s.id = owner),
    false)
$$;

comment on function public.shows_humidor(uuid) is
  'Reads privacy.show_humidor of another member. SECURITY DEFINER because '
  'profile_settings is owner-only: a policy reading it directly would return '
  'silence rather than a refusal (ADR 0006, D4). Closed fallback.';

-- =============================================================================
-- §4 · INDEX
-- -----------------------------------------------------------------------------
-- Les deux premiers sont le critère de sortie de P3 rendu exécutable. Un keyset
-- sur `(created_at, id)` demande un ordre TOTAL : `created_at` seul ne l'est pas
-- — deux publications de la même milliseconde se départagent par l'identifiant,
-- et sans cela une page en saute une en silence. L'index porte donc les deux
-- colonnes, dans le sens du tri.
-- =============================================================================

-- L'onglet Découverte. Partiel : un fil public ne lit que du public, et le
-- prédicat de l'index est le même que celui de la policy qui le sert.
create index posts_public_keyset_idx on public.posts (created_at desc, id desc)
  where visibility = 'public' and hidden_at is null;

-- L'onglet Abonnements, et la chronologie d'un membre sur son profil.
create index posts_author_keyset_idx on public.posts (author_id, created_at desc, id desc);

-- La cascade de portée : trouver la publication qui pointe une entrée.
create index posts_review_idx on public.posts (review_id) where review_id is not null;
create index posts_cigar_idx  on public.posts (cigar_id)  where cigar_id is not null;

-- « Qui me suit » — et surtout la branche `followers` de `reviews`, qui
-- interroge exactement ce couple dans cet ordre.
create index follows_followee_idx on public.follows (followee_id, follower_id);

create index blocks_blocked_idx on public.blocks (blocked_id);

create index post_comments_post_idx on public.post_comments (post_id, created_at)
  where hidden_at is null;
create index post_comments_author_idx on public.post_comments (author_id, created_at desc);

create index post_reactions_user_idx on public.post_reactions (user_id, created_at desc);

create index notifications_unread_idx on public.notifications (user_id, created_at desc)
  where read_at is null;
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- =============================================================================
-- §5 · TRIGGERS
-- =============================================================================

-- --- Les compteurs -----------------------------------------------------------
-- Recalculés par un count(), jamais par un delta. La règle est celle de
-- `humidor_items.qty` (ADR 0006) et sa raison n'a pas changé : un trigger qui
-- incrémente se trompe une fois et ment ensuite pour toujours ; un trigger qui
-- recompte se répare au mouvement suivant.
--
-- SECURITY DEFINER parce que braiser la publication de quelqu'un d'autre met à
-- jour une ligne dont on n'est pas l'auteur — et il n'est pas question de donner
-- à un client le droit d'écrire `ember_count`.
create or replace function public.tg_post_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := coalesce(new.post_id, old.post_id);
begin
  if tg_table_name = 'post_reactions' then
    update public.posts p
       set ember_count = (select count(*) from public.post_reactions r where r.post_id = target)
     where p.id = target;
  else
    update public.posts p
       set comment_count = (select count(*) from public.post_comments c
                             where c.post_id = target and c.hidden_at is null)
     where p.id = target;
  end if;
  return null;
end;
$$;

revoke execute on function public.tg_post_counts() from public, anon, authenticated;

create trigger post_reactions_count
  after insert or delete on public.post_reactions
  for each row execute function public.tg_post_counts();

create trigger post_comments_count
  after insert or delete on public.post_comments
  for each row execute function public.tg_post_counts();

-- Masquer un commentaire le retire du compte : le compteur dit ce que la page
-- affiche, sinon il annonce une conversation qui n'est pas là.
create trigger post_comments_count_hidden
  after update of hidden_at on public.post_comments
  for each row execute function public.tg_post_counts();

-- --- La cascade de portée ----------------------------------------------------
-- ADR 0004 : « Un post de type review_share ne peut jamais être plus visible que
-- l'entrée qu'il pointe. À poser en contrainte lors de P3, pas en convention. »
-- Un CHECK ne peut pas lire une autre table ; c'est donc un trigger, et il tient
-- la contrainte dans les deux sens.
--
-- SECURITY INVOKER — la leçon de la 0009, et la décision D1 de l'ADR 0006 : une
-- transaction ne demande pas un privilège. L'auteur de l'entrée est l'auteur de
-- la publication (garanti par la policy INSERT), donc il a déjà le droit
-- d'écrire ces deux lignes à la main. Le trigger ne fait que le faire en une
-- fois. Il n'appelle aucune fonction, ce qui est la seconde moitié de la leçon.
create or replace function public.tg_review_scope_cascade()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.visibility is distinct from old.visibility then
    if new.visibility in ('followers', 'public') then
      update public.posts p
         set visibility = new.visibility
       where p.review_id = new.id and p.visibility <> new.visibility;
    else
      -- L'entrée redescend sous ce qu'un fil peut montrer : la publication n'a
      -- plus d'audience licite. On la supprime plutôt que de la laisser muette.
      delete from public.posts p where p.review_id = new.id;
    end if;
  end if;
  return null;
end;
$$;

revoke execute on function public.tg_review_scope_cascade() from public, anon, authenticated;

create trigger reviews_scope_cascade
  after update of visibility on public.reviews
  for each row execute function public.tg_review_scope_cascade();

-- --- Le blocage nettoie l'abonnement ----------------------------------------
-- ADR 0007, D4. Plutôt qu'une policy restrictive sur `follows` — évaluée à
-- chaque lecture du graphe, y compris sur le chemin chaud de la branche
-- `followers` de `reviews` —, l'invariant est tenu à l'écriture : aucun couple
-- bloqué ne peut avoir de ligne d'abonnement. La policy INSERT de `follows`
-- ferme l'autre côté.
--
-- SECURITY INVOKER : le bloquant a déjà les deux policies DELETE qu'il faut —
-- se désabonner, et retirer un abonné.
create or replace function public.tg_block_clears_follow()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.follows f
   where (f.follower_id = new.blocker_id and f.followee_id = new.blocked_id)
      or (f.follower_id = new.blocked_id and f.followee_id = new.blocker_id);
  return null;
end;
$$;

revoke execute on function public.tg_block_clears_follow() from public, anon, authenticated;

create trigger blocks_clear_follow
  after insert on public.blocks
  for each row execute function public.tg_block_clears_follow();

-- --- Les notifications -------------------------------------------------------
-- SECURITY DEFINER : une notification s'écrit dans la boîte de quelqu'un
-- d'autre, ce qu'aucun client ne doit pouvoir faire. Le `not exists` sur
-- `blocks` évite le cas absurde d'une notification issue d'un geste que le
-- blocage vient d'annuler.
create or replace function public.tg_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
  actor     uuid;
  kind      public.notification_kind;
  post      uuid;
  review    uuid;
begin
  if tg_table_name = 'follows' then
    recipient := new.followee_id; actor := new.follower_id; kind := 'follow';

  elsif tg_table_name = 'post_reactions' then
    select p.author_id into recipient from public.posts p where p.id = new.post_id;
    actor := new.user_id; kind := 'ember'; post := new.post_id;

  elsif tg_table_name = 'post_comments' then
    select p.author_id into recipient from public.posts p where p.id = new.post_id;
    actor := new.author_id; kind := 'post_comment'; post := new.post_id;

  else -- review_shares
    recipient := new.grantee_id; actor := new.granted_by; kind := 'review_share';
    review := new.review_id;
  end if;

  if recipient is null or recipient = actor then return null; end if;

  if exists (select 1 from public.blocks b
              where (b.blocker_id = recipient and b.blocked_id = actor)
                 or (b.blocker_id = actor and b.blocked_id = recipient))
  then
    return null;
  end if;

  insert into public.notifications (user_id, kind, actor_id, post_id, review_id)
  values (recipient, kind, actor, post, review);

  return null;
end;
$$;

revoke execute on function public.tg_notify() from public, anon, authenticated;

create trigger follows_notify
  after insert on public.follows
  for each row execute function public.tg_notify();

create trigger post_reactions_notify
  after insert on public.post_reactions
  for each row execute function public.tg_notify();

create trigger post_comments_notify
  after insert on public.post_comments
  for each row execute function public.tg_notify();

-- Le carnet gagne enfin ce qui lui manquait : nommer quelqu'un sur une entrée le
-- lui dit. Jusqu'ici le destinataire devait tomber dessus.
create trigger review_shares_notify
  after insert on public.review_shares
  for each row execute function public.tg_notify();

-- =============================================================================
-- §6 · feed_page() — LE KEYSET, EN SECURITY INVOKER
-- -----------------------------------------------------------------------------
-- ADR 0007, D3. Le keyset vit ici plutôt que dans le client PostgREST pour trois
-- raisons mesurables :
--
--   1. PostgREST ne sait pas exprimer `(created_at, id) < (x, y)`. Sa traduction
--      est un `or=(created_at.lt.X, and(created_at.eq.X, id.lt.Y))`, que le
--      planificateur sert moins bien qu'un parcours d'index ordonné.
--   2. Trois appelants écriraient trois fois cette clause, donc trois occasions
--      de se tromper d'ordre — et un keyset dont l'ordre n'est pas total saute
--      des lignes sans rien dire.
--   3. Le critère de sortie demande « 0 requête N+1 ». Une page rendue en un
--      seul appel ne peut pas en avoir : les braises, les commentaires, la
--      braise de l'appelant, l'auteur et le cigare sortent avec la ligne.
--
-- SECURITY INVOKER — c'est la décision D1 de l'ADR 0006 et elle vaut ici mot pour
-- mot : un appel PostgREST est une transaction, pas un privilège. La RLS de
-- `posts`, de `profiles` et de `ref.cigars` s'applique intégralement dans le
-- corps, donc la même fonction rend des lignes différentes selon qui l'appelle.
--
-- Ce que la fonction filtre est la PORTÉE DE L'ONGLET, jamais l'audience : dire
-- « ce que suivent mes abonnements » n'est pas dire qui a le droit de lire. La
-- distinction est celle que `listMyNotebook` fait déjà avec `user_id`.
-- =============================================================================

create or replace function public.feed_page(
  p_scope             public.feed_scope,
  p_before_created_at timestamptz default null,
  p_before_id         uuid        default null,
  p_limit             integer     default 20
)
returns table (
  id            uuid,
  author_id     uuid,
  kind          public.post_kind,
  visibility    public.review_visibility,
  body          text,
  cigar_id      uuid,
  review_id     uuid,
  ember_count   integer,
  comment_count integer,
  created_at    timestamptz,
  updated_at    timestamptz,
  viewer_embered boolean,
  author_handle       text,
  author_display_name text,
  cigar_slug          text,
  cigar_name          text,
  brand_name          text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  ids    uuid[];
  n      integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  viewer uuid    := (select auth.uid());
begin
  -- Deux requêtes statiques plutôt qu'une paramétrée, et c'est une mesure et non
  -- un goût. Écrite en une seule expression — `(p_scope = 'discover' and …) or
  -- (p_scope = 'following' and …)` —, la portée est un PARAMÈTRE, donc le
  -- planificateur ne peut prouver aucune des deux branches et renonce à
  -- `posts_public_keyset_idx`, dont le prédicat partiel est justement
  -- `visibility = 'public'`. Il trie alors la table entière pour en rendre
  -- vingt lignes : **258 ms sur 50 000 publications, contre 1,5 ms** avec la
  -- même donnée et le prédicat écrit en dur. Un `if` en plpgsql sépare les deux
  -- requêtes, et chacune est planifiée sur un prédicat constant.
  --
  -- Deux instructions dans une fonction ne sont PAS un N+1 : le critère de
  -- sortie porte sur les allers-retours de l'application, et il n'y en a qu'un.
  if p_scope = 'discover' then
    select array_agg(s.id order by s.created_at desc, s.id desc) into ids
      from (select p.id, p.created_at
              from public.posts p
             where p.visibility = 'public'
               and p.hidden_at is null
               and (p_before_created_at is null
                    or p_before_id is null
                    or (p.created_at, p.id) < (p_before_created_at, p_before_id))
             order by p.created_at desc, p.id desc
             limit n) s;
  else
    -- Le fil des abonnements ne se lit pas comme la découverte, et le mesurer
    -- l'a montré : un `exists` sur `follows` avec un `order by` global n'a aucun
    -- index à suivre — `posts_author_keyset_idx` commence par l'auteur — donc
    -- PostgreSQL trie les 50 000 lignes. **600 ms.**
    --
    -- La forme juste est un LATERAL par auteur suivi : chacun rend ses vingt
    -- plus récentes par un parcours d'index de vingt lignes, et la fusion trie
    -- au plus `abonnements × n` lignes. Le coût suit alors le nombre de
    -- personnes qu'on suit, jamais le nombre de publications du site — ce qui
    -- est la bonne dépendance pour un fil. **1,4 ms** sur la même donnée.
    select array_agg(s.id order by s.created_at desc, s.id desc) into ids
      from (select p.id, p.created_at
              from (select f.followee_id as author from public.follows f
                     where f.follower_id = viewer
                    union all
                    select viewer) a
              cross join lateral (
                select p2.id, p2.created_at
                  from public.posts p2
                 where p2.author_id = a.author
                   and p2.hidden_at is null
                   and (p_before_created_at is null
                        or p_before_id is null
                        or (p2.created_at, p2.id) < (p_before_created_at, p_before_id))
                 order by p2.created_at desc, p2.id desc
                 limit n) p
             order by p.created_at desc, p.id desc
             limit n) s;
  end if;

  if ids is null then return; end if;

  -- L'hydratation, une fois, pour la page entière. Chaque jointure porte la RLS
  -- de sa table : un auteur non découvrable rend NULL plutôt que de faire
  -- disparaître la ligne, et une fiche dépubliée aussi. C'est l'écran qui dit
  -- « Membre », comme `attachAuthors` le fait déjà pour le carnet.
  return query
    select
      p.id,
      p.author_id,
      p.kind,
      p.visibility,
      p.body,
      p.cigar_id,
      p.review_id,
      p.ember_count,
      p.comment_count,
      p.created_at,
      p.updated_at,
      exists (select 1 from public.post_reactions r
               where r.post_id = p.id and r.user_id = viewer),
      pr.handle,
      pr.display_name,
      c.slug,
      c.commercial_name,
      b.name
    from public.posts p
    left join public.profiles pr on pr.id = p.author_id
    left join ref.cigars      c  on c.id  = p.cigar_id
    left join ref.brands      b  on b.id  = c.brand_id
   where p.id = any(ids)
   order by p.created_at desc, p.id desc;
end;
$$;

comment on function public.feed_page(public.feed_scope, timestamptz, uuid, integer) is
  'One keyset page of the feed, ordered by (created_at desc, id desc) — the '
  'total order the exit criterion of P3 requires. SECURITY INVOKER: RLS decides '
  'who reads what, the scope argument only says what the tab is about.';

revoke execute on function public.feed_page(public.feed_scope, timestamptz, uuid, integer)
  from public;
grant execute on function public.feed_page(public.feed_scope, timestamptz, uuid, integer)
  to authenticated;

-- =============================================================================
-- §7 · shared_humidor_shelf() — LA PROJECTION
-- -----------------------------------------------------------------------------
-- ADR 0007, D5. Une policy est un mécanisme de LIGNES ; elle ne sait pas cacher
-- une colonne. Or `humidor_items.purchase_price_eur` est un prix de tabac, et
-- le §2 est exactement ce qui garde `show_indicative_prices` à `false`.
--
-- La projection est donc la raison d'être de cette fonction, et sa seule raison.
-- Elle est SECURITY DEFINER, donc elle revérifie elle-même ce qu'une policy
-- aurait vérifié — comme `file_report()` le fait pour `mod`. Une porte de la
-- taille du geste : trois colonnes, un propriétaire, deux prédicats.
-- =============================================================================

create or replace function public.shared_humidor_shelf(owner uuid)
returns table (
  humidor_id   uuid,
  humidor_name text,
  cigar_id     uuid,
  qty          integer,
  aging_start_date date
)
language sql
stable
security definer
set search_path = ''
as $$
  select h.id, h.name, i.cigar_id, i.qty, i.aging_start_date
    from public.humidors h
    join public.humidor_items i on i.humidor_id = h.id
   where h.user_id = owner
     and i.qty > 0
     and public.shows_humidor(owner)
     and not public.blocks_between(owner)
   order by h.created_at, i.aging_start_date nulls last
$$;

comment on function public.shared_humidor_shelf(uuid) is
  'What a member chose to show of their humidors: which cigars, how many, since '
  'when. Never the price, never the ledger. SECURITY DEFINER because a policy '
  'filters rows and cannot project a column set (ADR 0007, D5).';

revoke execute on function public.shared_humidor_shelf(uuid) from public;
grant execute on function public.shared_humidor_shelf(uuid) to authenticated;

-- =============================================================================
-- §8 · GRANTS
-- -----------------------------------------------------------------------------
-- Supabase accorde ALL sur toute nouvelle table de `public`. Chaque grant est
-- donc précédé d'un REVOKE : la surface de privilège se déclare ici.
-- =============================================================================

revoke all on public.follows from anon, authenticated;
grant select on public.follows to anon, authenticated;
grant insert, delete on public.follows to authenticated;
-- Aucun UPDATE : on s'abonne ou on ne s'abonne pas.

revoke all on public.blocks from anon, authenticated;
grant select, insert, delete on public.blocks to authenticated;

revoke all on public.posts from anon, authenticated;
grant select on public.posts to anon, authenticated;
-- Colonne par colonne à l'insertion : `ember_count` et `comment_count` sont
-- tenues par un trigger, et le meilleur moyen de garantir qu'un client ne les
-- écrit pas est qu'il n'en ait pas le droit.
grant insert (author_id, kind, visibility, body, cigar_id, review_id)
  on public.posts to authenticated;
-- On corrige son texte et on change sa portée ; on ne change ni son type, ni le
-- cigare dont elle parle, ni l'entrée qu'elle pointe. `updated_at` est tenue par
-- un trigger et n'est donc dans aucun grant : l'écrire à la main lève `42501`.
grant update (body, visibility) on public.posts to authenticated;
grant delete on public.posts to authenticated;

revoke all on public.post_reactions from anon, authenticated;
grant select on public.post_reactions to anon, authenticated;
grant insert, delete on public.post_reactions to authenticated;
-- Aucun UPDATE : on braise ou on retire sa braise.

revoke all on public.post_comments from anon, authenticated;
grant select on public.post_comments to anon, authenticated;
grant insert (post_id, author_id, body) on public.post_comments to authenticated;
grant update (body) on public.post_comments to authenticated;
grant delete on public.post_comments to authenticated;
-- `hidden_at`, `hidden_by`, `hidden_reason` : hors de tout grant, comme sur
-- `public.comments`. Masquer est un acte de modération, écrit par du code à clé
-- de service — y compris pour un modérateur connecté.

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;
-- Aucun INSERT, à personne. Elles naissent d'un trigger SECURITY DEFINER.

revoke execute on function public.blocked_user_ids() from public;
grant execute on function public.blocked_user_ids() to authenticated;

revoke execute on function public.blocks_between(uuid) from public;
grant execute on function public.blocks_between(uuid) to authenticated;

revoke execute on function public.shows_humidor(uuid) from public;
grant execute on function public.shows_humidor(uuid) to authenticated;

-- =============================================================================
-- §9 · ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
-- Découpage par rôle, comme en 0003 et 0004 : une branche qu'un anonyme ne peut
-- pas évaluer ne doit jamais lui être présentée, sans quoi un simple select
-- échoue sur « permission denied for table … ».
--
-- Et deux familles de policies RESTRICTIVE, qui sont AND-ées avec l'ensemble des
-- permissives. C'est la seule sémantique qui puisse RETIRER une ligne, donc la
-- seule qui puisse exprimer un blocage ou une exception de propriété.
-- =============================================================================

-- --- public.follows ----------------------------------------------------------
alter table public.follows enable row level security;
alter table public.follows force row level security;

-- Le graphe est public : c'est ce qui rend un profil lisible et une découverte
-- possible. Ce qu'il ne montre jamais, c'est le contenu — la portée s'en charge.
create policy follows_select_all on public.follows
  for select to anon, authenticated
  using (true);

-- L'autre moitié de l'invariant de blocage : le trigger nettoie ce qui existe,
-- cette policy refuse ce qui viendrait après.
create policy follows_insert_own on public.follows
  for insert to authenticated
  with check (
    follower_id = (select auth.uid())
    and not public.blocks_between(followee_id)
  );

create policy follows_delete_own on public.follows
  for delete to authenticated
  using (follower_id = (select auth.uid()));

-- ADR 0007, D1. Le contrepoids de l'abonnement libre : le suivi retire un
-- abonné. Une policy, un bouton, et le contrôle reste exerçable — là où une
-- approbation donnée en janvier ne se redemande jamais.
create policy follows_delete_followee on public.follows
  for delete to authenticated
  using (followee_id = (select auth.uid()));

-- --- public.blocks -----------------------------------------------------------
alter table public.blocks enable row level security;
alter table public.blocks force row level security;

-- Seul le bloquant voit ses blocages. La personne bloquée ne l'apprend pas :
-- c'est le comportement attendu, et `blocks_between()` est ce qui permet à la
-- règle de s'appliquer quand même dans ce sens-là.
create policy blocks_select_own on public.blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()));

create policy blocks_insert_own on public.blocks
  for insert to authenticated
  with check (blocker_id = (select auth.uid()));

create policy blocks_delete_own on public.blocks
  for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- --- public.posts ------------------------------------------------------------
alter table public.posts enable row level security;
alter table public.posts force row level security;

create policy posts_select_public on public.posts
  for select to anon, authenticated
  using (visibility = 'public' and hidden_at is null);

-- L'auteur voit la sienne même masquée : le DSA veut qu'une décision soit
-- contestable, et on ne conteste pas ce qu'on ne voit plus (ADR 0005).
create policy posts_select_own on public.posts
  for select to authenticated
  using (author_id = (select auth.uid()));

create policy posts_select_followers on public.posts
  for select to authenticated
  using (
    visibility = 'followers'
    and hidden_at is null
    and exists (
      select 1 from public.follows f
       where f.followee_id = author_id and f.follower_id = (select auth.uid())
    )
  );

create policy posts_select_moderator on public.posts
  for select to authenticated
  using ((select public.has_min_role('moderator')));

create policy posts_insert_own on public.posts
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (select public.has_min_role(public.comment_min_role()))
    -- On ne publie pas à propos d'un brouillon. L'EXISTS porte la RLS de
    -- ref.cigars, donc « publiée » se déduit au lieu d'être recopiée.
    and (cigar_id is null
         or exists (select 1 from ref.cigars c where c.id = cigar_id and c.status = 'published'))
    -- ADR 0004 : une publication ne peut pas être plus visible que l'entrée
    -- qu'elle pointe. `owns_review()` casse ici la même récursion qu'en 0003 —
    -- `posts` lit `reviews`, dont la branche `followers` lira `follows`, que
    -- `posts` lit aussi. La fonction répond sans réexpanser la RLS de `reviews`.
    -- `posts.visibility` est qualifié, et il doit l'être : `reviews` a une
    -- colonne du même nom, donc PostgreSQL résout d'abord dans la portée la plus
    -- interne. Écrit `r.visibility = visibility`, la condition compare la
    -- colonne à elle-même et vaut TOUJOURS vrai — mesuré par l'assertion P3 de
    -- `supabase/tests/09_social_rls.sql`, qui a accepté une publication publique
    -- sur une entrée réservée aux abonnés.
    and (review_id is null
         or (public.owns_review(review_id)
             and exists (select 1 from public.reviews r
                          where r.id = review_id and r.visibility = posts.visibility)))
  );

create policy posts_update_own on public.posts
  for update to authenticated
  using (author_id = (select auth.uid()) and hidden_at is null)
  with check (author_id = (select auth.uid()));

create policy posts_delete_own on public.posts
  for delete to authenticated
  using (author_id = (select auth.uid()));

create policy posts_delete_moderator on public.posts
  for delete to authenticated
  using ((select public.has_min_role('moderator')));

-- --- public.post_reactions ---------------------------------------------------
alter table public.post_reactions enable row level security;
alter table public.post_reactions force row level security;

-- L'EXISTS porte la RLS de `posts` : une braise n'est visible que là où la
-- publication l'est, et le blocage s'y applique par ricochet.
create policy post_reactions_select_visible on public.post_reactions
  for select to anon, authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

create policy post_reactions_insert_own on public.post_reactions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.posts p where p.id = post_id)
  );

create policy post_reactions_delete_own on public.post_reactions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- --- public.post_comments ----------------------------------------------------
alter table public.post_comments enable row level security;
alter table public.post_comments force row level security;

create policy post_comments_select_visible on public.post_comments
  for select to anon, authenticated
  using (
    hidden_at is null
    and exists (select 1 from public.posts p where p.id = post_id)
  );

create policy post_comments_select_own on public.post_comments
  for select to authenticated
  using (author_id = (select auth.uid()));

create policy post_comments_select_moderator on public.post_comments
  for select to authenticated
  using ((select public.has_min_role('moderator')));

create policy post_comments_insert_own on public.post_comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (select public.has_min_role(public.comment_min_role()))
    and exists (select 1 from public.posts p where p.id = post_id)
  );

create policy post_comments_update_own on public.post_comments
  for update to authenticated
  using (author_id = (select auth.uid()) and hidden_at is null)
  with check (author_id = (select auth.uid()));

create policy post_comments_delete_own on public.post_comments
  for delete to authenticated
  using (author_id = (select auth.uid()));

-- L'auteur de la publication modère chez lui : c'est le minimum qu'un fil doit
-- à quelqu'un qui accueille une conversation sous son texte.
create policy post_comments_delete_host on public.post_comments
  for delete to authenticated
  using (exists (select 1 from public.posts p
                  where p.id = post_id and p.author_id = (select auth.uid())));

create policy post_comments_delete_moderator on public.post_comments
  for delete to authenticated
  using ((select public.has_min_role('moderator')));

-- --- public.notifications ----------------------------------------------------
alter table public.notifications enable row level security;
alter table public.notifications force row level security;

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy notifications_delete_own on public.notifications
  for delete to authenticated
  using (user_id = (select auth.uid()));
-- Aucune policy INSERT : la table n'a pas de grant d'insertion non plus. Les
-- deux ensemble, parce qu'un grant retiré se remet et qu'une policy manquante
-- se remarque.

-- --- LA DETTE 1 : la branche `followers` de public.reviews -------------------
-- Elle attendait `public.follows` depuis la 0003, où elle est annoncée en
-- commentaire. Elle arrive comme une policy DE PLUS : les quatre existantes ne
-- sont pas touchées, parce qu'elles sont découpées par rôle et que les recoller
-- casserait la lecture publique (0003, §6).
--
-- `tests/unit/reviews-model.test.ts` échoue à partir d'ici tant que
-- `SCOPE_TRAITS.followers.reachesNobodyYet` n'est pas passé à `false` et que
-- l'avertissement d'interface n'est pas retiré. C'était voulu depuis le
-- premier jour, et c'est le même commit qui fait les deux.
create policy reviews_select_followers on public.reviews
  for select to authenticated
  using (
    visibility = 'followers'
    and exists (
      select 1 from public.follows f
       where f.followee_id = user_id and f.follower_id = (select auth.uid())
    )
  );

-- --- LA DETTE 2 : privacy.show_humidor ---------------------------------------
-- Une policy de plus sur `humidors`, et aucune existante modifiée (ADR 0006,
-- D4, qui l'avait écrit d'avance).
create policy humidors_select_shown on public.humidors
  for select to authenticated
  using (
    user_id <> (select auth.uid())
    and public.shows_humidor(user_id)
  );

-- Et immédiatement son garde-fou, sans lequel la décision serait FAUSSE.
--
-- Les trois tables filles ne redisent pas la propriété : elles rejoignent
-- `humidors` par un EXISTS soumis à sa RLS (0008, §8). Ouvrir `humidors` ouvre
-- donc, en cascade et en silence, les lots, LE GRAND LIVRE et les relevés — soit
-- quand la personne a fumé quoi, c'est-à-dire exactement la donnée que le carnet
-- protège par un défaut `private`. Republiée par une porte de côté.
--
-- Une policy permissive ne peut pas refermer cela : elles sont OR-ées. Une
-- policy RESTRICTIVE le peut, parce qu'elle est AND-ée avec toutes les autres.
create policy humidor_items_owner_only on public.humidor_items
  as restrictive for select to authenticated
  using (exists (select 1 from public.humidors h
                  where h.id = humidor_id and h.user_id = (select auth.uid())));

create policy humidor_events_owner_only on public.humidor_events
  as restrictive for select to authenticated
  using (exists (select 1 from public.humidor_items i
                   join public.humidors h on h.id = i.humidor_id
                  where i.id = item_id and h.user_id = (select auth.uid())));

create policy humidor_readings_owner_only on public.humidor_readings
  as restrictive for select to authenticated
  using (exists (select 1 from public.humidors h
                  where h.id = humidor_id and h.user_id = (select auth.uid())));

-- --- LE BLOCAGE, EN RESTRICTIF ------------------------------------------------
-- ADR 0007, D4. Une policy permissive de plus ne peut jamais retirer une ligne :
-- elles sont OR-ées. Un blocage est un AND, donc une policy RESTRICTIVE, et il
-- n'y a pas d'autre mécanisme dans PostgreSQL qui dise cela.
--
-- Chacune épargne ses propres lignes : bloquer quelqu'un ne doit pas rendre son
-- propre carnet illisible.
--
-- Et chacune lit le TABLEAU plutôt que le prédicat, enveloppé dans un
-- `(select …)` : PostgreSQL l'évalue alors une fois en InitPlan et non une fois
-- par ligne. C'est la même optimisation que `(select auth.uid())` en 0003, et
-- elle vaut ici 27 ms sur une page du fil — voir le commentaire de
-- `blocked_user_ids()`.
--
-- `follows` n'en reçoit pas, et ce n'est pas un oubli : l'invariant y est tenu à
-- l'écriture — le trigger `blocks_clear_follow` supprime les lignes existantes,
-- la policy `follows_insert_own` refuse les suivantes. Un prédicat de lecture
-- serait alors du code mort évalué sur le chemin chaud de `posts_select_followers`.
--
-- `post_reactions` n'en reçoit pas non plus : sa policy SELECT passe par un
-- EXISTS sur `posts`, donc elle hérite du blocage de la publication.
create policy posts_block_restrictive on public.posts
  as restrictive for select to authenticated
  using (author_id = (select auth.uid())
         or not (author_id = any ((select public.blocked_user_ids())::uuid[])));

create policy post_comments_block_restrictive on public.post_comments
  as restrictive for select to authenticated
  using (author_id = (select auth.uid())
         or not (author_id = any ((select public.blocked_user_ids())::uuid[])));

create policy reviews_block_restrictive on public.reviews
  as restrictive for select to authenticated
  using (user_id = (select auth.uid())
         or not (user_id = any ((select public.blocked_user_ids())::uuid[])));

create policy comments_block_restrictive on public.comments
  as restrictive for select to authenticated
  using (author_id = (select auth.uid())
         or not (author_id = any ((select public.blocked_user_ids())::uuid[])));

create policy profiles_block_restrictive on public.profiles
  as restrictive for select to authenticated
  using (id = (select auth.uid())
         or not (id = any ((select public.blocked_user_ids())::uuid[])));

-- =============================================================================
-- §10 · mod.reports — DEUX CIBLES DE PLUS
-- -----------------------------------------------------------------------------
-- Le fil crée deux surfaces publiques écrites par des membres. Une surface sans
-- bouton « Signaler » est un contenu qu'on publie sans mécanisme de notification
-- au sens de l'art. 16 du DSA — c'est le raisonnement exact de l'ADR 0005, et il
-- s'applique au fil plus directement encore qu'aux commentaires de fiche.
--
-- `public.profiles` était déjà dans la liste et le restera : P3 lui donne enfin
-- une page, donc `lib/compliance/dsa.ts` peut l'offrir.
-- =============================================================================

alter table mod.reports drop constraint reports_entity_known;
alter table mod.reports add constraint reports_entity_known check (
  entity_schema || '.' || entity_table in
    ('public.comments', 'public.reviews', 'ref.cigars', 'public.profiles',
     'public.posts', 'public.post_comments')
);

-- =============================================================================
-- §11 · AUTO-CONTRÔLE
-- -----------------------------------------------------------------------------
-- Il ne peut pas attraper ce que cette migration vient d'établir — c'est le rôle
-- de `supabase/tests/09_social_rls.sql`, qui n'accorde rien. Ce qu'il attrape,
-- ce sont les invariants du dépôt qu'une migration peut casser en passant.
-- =============================================================================

do $$
declare
  offender text;
  n        integer;
begin
  -- 1. §0.5 du brief : aucune table sans RLS et sans policy.
  select string_agg(format('%I.%I', ns.nspname, c.relname), ', ' order by 1)
    into offender
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
   where c.relkind = 'r'
     and ns.nspname in ('public', 'ref', 'mod')
     and (c.relrowsecurity = false
          or not exists (select 1 from pg_policy p where p.polrelid = c.oid));
  if offender is not null then
    raise exception 'VITOLA_RLS_GAP: table(s) sans RLS ou sans policy : %', offender;
  end if;

  -- 2. ADR 0007, D3. `feed_page` doit rester en droits d'appelant : la passer en
  --    DEFINER ferait de la fonction le juge de l'audience, à la place de la RLS.
  if exists (select 1 from pg_proc
              where oid = 'public.feed_page(public.feed_scope,timestamptz,uuid,integer)'::regprocedure
                and prosecdef)
  then
    raise exception 'VITOLA_SCOPE_GAP: feed_page() est passée en SECURITY DEFINER (ADR 0007, D3)';
  end if;

  -- 3. ADR 0007, D5. Sans les trois policies restrictives, ouvrir `humidors`
  --    ouvre le grand livre. C'est l'invariant le plus facile à défaire sans le
  --    voir, parce que rien ne casse : une lecture rend simplement plus.
  select string_agg(t, ', ' order by t) into offender
    from unnest(array['humidor_items', 'humidor_events', 'humidor_readings']) as t
   where not exists (
     select 1 from pg_policy p
      where p.polrelid = ('public.' || t)::regclass
        and p.polname = t || '_owner_only'
        and p.polpermissive = false);
  if offender is not null then
    raise exception
      'VITOLA_SCOPE_GAP: policy restrictive propriétaire manquante sur : % (ADR 0007, D5)', offender;
  end if;

  -- 4. Le blocage doit être restrictif partout où il est annoncé. Une policy
  --    permissive du même nom serait vert et ouvert.
  select string_agg(p.polname, ', ' order by p.polname) into offender
    from pg_policy p
   where p.polname like '%\_block\_restrictive' and p.polpermissive;
  if offender is not null then
    raise exception 'VITOLA_SCOPE_GAP: policy de blocage permissive : %', offender;
  end if;

  select count(*) into n from pg_policy where polname like '%\_block\_restrictive';
  if n <> 5 then
    raise exception 'VITOLA_SCOPE_GAP: % policies de blocage, 5 attendues', n;
  end if;

  -- 5. Les compteurs sont tenus par un trigger : aucun client ne les écrit.
  select string_agg(column_name, ', ' order by column_name) into offender
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'posts'
     and privilege_type in ('UPDATE', 'INSERT')
     and grantee in ('anon', 'authenticated')
     and column_name in ('ember_count', 'comment_count', 'hidden_at', 'hidden_by',
                         'hidden_reason', 'updated_at');
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: colonne(s) de posts écrivables par un client : %', offender;
  end if;

  -- 6. Aucune fonction nouvelle appelable au titre de PUBLIC — le défaut que
  --    PostgreSQL réapplique à chaque create function.
  select string_agg(proname, ', ' order by proname) into offender
    from pg_proc
   where pronamespace = 'public'::regnamespace
     and array_to_string(coalesce(proacl, '{}')::text[], ' ') ~ '(^| )=X/';
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: EXECUTE accordé à PUBLIC sur : %', offender;
  end if;

  -- 7. `notifications` n'a aucun droit d'insertion, à personne. Deux barrières
  --    valent mieux qu'une : la policy manquante se remarque, le grant retiré
  --    se remet.
  if exists (select 1 from information_schema.table_privileges
              where table_schema = 'public' and table_name = 'notifications'
                and privilege_type = 'INSERT' and grantee in ('anon', 'authenticated'))
  then
    raise exception 'VITOLA_GRANT_GAP: notifications est insérable par un client';
  end if;

  raise notice
    '0010 social : RLS complète, keyset en invoker, cave refermée sur son grand livre.';
end;
$$;

commit;
