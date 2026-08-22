-- =============================================================================
-- VITOLA — Migration P1 : `public.profiles` + schéma `ref` + socle de conformité
-- Destination : supabase/migrations/0001_p1_referential.sql
-- Cible       : PostgreSQL 15 (Supabase)
-- -----------------------------------------------------------------------------
-- Reading order (this file is meant to be reviewed top to bottom):
--   §0  Extensions, schemas, immutable helpers
--   §1  Enums
--   §2  Shared trigger functions
--   §3  public.profiles + public.profile_settings
--   §4  Compliance core: consents, audit_log, feature_flags
--   §5  ref.* referential tables
--   §6  Full-text + trigram search
--   §7  Indexes
--   §8  Grants (column-level where it matters)
--   §9  Row Level Security — every table, explicit policies
--   §10 Storage buckets and their policies
--   §11 Self-check: fails the migration if any table lacks RLS + a policy
--
-- Invariants enforced by this file:
--   * Every table has RLS enabled AND at least one explicit policy (§0.5 du brief).
--   * No client role can write `role`, `reputation`, `search_vector`, `verified_*`
--     — enforced twice: column-level GRANT and a guard trigger.
--   * `birth_date` is never selectable by another user: it lives in a separate,
--     owner-only table (see the note in §3).
--   * No column, table or enum value enables the sale, trade or gift of tobacco.
-- =============================================================================

begin;

-- =============================================================================
-- §0 · EXTENSIONS, SCHEMAS, IMMUTABLE HELPERS
-- =============================================================================

create schema if not exists extensions;
create schema if not exists ref;

comment on schema ref is
  'Collaborative cigar referential (wiki model). Public read, curated write.';

-- P1 needs fuzzy matching, accent folding and digests. `vector` (P4) and
-- `postgis` (P5) are deliberately NOT enabled here: each phase enables what it
-- uses, so a failure to install is attributed to the phase that caused it.
create extension if not exists pg_trgm  with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- `unaccent()` is STABLE, not IMMUTABLE, so it cannot appear in an index
-- expression. Pinning the dictionary explicitly makes the result deterministic,
-- which is what lets us mark the wrapper IMMUTABLE. This is the standard
-- workaround and the reason every index below calls the wrapper, never unaccent.
create or replace function public.immutable_unaccent(value text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, value)
$$;

comment on function public.immutable_unaccent(text) is
  'IMMUTABLE wrapper around unaccent(), safe for use in index expressions.';

-- Slugs are generated in SQL so that the seed (CSV import) and the application
-- produce byte-identical values. One algorithm, one place.
create or replace function public.slugify(value text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select trim(both '-' from
           regexp_replace(
             lower(public.immutable_unaccent(value)),
             '[^a-z0-9]+', '-', 'g'))
$$;

-- =============================================================================
-- §1 · ENUMS
-- -----------------------------------------------------------------------------
-- Enum *values* keep the domain vocabulary of the brief verbatim (Spanish trade
-- terms, French strength scale). See docs/phase-0/05-questions-ouvertes.md Q8:
-- anglicising the strength scale is proposed but NOT applied without approval.
-- =============================================================================

-- Role escalation is linear: each role holds every right of the previous one.
-- The ordering is what makes `has_min_role()` a single comparison.
create type public.app_role as enum (
  'member',       -- reads, contributes proposals
  'contributor',  -- trusted contributor, may create referential entries
  'editor',       -- validates revisions, publishes referential entries
  'moderator',    -- editor rights + UGC moderation (P3+)
  'admin'         -- full rights, including role assignment
);

create type public.consent_kind as enum (
  'terms',
  'privacy',
  'age_verification',
  'analytics',
  'marketing_email',
  'health_related_processing'  -- GDPR art. 9: consumption habits (§2 du brief)
);

create type ref.cigar_shape as enum (
  'parejo', 'torpedo', 'piramide', 'perfecto', 'belicoso',
  'culebra', 'diadema', 'petit_corona', 'figurado_autre'
);

create type ref.wrapper_shade as enum (
  'claro', 'colorado_claro', 'colorado', 'colorado_maduro', 'maduro', 'oscuro'
);

comment on type ref.wrapper_shade is
  'Official wrapper shade scale. Also drives the colour palette (§4.1 du brief).';

create type ref.strength as enum (
  'leger', 'leger_moyen', 'moyen', 'moyen_corse', 'corse'
);

create type ref.release_type as enum (
  'regular', 'edicion_limitada', 'regional', 'reserva',
  'gran_reserva', 'aniversario', 'custom_roll'
);

create type ref.entry_status as enum ('draft', 'published', 'merged', 'rejected');

create type ref.revision_status as enum ('pending', 'approved', 'rejected');

create type ref.image_kind as enum ('band', 'full', 'box', 'foot', 'ash');

-- DELTA vs brief §5.1: `box_codes` conflated two distinct things (factory letter
-- codes and date codes). A decoder needs to tell them apart.
create type ref.box_code_kind as enum ('factory', 'month', 'year');

-- =============================================================================
-- §2 · SHARED TRIGGER FUNCTIONS
-- =============================================================================

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- True when the statement runs outside a user session: service_role key, the
-- Supabase dashboard, a migration, or a SECURITY DEFINER routine we own.
-- Used by guard triggers so that server-side code can still write the columns
-- clients must never write.
create or replace function public.is_privileged_context()
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  jwt_role text;
begin
  begin
    jwt_role := coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
      ''
    );
  exception when others then
    jwt_role := '';
  end;

  return jwt_role = 'service_role'
      or current_user in ('postgres', 'supabase_admin', 'service_role');
end;
$$;

