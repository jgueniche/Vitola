-- =============================================================================
-- Assertions de comportement : « Montrer ma cave » ne s'adresse qu'aux
-- personnes à qui la cave est partagée (migration 0038, ADR 0022).
--
-- Exécuté en CI sur une base où 0001 à 0038 sont appliquées. Ce fichier
-- n'accorde rien : il éprouve `shared_humidor_shelf()` telle qu'un tiers, un
-- invité, un destinataire et le propriétaire la rencontrent.
--
-- Les pièges du dépôt, évités : chaque assertion vit dans un bloc `do $$ … $$`
-- (donc une transaction, pour que `SET LOCAL ROLE` porte), et chaque « rien »
-- prouve d'abord, en contexte privilégié, qu'il y avait quelque chose à voir.
--
-- A a coché « Montrer ma cave » et possède deux caves : X, partagée avec B qui
-- l'a acceptée, et Y, proposée à D qui n'a pas répondu. C n'a aucun partage.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- ---------- Fixtures, créées comme postgres (contexte privilégié) ------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('ca5e0001-0000-4000-8000-000000000001','etagere-a@x.test','{"birth_date":"1980-01-02"}'),
  ('ca5e0002-0000-4000-8000-000000000002','etagere-b@x.test','{"birth_date":"1984-03-04"}'),
  ('ca5e0003-0000-4000-8000-000000000003','etagere-c@x.test','{"birth_date":"1988-05-06"}'),
  ('ca5e0004-0000-4000-8000-000000000004','etagere-d@x.test','{"birth_date":"1992-07-08"}')
on conflict (id) do nothing;

update public.profiles set handle = 'etagere_a' where id = 'ca5e0001-0000-4000-8000-000000000001';
update public.profiles set handle = 'etagere_b' where id = 'ca5e0002-0000-4000-8000-000000000002';
update public.profiles set handle = 'etagere_c' where id = 'ca5e0003-0000-4000-8000-000000000003';
update public.profiles set handle = 'etagere_d' where id = 'ca5e0004-0000-4000-8000-000000000004';

update public.profile_settings
   set privacy = privacy || '{"show_humidor": true}'::jsonb
 where id = 'ca5e0001-0000-4000-8000-000000000001';

insert into ref.manufacturers (id, name, slug, country) values
  ('ca5e0000-0000-4000-8000-0000000000f1', 'Manufacture Etagere', 'manufacture-etagere', 'CU')
on conflict (id) do nothing;
insert into ref.brands (id, manufacturer_id, name, slug, country, is_cuban) values
  ('ca5e0000-0000-4000-8000-0000000000f2', 'ca5e0000-0000-4000-8000-0000000000f1',
   'Marque Etagere', 'marque-etagere', 'CU', true)
on conflict (id) do nothing;
insert into ref.cigars (id, brand_id, commercial_name, slug, origin_country, status) values
  ('ca5e0000-0000-4000-8000-0000000000f3', 'ca5e0000-0000-4000-8000-0000000000f2',
   'Fiche Etagere', 'fiche-etagere', 'CU', 'published')
on conflict (id) do nothing;

insert into public.humidors (id, user_id, name, capacity, is_default) values
  ('ca5e0000-0000-4000-8000-0000000000a1', 'ca5e0001-0000-4000-8000-000000000001', 'Cave X', 50, true),
  ('ca5e0000-0000-4000-8000-0000000000a2', 'ca5e0001-0000-4000-8000-000000000001', 'Cave Y', 20, false)
on conflict (id) do nothing;

-- Un lot par cave, recréés à chaque passage. Celui de X porte un prix et un
-- vendeur : ce que l'étagère ne doit jamais rendre.
delete from public.humidor_items
 where id in ('ca5e0000-0000-4000-8000-0000000001a1', 'ca5e0000-0000-4000-8000-0000000001a2');
insert into public.humidor_items
  (id, humidor_id, cigar_id, qty, purchase_date, purchase_price_eur, vendor_name)
values
  ('ca5e0000-0000-4000-8000-0000000001a1', 'ca5e0000-0000-4000-8000-0000000000a1',
   'ca5e0000-0000-4000-8000-0000000000f3', 5, current_date - 200, 20.00, 'Vendeur secret'),
  ('ca5e0000-0000-4000-8000-0000000001a2', 'ca5e0000-0000-4000-8000-0000000000a2',
   'ca5e0000-0000-4000-8000-0000000000f3', 2, current_date - 30, null, null);

