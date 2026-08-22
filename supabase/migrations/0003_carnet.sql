-- =============================================================================
-- VITOLA — 0003 : le carnet du fumeur et la dégustation structurée (§5.4)
-- -----------------------------------------------------------------------------
-- Applique l'ADR 0004, acceptée le 22 août 2026 :
--   docs/adr/0004-portee-des-entrees-du-carnet.md
--
-- Les trois décisions qu'elle a prises, et où elles vivent dans ce fichier :
--   D1  Une seule table `reviews`, discriminant explicite `kind`      → §2
--   D2  L'enum porte la classe d'audience, `review_shares` les noms   → §1, §2
--   D3  Seules les entrées publiques alimentent une moyenne publique  → §4
--
-- Et la règle qui les tient ensemble : la visibilité est appliquée par la RLS,
-- et par rien d'autre (§6). Aucune requête applicative ne filtre `visibility`.
--
-- Ordre de lecture :
--   §1  Enums
--   §2  Tables
--   §3  Index
--   §4  cigar_stats — la moyenne bayésienne, publique seulement
--   §5  Grants
--   §6  Row Level Security
--   §7  Auto-contrôle
--
-- Ce que ce fichier ne fait PAS, et pourquoi :
--   `review_media` (§5.4) n'est pas créée. Elle exige un bucket de stockage, donc
--   une réponse à la Q8 (privé ou public), et surtout le chemin d'effacement que
--   `app/api/gdpr/delete` ne peut pas encore écrire : `deleteUser` supprime des
--   lignes, jamais des objets. Créer la table avant ce chemin, c'est livrer un
--   trou RGPD daté. Elle arrivera avec le téléversement, dans le même commit.
-- =============================================================================

begin;

-- =============================================================================
-- §1 · ENUMS
-- -----------------------------------------------------------------------------
-- Les quatre valeurs de `review_visibility` sont déclarées ici, `followers`
-- comprise, bien que `public.follows` n'existe qu'en P3. Ce n'est pas de
-- l'anticipation gratuite : depuis PostgreSQL 12, `ALTER TYPE … ADD VALUE`
-- s'exécute dans une transaction, mais la valeur ajoutée n'y est utilisable par
-- rien — ni un INSERT, ni une policy, ni un index partiel :
--
--   begin;
--   alter type t add value 'shared';
--   create policy p on t_rev for select using (visibility = 'shared');
--   -- ERROR: unsafe use of new value "shared" of enum type t
--
-- Or toute migration de ce dépôt est un `begin … commit` unique. Ajouter
-- `followers` plus tard coûterait deux migrations pour un mot.
-- =============================================================================

-- Le discriminant de l'ADR 0004, D1. `log` est le geste quotidien du carnet ;
-- `tasting` est l'exercice du §5.4 — trois tiers, roue des arômes.
create type public.review_kind as enum ('log', 'tasting');

create type public.review_visibility as enum (
  'private',    -- l'auteur seul. Défaut, et c'est la minimisation de l'art. 25.
  'shared',     -- l'auteur et les personnes nommées dans review_shares.
  'followers',  -- l'auteur et ses abonnés. Branche de policy livrée avec P3.
  'public'      -- tout le monde. La seule portée qui compte dans cigar_stats.
);

-- §5.4 du brief. Les familles sont du vocabulaire de métier : elles restent
-- telles quelles, comme les valeurs hispanophones de la Q18.
create type public.aroma_family as enum (
  'boise', 'torrefie', 'epice', 'terreux', 'animal',
  'fruite', 'floral', 'sucre', 'vegetal', 'mineral', 'defaut'
);

-- =============================================================================
-- §2 · TABLES
-- =============================================================================

-- --- public.aroma_taxonomy ---------------------------------------------------
-- Référentiel d'arômes, arborescent. Lecture publique, écriture réservée aux
-- éditeurs : c'est une nomenclature, pas une contribution.
create table public.aroma_taxonomy (
  id         integer generated always as identity primary key,
  parent_id  integer references public.aroma_taxonomy(id) on delete restrict,
  family     public.aroma_family not null,
  slug       text not null,
  label_fr   text not null,
  label_en   text,
  created_at timestamptz not null default now(),

  constraint aroma_taxonomy_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint aroma_taxonomy_label_len  check (length(label_fr) between 1 and 60),
  constraint aroma_taxonomy_not_self   check (parent_id is null or parent_id <> id)
);