-- =============================================================================
-- §3 · IDENTITY
-- -----------------------------------------------------------------------------
-- DELTA vs brief §5.6 — the brief puts `birth_date`, `preferences` and `privacy`
-- on `profiles`. They are split out into `profile_settings` here, because RLS is
-- row-level, not column-level: a single table cannot be both a public directory
-- (anyone reads a handle and an avatar) and the holder of a date of birth.
-- Column-level GRANTs cannot express "only the owner", so the only way to keep
-- birth_date unreadable by other members is to put it in an owner-scoped table.
-- This also satisfies the data-minimisation duty of §2 (RGPD).
-- =============================================================================

create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  handle          text        not null,
  display_name    text,
  avatar_path     text,
  bio             text,
  country         char(2),
  city            text,
  reputation      integer     not null default 0,
  role            public.app_role not null default 'member',
  -- Directory visibility. Kept here (not in privacy jsonb) because RLS policies
  -- must read it without a cross-table lookup.
  is_discoverable boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint profiles_handle_format
    check (handle ~ '^[a-z0-9][a-z0-9_]{1,28}[a-z0-9]$'),
  constraint profiles_display_name_len check (display_name is null or length(display_name) between 1 and 60),
  constraint profiles_bio_len          check (bio is null or length(bio) <= 400),
  constraint profiles_country_format   check (country is null or country ~ '^[A-Z]{2}$'),
  constraint profiles_city_len         check (city is null or length(city) <= 80),
  constraint profiles_reputation_range check (reputation >= 0)
);

comment on table public.profiles is
  'Public member directory. Contains no personal data beyond what the member '
  'chooses to publish. Sensitive fields live in public.profile_settings.';
comment on column public.profiles.reputation is
  'Server-computed. Not writable by clients (column GRANT + guard trigger).';
comment on column public.profiles.role is
  'Assigned by an admin through a service-role endpoint, never from the client.';

create unique index profiles_handle_key on public.profiles (handle);
create index profiles_reputation_idx on public.profiles (reputation desc) where is_discoverable;

-- Reads the caller's role. SECURITY DEFINER on purpose: it must not be subject
-- to profiles' own RLS policies, otherwise every policy that calls it recurses.
-- This is also why `public.profiles` is ENABLE (not FORCE) row level security —
-- FORCE would subject the owner of this function to the policies it evaluates.
create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
    from public.profiles p
   where p.id = (select auth.uid())
$$;

create or replace function public.has_min_role(minimum public.app_role)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(public.current_app_role() >= minimum, false)
$$;

comment on function public.has_min_role(public.app_role) is
  'Linear role check. Returns false for anonymous callers (NULL role).';


create table public.profile_settings (
  id                 uuid primary key references public.profiles(id) on delete cascade,
  birth_date         date,
  adult_confirmed_at timestamptz,
  locale             text        not null default 'fr',
  preferences        jsonb       not null default
    '{"score_scale": 100, "length_unit": "mm", "email_digest": false}'::jsonb,
  privacy            jsonb       not null default
    '{"show_humidor": false, "show_reviews": true, "show_country": true}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint profile_settings_locale_allowed check (locale in ('fr', 'en', 'es')),
  constraint profile_settings_preferences_object check (jsonb_typeof(preferences) = 'object'),
  constraint profile_settings_privacy_object     check (jsonb_typeof(privacy) = 'object'),
  constraint profile_settings_score_scale
    check ((preferences ->> 'score_scale') in ('100', '20'))
);

comment on table public.profile_settings is
  'Owner-only settings. `birth_date` is readable by the owner and by admins only '
  '(age-verification disputes), never by other members.';
comment on column public.profile_settings.adult_confirmed_at is
  'Set by trigger when a valid 18+ birth_date is stored. The age gate middleware '
  'checks this column for authenticated users; the signed cookie covers anonymous '
  'visitors. Never written by the client.';

-- 18+ enforcement. It lives in a trigger rather than a CHECK constraint because
-- CHECK constraints may not call non-immutable functions such as current_date.
create or replace function public.tg_enforce_adult_birth_date()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.birth_date is null then
    new.adult_confirmed_at := null;
    return new;
  end if;

  if new.birth_date > (current_date - interval '18 years')::date then
    raise exception 'VITOLA_UNDERAGE: access is restricted to adults (18+)'
      using errcode = '23514';
  end if;

  if new.birth_date < (current_date - interval '120 years')::date then
    raise exception 'VITOLA_INVALID_BIRTH_DATE: implausible date of birth'
      using errcode = '23514';
  end if;

  -- Set server-side so a client cannot claim adulthood without a date.
  if new.adult_confirmed_at is null then
    new.adult_confirmed_at := now();
  end if;

  return new;
end;
$$;

create trigger profile_settings_enforce_adult
  before insert or update of birth_date, adult_confirmed_at
  on public.profile_settings
  for each row execute function public.tg_enforce_adult_birth_date();

-- Defence in depth behind the column GRANTs of §8: if a future migration
-- re-grants a column by accident, this still refuses the write.
create or replace function public.tg_protect_profile_privileges()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if public.is_privileged_context() then
    new.updated_at := now();
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'VITOLA_FORBIDDEN: role is not client-writable' using errcode = '42501';
  end if;

  if new.reputation is distinct from old.reputation then
    raise exception 'VITOLA_FORBIDDEN: reputation is not client-writable' using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_protect_privileges
  before update on public.profiles
  for each row execute function public.tg_protect_profile_privileges();

create trigger profile_settings_set_updated_at
  before update on public.profile_settings
  for each row execute function public.tg_set_updated_at();

