-- =============================================================================
-- Assertions de comportement sur le status de ref.lines (migration 0019,
-- ADR 0009, pièce 1).
--
-- Exécuté en CI sur une base où 0001 à 0019 sont appliquées.
--
-- Ce fichier **n'accorde rien** et ne corrige rien : l'auto-contrôle d'une
-- migration ne peut pas attraper ce qu'elle vient d'établir, la régression
-- future ne se voit que d'ici.
--
-- Deux personnes : `nora` est promue editor, `paul` est membre. La règle
-- vérifiée est celle de l'ADR : une gamme naît en brouillon, invisible de tous
-- sauf des relecteurs, et se publie par un editor — jamais par son insertion.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- ---------- Fixtures, créées comme postgres (contexte privilégié) ------------
delete from ref.lines  where slug like 'gamme-%-test';
delete from ref.brands where slug = 'marque-gammes-test';

insert into auth.users (id, email, raw_user_meta_data) values
  ('aa190000-0000-4000-8000-000000000001','gammes-nora@x.test','{"birth_date":"1984-05-01"}'),
  ('bb190000-0000-4000-8000-000000000002','gammes-paul@x.test','{"birth_date":"1987-06-02"}')
on conflict (id) do nothing;

update public.profiles set handle='gammes_nora', role='editor'
 where id='aa190000-0000-4000-8000-000000000001';
update public.profiles set handle='gammes_paul'
 where id='bb190000-0000-4000-8000-000000000002';

insert into ref.brands (id, name, slug)
values ('cc190000-0000-4000-8000-000000000003', 'Marque des gammes', 'marque-gammes-test')
on conflict (id) do nothing;

-- Une gamme publiée et une en brouillon. Statuts posés en contexte privilégié :
-- ce que le test mesure est qui LES LIT, pas qui les écrit.
insert into ref.lines (id, brand_id, name, slug, status) values
  ('dd190000-0000-4000-8000-000000000004', 'cc190000-0000-4000-8000-000000000003',
   'Gamme publiée', 'gamme-publiee-test', 'published'),
  ('ee190000-0000-4000-8000-000000000005', 'cc190000-0000-4000-8000-000000000003',
   'Gamme en brouillon', 'gamme-brouillon-test', 'draft');

\echo '=== L1  les deux fixtures existent (sans quoi rien ne se teste)'
do $$
declare n integer;
begin
  select count(*) into n from ref.lines where slug like 'gamme-%-test';
  if n <> 2 then
    raise exception 'FAIL: % fixture(s) au lieu de 2 — les assertions suivantes ne testeraient rien', n;
  end if;
  raise notice 'PASS';
end $$;

\echo '=== L2  un anonyme ne lit que la gamme publiee'
do $$
declare n integer;
begin
  set local role anon;
  select count(*) into n from ref.lines where slug like 'gamme-%-test';
  if n <> 1 then
    raise exception 'FAIL: un anonyme lit % gamme(s) au lieu de 1 — le brouillon fuite', n;
  end if;
  select count(*) into n from ref.lines where slug = 'gamme-brouillon-test';
  if n <> 0 then raise exception 'FAIL: le brouillon est lisible d un anonyme'; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== L3  un membre ne lit que la publiee, et n insere pas de gamme'
do $$
declare n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','bb190000-0000-4000-8000-000000000002',true);

  select count(*) into n from ref.lines where slug like 'gamme-%-test';
  if n <> 1 then
    raise exception 'FAIL: un membre lit % gamme(s) au lieu de 1', n;
  end if;

  begin
    insert into ref.lines (brand_id, name, slug)
    values ('cc190000-0000-4000-8000-000000000003', 'Gamme de Paul', 'gamme-de-paul-test');
    raise exception 'FAIL: un membre a insere une gamme — la piece 3 n est pas ouverte';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== L4  un membre ne publie pas un brouillon (zero ligne, pas d erreur)'
do $$
declare n integer;
begin
  -- La ligne existe, en contexte privilégié — une assertion « zéro ligne »
  -- doit d'abord prouver que la ligne est là.
  select count(*) into n from ref.lines where slug = 'gamme-brouillon-test';
  if n <> 1 then raise exception 'FAIL: le brouillon fixture a disparu'; end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','bb190000-0000-4000-8000-000000000002',true);
  update ref.lines set status = 'published' where slug = 'gamme-brouillon-test';
  reset role;

  select count(*) into n from ref.lines
   where slug = 'gamme-brouillon-test' and status = 'draft';
  if n <> 1 then raise exception 'FAIL: un membre a publie un brouillon de gamme'; end if;
  raise notice 'PASS';
end $$;

\echo '=== L5  un relecteur lit aussi les brouillons'
do $$
declare n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa190000-0000-4000-8000-000000000001',true);
  select count(*) into n from ref.lines where slug like 'gamme-%-test';
  if n <> 2 then
    raise exception 'FAIL: un relecteur lit % gamme(s) au lieu de 2 — il ne peut pas relire ce qu il ne voit pas', n;
  end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== L6  une gamme d editor nait draft, puis se publie et devient lisible'
do $$
declare v_id uuid; n integer; v_status text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa190000-0000-4000-8000-000000000001',true);

  insert into ref.lines (brand_id, name, slug)
  values ('cc190000-0000-4000-8000-000000000003', 'Gamme de Nora', 'gamme-de-nora-test')
  returning id into v_id;

  select status::text into v_status from ref.lines where id = v_id;
  if v_status <> 'draft' then
    raise exception 'FAIL: une gamme nait % au lieu de draft', v_status;
  end if;

  reset role;
  set local role anon;
  select count(*) into n from ref.lines where id = v_id;
  if n <> 0 then raise exception 'FAIL: un brouillon d editor est lisible d un anonyme'; end if;
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa190000-0000-4000-8000-000000000001',true);
  update ref.lines set status = 'published' where id = v_id;
  reset role;

  set local role anon;
  select count(*) into n from ref.lines where id = v_id;
  if n <> 1 then raise exception 'FAIL: une gamme publiee par un editor reste invisible'; end if;
  raise notice 'PASS';
  reset role;
end $$;

-- ---------- Nettoyage, en contexte privilégié --------------------------------
delete from ref.lines  where slug like 'gamme-%-test';
delete from ref.brands where slug = 'marque-gammes-test';

\echo 'Gammes : 6 assertions, base laissee comme trouvee (les fixtures d auth restent).'