comment on table public.aroma_taxonomy is
  'Aroma wheel (§5.4). Reference data: public read, editor write. Referenced by '
  'reviews.aroma_tags, which is an integer[] rather than a join table because a '
  'tag list is read whole or not at all.';

create unique index aroma_taxonomy_slug_key on public.aroma_taxonomy (slug);
create index aroma_taxonomy_parent_idx on public.aroma_taxonomy (parent_id);
create index aroma_taxonomy_family_idx on public.aroma_taxonomy (family);

-- --- public.reviews ----------------------------------------------------------
-- ADR 0004, D1 : une seule table pour le carnet et la dégustation. Une entrée de
-- carnet est une dégustation dégénérée — même auteur, même cigare, même date,
-- même note, sans les tiers ni les arômes. Deux tables auraient rendu
-- `humidor_events.review_id` (§5.5) polymorphe et obligé `cigar_stats` à
-- moyenner sur une union : trois endroits où oublier l'une des deux est
-- silencieux.
create table public.reviews (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  cigar_id           uuid not null references ref.cigars(id) on delete cascade,

  kind               public.review_kind       not null default 'log',
  visibility         public.review_visibility not null default 'private',

  -- Note sur 100 (§5.4), avec bascule /20 en préférence d'affichage seulement :
  -- convertir au stockage ferait deux échelles dans la même colonne.
  score_total        numeric(4,1),
  scores             jsonb   not null default '{}'::jsonb,
  aroma_tags         integer[] not null default '{}'::integer[],

  strength_perceived ref.strength,
  smoke_duration_min integer,
  pairing_text       text,
  pairing_tags       text[]  not null default '{}'::text[],
  box_code           text,
  production_year    smallint,
  purchase_year      smallint,
  humidity_pct       numeric(4,1),
  is_blind           boolean not null default false,
  body               text,

  -- Le « quand » du carnet, distinct de created_at : on note souvent le
  -- lendemain, et une statistique de P11 porte sur la date de consommation.
  smoked_on          date    not null default current_date,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint reviews_score_range check (score_total is null or score_total between 0 and 100),
  constraint reviews_scores_object check (jsonb_typeof(scores) = 'object'),

  -- Les six sous-notes du §5.4 et rien d'autre. Écrit comme une soustraction de
  -- clés plutôt qu'avec une sous-requête : un CHECK n'en accepte pas.
  constraint reviews_scores_known_keys check (
    scores - array['construction', 'draw', 'burn', 'aroma', 'evolution', 'finish']::text[]
      = '{}'::jsonb
  ),

  -- ADR 0004, D1 : le discriminant doit vouloir dire quelque chose. Une
  -- dégustation porte sa structure ; un formulaire progressif (F5) enregistre
  -- dès le premier tiers, donc « non vide » et non « complète ».
  constraint reviews_tasting_has_structure check (kind <> 'tasting' or scores <> '{}'::jsonb),

  -- Et une entrée de carnet dit au moins quelque chose : une note, ou un mot.
  -- Sans cela, « j'ai fumé ce cigare » est une ligne vide avec une date.
  constraint reviews_log_says_something check (
    kind <> 'log'
    or score_total is not null
    or (body is not null and length(btrim(body)) > 0)
  ),

  constraint reviews_body_len      check (body is null or length(body) <= 4000),
  constraint reviews_pairing_len   check (pairing_text is null or length(pairing_text) <= 500),
  constraint reviews_box_code_len  check (box_code is null or length(box_code) between 1 and 40),
  constraint reviews_duration      check (smoke_duration_min is null or smoke_duration_min between 1 and 600),
  constraint reviews_humidity      check (humidity_pct is null or humidity_pct between 0 and 100),
  constraint reviews_production_yr check (production_year is null or production_year between 1850 and 2200),
  constraint reviews_purchase_yr   check (purchase_year   is null or purchase_year   between 1850 and 2200),
  constraint reviews_pairing_tags_len check (cardinality(pairing_tags) <= 12),
  constraint reviews_aroma_tags_len   check (cardinality(aroma_tags)   <= 30)
);