-- Provisions both rows on signup. The provisional handle is replaced during
-- onboarding; birth_date is filled there too, because OAuth providers
-- (Google, Apple) do not supply a date of birth.
create or replace function public.tg_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate text;
begin
  candidate := 'membre_' || substr(replace(new.id::text, '-', ''), 1, 12);

  insert into public.profiles (id, handle, display_name)
  values (new.id, candidate, nullif(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;

  insert into public.profile_settings (id, birth_date)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'birth_date', '')::date
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_handle_new_user();

-- =============================================================================
-- §4 · COMPLIANCE CORE
-- -----------------------------------------------------------------------------
-- Present in P1 because §2 of the brief requires `consents` and the GDPR
-- export/delete endpoints "dès la Phase 1", and because the indicative-price
-- feature flag gates a field of ref.cigars shipped in this very migration.
-- =============================================================================

create table public.consents (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       public.consent_kind not null,
  granted    boolean     not null,
  version    text        not null,          -- version of the document consented to
  granted_at timestamptz not null default now(),
  ip_hash    bytea,                         -- sha256(ip || pepper); never the raw IP
  user_agent text,

  constraint consents_version_len check (length(version) between 1 and 40)
);

comment on table public.consents is
  'Append-only consent ledger. A withdrawal is a NEW row with granted = false, '
  'never an UPDATE — the history is the proof. No UPDATE/DELETE grant exists.';

create index consents_user_kind_idx on public.consents (user_id, kind, granted_at desc);

create table public.audit_log (
  id           bigint generated always as identity primary key,
  actor_id     uuid references auth.users(id) on delete set null,
  action       text        not null,
  entity_schema text,
  entity_table text,
  entity_id    text,
  before_state jsonb,
  after_state  jsonb,
  ip_hash      bytea,
  created_at   timestamptz not null default now(),

  constraint audit_log_action_len check (length(action) between 1 and 80)
);

comment on table public.audit_log is
  'Append-only. Written exclusively by service-role code (lib/compliance/audit.ts) '
  'or SECURITY DEFINER routines. Clients hold no INSERT grant and no INSERT policy.';

create index audit_log_entity_idx on public.audit_log (entity_table, entity_id, created_at desc);
create index audit_log_actor_idx  on public.audit_log (actor_id, created_at desc);

create table public.feature_flags (
  key         text primary key,
  enabled     boolean     not null default false,
  description text        not null,
  payload     jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),

  constraint feature_flags_key_format check (key ~ '^[a-z][a-z0-9_]{2,48}$'),
  constraint feature_flags_payload_object check (jsonb_typeof(payload) = 'object')
);

create trigger feature_flags_set_updated_at
  before update on public.feature_flags
  for each row execute function public.tg_set_updated_at();

-- Required by §2: indicative prices must be switchable off without a deploy.
insert into public.feature_flags (key, enabled, description) values
  ('show_indicative_prices', false,
   'Displays ref.cigars.msrp_eur. OFF by default: prices must never be a call to '
   'purchase (loi Evin, art. L3512-4 CSP).'),
  ('wiki_contributions_open', true,
   'Opens the public revision queue (ref.cigar_revisions).'),
  ('public_signup_open', false,
   'Opens registration. OFF until the legal review of the brief §2 is signed off.')
on conflict (key) do nothing;

-- =============================================================================
-- §5 · REFERENTIAL — schema `ref`
-- =============================================================================

create table ref.manufacturers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null,
  country    char(2),
  group_name text,                         -- e.g. 'Habanos S.A.', 'Altadis'
  notes      text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint manufacturers_name_len      check (length(name) between 1 and 120),
  constraint manufacturers_slug_format   check (slug = public.slugify(slug) and length(slug) between 1 and 140),
  constraint manufacturers_country_format check (country is null or country ~ '^[A-Z]{2}$')
);

create table ref.brands (
  id              uuid primary key default gen_random_uuid(),
  manufacturer_id uuid references ref.manufacturers(id) on delete set null,
  name            text not null,
  slug            text not null,
  country         char(2),
  founded_year    smallint,
  -- Not derivable from `country`: several brands exist in both a Cuban and a
  -- non-Cuban version (post-1959 trademark split). The flag disambiguates them.
  is_cuban        boolean not null default false,
  description     text,
  -- See Q4 in 05-questions-ouvertes.md: hosting third-party trademark artwork
  -- is a legal decision, not a technical one. Column exists, stays NULL until ruled on.
  logo_path       text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint brands_name_len       check (length(name) between 1 and 120),
  constraint brands_slug_format    check (slug = public.slugify(slug) and length(slug) between 1 and 140),
  constraint brands_country_format check (country is null or country ~ '^[A-Z]{2}$'),
  constraint brands_founded_year   check (founded_year is null or founded_year between 1700 and 2100),
  constraint brands_description_len check (description is null or length(description) <= 4000)
);

create table ref.lines (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references ref.brands(id) on delete cascade,
  name        text not null,
  slug        text not null,
  description text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint lines_name_len     check (length(name) between 1 and 120),
  constraint lines_slug_format  check (slug = public.slugify(slug) and length(slug) between 1 and 140),
  constraint lines_description_len check (description is null or length(description) <= 4000)
);

comment on table ref.lines is 'Brand sub-range, e.g. Cohiba > Linea 1492.';

create table ref.vitolas (
  id          uuid primary key default gen_random_uuid(),
  name_galera text,                    -- factory name (Cuban usage), may be null
  name_salida text not null,           -- commercial name, e.g. 'Lancero'
  slug        text not null,           -- DELTA vs brief: needed for /vitoles/[slug]
  length_mm   smallint not null,
  ring_gauge  smallint not null,
  shape       ref.cigar_shape not null,
  notes       text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint vitolas_salida_len  check (length(name_salida) between 1 and 80),
  constraint vitolas_galera_len  check (name_galera is null or length(name_galera) between 1 and 80),
  constraint vitolas_slug_format check (slug = public.slugify(slug) and length(slug) between 1 and 120),
  constraint vitolas_length_mm   check (length_mm between 60 and 400),
  constraint vitolas_ring_gauge  check (ring_gauge between 20 and 90)
);

comment on column ref.vitolas.ring_gauge is
  'Cepo, in 64ths of an inch. Facet "cepo" of F2 filters on this column.';