-- Rejouable : les partages et les blocages repartent de zéro.
delete from public.humidor_shares
 where humidor_id in ('ca5e0000-0000-4000-8000-0000000000a1', 'ca5e0000-0000-4000-8000-0000000000a2');
delete from public.blocks
 where blocker_id in ('ca5e0001-0000-4000-8000-000000000001', 'ca5e0002-0000-4000-8000-000000000002');

-- X partagée avec B, qui a accepté ; Y proposée à D, sans réponse.
insert into public.humidor_shares (humidor_id, recipient_id, accepted_at) values
  ('ca5e0000-0000-4000-8000-0000000000a1', 'ca5e0002-0000-4000-8000-000000000002', now());
insert into public.humidor_shares (humidor_id, recipient_id) values
  ('ca5e0000-0000-4000-8000-0000000000a2', 'ca5e0004-0000-4000-8000-000000000004');

\echo '=== E1  un membre sans partage ne lit rien, case cochee'
do $$
declare n integer;
begin
  select count(*) into n from public.humidor_items
   where humidor_id in ('ca5e0000-0000-4000-8000-0000000000a1', 'ca5e0000-0000-4000-8000-0000000000a2')
     and qty > 0;
  if n <> 2 then raise exception 'FAIL: % lot(s) de fixture au lieu de 2, le test ne teste rien', n; end if;
  if not public.shows_humidor('ca5e0001-0000-4000-8000-000000000001') then
    raise exception 'FAIL: show_humidor n est pas coche, le test ne teste rien';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'ca5e0003-0000-4000-8000-000000000003', true);
  select count(*) into n from public.shared_humidor_shelf('ca5e0001-0000-4000-8000-000000000001');
  if n <> 0 then raise exception 'FAIL: un tiers sans partage lit % lot(s) de l etagere', n; end if;

  raise notice 'PASS';
  reset role;
end $$;

\echo '=== E2  le destinataire ne lit que la cave partagee avec lui, sans prix'
do $$
declare n integer; r record;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'ca5e0002-0000-4000-8000-000000000002', true);

  select count(*) into n from public.shared_humidor_shelf('ca5e0001-0000-4000-8000-000000000001');
  if n <> 1 then raise exception 'FAIL: le destinataire lit % lot(s) au lieu de 1', n; end if;

  select * into r from public.shared_humidor_shelf('ca5e0001-0000-4000-8000-000000000001');
  if r.humidor_id <> 'ca5e0000-0000-4000-8000-0000000000a1' then
    raise exception 'FAIL: l etagere rend la cave % au lieu de la cave partagee', r.humidor_name;
  end if;
  if r.qty <> 5 then raise exception 'FAIL: quantite % au lieu de 5', r.qty; end if;
  if to_jsonb(r)::text ~ '(20\.00|Vendeur)' then
    raise exception 'FAIL: l etagere rend le prix ou le vendeur : %', to_jsonb(r);
  end if;

  raise notice 'PASS';
  reset role;
end $$;

\echo '=== E3  une invitation en attente n ouvre pas l etagere'
do $$
declare n integer;
begin
  if not exists (select 1 from public.humidor_shares
                  where humidor_id = 'ca5e0000-0000-4000-8000-0000000000a2'
                    and recipient_id = 'ca5e0004-0000-4000-8000-000000000004'
                    and accepted_at is null) then
    raise exception 'FAIL: l invitation de fixture n existe pas';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'ca5e0004-0000-4000-8000-000000000004', true);
  select count(*) into n from public.shared_humidor_shelf('ca5e0001-0000-4000-8000-000000000001');
  if n <> 0 then raise exception 'FAIL: une invitation en attente montre % lot(s)', n; end if;

  raise notice 'PASS';
  reset role;
end $$;

\echo '=== E4  masquer retire la cave de l etagere, la reafficher la rend'
do $$
declare n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'ca5e0002-0000-4000-8000-000000000002', true);

  update public.humidor_shares set hidden_at = now()
   where humidor_id = 'ca5e0000-0000-4000-8000-0000000000a1'
     and recipient_id = 'ca5e0002-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: B n a pas pu masquer (% ligne)', n; end if;

  select count(*) into n from public.shared_humidor_shelf('ca5e0001-0000-4000-8000-000000000001');
  if n <> 0 then raise exception 'FAIL: une cave masquee revient par le profil (% lot)', n; end if;

  update public.humidor_shares set hidden_at = null
   where humidor_id = 'ca5e0000-0000-4000-8000-0000000000a1'
     and recipient_id = 'ca5e0002-0000-4000-8000-000000000002';
  select count(*) into n from public.shared_humidor_shelf('ca5e0001-0000-4000-8000-000000000001');
  if n <> 1 then raise exception 'FAIL: reafficher ne rend pas la cave (% lot)', n; end if;

  raise notice 'PASS';
  reset role;