comment on table public.reviews is
  'The smoker''s notebook and the structured tasting, in one table (ADR 0004). '
  'Scope is enforced by RLS alone: no application query filters `visibility`.';
comment on column public.reviews.visibility is
  'Audience class. `shared` names its recipients in public.review_shares — one '
  'row each, so "to Marc" and "to Marc and Julie" are the same mode.';
comment on column public.reviews.smoked_on is
  'When it was smoked, not when the row was written. P11 counts on this one.';

create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute function public.tg_set_updated_at();

-- --- public.review_shares ----------------------------------------------------
-- ADR 0004, D2 : la table qui nomme les personnes. Ajouter un destinataire est
-- un INSERT, jamais un UPDATE de l'entrée — donc pas de course à la mise à jour,
-- et pas de bruit dans l'historique d'une entrée qui n'a pas changé.
create table public.review_shares (
  review_id  uuid not null references public.reviews(id)  on delete cascade,
  grantee_id uuid not null references auth.users(id)      on delete cascade,
  granted_by uuid not null references auth.users(id)      on delete cascade,
  granted_at timestamptz not null default now(),

  primary key (review_id, grantee_id),

  -- Se partager à soi-même n'ajoute aucun droit et fausse le compte des
  -- destinataires que le seuil de réouverture de l'ADR 0004 mesure.
  constraint review_shares_not_self check (grantee_id <> granted_by)
);

comment on table public.review_shares is
  'Per-entry authorisation (ADR 0004). Never per-user: "share my whole notebook '
  'with Marc" is a different feature and needs its own ADR. `granted_by` exists '
  'so that "who opened this?" is answerable; only the author may insert.';

-- --- public.review_thirds ----------------------------------------------------
-- Les trois tiers du §5.4. Table séparée plutôt que trois colonnes : le §5.4 le
-- demande, et un tiers absent est différent d'un tiers vide.
create table public.review_thirds (
  review_id uuid     not null references public.reviews(id) on delete cascade,
  third     smallint not null,
  notes     text,

  primary key (review_id, third),
  constraint review_thirds_range check (third between 1 and 3),
  constraint review_thirds_len   check (notes is null or length(notes) <= 2000)
);

comment on table public.review_thirds is
  'Per-third notes of a structured tasting (§5.4). Visibility is inherited from '
  'the parent entry through an EXISTS sub-query, which is itself subject to '
  'reviews'' RLS — the mechanism ref.cigar_images already uses.';

-- =============================================================================
-- §3 · INDEXES
-- -----------------------------------------------------------------------------
-- Le §8 du brief impose le composite `(cigar_id, created_at)` sur `reviews`.
-- Il est ici en variante **partielle** sur les entrées publiques : c'est la
-- lecture chaude — la fiche cigare et `cigar_stats` — et le prédicat partiel est
-- exactement celui de la décision D3.
-- =============================================================================

create index reviews_cigar_public_idx on public.reviews (cigar_id, created_at desc)
  where visibility = 'public';

-- Le composite complet, pour l'auteur et pour la fusion de fiches, qui doivent
-- voir toutes les portées.
create index reviews_cigar_idx on public.reviews (cigar_id, created_at desc);

-- Le carnet de son auteur, toutes portées confondues.
create index reviews_user_idx on public.reviews (user_id, smoked_on desc, created_at desc);

-- La branche `shared` de la policy, prise par les deux bouts.
create index review_shares_grantee_idx on public.review_shares (grantee_id, review_id);
create index review_shares_granted_by_idx on public.review_shares (granted_by);

-- §8 : GIN sur aroma_tags.
create index reviews_aroma_tags_idx on public.reviews using gin (aroma_tags);