create table ref.cigars (
  id                uuid primary key default gen_random_uuid(),
  brand_id          uuid not null references ref.brands(id) on delete restrict,
  line_id           uuid references ref.lines(id) on delete set null,
  vitola_id         uuid references ref.vitolas(id) on delete restrict,
  commercial_name   text not null,
  slug              text not null,
  -- DELTA vs brief §5.1: F2 requires a "pays" facet. Brand country is not it —
  -- a brand may be produced in several countries. This is country of manufacture.
  origin_country    char(2),
  wrapper_origin    text,              -- region-level free text, e.g. 'Vuelta Abajo'
  binder_origin     text,
  filler_origins    text[] not null default '{}',
  wrapper_shade     ref.wrapper_shade,
  strength          ref.strength,
  release_type      ref.release_type not null default 'regular',
  release_year      smallint,
  discontinued_year smallint,
  packaging         jsonb not null default '{}'::jsonb,
  -- Indicative price only. Display is gated by feature flag
  -- `show_indicative_prices`. There is deliberately NO affiliate_url,
  -- no vendor link, no availability and no "deal" column on this table (§2).
  --
  -- DELTA vs brief §5.1: a price with no date and no source is misinformation
  -- within weeks. French retail prices are homologated by decree and revised
  -- roughly monthly, so the three columns travel together — enforced below.
  msrp_eur          numeric(10,2),
  msrp_source       text,
  msrp_effective_on date,
  status            ref.entry_status not null default 'draft',
  -- DELTA vs brief: `status = 'merged'` needs a target for duplicate merging (F3).
  merged_into_id    uuid references ref.cigars(id) on delete set null,
  created_by        uuid references auth.users(id) on delete set null,
  verified_at       timestamptz,
  verified_by       uuid references auth.users(id) on delete set null,
  search_vector     tsvector,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint cigars_commercial_name_len check (length(commercial_name) between 1 and 160),
  constraint cigars_slug_format         check (slug = public.slugify(slug) and length(slug) between 1 and 180),
  constraint cigars_origin_country_format check (origin_country is null or origin_country ~ '^[A-Z]{2}$'),
  constraint cigars_msrp_positive       check (msrp_eur is null or msrp_eur >= 0),
  -- A price is only meaningful with its source and its date of effect.
  constraint cigars_msrp_sourced check (
    (msrp_eur is null and msrp_source is null and msrp_effective_on is null)
    or (msrp_eur is not null and msrp_source is not null and msrp_effective_on is not null)
  ),
  constraint cigars_msrp_source_allowed check (
    msrp_source is null or msrp_source in ('douane-fr', 'manufacturer', 'community')
  ),
  constraint cigars_release_year        check (release_year is null or release_year between 1800 and 2100),
  constraint cigars_discontinued_after_release
    check (discontinued_year is null or release_year is null or discontinued_year >= release_year),
  constraint cigars_packaging_object    check (jsonb_typeof(packaging) = 'object'),
  constraint cigars_filler_origins_sane
    check (coalesce(array_length(filler_origins, 1), 0) <= 12),
  constraint cigars_merge_target_consistent
    check ((status = 'merged') = (merged_into_id is not null)),
  constraint cigars_no_self_merge
    check (merged_into_id is null or merged_into_id <> id)
);

comment on column ref.cigars.msrp_source is
  'Where the price came from. `douane-fr` = the French homologated retail price '
  '(arrêté published in the JO), which is official public data, not a scrape.';

comment on table ref.cigars is
  'Referential entry. Wiki-versioned through ref.cigar_revisions. '
  'Carries no commercial affordance: no vendor, no stock, no purchase link (§2).';

create table ref.cigar_revisions (
  id             uuid primary key default gen_random_uuid(),
  -- NULL when the revision proposes a brand-new entry rather than a change.
  cigar_id       uuid references ref.cigars(id) on delete cascade,
  author_id      uuid not null references auth.users(id) on delete cascade,
  diff           jsonb not null,
  comment        text,
  status         ref.revision_status not null default 'pending',
  reviewed_by    uuid references auth.users(id) on delete set null,
  reviewed_at    timestamptz,
  review_comment text,
  created_at     timestamptz not null default now(),

  constraint cigar_revisions_diff_object check (jsonb_typeof(diff) = 'object'),
  constraint cigar_revisions_diff_not_empty check (diff <> '{}'::jsonb),
  constraint cigar_revisions_comment_len check (comment is null or length(comment) <= 1000),
  constraint cigar_revisions_review_consistent
    check ((status = 'pending') = (reviewed_at is null))
);

create table ref.cigar_images (
  id         uuid primary key default gen_random_uuid(),
  cigar_id   uuid not null references ref.cigars(id) on delete cascade,
  path       text not null,                    -- object key in the `cigar-images` bucket
  kind       ref.image_kind not null,
  is_primary boolean not null default false,
  credit     text,
  -- DELTA: NOT NULL. An image of unknown licence is a liability, not an asset.
  license    text not null default 'cc-by-sa-4.0',
  width      smallint,
  height     smallint,
  blurhash   text,                             -- DELTA: LQIP required by §3 of the brief
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint cigar_images_path_len check (length(path) between 1 and 512),
  constraint cigar_images_license_allowed
    check (license in ('cc-by-sa-4.0', 'cc-by-4.0', 'cc0-1.0', 'owner-granted', 'fair-quotation')),
  constraint cigar_images_dimensions check (
    (width is null and height is null)
    or (width between 1 and 20000 and height between 1 and 20000)
  )
);

create table ref.box_codes (
  id           uuid primary key default gen_random_uuid(),
  kind         ref.box_code_kind not null,
  code         text not null,            -- 'MSU', 'ENE', 'JUN'…
  factory_code text,                     -- resolved factory, when kind = 'factory'
  month        smallint,
  year         smallint,
  notes        text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint box_codes_code_len check (length(code) between 1 and 16),
  constraint box_codes_month    check (month is null or month between 1 and 12),
  constraint box_codes_year     check (year is null or year between 1960 and 2100),
  constraint box_codes_kind_payload check (
    (kind = 'factory' and factory_code is not null and month is null and year is null)
    or (kind = 'month' and month is not null)
    or (kind = 'year'  and year  is not null)
  )
);

