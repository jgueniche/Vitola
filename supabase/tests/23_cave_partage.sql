-- =============================================================================
-- Assertions de comportement : la cave à son propriétaire, et le partage
-- (migration 0036, ADR 0022).
--
-- Exécuté en CI sur une base où 0001 à 0036 sont appliquées.
--
-- Ce fichier n'accorde rien et ne corrige rien : l'auto-contrôle de la 0036
-- vérifie ce qu'elle vient d'établir, donc il ne peut pas échouer dessus. La
-- régression future ne se voit que d'ici.
--
-- Les quatre pièges du dépôt, évités explicitement :
--
--   1. `SET LOCAL ROLE` hors transaction est ignoré : chaque assertion vit dans
--      un bloc `do $$ … $$`, qui est une transaction implicite.
--   2. Une assertion dont la donnée n'existe pas réussit sans rien tester :
--      chaque « invisible » prouve d'abord, en contexte privilégié, que la ligne
--      existe.
--   3. Un UPDATE ou un DELETE qu'une policy refuse rend zéro ligne sans lever :
--      on compte les lignes effectivement touchées. Un INSERT refusé, lui, lève.
--   4. Un DELETE sans clause WHERE ne lit aucune colonne, donc n'évalue aucune
--      policy SELECT — c'est par là que la cave d'autrui se vidait. S2 l'exerce
--      nu, exprès.
--
-- A possède une cave montrée sur son profil ; B est invité ; C est un tiers.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- ---------- Fixtures, créées comme postgres (contexte privilégié) ------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('c0ca0001-0000-4000-8000-000000000001','partage-a@x.test','{"birth_date":"1981-02-03"}'),
  ('c0ca0002-0000-4000-8000-000000000002','partage-b@x.test','{"birth_date":"1985-06-07"}'),
  ('c0ca0003-0000-4000-8000-000000000003','partage-c@x.test','{"birth_date":"1990-10-11"}')
on conflict (id) do nothing;

update public.profiles set handle = 'partage_a' where id = 'c0ca0001-0000-4000-8000-000000000001';
update public.profiles set handle = 'partage_b' where id = 'c0ca0002-0000-4000-8000-000000000002';
update public.profiles set handle = 'partage_c' where id = 'c0ca0003-0000-4000-8000-000000000003';

-- A a coché « Montrer ma cave » : c'est la clé qui ouvrait la ligne à tous.
update public.profile_settings
   set privacy = privacy || '{"show_humidor": true}'::jsonb
 where id = 'c0ca0001-0000-4000-8000-000000000001';

insert into ref.manufacturers (id, name, slug, country) values
  ('c0ca0000-0000-4000-8000-0000000000f1', 'Manufacture Partage', 'manufacture-partage', 'CU')
on conflict (id) do nothing;
insert into ref.brands (id, manufacturer_id, name, slug, country, is_cuban) values
  ('c0ca0000-0000-4000-8000-0000000000f2', 'c0ca0000-0000-4000-8000-0000000000f1',
   'Marque Partage', 'marque-partage', 'CU', true)
on conflict (id) do nothing;
insert into ref.cigars (id, brand_id, commercial_name, slug, origin_country, status) values
  ('c0ca0000-0000-4000-8000-0000000000f3', 'c0ca0000-0000-4000-8000-0000000000f2',
   'Fiche Partage', 'fiche-partage', 'CU', 'published')
on conflict (id) do nothing;

insert into public.humidors (id, user_id, name, capacity, is_default) values
  ('c0ca0000-0000-4000-8000-0000000000a1', 'c0ca0001-0000-4000-8000-000000000001', 'Cave de A', 50, true),
  ('c0ca0000-0000-4000-8000-0000000000c1', 'c0ca0003-0000-4000-8000-000000000003', 'Cave de C', null, true)
on conflict (id) do nothing;

