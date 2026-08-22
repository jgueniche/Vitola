-- =============================================================================
-- VITOLA — 0004 : commentaires de fiche, et le signalement DSA qu'ils imposent
-- -----------------------------------------------------------------------------
-- Applique l'ADR 0005, acceptée le 22 août 2026 :
--   docs/adr/0005-cible-des-commentaires.md
--
-- Les commentaires s'accrochent à `ref.cigars`. Une fiche est lisible d'un
-- visiteur anonyme derrière le portail : **le premier contenu utilisateur public
-- du produit arrive donc ici, en P1, et non en P3 avec le fil.** C'est ce qui
-- casse le défaut de la Q12, et pourquoi ce fichier crée aussi le schéma `mod`.
-- Livrer les commentaires sans la file de signalement, ce serait livrer le trou
-- de conformité que l'ADR décrit.
--
-- Ordre de lecture :
--   §1  Schéma `mod` et enums
--   §2  public.comments
--   §3  Le schéma `mod` : signalements et actions de modération
--   §4  Index
--   §5  Le seuil de prise de parole, en drapeau plutôt qu'en dur
--   §6  Grants
--   §7  Row Level Security
--   §8  Auto-contrôle
--
-- Ce que ce fichier ne fait PAS, et pourquoi :
--   Le rattachement des commentaires lors d'une **fusion de fiches** (§5.3) n'est
--   pas écrit. `ref.cigars` porte déjà `merged_into_id`, mais la fusion elle-même
--   n'existe pas : F3 la livrera. Écrire maintenant le déplacement des
--   commentaires, ce serait deviner la forme d'une fonctionnalité absente. Ce qui
--   est fait ici : la policy de lecture masque les commentaires d'une fiche non
--   publiée — une fiche fusionnée passe en `merged`, donc ses commentaires
--   cessent d'être visibles plutôt que de s'afficher sous une page morte.
-- =============================================================================

begin;

-- =============================================================================
-- §1 · SCHÉMA ET ENUMS
-- =============================================================================

create schema if not exists mod;

comment on schema mod is
  'Moderation and DSA reporting (§5.9). Deliberately NOT added to PostgREST''s '
  'exposed schemas: who reported whom, and what a moderator did about it, is the '
  'most sensitive data in the product. RLS is the first barrier, unreachability '
  'the second. Do not relax one thinking the other suffices.';

-- Les motifs que le DSA veut pouvoir distinguer, plus les deux qui sont propres
-- à ce site : la promotion du tabac (§2, loi Évin) et l'erreur factuelle, qui
-- n'est pas une faute mais une contribution mal aiguillée — elle doit repartir
-- vers la file de révision du wiki, pas vers la modération.
create type mod.report_reason as enum (
  'illegal_content',
  'tobacco_promotion',
  'inaccurate',
  'spam',
  'harassment',
  'other'
);

create type mod.report_status as enum ('open', 'reviewing', 'upheld', 'dismissed');

create type mod.moderation_verb as enum ('hide', 'restore', 'warn', 'suspend', 'delete');

-- =============================================================================
-- §2 · public.comments
-- -----------------------------------------------------------------------------
-- ADR 0005 : `cigar_id`, `author_id`, `body`, et rien d'autre. Pas de
-- `visibility` — un commentaire de fiche est public par construction, puisque la
-- fiche l'est. C'est la séparation nette d'avec l'ADR 0004 : le carnet a des
-- portées, les commentaires n'en ont pas.
--
-- Pas de note non plus. La note est le carnet et sa moyenne bayésienne ; un
-- score porté par un commentaire créerait une seconde population de notes,
-- invisible de `cigar_stats` et impossible à réconcilier.
-- =============================================================================

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  cigar_id   uuid not null references ref.cigars(id)  on delete cascade,
  author_id  uuid not null references auth.users(id)  on delete cascade,
  body       text not null,

  -- Modération a posteriori : un commentaire retiré cesse d'être visible, il ne
  -- disparaît pas. Le DSA exige de pouvoir motiver une décision et de la
  -- rétablir sur contestation ; un DELETE ne laisse rien à motiver ni à rendre.
  hidden_at     timestamptz,
  hidden_by     uuid references auth.users(id) on delete set null,
  hidden_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint comments_body_len check (length(btrim(body)) between 1 and 2000),
  constraint comments_hidden_is_motivated check (
    (hidden_at is null and hidden_by is null and hidden_reason is null)
    or (hidden_at is not null and hidden_by is not null
        and hidden_reason is not null and length(btrim(hidden_reason)) > 0)
  )
);