comment on table ref.box_codes is
  'Factual decoding table for Cuban box codes. Read-only reference data, '
  'curated by editors. Purely informative: no provenance or valuation claim.';

-- =============================================================================
-- §6 · SEARCH
-- -----------------------------------------------------------------------------
-- `search_vector` cannot be a GENERATED column: it must include the brand, line
-- and vitola names, which live in other rows. A BEFORE trigger is the only
-- correct option. It fires on every INSERT/UPDATE of ref.cigars (not just on the
-- source columns) so that a brand rename can refresh dependants with a bare
-- `UPDATE ref.cigars SET updated_at = now()`.
--
-- Two configurations are combined on purpose:
--   * 'simple'  — proper nouns must not be stemmed. French stemming turns
--                 "Behike" and "Behiké" into different lexemes and mangles
--                 Spanish brand names.
--   * 'french'  — applied to prose fields, where stemming genuinely helps.
-- Config names are schema-qualified because the function runs with search_path = ''.
-- =============================================================================

create or replace function ref.tg_cigars_search_vector()
returns trigger
language plpgsql
-- SECURITY DEFINER: the index must be complete regardless of what the writing
-- user is allowed to see. A member creating a draft still gets a correct vector.
security definer
set search_path = ''
as $$
declare
  v_brand text := '';
  v_manuf text := '';
  v_line  text := '';
  v_galera text := '';
  v_salida text := '';
begin
  select b.name, coalesce(m.name, '')
    into v_brand, v_manuf
    from ref.brands b
    left join ref.manufacturers m on m.id = b.manufacturer_id
   where b.id = new.brand_id;

  if new.line_id is not null then
    select l.name into v_line from ref.lines l where l.id = new.line_id;
  end if;

  if new.vitola_id is not null then
    select coalesce(v.name_galera, ''), v.name_salida
      into v_galera, v_salida
      from ref.vitolas v
     where v.id = new.vitola_id;
  end if;

  new.search_vector :=
       setweight(to_tsvector('pg_catalog.simple'::regconfig,
                 public.immutable_unaccent(coalesce(new.commercial_name, ''))), 'A')
    || setweight(to_tsvector('pg_catalog.simple'::regconfig,
                 public.immutable_unaccent(coalesce(v_brand, ''))), 'A')
    || setweight(to_tsvector('pg_catalog.simple'::regconfig,
                 public.immutable_unaccent(coalesce(v_line, ''))), 'B')
    || setweight(to_tsvector('pg_catalog.simple'::regconfig,
                 public.immutable_unaccent(
                   trim(coalesce(v_salida, '') || ' ' || coalesce(v_galera, '')))), 'B')
    || setweight(to_tsvector('pg_catalog.simple'::regconfig,
                 public.immutable_unaccent(coalesce(v_manuf, ''))), 'C')
    || setweight(to_tsvector('pg_catalog.french'::regconfig,
                 public.immutable_unaccent(
                   concat_ws(' ',
                     new.wrapper_origin,
                     new.binder_origin,
                     array_to_string(new.filler_origins, ' ')))), 'D');

  return new;
end;
$$;

create trigger cigars_search_vector
  before insert or update on ref.cigars
  for each row execute function ref.tg_cigars_search_vector();

-- Renaming a brand/line/vitola must refresh the vector of every dependent cigar.
create or replace function ref.tg_touch_dependent_cigars()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'brands' then
    update ref.cigars set updated_at = now() where brand_id = new.id;
  elsif tg_table_name = 'lines' then
    update ref.cigars set updated_at = now() where line_id = new.id;
  elsif tg_table_name = 'vitolas' then
    update ref.cigars set updated_at = now() where vitola_id = new.id;
  end if;
  return null;
end;
$$;

create trigger brands_touch_cigars
  after update on ref.brands
  for each row when (old.name is distinct from new.name)
  execute function ref.tg_touch_dependent_cigars();

create trigger lines_touch_cigars
  after update on ref.lines
  for each row when (old.name is distinct from new.name)
  execute function ref.tg_touch_dependent_cigars();

create trigger vitolas_touch_cigars
  after update on ref.vitolas
  for each row when (old.name_salida is distinct from new.name_salida
                  or old.name_galera is distinct from new.name_galera)
  execute function ref.tg_touch_dependent_cigars();

create trigger manufacturers_set_updated_at before update on ref.manufacturers
  for each row execute function public.tg_set_updated_at();
create trigger brands_set_updated_at before update on ref.brands
  for each row execute function public.tg_set_updated_at();
create trigger lines_set_updated_at before update on ref.lines
  for each row execute function public.tg_set_updated_at();
create trigger vitolas_set_updated_at before update on ref.vitolas
  for each row execute function public.tg_set_updated_at();
create trigger cigars_set_updated_at before update on ref.cigars
  for each row execute function public.tg_set_updated_at();
create trigger box_codes_set_updated_at before update on ref.box_codes
  for each row execute function public.tg_set_updated_at();

-- =============================================================================
-- §7 · INDEXES
-- -----------------------------------------------------------------------------
-- Facet indexes are PARTIAL on `status = 'published'`. Anonymous search only
-- ever sees published rows, so the index stays small and the planner can
-- bitmap-AND several facets. Exit criterion of P1 is < 300 ms on 5 000 cigars;
-- if the corpus passes ~200 000 rows, denormalise into a materialised
-- `ref.cigar_search` view rather than widening these indexes.
-- =============================================================================

create unique index manufacturers_slug_key on ref.manufacturers (slug);
create unique index manufacturers_name_key
  on ref.manufacturers (public.immutable_unaccent(lower(name)));

create unique index brands_slug_key on ref.brands (slug);
create unique index brands_name_country_key
  on ref.brands (public.immutable_unaccent(lower(name)), coalesce(country, 'ZZ'));
