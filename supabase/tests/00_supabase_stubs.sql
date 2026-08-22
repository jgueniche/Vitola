-- =============================================================================
-- Doublures minimales des objets gérés par Supabase, pour exécuter les
-- migrations sur une PostgreSQL nue (CI, ou base locale sans la stack Supabase).
--
-- N'est JAMAIS appliqué à un vrai projet Supabase : ces objets y existent déjà.
-- docs/phase-0/03b-verification.sql embarque sa propre copie, volontairement :
-- c'est la trace d'exécution figée du livrable de Phase 0.
-- =============================================================================

-- Minimal stand-in for the Supabase-managed objects the migration depends on.
do $r$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname='supabase_admin') then create role supabase_admin nologin; end if;
end $r$;
grant anon, authenticated, service_role to postgres;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null, owner_id text, created_at timestamptz default now()
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$ select string_to_array(name, '/') $$;
grant usage on schema storage to anon, authenticated, service_role;

-- Supabase grants ALL on public tables to anon/authenticated by default.
-- Reproduced so the migration's REVOKEs are exercised for real.
alter default privileges in schema public grant all on tables to anon, authenticated;

-- And EXECUTE on every function created in `public` — the half that was missing
-- here until August 2026. Sans cette ligne, la doublure était plus fermée que
-- la vraie base : les neuf fonctions de `public` y étaient appelables par un
-- visiteur anonyme sur le projet réel, et le contrôle local ne pouvait pas le
-- voir. Une doublure plus sûre que la production ne prouve rien.
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