-- Le lot de A porte tout ce qu'une porte ne doit pas rendre : un prix, un
-- vendeur, un code de boîte, un emplacement et une note. Recréé à chaque
-- passage, avec son grand livre : S3 fume dedans, et le fichier doit rester
-- rejouable.
delete from public.humidor_items
 where id in ('c0ca0000-0000-4000-8000-0000000001a1', 'c0ca0000-0000-4000-8000-0000000001c1');
insert into public.humidor_items
  (id, humidor_id, cigar_id, qty, purchase_date, purchase_price_eur, vendor_name, box_code, position, notes)
values
  ('c0ca0000-0000-4000-8000-0000000001a1', 'c0ca0000-0000-4000-8000-0000000000a1',
   'c0ca0000-0000-4000-8000-0000000000f3', 7, current_date - 400, 12.50,
   'Vendeur secret', 'ABC 01', 'Tiroir du haut', 'Note privée'),
  ('c0ca0000-0000-4000-8000-0000000001c1', 'c0ca0000-0000-4000-8000-0000000000c1',
   'c0ca0000-0000-4000-8000-0000000000f3', 3, current_date - 10, null, null, null, null, null)
on conflict (id) do nothing;

delete from public.humidor_readings where humidor_id = 'c0ca0000-0000-4000-8000-0000000000a1';
insert into public.humidor_readings (humidor_id, rh)
values ('c0ca0000-0000-4000-8000-0000000000a1', 69);

-- Rejouable : aucun partage, aucun blocage, aucune notification au départ.
delete from public.humidor_shares
 where humidor_id in ('c0ca0000-0000-4000-8000-0000000000a1', 'c0ca0000-0000-4000-8000-0000000000c1');
delete from public.blocks
 where blocker_id in ('c0ca0001-0000-4000-8000-000000000001', 'c0ca0002-0000-4000-8000-000000000002',
                      'c0ca0003-0000-4000-8000-000000000003');
delete from public.notifications
 where user_id in ('c0ca0001-0000-4000-8000-000000000001', 'c0ca0002-0000-4000-8000-000000000002',
                   'c0ca0003-0000-4000-8000-000000000003');

\echo '=== S1  une cave montree sur le profil ne s ouvre plus a un tiers'
do $$
declare n integer;
begin
  if not exists (select 1 from public.humidors where id = 'c0ca0000-0000-4000-8000-0000000000a1') then
    raise exception 'FAIL: la fixture de cave n existe pas';
  end if;
  if not public.shows_humidor('c0ca0001-0000-4000-8000-000000000001') then
    raise exception 'FAIL: show_humidor n est pas coche, le test ne teste rien';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'c0ca0002-0000-4000-8000-000000000002', true);

  -- Le signalement du 26 septembre, en une requête : « mes caves ».
  select count(*) into n from public.humidors;
  if n <> 0 then raise exception 'FAIL: B voit % cave(s) qui ne sont pas les siennes', n; end if;

  select count(*) into n from public.humidors where id = 'c0ca0000-0000-4000-8000-0000000000a1';
  if n <> 0 then raise exception 'FAIL: la cave montree de A est lisible en direct'; end if;

  -- La promesse du réglage est tenue par sa porte, et par elle seule. C'est
  -- l'état d'après la 0036 : la 0038 borne ensuite cette porte aux personnes à
  -- qui la cave est partagée, et `25_cave_montree.sql` le décrit.
  select count(*) into n from public.shared_humidor_shelf('c0ca0001-0000-4000-8000-000000000001');
  if n <> 1 then raise exception 'FAIL: l etagere du profil rend % lot(s) au lieu de 1', n; end if;

  raise notice 'PASS';
  reset role;
end $$;