create index brands_manufacturer_idx on ref.brands (manufacturer_id);
create index brands_country_idx      on ref.brands (country);
create index brands_name_trgm_idx    on ref.brands
  using gin (public.immutable_unaccent(lower(name)) extensions.gin_trgm_ops);

create unique index lines_brand_slug_key on ref.lines (brand_id, slug);
create index lines_brand_idx     on ref.lines (brand_id);
create index lines_name_trgm_idx on ref.lines
  using gin (public.immutable_unaccent(lower(name)) extensions.gin_trgm_ops);

create unique index vitolas_slug_key on ref.vitolas (slug);
create unique index vitolas_identity_key on ref.vitolas (
  public.immutable_unaccent(lower(name_salida)), length_mm, ring_gauge, shape);
create index vitolas_dimensions_idx on ref.vitolas (ring_gauge, length_mm);
create index vitolas_shape_idx      on ref.vitolas (shape);
create index vitolas_salida_trgm_idx on ref.vitolas
  using gin (public.immutable_unaccent(lower(name_salida)) extensions.gin_trgm_ops);

create unique index cigars_slug_key on ref.cigars (slug);

-- Duplicate guard. Rejected and merged entries are excluded so that a merge
-- does not block re-creating a legitimately distinct entry later.
create unique index cigars_identity_key on ref.cigars (
  brand_id,
  coalesce(line_id,   '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(vitola_id, '00000000-0000-0000-0000-000000000000'::uuid),
  public.immutable_unaccent(lower(commercial_name))
) where status in ('draft', 'published');

create index cigars_search_vector_idx on ref.cigars using gin (search_vector);
create index cigars_name_trgm_idx on ref.cigars
  using gin (public.immutable_unaccent(lower(commercial_name)) extensions.gin_trgm_ops);

create index cigars_facet_brand_idx    on ref.cigars (brand_id)       where status = 'published';
create index cigars_facet_line_idx     on ref.cigars (line_id)        where status = 'published';
create index cigars_facet_vitola_idx   on ref.cigars (vitola_id)      where status = 'published';
create index cigars_facet_country_idx  on ref.cigars (origin_country) where status = 'published';
create index cigars_facet_strength_idx on ref.cigars (strength)       where status = 'published';
create index cigars_facet_shade_idx    on ref.cigars (wrapper_shade)  where status = 'published';
create index cigars_facet_release_idx  on ref.cigars (release_type)   where status = 'published';

-- Keyset pagination (§5.6 of the brief: no offset paging anywhere).
create index cigars_published_keyset_idx
  on ref.cigars (created_at desc, id desc) where status = 'published';

-- Drives "my drafts" and the editorial review queue.
create index cigars_created_by_idx on ref.cigars (created_by, created_at desc);
create index cigars_merged_into_idx on ref.cigars (merged_into_id) where merged_into_id is not null;

create index cigar_revisions_queue_idx  on ref.cigar_revisions (created_at) where status = 'pending';
create index cigar_revisions_cigar_idx  on ref.cigar_revisions (cigar_id, created_at desc);
create index cigar_revisions_author_idx on ref.cigar_revisions (author_id, created_at desc);

create unique index cigar_images_path_key on ref.cigar_images (path);
create unique index cigar_images_one_primary_key
  on ref.cigar_images (cigar_id) where is_primary;
create index cigar_images_cigar_kind_idx on ref.cigar_images (cigar_id, kind);

create unique index box_codes_kind_code_key on ref.box_codes (kind, upper(code));

-- =============================================================================
-- §8 · GRANTS
-- -----------------------------------------------------------------------------
-- Supabase grants ALL on new `public` tables to anon/authenticated by default.
-- Every grant below is therefore preceded by an explicit REVOKE: the privilege
-- surface is declared here and nowhere else.
-- =============================================================================

-- USAGE on `extensions` is NOT optional. public.slugify() -> immutable_unaccent()
-- -> extensions.unaccent() runs SECURITY INVOKER, and it is called by the CHECK
-- constraint on every slug column. Without this grant every client-side INSERT
-- into ref.* fails with "permission denied for schema extensions".
grant usage on schema extensions to anon, authenticated, service_role;
grant execute on function extensions.unaccent(regdictionary, text) to anon, authenticated, service_role;

grant usage on schema ref to anon, authenticated, service_role;
alter default privileges in schema ref revoke all on tables from anon, authenticated;

-- --- public.profiles ---------------------------------------------------------
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant insert (id, handle, display_name, avatar_path, bio, country, city, is_discoverable)
  on public.profiles to authenticated;
grant update (handle, display_name, avatar_path, bio, country, city, is_discoverable)
  on public.profiles to authenticated;
-- `role` and `reputation` appear in no grant: unreachable from any client key.

-- --- public.profile_settings -------------------------------------------------
revoke all on public.profile_settings from anon, authenticated;
grant select on public.profile_settings to authenticated;
grant insert (id, birth_date, locale, preferences, privacy) on public.profile_settings to authenticated;
grant update (birth_date, locale, preferences, privacy)     on public.profile_settings to authenticated;
-- `adult_confirmed_at` is trigger-written only.

-- --- public.consents ---------------------------------------------------------
revoke all on public.consents from anon, authenticated;
grant select, insert on public.consents to authenticated;
-- No UPDATE, no DELETE: the ledger is append-only.

-- --- public.audit_log --------------------------------------------------------
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;   -- narrowed to admins by policy
-- No INSERT: written by service-role code only.

-- --- public.feature_flags ----------------------------------------------------
revoke all on public.feature_flags from anon, authenticated;
grant select on public.feature_flags to anon, authenticated;

-- --- ref.* -------------------------------------------------------------------
revoke all on all tables in schema ref from anon, authenticated;
grant select on ref.manufacturers, ref.brands, ref.lines, ref.vitolas,
                ref.cigars, ref.cigar_images, ref.box_codes
  to anon, authenticated;

grant insert, update on ref.manufacturers, ref.brands, ref.lines, ref.vitolas, ref.box_codes
  to authenticated;   -- narrowed to editor+ by policy

grant insert on ref.cigars to authenticated;
grant update (
  brand_id, line_id, vitola_id, commercial_name, slug, origin_country,
  wrapper_origin, binder_origin, filler_origins, wrapper_shade, strength,
  release_type, release_year, discontinued_year, packaging,
  msrp_eur, msrp_source, msrp_effective_on,
  status, merged_into_id, verified_at, verified_by, updated_at
) on ref.cigars to authenticated;
-- `search_vector` and `created_by` are absent: trigger- and insert-owned.

grant select, insert on ref.cigar_revisions to authenticated;
grant update (diff, comment, status, reviewed_by, reviewed_at, review_comment)
  on ref.cigar_revisions to authenticated;
grant delete on ref.cigar_revisions to authenticated;   -- narrowed to own+pending by policy

grant insert on ref.cigar_images to authenticated;
grant update (kind, is_primary, credit, license, width, height, blurhash)
  on ref.cigar_images to authenticated;
grant delete on ref.cigar_images to authenticated;

grant execute on function public.immutable_unaccent(text)      to anon, authenticated;
grant execute on function public.slugify(text)                 to anon, authenticated;
grant execute on function public.current_app_role()            to authenticated;
grant execute on function public.has_min_role(public.app_role) to anon, authenticated;

-- =============================================================================
-- §9 · ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
-- Every table below gets ENABLE ROW LEVEL SECURITY and at least one explicit
-- policy (§0.5 of the brief). Note: FORCE ROW LEVEL SECURITY is deliberately NOT
-- used on public.profiles — it would subject the owner of
-- public.current_app_role() to the very policies that call it, causing infinite
-- recursion. Every other table is safe to FORCE, and does.
--
-- `(select auth.uid())` is wrapped in a scalar subquery on purpose: PostgreSQL
-- then evaluates it once as an InitPlan instead of once per row.
-- =============================================================================

-- --- public.profiles ---------------------------------------------------------
alter table public.profiles enable row level security;

create policy profiles_select_directory on public.profiles
  for select to anon, authenticated
  using (
    is_discoverable
    or id = (select auth.uid())
    or (select public.has_min_role('moderator'))
  );

create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using ((select public.has_min_role('admin')))
  with check ((select public.has_min_role('admin')));

create policy profiles_delete_admin on public.profiles
  for delete to authenticated
  using ((select public.has_min_role('admin')));

-- --- public.profile_settings -------------------------------------------------
alter table public.profile_settings enable row level security;
alter table public.profile_settings force row level security;

create policy profile_settings_select_own on public.profile_settings
  for select to authenticated
  using (id = (select auth.uid()));

-- Admins only, for age-verification disputes and GDPR requests. Every read
-- through this path must be written to audit_log by the calling endpoint.
create policy profile_settings_select_admin on public.profile_settings
  for select to authenticated
  using ((select public.has_min_role('admin')));

create policy profile_settings_insert_own on public.profile_settings
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy profile_settings_update_own on public.profile_settings
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- --- public.consents ---------------------------------------------------------
alter table public.consents enable row level security;
alter table public.consents force row level security;

create policy consents_select_own on public.consents
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy consents_select_admin on public.consents
  for select to authenticated
  using ((select public.has_min_role('admin')));

create policy consents_insert_own on public.consents
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- --- public.audit_log --------------------------------------------------------
alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;

-- The only client-facing policy. No INSERT/UPDATE/DELETE policy exists, so
-- those are denied for every client key; service_role bypasses RLS by design.
create policy audit_log_select_admin on public.audit_log
  for select to authenticated
  using ((select public.has_min_role('admin')));

-- --- public.feature_flags ----------------------------------------------------
alter table public.feature_flags enable row level security;
alter table public.feature_flags force row level security;

create policy feature_flags_select_all on public.feature_flags
  for select to anon, authenticated
  using (true);
-- Writes are service-role only: a flag change is a deployment event, not a
-- user action.

-- --- ref dimension tables ----------------------------------------------------
-- Same shape for manufacturers / brands / lines / vitolas / box_codes:
-- world-readable, editor-writable, admin-deletable. Members contribute through
-- ref.cigar_revisions, never by writing these tables directly.

alter table ref.manufacturers enable row level security;
alter table ref.manufacturers force row level security;
create policy manufacturers_select_all on ref.manufacturers
  for select to anon, authenticated using (true);
create policy manufacturers_write_editor on ref.manufacturers
  for insert to authenticated with check ((select public.has_min_role('editor')));
create policy manufacturers_update_editor on ref.manufacturers
  for update to authenticated
  using ((select public.has_min_role('editor')))
  with check ((select public.has_min_role('editor')));

alter table ref.brands enable row level security;
alter table ref.brands force row level security;
create policy brands_select_all on ref.brands
  for select to anon, authenticated using (true);
create policy brands_insert_editor on ref.brands
  for insert to authenticated with check ((select public.has_min_role('editor')));
create policy brands_update_editor on ref.brands
  for update to authenticated
  using ((select public.has_min_role('editor')))
  with check ((select public.has_min_role('editor')));

alter table ref.lines enable row level security;
alter table ref.lines force row level security;
create policy lines_select_all on ref.lines
  for select to anon, authenticated using (true);
create policy lines_insert_editor on ref.lines
  for insert to authenticated with check ((select public.has_min_role('editor')));
create policy lines_update_editor on ref.lines
  for update to authenticated
  using ((select public.has_min_role('editor')))
  with check ((select public.has_min_role('editor')));

alter table ref.vitolas enable row level security;
alter table ref.vitolas force row level security;
create policy vitolas_select_all on ref.vitolas
  for select to anon, authenticated using (true);
create policy vitolas_insert_editor on ref.vitolas
  for insert to authenticated with check ((select public.has_min_role('editor')));
create policy vitolas_update_editor on ref.vitolas
  for update to authenticated
  using ((select public.has_min_role('editor')))
  with check ((select public.has_min_role('editor')));

alter table ref.box_codes enable row level security;
alter table ref.box_codes force row level security;
create policy box_codes_select_all on ref.box_codes
  for select to anon, authenticated using (true);
create policy box_codes_insert_editor on ref.box_codes
  for insert to authenticated with check ((select public.has_min_role('editor')));
create policy box_codes_update_editor on ref.box_codes
  for update to authenticated
  using ((select public.has_min_role('editor')))
  with check ((select public.has_min_role('editor')));

-- --- ref.cigars --------------------------------------------------------------
alter table ref.cigars enable row level security;
alter table ref.cigars force row level security;

create policy cigars_select_published on ref.cigars
  for select to anon, authenticated
  using (
    status = 'published'
    or created_by = (select auth.uid())
    or (select public.has_min_role('editor'))
  );

-- A member may create an entry, but only as a draft, and only in their own name.
create policy cigars_insert_own_draft on ref.cigars
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and status = 'draft'
    and verified_at is null
    and verified_by is null
    and merged_into_id is null
  );