-- =============================================================================
-- §4 · cigar_stats — LA MOYENNE BAYÉSIENNE
-- -----------------------------------------------------------------------------
-- ADR 0004, D3 : **seules les entrées publiques comptent.** Compter les entrées
-- privées ouvrirait une voie d'inférence — sur un cigare peu noté, la moyenne
-- publique bouge de façon observable quand une entrée privée est ajoutée, et une
-- donnée privée devient déductible d'une donnée publique.
--
-- Une vue matérialisée n'accepte PAS de RLS. Le `where visibility = 'public'`
-- ci-dessous est donc la frontière de sécurité entière, au même titre que le
-- filtre par sujet de l'export RGPD. Il est écrit une fois, et le §7 vérifie
-- qu'il y est toujours.
--
-- Moyenne bayésienne (§5.4), et non arithmétique : sans elle un cigare noté une
-- fois à 98 domine le classement. Poids de l'a priori fixé à 10 avis — la
-- moyenne d'un cigare n'atteint la moitié du chemin vers sa vraie valeur qu'au
-- dixième avis. C'est aussi ce qui rend D3 supportable : la moyenne publique
-- porte sur moins d'entrées qu'il n'en existe, et l'a priori absorbe ce petit n.
-- =============================================================================

create materialized view public.cigar_stats as
with published as (
  select r.cigar_id, r.score_total, r.created_at
    from public.reviews r
   where r.visibility = 'public'
     and r.score_total is not null
),
prior as (
  -- 80/100 quand il n'existe encore aucune note : une valeur neutre haute, qui
  -- ne récompense ni ne punit un cigare dont personne n'a rien dit.
  select coalesce(avg(score_total), 80.0)::numeric as mean from published
)
select
  p.cigar_id,
  count(*)::integer                                    as review_count,
  round(avg(p.score_total), 1)                         as mean_score,
  round(
    (10 * (select mean from prior) + sum(p.score_total)) / (10 + count(*)),
    1
  )                                                    as bayesian_score,
  count(*) filter (where p.created_at >= now() - interval '90 days')::integer
                                                       as review_count_90d,
  round(avg(p.score_total) filter (where p.created_at >= now() - interval '90 days'), 1)
                                                       as mean_score_90d,
  jsonb_build_object(
    'lt60',  count(*) filter (where p.score_total <  60),
    'b60_69', count(*) filter (where p.score_total >= 60 and p.score_total < 70),
    'b70_79', count(*) filter (where p.score_total >= 70 and p.score_total < 80),
    'b80_89', count(*) filter (where p.score_total >= 80 and p.score_total < 90),
    'b90_100', count(*) filter (where p.score_total >= 90)
  )                                                    as distribution,
  max(p.created_at)                                    as last_review_at
from published p
group by p.cigar_id;

comment on materialized view public.cigar_stats is
  'Public rating aggregate (§5.4). Reads ONLY visibility = ''public'' — a '
  'materialized view cannot carry RLS, so that predicate is the security '
  'boundary, not an optimisation. Refreshed by public.refresh_cigar_stats().';

-- Obligatoire pour REFRESH … CONCURRENTLY, qui est le seul mode qui ne verrouille
-- pas la fiche cigare pendant le calcul.
create unique index cigar_stats_cigar_key on public.cigar_stats (cigar_id);
create index cigar_stats_bayesian_idx on public.cigar_stats (bayesian_score desc);

create or replace function public.refresh_cigar_stats()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- CONCURRENTLY exige l'index unique ci-dessus et un premier peuplement.
  refresh materialized view concurrently public.cigar_stats;
exception when object_not_in_prerequisite_state then
  -- Première exécution : la vue n'a jamais été peuplée, CONCURRENTLY refuse.
  refresh materialized view public.cigar_stats;
end;
$$;

comment on function public.refresh_cigar_stats() is
  'Service-role only. SECURITY DEFINER because refreshing reads every public '
  'review, which no client role may do directly.';