\echo '=== S2  un tiers n ecrit rien dans la cave d autrui, par aucun chemin'
do $$
declare n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'c0ca0003-0000-4000-8000-000000000003', true);

  -- Sans RETURNING : c'est ce que PostgREST envoie quand le client ne lit rien.
  begin
    insert into public.humidor_readings (humidor_id, rh)
    values ('c0ca0000-0000-4000-8000-0000000000a1', 12);
    raise exception 'FAIL: C a ecrit un releve dans la cave de A';
  exception when insufficient_privilege then null;
  end;

  -- Le chemin de l'import CSV : `.insert(rows)` sans `.select()`.
  begin
    insert into public.humidor_items (humidor_id, cigar_id, qty)
    values ('c0ca0000-0000-4000-8000-0000000000a1', 'c0ca0000-0000-4000-8000-0000000000f3', 99);
    raise exception 'FAIL: C a range des cigares dans la cave de A';
  exception when insufficient_privilege then null;
  end;

  -- Déplacer son propre lot chez A.
  begin
    update public.humidor_items set humidor_id = 'c0ca0000-0000-4000-8000-0000000000a1'
     where id = 'c0ca0000-0000-4000-8000-0000000001c1';
    raise exception 'FAIL: C a deplace un lot dans la cave de A';
  exception when insufficient_privilege then null;
  end;

  -- Nus, sans WHERE : aucune policy SELECT ne s'applique, seul le verrou tient.
  -- C y perd son propre lot, et c'est la preuve que la requête a bien tourné.
  delete from public.humidor_items;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'FAIL: le delete nu a touche % lot(s) au lieu du seul lot de C', n;
  end if;

  delete from public.humidor_readings;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: C a supprime % releve(s) d autrui', n; end if;

  update public.humidor_items set notes = 'ecrit par C'
   where humidor_id = 'c0ca0000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: C a modifie % lot(s) de A', n; end if;

  delete from public.humidors where id = 'c0ca0000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: C a supprime la cave de A'; end if;

  reset role;

  select count(*) into n from public.humidor_items
   where humidor_id = 'c0ca0000-0000-4000-8000-0000000000a1' and notes = 'Note privée';
  if n <> 1 then raise exception 'FAIL: le lot de A a ete touche'; end if;
  select count(*) into n from public.humidor_readings
   where humidor_id = 'c0ca0000-0000-4000-8000-0000000000a1';
  if n <> 1 then raise exception 'FAIL: les releves de A ont ete touches'; end if;

  raise notice 'PASS';
end $$;

\echo '=== S3  le proprietaire, lui, fait tout ce qu il faisait'
do $$
declare n integer; v_qty integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'c0ca0001-0000-4000-8000-000000000001', true);

  select count(*) into n from public.humidors;
  if n <> 1 then raise exception 'FAIL: A voit % cave(s) au lieu de 1', n; end if;

  select count(*) into n from public.humidor_inventory
   where humidor_id = 'c0ca0000-0000-4000-8000-0000000000a1';
  if n <> 1 then raise exception 'FAIL: A ne lit plus son inventaire'; end if;

  insert into public.humidor_readings (humidor_id, rh)
  values ('c0ca0000-0000-4000-8000-0000000000a1', 70);

  -- Le geste de l'ADR 0006, en droits d'appelant : l'événement `smoke` passe
  -- le verrou `FOR ALL` du grand livre, et le trigger tient `qty`.
  perform public.smoke_from_humidor('c0ca0000-0000-4000-8000-0000000001a1', 1);
  select qty into v_qty from public.humidor_items where id = 'c0ca0000-0000-4000-8000-0000000001a1';
  if v_qty <> 6 then raise exception 'FAIL: qty vaut % apres une fumee au lieu de 6', v_qty; end if;

  raise notice 'PASS';
  reset role;
end $$;