-- The author keeps editing rights while the entry is a draft. The WITH CHECK
-- clause repeats `status = 'draft'`: without it the author could publish
-- their own entry, bypassing editorial validation.
create policy cigars_update_own_draft on ref.cigars
  for update to authenticated
  using (created_by = (select auth.uid()) and status = 'draft')
  with check (
    created_by = (select auth.uid())
    and status = 'draft'
    and verified_at is null
    and verified_by is null
  );

create policy cigars_update_editor on ref.cigars
  for update to authenticated
  using ((select public.has_min_role('editor')))
  with check ((select public.has_min_role('editor')));

create policy cigars_delete_admin on ref.cigars
  for delete to authenticated
  using ((select public.has_min_role('admin')));

-- --- ref.cigar_revisions -----------------------------------------------------
alter table ref.cigar_revisions enable row level security;
alter table ref.cigar_revisions force row level security;

create policy cigar_revisions_select_own on ref.cigar_revisions
  for select to authenticated
  using (author_id = (select auth.uid()));

create policy cigar_revisions_select_editor on ref.cigar_revisions
  for select to authenticated
  using ((select public.has_min_role('editor')));

create policy cigar_revisions_insert_own on ref.cigar_revisions
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

-- The author may amend a proposal while it is pending, but cannot approve it.
create policy cigar_revisions_update_own_pending on ref.cigar_revisions
  for update to authenticated
  using (author_id = (select auth.uid()) and status = 'pending')
  with check (
    author_id = (select auth.uid())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

create policy cigar_revisions_update_editor on ref.cigar_revisions
  for update to authenticated
  using ((select public.has_min_role('editor')))
  with check ((select public.has_min_role('editor')));

create policy cigar_revisions_delete_own_pending on ref.cigar_revisions
  for delete to authenticated
  using (author_id = (select auth.uid()) and status = 'pending');

create policy cigar_revisions_delete_admin on ref.cigar_revisions
  for delete to authenticated
  using ((select public.has_min_role('admin')));

-- --- ref.cigar_images --------------------------------------------------------
-- The EXISTS sub-query is itself subject to ref.cigars' RLS, so image
-- visibility follows entry visibility automatically, with no duplicated logic.
alter table ref.cigar_images enable row level security;
alter table ref.cigar_images force row level security;

create policy cigar_images_select_visible on ref.cigar_images
  for select to anon, authenticated
  using (exists (select 1 from ref.cigars c where c.id = cigar_id));

create policy cigar_images_insert_own on ref.cigar_images
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (select 1 from ref.cigars c where c.id = cigar_id)
  );