-- =============================================================================
-- §5 · GRANTS
-- -----------------------------------------------------------------------------
-- Supabase accorde ALL sur toute nouvelle table de `public` à anon et
-- authenticated. Chaque grant est donc précédé d'un REVOKE : la surface de
-- privilège se déclare ici et nulle part ailleurs.
-- =============================================================================

-- --- public.aroma_taxonomy ---------------------------------------------------
revoke all on public.aroma_taxonomy from anon, authenticated;
grant select on public.aroma_taxonomy to anon, authenticated;
grant insert, update on public.aroma_taxonomy to authenticated;  -- éditeurs, par policy

-- --- public.reviews ----------------------------------------------------------
revoke all on public.reviews from anon, authenticated;
-- anon lit : une entrée publique est publique, y compris pour un visiteur non
-- connecté derrière le portail. La RLS décide laquelle, pas ce grant.
grant select on public.reviews to anon, authenticated;
grant insert on public.reviews to authenticated;
grant update (
  kind, visibility, score_total, scores, aroma_tags, strength_perceived,
  smoke_duration_min, pairing_text, pairing_tags, box_code, production_year,
  purchase_year, humidity_pct, is_blind, body, smoked_on, updated_at
) on public.reviews to authenticated;
grant delete on public.reviews to authenticated;
-- `user_id` et `cigar_id` n'apparaissent dans aucun grant d'UPDATE : une entrée
-- ne change ni d'auteur ni de cigare. Se tromper de fiche, c'est supprimer et
-- ressaisir — visible, plutôt qu'un glissement silencieux dans les statistiques.

-- --- public.review_shares ----------------------------------------------------
revoke all on public.review_shares from anon, authenticated;
grant select, insert, delete on public.review_shares to authenticated;
-- Aucun UPDATE : on accorde ou on retire, on ne modifie pas une autorisation.

-- --- public.review_thirds ----------------------------------------------------
revoke all on public.review_thirds from anon, authenticated;
grant select on public.review_thirds to anon, authenticated;
grant insert, update, delete on public.review_thirds to authenticated;

-- --- public.cigar_stats ------------------------------------------------------
revoke all on public.cigar_stats from anon, authenticated;
grant select on public.cigar_stats to anon, authenticated;

-- --- fonctions ---------------------------------------------------------------
-- PostgreSQL accorde EXECUTE à PUBLIC sur TOUTE nouvelle fonction. La migration
-- 0002 a fermé les neuf existantes, mais son `alter default privileges` ne
-- visait qu'anon et authenticated : le défaut PUBLIC, lui, revient à chaque
-- `create function`. Il est fermé ici pour de bon, sur la fonction et par
-- défaut, faute de quoi supabase/tests/02_function_grants.sql échoue — et il a
-- raison d'échouer.
revoke execute on function public.refresh_cigar_stats() from public;
revoke execute on function public.refresh_cigar_stats() from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public;

-- =============================================================================
-- §5bis · LE BRISEUR DE CYCLE
-- -----------------------------------------------------------------------------
-- `reviews` et `review_shares` se lisent mutuellement dans leurs policies :
-- la branche `shared` de `reviews` interroge `review_shares` pour savoir qui est
-- nommé, et `review_shares` doit interroger `reviews` pour savoir qui est
-- l'auteur. PostgreSQL détecte le cycle **structurellement**, sans regarder les
-- données, et refuse :
--
--   ERROR: infinite recursion detected in policy for relation "review_shares"
--
-- Ce n'était pas prévu par l'ADR 0004, qui affirmait le contraire en
-- raisonnant sur le chemin d'exécution plutôt que sur le graphe des policies.
-- Le test C6 l'a montré ; la correction est consignée dans l'ADR.
--
-- Le cycle se coupe du côté FROID. Lire `reviews` est le chemin chaud — la fiche
-- cigare, le fil de P3, les statistiques — et il doit rester un EXISTS ordinaire
-- que le planificateur sait servir par `review_shares_grantee_idx`. Partager une
-- entrée est rare. C'est donc `review_shares` qui passe par une fonction
-- SECURITY DEFINER, laquelle n'expanse pas la RLS de `reviews`.
--
-- Même raison d'être que `current_app_role()` en 0001, et même précaution : elle
-- ne révèle rien, puisqu'elle ne répond que sur l'appelant lui-même.
-- =============================================================================