comment on table public.comments is
  'Talk page of a cigar entry (ADR 0005). Public by construction — the entry is. '
  'Hiding is reversible and must carry a reason: the DSA requires a motivated, '
  'contestable decision, which a DELETE cannot provide.';
comment on column public.comments.hidden_reason is
  'Never written by a client. Column absent from every GRANT, like profiles.role.';

create trigger comments_set_updated_at
  before update on public.comments
  for each row execute function public.tg_set_updated_at();

-- =============================================================================
-- §3 · LE SCHÉMA `mod`
-- -----------------------------------------------------------------------------
-- §5.9 du brief. Volontairement **non exposé à PostgREST** : c'est une seconde
-- barrière derrière la RLS, sur les données les plus sensibles du produit — qui
-- a signalé qui, et ce qu'un modérateur en a fait. Conséquence assumée et
-- consignée : un signalement n'entre pas dans l'export RGPD tant que le schéma
-- n'est pas joignable, ce que `lib/compliance/gdpr.ts` déclare explicitement au
-- lieu de le taire. `reporter_id` est donc `on delete set null` : l'effacement
-- d'un compte anonymise ses signalements plutôt que de les détruire, la file de
-- traitement devant survivre au départ de celui qui l'a alimentée.
-- =============================================================================

create table mod.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,

  -- Cible générique, sur le modèle de `public.audit_log` : une file DSA reçoit
  -- des signalements sur tout ce qui est public, et un point de contact unique
  -- est précisément ce que le règlement demande. Le CHECK borne ce « tout ».
  entity_schema text not null,
  entity_table  text not null,
  entity_id     text not null,

  reason mod.report_reason not null,
  detail text,
  status mod.report_status not null default 'open',

  created_at      timestamptz not null default now(),
  acknowledged_at timestamptz,
  decided_at      timestamptz,
  decided_by      uuid references auth.users(id) on delete set null,
  decision_note   text,

  constraint reports_entity_known check (
    entity_schema || '.' || entity_table in
      ('public.comments', 'public.reviews', 'ref.cigars', 'public.profiles')
  ),
  constraint reports_detail_len   check (detail is null or length(detail) <= 2000),
  constraint reports_decision_len check (decision_note is null or length(decision_note) <= 2000),
  -- Une décision sans date ni auteur n'est pas une décision.
  constraint reports_decision_complete check (
    status in ('open', 'reviewing')
    or (decided_at is not null and decided_by is not null)
  )
);

comment on table mod.reports is
  'DSA reporting queue. One contact point, every public surface. Not exposed to '
  'PostgREST: written by service-role code through app/api, read by moderators.';

create table mod.moderation_actions (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid references mod.reports(id) on delete set null,
  moderator_id uuid references auth.users(id)  on delete set null,
  verb         mod.moderation_verb not null,

  entity_schema text not null,
  entity_table  text not null,
  entity_id     text not null,

  reason     text not null,
  created_at timestamptz not null default now(),

  constraint moderation_actions_reason_len check (length(btrim(reason)) between 1 and 2000)
);

comment on table mod.moderation_actions is
  'What was actually done, and why. Append-only by convention and by grant: no '
  'UPDATE, no DELETE reaches any client role. A moderation history that can be '
  'rewritten is not a history.';

-- =============================================================================
-- §4 · INDEXES
-- =============================================================================

-- La lecture chaude : les commentaires visibles d'une fiche, du plus récent au
-- plus ancien. Partiel sur les non masqués, qui sont le cas normal.
create index comments_cigar_visible_idx on public.comments (cigar_id, created_at desc)
  where hidden_at is null;
create index comments_author_idx on public.comments (author_id, created_at desc);

-- La file de traitement : ce qui n'est pas encore tranché, du plus ancien au
-- plus récent — un délai DSA se compte depuis la réception.
create index reports_queue_idx on mod.reports (created_at)
  where status in ('open', 'reviewing');
create index reports_entity_idx   on mod.reports (entity_schema, entity_table, entity_id);
create index reports_reporter_idx on mod.reports (reporter_id, created_at desc);
create index moderation_actions_entity_idx on mod.moderation_actions
  (entity_schema, entity_table, entity_id, created_at desc);