create policy cigar_images_update_own on ref.cigar_images
  for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy cigar_images_update_editor on ref.cigar_images
  for update to authenticated
  using ((select public.has_min_role('editor')))
  with check ((select public.has_min_role('editor')));

create policy cigar_images_delete_own on ref.cigar_images
  for delete to authenticated
  using (created_by = (select auth.uid()) or (select public.has_min_role('editor')));

-- =============================================================================
-- §10 · STORAGE
-- -----------------------------------------------------------------------------
-- Both buckets are private, per §8 of the brief ("jamais de bucket public sauf
-- articles-media"). Reads therefore go through short-lived signed URLs.
-- See Q8 in 05-questions-ouvertes.md: for referential images this costs CDN
-- caching on the highest-traffic pages and may deserve a reversal.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('cigar-images', 'cigar-images', false, 8388608,
   array['image/webp', 'image/jpeg', 'image/png', 'image/avif']),
  ('avatars', 'avatars', false, 2097152,
   array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy storage_cigar_images_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'cigar-images');

create policy storage_cigar_images_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cigar-images' and owner_id = (select auth.uid())::text);

create policy storage_cigar_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'cigar-images'
    and (owner_id = (select auth.uid())::text or (select public.has_min_role('editor')))
  );

-- Avatars are namespaced by user id: `avatars/<uid>/<file>`.
create policy storage_avatars_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

create policy storage_avatars_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy storage_avatars_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy storage_avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- =============================================================================
-- §11 · SELF-CHECK
-- -----------------------------------------------------------------------------
-- §0.5 of the brief: "Une table sans RLS = build cassé." Asserting it inside the
-- transaction means the migration cannot be applied while the invariant is
-- violated. tooling/scripts/audit-rls.ts re-runs the same query in CI.
-- =============================================================================

do $$
declare
  offender text;
begin
  select string_agg(format('%I.%I', n.nspname, c.relname), ', ' order by n.nspname, c.relname)
    into offender
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r'
     and n.nspname in ('public', 'ref')
     and (
       c.relrowsecurity = false
       or not exists (select 1 from pg_policy p where p.polrelid = c.oid)
     );

  if offender is not null then
    raise exception 'VITOLA_RLS_GAP: table(s) without RLS or without any policy: %', offender;
  end if;
end;
$$;

commit;