\echo '=== S4  seul le proprietaire invite, jamais lui-meme, et l invitation se dit'
do $$
declare n integer;
begin
  set local role authenticated;

  perform set_config('request.jwt.claim.sub', 'c0ca0003-0000-4000-8000-000000000003', true);
  begin
    insert into public.humidor_shares (humidor_id, recipient_id)
    values ('c0ca0000-0000-4000-8000-0000000000a1', 'c0ca0003-0000-4000-8000-000000000003');
    raise exception 'FAIL: C a partage la cave de A';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', 'c0ca0001-0000-4000-8000-000000000001', true);
  begin
    insert into public.humidor_shares (humidor_id, recipient_id)
    values ('c0ca0000-0000-4000-8000-0000000000a1', 'c0ca0001-0000-4000-8000-000000000001');
    raise exception 'FAIL: A a partage sa cave avec lui-meme';
  exception when insufficient_privilege then null;
  end;

  -- Une invitation ne naît pas acceptée : la colonne est hors du grant.
  begin
    insert into public.humidor_shares (humidor_id, recipient_id, accepted_at)
    values ('c0ca0000-0000-4000-8000-0000000000a1', 'c0ca0002-0000-4000-8000-000000000002', now());
    raise exception 'FAIL: A a ecrit une invitation deja acceptee';
  exception when insufficient_privilege then null;
  end;

  insert into public.humidor_shares (humidor_id, recipient_id)
  values ('c0ca0000-0000-4000-8000-0000000000a1', 'c0ca0002-0000-4000-8000-000000000002');

  reset role;

  select count(*) into n from public.notifications
   where user_id = 'c0ca0002-0000-4000-8000-000000000002'
     and kind = 'humidor_share'
     and actor_id = 'c0ca0001-0000-4000-8000-000000000001';
  if n <> 1 then raise exception 'FAIL: % notification(s) d invitation au lieu de 1', n; end if;

  raise notice 'PASS';
end $$;

\echo '=== S5  une invitation n ouvre rien'
do $$
declare n integer; r record;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'c0ca0002-0000-4000-8000-000000000002', true);

  select count(*) into n from public.humidor_shares_received();
  if n <> 1 then raise exception 'FAIL: B voit % invitation(s) au lieu de 1', n; end if;

  select * into r from public.humidor_shares_received();
  if r.humidor_name <> 'Cave de A' or r.owner_handle <> 'partage_a' then
    raise exception 'FAIL: l invitation ne dit ni la cave ni qui la propose (%, %)',
      r.humidor_name, r.owner_handle;
  end if;
  if r.accepted_at is not null or r.capacity is not null or r.cigar_count is not null then
    raise exception 'FAIL: une invitation en attente en dit trop';
  end if;

  select count(*) into n from public.shared_humidor_lots('c0ca0000-0000-4000-8000-0000000000a1');
  if n <> 0 then raise exception 'FAIL: % lot(s) lisibles avant acceptation', n; end if;

  select count(*) into n from public.humidors;
  if n <> 0 then raise exception 'FAIL: l invitation a mis la cave de A dans la liste de B'; end if;

  -- C, tiers : ni l'invitation, ni la ligne, ni la porte.
  perform set_config('request.jwt.claim.sub', 'c0ca0003-0000-4000-8000-000000000003', true);
  select count(*) into n from public.humidor_shares_received();
  if n <> 0 then raise exception 'FAIL: C voit l invitation de B'; end if;
  select count(*) into n from public.humidor_shares;
  if n <> 0 then raise exception 'FAIL: C lit % ligne(s) de partage', n; end if;

  raise notice 'PASS';
  reset role;
end $$;