-- =============================================================================
-- §5 · LE SEUIL DE PRISE DE PAROLE
-- -----------------------------------------------------------------------------
-- La question ouverte de l'ADR 0005 — qui a le droit de commenter — n'est pas
-- tranchée dans le SQL, parce qu'elle n'a pas à l'être : c'est un arbitrage qui
-- doit pouvoir changer sans migration. Il vit donc dans `feature_flags`.
--
-- Défaut appliqué : `member`, c'est-à-dire tout compte. Non par laxisme, mais
-- parce que le seuil `contributor` que je recommandais dans l'ADR vaut 50 points
-- de réputation, soit cinq révisions approuvées — et que la réputation démarre à
-- zéro. Le livrer ainsi, c'est livrer une fonctionnalité que personne ne peut
-- utiliser. Le risque qu'il couvre, le spam, est par ailleurs nul aujourd'hui :
-- `public_signup_open` est à `false` et il existe trois comptes.
--
-- Resserrer plus tard est un UPDATE d'une ligne. Desserrer après coup, quand des
-- gens se sont exprimés, ne l'est pas. C'est le sens de ce défaut, et il est à
-- rouvrir le jour où l'inscription s'ouvre.
-- =============================================================================

insert into public.feature_flags (key, enabled, description, payload) values
  ('comments_min_role', true,
   'Rôle minimum pour commenter une fiche (ADR 0005). Passer à "contributor" le '
   'jour où l''inscription s''ouvre — voir Q14 pour le barème de réputation.',
   '{"min_role": "member"}'::jsonb),
  ('dsa_report_sla_hours', true,
   'Délai de traitement annoncé pour un signalement, en heures. Publié dans les '
   'mentions légales : il engage, donc il se déclare ici et pas dans un gabarit.',
   '{"hours": 72}'::jsonb)
on conflict (key) do nothing;

create or replace function public.comment_min_role()
returns public.app_role
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select nullif(f.payload ->> 'min_role', '')::public.app_role
       from public.feature_flags f
      where f.key = 'comments_min_role' and f.enabled),
    'member'::public.app_role
  )
$$;

comment on function public.comment_min_role() is
  'Reads the comments_min_role flag. Falls back to member when the flag is off '
  'or missing: failing open here would be failing closed for the feature, and a '
  'missing flag must not silence everyone.';

revoke execute on function public.comment_min_role() from public;
grant execute on function public.comment_min_role() to anon, authenticated;

-- =============================================================================
-- §6 · GRANTS
-- =============================================================================

-- --- public.comments ---------------------------------------------------------
revoke all on public.comments from anon, authenticated;
grant select on public.comments to anon, authenticated;
grant insert on public.comments to authenticated;
grant update (body, updated_at) on public.comments to authenticated;
grant delete on public.comments to authenticated;
-- `hidden_at`, `hidden_by`, `hidden_reason`, `cigar_id` et `author_id` ne sont
-- dans aucun grant d'UPDATE : masquer est un acte de modération, écrit par du
-- code à clé de service, et un commentaire ne change ni d'auteur ni de fiche.

-- --- schéma mod --------------------------------------------------------------
-- Aucun USAGE pour anon ni authenticated : le schéma est fermé, la RLS n'est
-- qu'une seconde ligne. Les deux barrières sont voulues, ne pas relâcher l'une
-- en pensant que l'autre suffit.
grant usage on schema mod to service_role;
revoke all on all tables in schema mod from anon, authenticated;
alter default privileges in schema mod revoke all on tables from anon, authenticated;

-- =============================================================================
-- §7 · ROW LEVEL SECURITY
-- =============================================================================

-- --- public.comments ---------------------------------------------------------
alter table public.comments enable row level security;
alter table public.comments force row level security;

-- Comme pour `reviews` en 0003 : découpé par rôle plutôt qu'une seule expression,
-- pour qu'un visiteur anonyme n'ait jamais à évaluer une branche qui interroge
-- une table sur laquelle il n'a aucun droit.
-- L'EXISTS sur `ref.cigars` est soumis à la RLS de `ref.cigars` : « la fiche est
-- publiée » se déduit et ne se redit pas. Une fiche passée en `merged` fait donc
-- disparaître ses commentaires de la page morte, sans code de fusion.
create policy comments_select_visible on public.comments
  for select to anon, authenticated
  using (
    hidden_at is null
    and exists (select 1 from ref.cigars c where c.id = cigar_id and c.status = 'published')
  );