end $$;

\echo '=== E5  decocher la case ferme l etagere, pas le partage'
do $$
declare n integer;
begin
  update public.profile_settings
     set privacy = privacy || '{"show_humidor": false}'::jsonb
   where id = 'ca5e0001-0000-4000-8000-000000000001';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'ca5e0002-0000-4000-8000-000000000002', true);

  select count(*) into n from public.shared_humidor_shelf('ca5e0001-0000-4000-8000-000000000001');
  if n <> 0 then raise exception 'FAIL: la case decochee laisse % lot(s) sur le profil', n; end if;

  select count(*) into n from public.shared_humidor_lots('ca5e0000-0000-4000-8000-0000000000a1');
  if n <> 1 then raise exception 'FAIL: decocher la case a repris la cave partagee (% lot)', n; end if;

  reset role;
  update public.profile_settings
     set privacy = privacy || '{"show_humidor": true}'::jsonb
   where id = 'ca5e0001-0000-4000-8000-000000000001';

  raise notice 'PASS';
end $$;

\echo '=== E6  un blocage ferme l etagere'
do $$
declare n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'ca5e0001-0000-4000-8000-000000000001', true);
  insert into public.blocks (blocker_id, blocked_id)
  values ('ca5e0001-0000-4000-8000-000000000001', 'ca5e0002-0000-4000-8000-000000000002');

  perform set_config('request.jwt.claim.sub', 'ca5e0002-0000-4000-8000-000000000002', true);
  select count(*) into n from public.shared_humidor_shelf('ca5e0001-0000-4000-8000-000000000001');
  if n <> 0 then raise exception 'FAIL: l etagere reste ouverte par-dessus un blocage (% lot)', n; end if;

  perform set_config('request.jwt.claim.sub', 'ca5e0001-0000-4000-8000-000000000001', true);
  delete from public.blocks
   where blocker_id = 'ca5e0001-0000-4000-8000-000000000001'
     and blocked_id = 'ca5e0002-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: le blocage de fixture ne s est pas defait'; end if;

  raise notice 'PASS';
  reset role;
end $$;

\echo '=== E7  le proprietaire lit ses caves par « Ma cave », pas par cette porte'
do $$
declare n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'ca5e0001-0000-4000-8000-000000000001', true);

  select count(*) into n from public.shared_humidor_shelf('ca5e0001-0000-4000-8000-000000000001');
  if n <> 0 then raise exception 'FAIL: la porte rend % lot(s) a son proprietaire', n; end if;

  -- Et ce n'est pas qu'il ait perdu ses caves : elles sont là, par la RLS.
  select count(*) into n from public.humidor_items
   where humidor_id in ('ca5e0000-0000-4000-8000-0000000000a1', 'ca5e0000-0000-4000-8000-0000000000a2');
  if n <> 2 then raise exception 'FAIL: le proprietaire ne lit que % lot(s) sur 2', n; end if;

  raise notice 'PASS';
  reset role;
end $$;

\echo '=== E8  anon ne l appelle pas, et elle ne rend toujours ni prix ni vendeur'
do $$
declare cols text;
begin
  if has_function_privilege('anon', 'public.shared_humidor_shelf(uuid)', 'EXECUTE') then
    raise exception 'FAIL: anon peut appeler shared_humidor_shelf()';
  end if;
  if not has_function_privilege('authenticated', 'public.shared_humidor_shelf(uuid)', 'EXECUTE') then
    raise exception 'FAIL: un membre a perdu la porte de l etagere';
  end if;

  cols := pg_get_function_result('public.shared_humidor_shelf(uuid)'::regprocedure);
  if cols ~* '(price|vendor|note|box|position|purchase)' then
    raise exception 'FAIL: l etagere expose %', cols;
  end if;

  raise notice 'PASS';
end $$;

\echo ''
\echo 'Cave montree aux seuls destinataires : 8 assertions passees.'