create or replace function public.owns_review(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.reviews r
     where r.id = target and r.user_id = (select auth.uid())
  )
$$;

comment on function public.owns_review(uuid) is
  'Breaks the reviews <-> review_shares policy cycle. SECURITY DEFINER so that '
  'reading reviews here does not re-expand its RLS. Answers only about the '
  'caller, so it discloses nothing they could not already read.';

revoke execute on function public.owns_review(uuid) from public;
grant execute on function public.owns_review(uuid) to authenticated;

-- =============================================================================
-- §6 · ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
-- ADR 0004 : la visibilité est appliquée ici, et par rien d'autre.
--
-- `(select auth.uid())` est enveloppé dans une sous-requête scalaire : PostgreSQL
-- l'évalue alors une fois en InitPlan, et non une fois par ligne.
-- =============================================================================

-- --- public.aroma_taxonomy ---------------------------------------------------
alter table public.aroma_taxonomy enable row level security;
alter table public.aroma_taxonomy force row level security;

create policy aroma_taxonomy_select_all on public.aroma_taxonomy
  for select to anon, authenticated
  using (true);

create policy aroma_taxonomy_insert_editor on public.aroma_taxonomy
  for insert to authenticated
  with check ((select public.has_min_role('editor')));

create policy aroma_taxonomy_update_editor on public.aroma_taxonomy
  for update to authenticated
  using ((select public.has_min_role('editor')))
  with check ((select public.has_min_role('editor')));

-- --- public.reviews ----------------------------------------------------------
alter table public.reviews enable row level security;
alter table public.reviews force row level security;

