-- =============================================================================
-- VITOLA — Vérification du schéma P1  (docs/phase-0/03-schema-p1.sql)
-- -----------------------------------------------------------------------------
-- Ce fichier n'est PAS du code applicatif : c'est la preuve d'exécution du
-- livrable 2 de la Phase 0. Il sera transposé en pgTAP dans supabase/tests/
-- au démarrage de P1.
--
--   createdb vitola
--   psql -d vitola -f 03b-verification.sql
--
-- Il crée d'abord des doublures minimales des objets gérés par Supabase
-- (auth.users, auth.uid(), storage.*, rôles anon/authenticated/service_role),
-- applique la migration, puis exécute 25 assertions.
--
-- Note de méthode : chaque assertion qui change de rôle est enveloppée dans un
-- BEGIN/COMMIT explicite. `SET LOCAL ROLE` hors transaction est silencieusement
-- ignoré — un harnais qui l'oublie teste le superutilisateur et voit tout passer.
-- =============================================================================

-- ---------- 1. Doublures Supabase ----------
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
-- And EXECUTE on every function created in `public`. Missing here until August
-- 2026, which made this stand-in strictly safer than the real project: the nine
-- functions of `public` were callable by an anonymous visitor there, and no
-- local run could see it. See supabase/migrations/0002_function_grants.sql.
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;


-- ---------- 2. Migration ----------
\i 03-schema-p1.sql

-- ---------- 3. Assertions ----------
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- Fixtures, created as postgres (privileged context).
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111','member@x.test','{"birth_date":"1985-04-02"}'),
  ('22222222-2222-2222-2222-222222222222','editor@x.test','{"birth_date":"1979-11-20"}'),
  ('33333333-3333-3333-3333-333333333333','other@x.test' ,'{"birth_date":"1990-01-01"}');
update public.profiles set role='editor', handle='editrice' where id='22222222-2222-2222-2222-222222222222';
update public.profiles set handle='amateur' where id='11111111-1111-1111-1111-111111111111';
update public.profiles set handle='autre'   where id='33333333-3333-3333-3333-333333333333';