\echo '=== S6  seul le destinataire repond, et on ne masque que ce qu on a accepte'
do $$
declare n integer;
begin
  if not exists (select 1 from public.humidor_shares
                  where humidor_id = 'c0ca0000-0000-4000-8000-0000000000a1'
                    and recipient_id = 'c0ca0002-0000-4000-8000-000000000002'
                    and accepted_at is null) then
    raise exception 'FAIL: l invitation en attente n existe pas';
  end if;

  set local role authenticated;

  -- Le propriétaire n'accepte pas à la place de celui qu'il invite.
  perform set_config('request.jwt.claim.sub', 'c0ca0001-0000-4000-8000-000000000001', true);
  update public.humidor_shares set accepted_at = now()
   where humidor_id = 'c0ca0000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: le proprietaire a accepte pour B'; end if;

  perform set_config('request.jwt.claim.sub', 'c0ca0003-0000-4000-8000-000000000003', true);
  update public.humidor_shares set accepted_at = now()
   where humidor_id = 'c0ca0000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: un tiers a accepte pour B'; end if;

  perform set_config('request.jwt.claim.sub', 'c0ca0002-0000-4000-8000-000000000002', true);
  begin
    update public.humidor_shares set hidden_at = now()
     where humidor_id = 'c0ca0000-0000-4000-8000-0000000000a1'
       and recipient_id = 'c0ca0002-0000-4000-8000-000000000002';
    raise exception 'FAIL: une invitation en attente a ete masquee';
  exception when check_violation then null;
  end;

  update public.humidor_shares set accepted_at = now()
   where humidor_id = 'c0ca0000-0000-4000-8000-0000000000a1'
     and recipient_id = 'c0ca0002-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: B n a pas pu accepter'; end if;

  raise notice 'PASS';
  reset role;
end $$;

\echo '=== S7  accepte : B lit la projection, et rien d autre'
do $$
declare n integer; r record; cols text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'c0ca0002-0000-4000-8000-000000000002', true);

  select count(*) into n from public.shared_humidor_lots('c0ca0000-0000-4000-8000-0000000000a1');
  if n <> 1 then raise exception 'FAIL: % lot(s) rendus au lieu de 1', n; end if;

  select * into r from public.shared_humidor_lots('c0ca0000-0000-4000-8000-0000000000a1');
  if r.qty <> 6 then raise exception 'FAIL: qty vaut % au lieu de 6', r.qty; end if;
  if r.aging_days <> 400 then raise exception 'FAIL: age de % jours au lieu de 400', r.aging_days; end if;

  select * into r from public.humidor_shares_received();
  if r.accepted_at is null or r.capacity <> 50 or r.cigar_count <> 6 then
    raise exception 'FAIL: la cave acceptee ne dit pas sa capacite et son compte (%, %)',
      r.capacity, r.cigar_count;
  end if;

  -- Accepter n'ouvre pas les tables : la cave reste à son propriétaire.
  select count(*) into n from public.humidors;
  if n <> 0 then raise exception 'FAIL: la cave partagee est lisible en direct'; end if;
  select count(*) into n from public.humidor_items;
  if n <> 0 then raise exception 'FAIL: % lot(s) lisibles en direct', n; end if;
  select count(*) into n from public.humidor_inventory;
  if n <> 0 then raise exception 'FAIL: l inventaire de A est lisible par sa vue'; end if;
  select count(*) into n from public.humidor_events;
  if n <> 0 then raise exception 'FAIL: le grand livre de A est lisible'; end if;
  select count(*) into n from public.humidor_readings;
  if n <> 0 then raise exception 'FAIL: les releves de A sont lisibles'; end if;

  -- Lecture seule en v1 (ADR 0022, D4).
  begin
    insert into public.humidor_readings (humidor_id, rh)
    values ('c0ca0000-0000-4000-8000-0000000000a1', 50);
    raise exception 'FAIL: le destinataire a ecrit dans la cave partagee';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.smoke_from_humidor('c0ca0000-0000-4000-8000-0000000001a1', 1);
    raise exception 'FAIL: le destinataire a fume dans la cave partagee';
  exception when no_data_found then null;
  end;

  reset role;

  -- La frontière est le type de retour. Une valeur absente peut être un hasard
  -- de données ; une colonne absente est une décision.
  select string_agg(pg_get_function_result(p.oid), ' | ') into cols
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('humidor_shares_received', 'shared_humidor_lots')
     and pg_get_function_result(p.oid) ~* '(price|purchase|vendor|box_code|position|notes)';
  if cols is not null then raise exception 'FAIL: une porte expose %', cols; end if;

  raise notice 'PASS';