-- Quatre policies permissives, donc OR-ées, plutôt qu'une seule expression.
-- Ce n'est pas une préférence de style : une policy unique `to anon,
-- authenticated` fait évaluer la sous-requête sur `review_shares` pour un
-- visiteur anonyme, qui n'a aucun droit de lecture dessus. Résultat mesuré,
-- avant correction : « permission denied for table review_shares » sur un
-- simple `select from public.reviews` en tant qu'anon — c'est-à-dire la lecture
-- publique cassée, exactement comme `current_app_role()` l'avait cassée dans la
-- 0002. Découpées par rôle, les branches inaccessibles à anon ne sont jamais
-- planifiées, et aucun droit ne lui est accordé sur une table d'autorisations.
create policy reviews_select_public on public.reviews
  for select to anon, authenticated
  using (visibility = 'public');

create policy reviews_select_own on public.reviews
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy reviews_select_shared on public.reviews
  for select to authenticated
  using (
    visibility = 'shared'
    and exists (
      select 1 from public.review_shares s
       where s.review_id = id and s.grantee_id = (select auth.uid())
    )
  );
-- La branche `followers` arrive avec public.follows, en P3. Jusque-là une entrée
-- `followers` n'est lisible que de son auteur : fermé, pas ouvert.

create policy reviews_select_moderator on public.reviews
  for select to authenticated
  using ((select public.has_min_role('moderator')));

create policy reviews_insert_own on public.reviews
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    -- On ne note pas un brouillon. L'EXISTS est soumis à la RLS de ref.cigars,
    -- donc « publiée » se déduit et ne se redit pas.
    and exists (select 1 from ref.cigars c where c.id = cigar_id and c.status = 'published')
  );

create policy reviews_update_own on public.reviews
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy reviews_delete_own on public.reviews
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy reviews_delete_moderator on public.reviews
  for delete to authenticated
  using ((select public.has_min_role('moderator')));

-- --- public.review_shares ----------------------------------------------------
alter table public.review_shares enable row level security;
alter table public.review_shares force row level security;

-- Ne lit PAS `reviews` : c'est ce qui garantit l'absence de récursion avec la
-- policy SELECT de `reviews`, qui lit cette table.
create policy review_shares_select_involved on public.review_shares
  for select to authenticated
  using (grantee_id = (select auth.uid()) or granted_by = (select auth.uid()));

-- Seul l'auteur de l'entrée partage, et il se nomme comme celui qui partage.
-- Un destinataire ne peut donc pas repartager : l'ADR 0004 l'interdit, et c'est
-- cette policy qui l'applique.
create policy review_shares_insert_author on public.review_shares
  for insert to authenticated
  with check (granted_by = (select auth.uid()) and public.owns_review(review_id));

create policy review_shares_delete_author on public.review_shares
  for delete to authenticated
  using (public.owns_review(review_id));

-- --- public.review_thirds ----------------------------------------------------
alter table public.review_thirds enable row level security;
alter table public.review_thirds force row level security;

-- L'EXISTS est soumis à la RLS de `reviews` : la visibilité d'un tiers suit
-- celle de son entrée, sans logique dupliquée. Même mécanisme que
-- ref.cigar_images, ligne 1230 de la migration 0001.
create policy review_thirds_select_visible on public.review_thirds
  for select to anon, authenticated
  using (exists (select 1 from public.reviews r where r.id = review_id));

create policy review_thirds_write_own on public.review_thirds
  for insert to authenticated
  with check (
    exists (select 1 from public.reviews r
             where r.id = review_id and r.user_id = (select auth.uid()))
  );

create policy review_thirds_update_own on public.review_thirds
  for update to authenticated
  using (
    exists (select 1 from public.reviews r
             where r.id = review_id and r.user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.reviews r
             where r.id = review_id and r.user_id = (select auth.uid()))
  );

create policy review_thirds_delete_own on public.review_thirds
  for delete to authenticated
  using (
    exists (select 1 from public.reviews r
             where r.id = review_id and r.user_id = (select auth.uid()))
  );

-- =============================================================================
-- §7 · AUTO-CONTRÔLE
-- -----------------------------------------------------------------------------
-- Même principe qu'au §11 de 0001 : un invariant asserté hors de la transaction
-- qui l'établit n'est vrai qu'au moment où on l'a écrit.
-- =============================================================================

do $$
declare
  offender text;
begin
  -- 1. §0.5 du brief : aucune table sans RLS et sans policy.
  select string_agg(format('%I.%I', n.nspname, c.relname), ', ' order by 1)
    into offender
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r'
     and n.nspname in ('public', 'ref')
     and (c.relrowsecurity = false
          or not exists (select 1 from pg_policy p where p.polrelid = c.oid));
  if offender is not null then
    raise exception 'VITOLA_RLS_GAP: table(s) sans RLS ou sans policy : %', offender;
  end if;

  -- 2. ADR 0004, D3. Une vue matérialisée n'a pas de RLS : si ce prédicat
  --    disparaît de sa définition, toutes les entrées privées entrent dans une
  --    moyenne publique et rien d'autre ne s'en apercevra.
  if position('visibility = ''public''' in pg_get_viewdef('public.cigar_stats'::regclass)) = 0 then
    raise exception
      'VITOLA_SCOPE_GAP: cigar_stats ne filtre plus visibility = public (ADR 0004, D3)';
  end if;

  -- 3. Aucune fonction nouvelle appelable au titre de PUBLIC — le défaut que
  --    PostgreSQL réapplique à chaque create function.
  select string_agg(proname, ', ' order by proname) into offender
    from pg_proc
   where pronamespace = 'public'::regnamespace
     and array_to_string(coalesce(proacl, '{}')::text[], ' ') ~ '(^| )=X/';
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: EXECUTE accordé à PUBLIC sur : %', offender;
  end if;

  -- 4. `user_id` et `cigar_id` ne doivent être écrivables par aucun client :
  --    une entrée ne change ni d'auteur ni de cigare.
  select string_agg(column_name, ', ' order by column_name) into offender
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'reviews'
     and privilege_type = 'UPDATE'
     and grantee in ('anon', 'authenticated')
     and column_name in ('user_id', 'cigar_id');
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: colonne(s) de reviews modifiables par un client : %', offender;
  end if;

  raise notice '0003 carnet : RLS complète, portée publique préservée, grants fermés.';
end;
$$;

commit;