insert into ref.manufacturers (id,name,slug,country,group_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001','Empresa Cubana del Tabaco','empresa-cubana-del-tabaco','CU','Habanos S.A.');
insert into ref.brands (id,manufacturer_id,name,slug,country,is_cuban) values
  ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Cohíba','cohiba','CU',true);
insert into ref.lines (id,brand_id,name,slug) values
  ('cccccccc-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','Línea 1492','linea-1492');
insert into ref.vitolas (id,name_galera,name_salida,slug,length_mm,ring_gauge,shape) values
  ('dddddddd-0000-0000-0000-000000000001','Laguito No. 1','Lancero','lancero',192,38,'parejo');
insert into ref.cigars (id,brand_id,line_id,vitola_id,commercial_name,slug,origin_country,wrapper_shade,strength,status)
 values ('eeeeeeee-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001',
         'cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001',
         'Siglo VI','cohiba-siglo-vi','CU','colorado','moyen_corse','published');

-- The draft T8 and T9 act on. Authored by the member, so T8 exercises "an author
-- cannot publish their own entry" and T9 "an editor can". Without this row both
-- assertions match zero rows and report success without testing anything.
insert into ref.cigars (id,brand_id,vitola_id,commercial_name,slug,created_by,status)
 values ('eeeeeeee-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000001',
         'dddddddd-0000-0000-0000-000000000001','Brouillon Test','brouillon-test',
         '11111111-1111-1111-1111-111111111111','draft');

\echo '=== T1  signup trigger provisions both rows + adult_confirmed_at'
select case when count(*)=3 then 'PASS' else 'FAIL '||count(*) end
  from public.profiles p join public.profile_settings s using (id)
 where s.adult_confirmed_at is not null;

\echo '=== T2  underage birth_date is refused'
do $$ begin
  begin
    update public.profile_settings set birth_date = current_date - interval '17 years'
     where id='11111111-1111-1111-1111-111111111111';
    raise exception 'FAIL: underage accepted';
  exception when check_violation then raise notice 'PASS';
  end;
end $$;

\echo '=== T3  member cannot escalate own role (column grant)'
do $$ begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
  begin
    update public.profiles set role='admin' where id='11111111-1111-1111-1111-111111111111';
    raise exception 'FAIL: role escalation allowed';
  exception when insufficient_privilege then raise notice 'PASS';
  end;
  reset role;
end $$;

\echo '=== T4  member cannot inflate own reputation (column grant)'
do $$ begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
  begin
    update public.profiles set reputation = 9999 where id='11111111-1111-1111-1111-111111111111';
    raise exception 'FAIL: reputation writable';
  exception when insufficient_privilege then raise notice 'PASS';
  end;
  reset role;
end $$;

\echo '=== T8  author cannot publish their own draft'
do $$ begin
  -- Checked privileged, before switching role: "0 rows matched" is indistinguishable
  -- from "the fixture does not exist", and a missing fixture would report success.
  if not exists (select 1 from ref.cigars where slug='brouillon-test' and status='draft') then
    raise exception 'FAIL: fixture brouillon-test missing — the assertion would be vacuous';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
  begin
    update ref.cigars set status='published' where slug='brouillon-test';
    if found then raise exception 'FAIL: self-publish allowed'; end if;
    raise notice 'PASS (0 rows matched by policy)';
  exception when insufficient_privilege then raise notice 'PASS (denied)';
  end;
  reset role;
end $$;

\echo '=== T9  editor can publish'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
  update ref.cigars set status='published', verified_at=now(),
         verified_by='22222222-2222-2222-2222-222222222222' where slug='brouillon-test';
  select case
           when count(*) = 0 then 'FAIL: no row — fixture missing or invisible to the editor'
           when count(*) filter (
                  where status='published'
                    and verified_by='22222222-2222-2222-2222-222222222222') = 1 then 'PASS'
           else 'FAIL: still '||max(status::text)
         end
    from ref.cigars where slug='brouillon-test';
commit;

\echo '=== T10 member cannot write ref.brands directly'
do $$ begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
  begin
    insert into ref.brands (name,slug) values ('Fausse Marque','fausse-marque');
    raise exception 'FAIL: member wrote a brand';
  exception when insufficient_privilege then raise notice 'PASS';
  end;
  reset role;
end $$;

\echo '=== T11 search_vector is built and includes the brand (accent-folded)'
select case when search_vector @@ to_tsquery('simple','cohiba') then 'PASS' else 'FAIL' end
  from ref.cigars where slug='cohiba-siglo-vi';

\echo '=== T12 renaming a brand refreshes dependent vectors'
update ref.brands set name='Cohíba Atmosphere' where slug='cohiba';
select case when search_vector @@ to_tsquery('simple','atmosphere') then 'PASS' else 'FAIL' end
  from ref.cigars where slug='cohiba-siglo-vi';
update ref.brands set name='Cohíba' where slug='cohiba';

\echo '=== T13 duplicate entry is rejected (accent/case-insensitive)'
do $$ begin
  begin
    insert into ref.cigars (brand_id,line_id,vitola_id,commercial_name,slug,status)
    values ('bbbbbbbb-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',
            'dddddddd-0000-0000-0000-000000000001','siglo vi','cohiba-siglo-vi-2','draft');
    raise exception 'FAIL: duplicate accepted';
  exception when unique_violation then raise notice 'PASS';
  end;
end $$;

\echo '=== T14 status=merged requires a merge target'
do $$ begin
  begin
    update ref.cigars set status='merged' where slug='cohiba-siglo-vi';
    raise exception 'FAIL: merged without target';
  exception when check_violation then raise notice 'PASS';
  end;
end $$;

\echo '=== T15 only one primary image per cigar'
insert into ref.cigar_images (cigar_id,path,kind,is_primary)
 values ('eeeeeeee-0000-0000-0000-000000000001','a.webp','band',true);
do $$ begin
  begin
    insert into ref.cigar_images (cigar_id,path,kind,is_primary)
     values ('eeeeeeee-0000-0000-0000-000000000001','b.webp','full',true);
    raise exception 'FAIL: two primary images';
  exception when unique_violation then raise notice 'PASS';
  end;
end $$;

\echo '=== T16 consent ledger is append-only for clients'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  insert into public.consents (user_id,kind,granted,version)
   values ('11111111-1111-1111-1111-111111111111','health_related_processing',true,'2026-08-01');
commit;
do $$ begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
  begin
    update public.consents set granted=false;
    raise exception 'FAIL: consent updated';
  exception when insufficient_privilege then raise notice 'PASS';
  end;
  reset role;
end $$;

\echo '=== T17 audit_log unreadable by a non-admin, no client INSERT'
-- Seeded privileged: against an empty table, "the member sees 0 rows" is true
-- whatever the policy does. One row makes the assertion mean something.
insert into public.audit_log (actor_id, action, entity_table, entity_id)
 values ('22222222-2222-2222-2222-222222222222','cigar.publish','ref.cigars','brouillon-test');
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  select case when count(*)=0 then 'PASS(select)' else 'FAIL: '||count(*)||' row(s) visible' end
    from public.audit_log;
commit;
do $$ begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
  begin
    insert into public.audit_log (action) values ('forged');
    raise exception 'FAIL: audit_log writable';
  exception when insufficient_privilege then raise notice 'PASS(insert denied)';
  end;
  reset role;
end $$;

\echo '=== T18 indicative prices are OFF by default (loi Evin)'
select case when enabled=false then 'PASS' else 'FAIL' end
  from public.feature_flags where key='show_indicative_prices';

\echo '=== T19 slug format constraint is enforced'
do $$ begin
  begin
    insert into ref.brands (name,slug) values ('Bad','Not A Slug!');
    raise exception 'FAIL: bad slug accepted';
  exception when check_violation then raise notice 'PASS';
  end;
end $$;


\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\echo '=== T5  birth_date of another member is invisible'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  select case when count(*)=1 then 'PASS (1 row: own only)' else 'FAIL rows='||count(*) end
    from public.profile_settings;
commit;

-- T9 has just published the only draft in the table. Without a draft present,
-- "anon sees no draft" is true because there is nothing to see, and T6/T7 pass
-- without exercising a single policy. One is inserted here, privileged, and its
-- presence is asserted before the role switch.
insert into ref.cigars (brand_id,vitola_id,commercial_name,slug,created_by,status)
 values ('bbbbbbbb-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001',
         'Brouillon Temoin','brouillon-temoin','11111111-1111-1111-1111-111111111111','draft');
do $$ begin
  if not exists (select 1 from ref.cigars where status='draft') then
    raise exception 'FAIL: aucun brouillon en base — T6 et T7 seraient vides';
  end if;
end $$;

\echo '=== T6  anon sees published only, never drafts'
begin;
  set local role anon;
  select case when count(*) filter (where status='draft')=0 then 'PASS (0 drafts visible)'
              else 'FAIL' end from ref.cigars;
commit;

\echo '=== T7  author sees own draft, a third party does not'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
  select case when count(*) filter (where status='draft')=0 then 'PASS (third party blind to drafts)'
              else 'FAIL' end from ref.cigars;
commit;

\echo '=== T7b author does see their own draft'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  insert into ref.cigars (brand_id,vitola_id,commercial_name,slug,created_by,status)
   values ('bbbbbbbb-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001',
           'Second Brouillon','second-brouillon','11111111-1111-1111-1111-111111111111','draft');
  -- brouillon-temoin (inserted before T6) plus second-brouillon, both authored
  -- by this member: the author sees two, a third party and anon see none.
  select case when count(*) filter (where status='draft')=2 then 'PASS (author sees own 2 drafts)'
              else 'FAIL n='||count(*) filter (where status='draft') end from ref.cigars;
commit;

\echo '=== T7c anon still blind to that draft'
begin;
  set local role anon;
  select case when count(*) filter (where status='draft')=0 then 'PASS' else 'FAIL' end from ref.cigars;
commit;

\echo '=== T21 anon cannot read profile_settings at all (no grant)'
begin;
  set local role anon;
  do $$ begin
    begin
      perform 1 from public.profile_settings;
      raise exception 'FAIL: anon read settings';
    exception when insufficient_privilege then raise notice 'PASS';
    end;
  end $$;
commit;

\echo '=== T22 a non-discoverable profile disappears from the directory'
update public.profiles set is_discoverable=false where handle='autre';
begin;
  set local role anon;
  select case when count(*)=2 then 'PASS (2 of 3 listed)' else 'FAIL n='||count(*) end from public.profiles;
commit;
update public.profiles set is_discoverable=true where handle='autre';

\echo '=== T23 cigar images follow entry visibility, with no duplicated rule'
insert into ref.cigar_images (cigar_id,path,kind,created_by)
 select id,'draft-band.webp','band','11111111-1111-1111-1111-111111111111'
   from ref.cigars where slug='second-brouillon';
begin;
  set local role anon;
  select case when count(*)=1 then 'PASS (only the published cigar''s image)' else 'FAIL n='||count(*) end
    from ref.cigar_images;
commit;

\echo '=== T20 la recherche facettée passe par les index partiels'
-- Was an EXPLAIN printed for a human to read, with no verdict: nothing could fail it.
-- The plan is now asserted, so a dropped or unused partial index breaks the run.
create temporary table _t20_plan (line text);
do $t20$
declare rec record;
begin
  -- EXPLAIN is not a subquery in plain SQL; it has to be driven from PL/pgSQL.
  for rec in execute
    'explain (costs off) '
    'select c.id from ref.cigars c join ref.vitolas v on v.id = c.vitola_id '
    ' where c.status = ''published'' and c.strength = ''moyen_corse'' '
    '   and v.ring_gauge between 30 and 45'
  loop
    insert into _t20_plan (line) values (rec."QUERY PLAN");
  end loop;
end $t20$;

select case
         when bool_or(line like '%cigars_facet_%')
          and bool_or(line like '%vitolas_dimensions_idx%')
           then 'PASS (partial facet index + vitola dimensions index)'
         when not bool_or(line like '%cigars_facet_%')
           then 'FAIL: no partial facet index in the plan'
         else 'FAIL: vitolas_dimensions_idx not used'
       end
  from _t20_plan;

-- Kept visible: the plan is worth reading when the assertion above turns red.
select line as "plan" from _t20_plan;
drop table _t20_plan;

\echo ''
\echo '=== Couverture RLS : toute table de public/ref doit avoir RLS + une policy'
select case when count(*) = 0 then 'PASS (0 table non couverte)'
            else 'FAIL: ' || string_agg(format('%I.%I', n.nspname, c.relname), ', ') end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where c.relkind = 'r' and n.nspname in ('public','ref')
   and (c.relrowsecurity = false or not exists (select 1 from pg_policy p where p.polrelid = c.oid));