end $$;

\echo '=== S8  masquer appartient au destinataire, et le proprietaire ne le lit pas'
do $$
declare n integer; v timestamptz;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'c0ca0002-0000-4000-8000-000000000002', true);

  update public.humidor_shares set hidden_at = now()
   where humidor_id = 'c0ca0000-0000-4000-8000-0000000000a1'
     and recipient_id = 'c0ca0002-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: B n a pas pu masquer'; end if;

  select hidden_at into v from public.humidor_shares_received();
  if v is null then raise exception 'FAIL: B ne relit pas son choix'; end if;

  -- Masquer n'est pas quitter : la porte reste ouverte, seul l'affichage change.
  select count(*) into n from public.shared_humidor_lots('c0ca0000-0000-4000-8000-0000000000a1');
  if n <> 1 then raise exception 'FAIL: masquer a ferme la porte'; end if;

  perform set_config('request.jwt.claim.sub', 'c0ca0001-0000-4000-8000-000000000001', true);
  select count(*) into n from public.humidor_shares where accepted_at is not null;
  if n <> 1 then raise exception 'FAIL: A ne voit pas que son partage est accepte'; end if;
  begin
    perform hidden_at from public.humidor_shares;
    raise exception 'FAIL: le proprietaire lit le choix du destinataire';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', 'c0ca0002-0000-4000-8000-000000000002', true);
  update public.humidor_shares set hidden_at = null
   where humidor_id = 'c0ca0000-0000-4000-8000-0000000000a1'
     and recipient_id = 'c0ca0002-0000-4000-8000-000000000002';
  select hidden_at into v from public.humidor_shares_received();
  if v is not null then raise exception 'FAIL: B n a pas pu reafficher'; end if;

  raise notice 'PASS';
  reset role;
end $$;

\echo '=== S9  un blocage ferme les deux portes, et empeche d inviter'
do $$
declare n integer;
begin
  set local role authenticated;

  perform set_config('request.jwt.claim.sub', 'c0ca0002-0000-4000-8000-000000000002', true);
  insert into public.blocks (blocker_id, blocked_id)
  values ('c0ca0002-0000-4000-8000-000000000002', 'c0ca0001-0000-4000-8000-000000000001');

  select count(*) into n from public.humidor_shares_received();
  if n <> 0 then raise exception 'FAIL: la cave reste listee par-dessus un blocage'; end if;
  select count(*) into n from public.shared_humidor_lots('c0ca0000-0000-4000-8000-0000000000a1');
  if n <> 0 then raise exception 'FAIL: la cave reste ouverte par-dessus un blocage'; end if;

  -- Dans l'autre sens : A ne peut pas inviter quelqu'un qui l'a bloqué.
  perform set_config('request.jwt.claim.sub', 'c0ca0003-0000-4000-8000-000000000003', true);
  insert into public.blocks (blocker_id, blocked_id)
  values ('c0ca0003-0000-4000-8000-000000000003', 'c0ca0001-0000-4000-8000-000000000001');

  perform set_config('request.jwt.claim.sub', 'c0ca0001-0000-4000-8000-000000000001', true);
  begin
    insert into public.humidor_shares (humidor_id, recipient_id)
    values ('c0ca0000-0000-4000-8000-0000000000a1', 'c0ca0003-0000-4000-8000-000000000003');
    raise exception 'FAIL: A a invite quelqu un qui l a bloque';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', 'c0ca0003-0000-4000-8000-000000000003', true);
  delete from public.blocks where blocker_id = 'c0ca0003-0000-4000-8000-000000000003';
  perform set_config('request.jwt.claim.sub', 'c0ca0002-0000-4000-8000-000000000002', true);
  delete from public.blocks where blocker_id = 'c0ca0002-0000-4000-8000-000000000002';

  select count(*) into n from public.shared_humidor_lots('c0ca0000-0000-4000-8000-0000000000a1');
  if n <> 1 then raise exception 'FAIL: debloquer ne rend pas la cave'; end if;

  raise notice 'PASS';
  reset role;
