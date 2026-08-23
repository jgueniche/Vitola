-- =============================================================================
-- Assertions de comportement sur le garde-fou du profil (migration 0009).
--
-- Ce fichier existe parce que la 0002 avait un test, qu'il était juste, et qu'il
-- a laissé passer six mois de profils non modifiables. Il vérifiait un **droit**
-- (`is_privileged_context()` reste fermée) là où le bug était dans un
-- **comportement** (un membre ne peut plus se renommer). Les deux se testent, et
-- ce n'est pas le même fichier qui les attrape.
--
-- Les trois pièges du dépôt s'appliquent ici comme ailleurs : chaque assertion
-- vit dans un `do $$ … $$` (sans quoi `SET LOCAL ROLE` est ignoré et tout passe
-- en superutilisateur), chaque non-visibilité prouve d'abord que la ligne
-- existe, et un UPDATE qu'une policy refuse **ne lève pas** — il compte zéro.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

insert into auth.users (id, email, raw_user_meta_data) values
  ('f6000000-0000-4000-8000-000000000001','profil-un@x.test'  ,'{"birth_date":"1986-02-02"}'),
  ('f7000000-0000-4000-8000-000000000002','profil-deux@x.test','{"birth_date":"1987-03-03"}')
on conflict (id) do nothing;

update public.profiles set handle='profil_un'   where id='f6000000-0000-4000-8000-000000000001';
update public.profiles set handle='profil_deux' where id='f7000000-0000-4000-8000-000000000002';

\echo '=== P1  un membre peut modifier son propre profil'
-- L'assertion que personne n'avait écrite. Elle échoue sur la base d'avant la
-- 0009 avec « permission denied for function is_privileged_context ».
do $$
declare n integer; v_city text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-000000000001',true);

  update public.profiles
     set city = 'Bordeaux', display_name = 'Profil Un', bio = 'Une ligne.'
   where id = 'f6000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;

  if n <> 1 then raise exception 'FAIL: % ligne(s) modifiee(s) au lieu de 1', n; end if;

  select city into v_city from public.profiles
   where id = 'f6000000-0000-4000-8000-000000000001';
  if v_city <> 'Bordeaux' then raise exception 'FAIL: la ville vaut %', v_city; end if;

  raise notice 'PASS';
  reset role;
end $$;

\echo '=== P2  et changer de pseudo, qui est le premier reglage que tout le monde change'
do $$
declare v_handle text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-000000000001',true);

  update public.profiles set handle = 'profil_un_bis'
   where id = 'f6000000-0000-4000-8000-000000000001';

  select handle into v_handle from public.profiles
   where id = 'f6000000-0000-4000-8000-000000000001';
  if v_handle <> 'profil_un_bis' then raise exception 'FAIL: le pseudo vaut %', v_handle; end if;

  update public.profiles set handle = 'profil_un'
   where id = 'f6000000-0000-4000-8000-000000000001';
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== P3  le garde-fou refuse toujours role et reputation'
-- La moitie du travail que la 0009 ne devait surtout pas defaire. Passer le
-- trigger en SECURITY DEFINER aurait rendu P1 vert en desarmant celle-ci.
do $$
declare refused integer := 0;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-000000000001',true);

  begin
    update public.profiles set role = 'admin'
     where id = 'f6000000-0000-4000-8000-000000000001';
  exception when insufficient_privilege then refused := refused + 1;
  end;

  begin
    update public.profiles set reputation = 9999
     where id = 'f6000000-0000-4000-8000-000000000001';
  exception when insufficient_privilege then refused := refused + 1;
  end;

  if refused <> 2 then
    raise exception 'FAIL: % refus sur 2 attendus — le garde-fou est desarme', refused;
  end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== P4  le profil d autrui ne se modifie pas, et le refus est silencieux'
do $$
declare n integer; v_city text;
begin
  -- D'abord la preuve que la ligne existe, sinon « zero ligne modifiee » ne
  -- prouverait que l'absence de la fixture.
  select count(*) into n from public.profiles
   where id = 'f7000000-0000-4000-8000-000000000002';
  if n <> 1 then raise exception 'FAIL: la fixture n existe pas'; end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-000000000001',true);

  update public.profiles set city = 'Pirate'
   where id = 'f7000000-0000-4000-8000-000000000002';
  get diagnostics n = row_count;

  -- Zero, et non une erreur : c'est ainsi qu'une policy refuse un UPDATE.
  if n <> 0 then raise exception 'FAIL: % ligne(s) d autrui modifiee(s)', n; end if;

  reset role;
  select city into v_city from public.profiles
   where id = 'f7000000-0000-4000-8000-000000000002';
  if v_city is not null then raise exception 'FAIL: la ville d autrui vaut %', v_city; end if;
  raise notice 'PASS';
end $$;

\echo '=== P5  la cle de service ecrit role et reputation, elle'
-- L'autre moitie : le contexte privilegie doit rester privilegie. C'est par la
-- que passera l'attribution d'un role en P8.
do $$
declare v_role public.app_role;
begin
  update public.profiles set role = 'moderator', reputation = 50
   where id = 'f7000000-0000-4000-8000-000000000002';

  select role into v_role from public.profiles
   where id = 'f7000000-0000-4000-8000-000000000002';
  if v_role <> 'moderator' then raise exception 'FAIL: le role vaut %', v_role; end if;

  update public.profiles set role = 'member', reputation = 0
   where id = 'f7000000-0000-4000-8000-000000000002';
  raise notice 'PASS';
end $$;

\echo '=== P6  les reglages restent modifiables par leur proprietaire'
do $$
declare v_scale text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-000000000001',true);

  update public.profile_settings
     set preferences = '{"score_scale":20,"length_unit":"in","email_digest":false}'::jsonb
   where id = 'f6000000-0000-4000-8000-000000000001';

  select preferences ->> 'score_scale' into v_scale from public.profile_settings
   where id = 'f6000000-0000-4000-8000-000000000001';
  if v_scale <> '20' then raise exception 'FAIL: l echelle vaut %', v_scale; end if;

  raise notice 'PASS';
  reset role;
end $$;

\echo '=== Garde-fou du profil : 6 assertions passees'