-- L'auteur voit son propre commentaire même masqué : le DSA veut qu'une décision
-- soit contestable, et on ne conteste pas ce qu'on ne voit plus.
create policy comments_select_own on public.comments
  for select to authenticated
  using (author_id = (select auth.uid()));

create policy comments_select_moderator on public.comments
  for select to authenticated
  using ((select public.has_min_role('moderator')));

create policy comments_insert_own on public.comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (select public.has_min_role(public.comment_min_role()))
    and exists (select 1 from ref.cigars c where c.id = cigar_id and c.status = 'published')
  );

-- On corrige ce qu'on a écrit, pas ce qui a été masqué : rouvrir un commentaire
-- retiré serait contourner la décision plutôt que la contester.
create policy comments_update_own on public.comments
  for update to authenticated
  using (author_id = (select auth.uid()) and hidden_at is null)
  with check (author_id = (select auth.uid()));

create policy comments_delete_own on public.comments
  for delete to authenticated
  using (author_id = (select auth.uid()));

create policy comments_delete_moderator on public.comments
  for delete to authenticated
  using ((select public.has_min_role('moderator')));

-- --- mod.reports -------------------------------------------------------------
alter table mod.reports enable row level security;
alter table mod.reports force row level security;

-- Le signalant suit son propre signalement : le DSA veut qu'il soit informé de
-- la décision. La policy existe avant l'écran, pour que l'écran n'ait pas à
-- réinventer la règle le jour où il arrive.
create policy reports_select_own on mod.reports
  for select to authenticated
  using (reporter_id = (select auth.uid()));

create policy reports_select_moderator on mod.reports
  for select to authenticated
  using ((select public.has_min_role('moderator')));

create policy reports_update_moderator on mod.reports
  for update to authenticated
  using ((select public.has_min_role('moderator')))
  with check ((select public.has_min_role('moderator')));

-- --- mod.moderation_actions --------------------------------------------------
alter table mod.moderation_actions enable row level security;
alter table mod.moderation_actions force row level security;

create policy moderation_actions_select_moderator on mod.moderation_actions
  for select to authenticated
  using ((select public.has_min_role('moderator')));

-- Aucune policy INSERT, UPDATE ni DELETE, et aucun grant : écrit exclusivement
-- par du code à clé de service, comme `public.audit_log`. Un historique de
-- modération réinscriptible n'est pas un historique.

-- =============================================================================
-- §8 · AUTO-CONTRÔLE
-- =============================================================================

do $$
declare
  offender text;
begin
  -- 1. §0.5 du brief, désormais sur trois schémas.
  select string_agg(format('%I.%I', n.nspname, c.relname), ', ' order by 1)
    into offender
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r'
     and n.nspname in ('public', 'ref', 'mod')
     and (c.relrowsecurity = false
          or not exists (select 1 from pg_policy p where p.polrelid = c.oid));
  if offender is not null then
    raise exception 'VITOLA_RLS_GAP: table(s) sans RLS ou sans policy : %', offender;
  end if;

  -- 2. Le schéma `mod` reste fermé aux rôles clients. C'est la seconde barrière ;
  --    si elle tombe, la RLS reste, mais on doit le savoir tout de suite.
  if has_schema_privilege('anon', 'mod', 'USAGE')
     or has_schema_privilege('authenticated', 'mod', 'USAGE') then
    raise exception 'VITOLA_SCOPE_GAP: le schéma mod est devenu joignable par un rôle client';
  end if;

  -- 3. Les colonnes de modération de `comments` ne sont écrivables par personne.
  select string_agg(column_name, ', ' order by column_name) into offender
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'comments'
     and privilege_type = 'UPDATE'
     and grantee in ('anon', 'authenticated')
     and column_name in ('hidden_at', 'hidden_by', 'hidden_reason', 'author_id', 'cigar_id');
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: colonne(s) de modération modifiables par un client : %', offender;
  end if;

  -- 4. Aucune fonction nouvelle appelable au titre de PUBLIC.
  select string_agg(proname, ', ' order by proname) into offender
    from pg_proc
   where pronamespace = 'public'::regnamespace
     and array_to_string(coalesce(proacl, '{}')::text[], ' ') ~ '(^| )=X/';
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: EXECUTE accordé à PUBLIC sur : %', offender;
  end if;

  raise notice '0004 commentaires : RLS complète, schéma mod fermé, colonnes de modération hors grant.';
end;
$$;

commit;