end $$;

\echo '=== S10 chacun met fin au partage ; un tiers, non'
do $$
declare n integer;
begin
  set local role authenticated;

  perform set_config('request.jwt.claim.sub', 'c0ca0003-0000-4000-8000-000000000003', true);
  delete from public.humidor_shares where humidor_id = 'c0ca0000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: un tiers a mis fin au partage'; end if;

  -- B quitte.
  perform set_config('request.jwt.claim.sub', 'c0ca0002-0000-4000-8000-000000000002', true);
  delete from public.humidor_shares
   where humidor_id = 'c0ca0000-0000-4000-8000-0000000000a1'
     and recipient_id = 'c0ca0002-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: B n a pas pu quitter'; end if;
  select count(*) into n from public.shared_humidor_lots('c0ca0000-0000-4000-8000-0000000000a1');
  if n <> 0 then raise exception 'FAIL: la porte reste ouverte apres le depart'; end if;

  -- A réinvite, puis retire.
  perform set_config('request.jwt.claim.sub', 'c0ca0001-0000-4000-8000-000000000001', true);
  insert into public.humidor_shares (humidor_id, recipient_id)
  values ('c0ca0000-0000-4000-8000-0000000000a1', 'c0ca0002-0000-4000-8000-000000000002');
  delete from public.humidor_shares
   where humidor_id = 'c0ca0000-0000-4000-8000-0000000000a1'
     and recipient_id = 'c0ca0002-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: A n a pas pu retirer son partage'; end if;

  raise notice 'PASS';
  reset role;
end $$;

\echo '=== S11 supprimer la cave emporte ses partages ; la suppression par son proprietaire aboutit'
do $$
declare n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'c0ca0003-0000-4000-8000-000000000003', true);
  insert into public.humidor_shares (humidor_id, recipient_id)
  values ('c0ca0000-0000-4000-8000-0000000000c1', 'c0ca0002-0000-4000-8000-000000000002');

  delete from public.humidors where id = 'c0ca0000-0000-4000-8000-0000000000c1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: le proprietaire n a pas pu supprimer sa cave'; end if;
  reset role;

  select count(*) into n from public.humidor_shares
   where humidor_id = 'c0ca0000-0000-4000-8000-0000000000c1';
  if n <> 0 then raise exception 'FAIL: % partage(s) survivent a la cave', n; end if;
  select count(*) into n from public.humidor_items
   where humidor_id = 'c0ca0000-0000-4000-8000-0000000000c1';
  if n <> 0 then raise exception 'FAIL: % lot(s) survivent a la cave', n; end if;

  raise notice 'PASS';
end $$;

\echo '=== S12 anon ne touche ni au partage ni a ses portes'
do $$
begin
  if has_table_privilege('anon', 'public.humidor_shares', 'SELECT')
     or has_table_privilege('anon', 'public.humidor_shares', 'INSERT') then
    raise exception 'FAIL: anon a des droits sur humidor_shares';
  end if;
  if has_function_privilege('anon', 'public.humidor_shares_received()', 'EXECUTE')
     or has_function_privilege('anon', 'public.shared_humidor_lots(uuid)', 'EXECUTE') then
    raise exception 'FAIL: anon appelle une porte du partage';
  end if;
  if not has_function_privilege('authenticated', 'public.humidor_shares_received()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.shared_humidor_lots(uuid)', 'EXECUTE') then
    raise exception 'FAIL: un membre a perdu une porte du partage';
  end if;
  raise notice 'PASS';
end $$;

\echo ''
\echo 'Cave personnelle et partage : 12 assertions passees.'
