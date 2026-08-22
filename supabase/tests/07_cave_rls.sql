-- =============================================================================
-- Assertions de comportement sur la cave (migration 0008, ADR 0006).
--
-- Exécuté en CI sur une base où 0001 à 0008 sont appliquées.
--
-- Ce fichier **n'accorde rien** et ne corrige rien. C'est sa raison d'être :
-- l'auto-contrôle d'une migration vérifie ce que cette migration vient
-- d'établir, donc il ne peut pas échouer dessus. La régression future ne se voit
-- que d'ici.
--
-- Les trois pièges du dépôt, évités explicitement :
--
--   1. `SET LOCAL ROLE` hors transaction est ignoré avec un WARNING. L'assertion
--      tourne alors en superutilisateur et passe pour rien. Chaque assertion vit
--      dans un bloc `do $$ … $$`, qui est une transaction implicite.
--
--   2. Une assertion dont la donnée de test n'existe pas réussit sans rien
--      tester. Chaque assertion de non-visibilité prouve d'abord, en contexte
--      privilégié, que la ligne existe.
--
--   3. Un UPDATE qu'une policy refuse n'échoue pas : il ne trouve aucune ligne
--      et rapporte zéro. Les assertions qui portent sur un refus de policy
--      comptent donc les lignes **effectivement** modifiées, et celles qui
--      portent sur un refus de *grant* attrapent `insufficient_privilege`.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- ---------- Fixtures, créées comme postgres (contexte privilégié) ------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('d4000000-0000-4000-8000-000000000001','cave-proprio@x.test' ,'{"birth_date":"1984-03-05"}'),
  ('e5000000-0000-4000-8000-000000000002','cave-voisin@x.test'  ,'{"birth_date":"1988-07-14"}')
on conflict (id) do nothing;

update public.profiles set handle='proprio_cave' where id='d4000000-0000-4000-8000-000000000001';
update public.profiles set handle='voisin_cave'  where id='e5000000-0000-4000-8000-000000000002';

insert into ref.manufacturers (id,name,slug,country) values
  ('da000000-0000-4000-8000-000000000001','Manufacture Cave','manufacture-cave','CU')
on conflict (id) do nothing;
insert into ref.brands (id,manufacturer_id,name,slug,country,is_cuban) values
  ('db000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001','Marque Cave','marque-cave','CU',true)
on conflict (id) do nothing;

-- Une fiche publiée : elle entre en cave. Une en brouillon : elle ne doit pas.
insert into ref.cigars (id,brand_id,commercial_name,slug,origin_country,status) values
  ('dc000000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001','Fiche Cave','fiche-cave','CU','published'),
  ('dc000000-0000-4000-8000-000000000002','db000000-0000-4000-8000-000000000001','Fiche Cave Brouillon','fiche-cave-brouillon','CU','draft')
on conflict (id) do nothing;

insert into public.humidors (id,user_id,name,capacity,is_default) values
  ('d0000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','Cave du proprio',50,true),
  ('e0000000-0000-4000-8000-000000000002','e5000000-0000-4000-8000-000000000002','Cave du voisin' ,50,true)
on conflict (id) do nothing;

-- Les lots que les assertions nomment sont créés ici, en contexte privilégié :
-- `id` n'est dans aucun grant d'INSERT, donc un client ne choisit pas sa clé —
-- et desserrer le grant pour rendre un test plus lisible serait l'échange
-- inverse de celui qu'on veut. V1 exerce le chemin client, sans clé imposée.
insert into public.humidor_items (id, humidor_id, cigar_id, qty, purchase_date, purchase_price_eur) values
  ('d1000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001',
   'dc000000-0000-4000-8000-000000000001', 10, current_date - 400, 12.50)
on conflict (id) do nothing;

-- Le lot de V5 : assez gros pour que la borne d'un événement morde avant celle
-- du stock. 100 000 est le maximum qu'un événement accepte, donc deux `add` de
-- 100 000 font un stock que 100 001 ne dépasse pas.
insert into public.humidor_items (id, humidor_id, cigar_id, qty) values
  ('d1000000-0000-4000-8000-000000000009','d0000000-0000-4000-8000-000000000001',
   'dc000000-0000-4000-8000-000000000001', 100000)
on conflict (id) do nothing;
-- Le trigger d'ouverture en a déjà écrit un ; il en faut un second, et le
-- fichier doit rester rejouable, d'où le compte plutôt qu'un ON CONFLICT sur
-- une table qui n'a pas de clé naturelle.
insert into public.humidor_events (item_id, type, qty)
select 'd1000000-0000-4000-8000-000000000009', 'add', 100000
 where (select count(*) from public.humidor_events
         where item_id = 'd1000000-0000-4000-8000-000000000009' and type = 'add') < 2;

\echo '=== V1  l inventaire d ouverture ecrit son evenement add, et qty le suit'
do $$
declare v_qty integer; v_events integer; v_item uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','d4000000-0000-4000-8000-000000000001',true);

  insert into public.humidor_items (humidor_id, cigar_id, qty, purchase_date, purchase_price_eur)
  values ('d0000000-0000-4000-8000-000000000001',
          'dc000000-0000-4000-8000-000000000001', 10, current_date - 400, 12.50)
  returning id into v_item;

  select qty into v_qty from public.humidor_items where id = v_item;
  select count(*) into v_events from public.humidor_events
   where item_id = v_item and type = 'add';

  if v_qty <> 10 then raise exception 'FAIL: qty vaut % au lieu de 10', v_qty; end if;
  if v_events <> 1 then raise exception 'FAIL: % evenement(s) add au lieu de 1', v_events; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== V2  fumer depuis la cave ecrit l entree ET l evenement, lies'
do $$
declare v_review uuid; v_qty integer; v_linked integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','d4000000-0000-4000-8000-000000000001',true);

  v_review := public.smoke_from_humidor('d1000000-0000-4000-8000-000000000001', 2,
                                        current_date, 'private', 88.0, 'Note de cave');

  if v_review is null then raise exception 'FAIL: aucune entree rendue'; end if;

  select qty into v_qty from public.humidor_items
   where id = 'd1000000-0000-4000-8000-000000000001';
  if v_qty <> 8 then raise exception 'FAIL: le stock vaut % au lieu de 8', v_qty; end if;

  select count(*) into v_linked from public.humidor_events
   where item_id = 'd1000000-0000-4000-8000-000000000001'
     and type = 'smoke' and review_id = v_review;
  if v_linked <> 1 then raise exception 'FAIL: l evenement ne reference pas l entree'; end if;

  raise notice 'PASS';
  reset role;
end $$;

\echo '=== V3  l entree creee par la cave est privee (ADR 0006, D2)'
do $$
declare v_review uuid; v_visibility public.review_visibility; v_kind public.review_kind;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','d4000000-0000-4000-8000-000000000001',true);

  v_review := public.smoke_from_humidor('d1000000-0000-4000-8000-000000000001', 1,
                                        current_date, 'private', null, 'Un mot suffit');

  select visibility, kind into v_visibility, v_kind
    from public.reviews where id = v_review;

  if v_visibility <> 'private' then
    raise exception 'FAIL: portee par defaut = % au lieu de private', v_visibility;
  end if;
  if v_kind <> 'log' then
    raise exception 'FAIL: nature = % au lieu de log', v_kind;
  end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== V4  fumer plus que le stock est refuse, et n ecrit aucune entree'
do $$
declare v_before integer; v_after integer; v_qty integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','d4000000-0000-4000-8000-000000000001',true);

  select count(*) into v_before from public.reviews
   where user_id = 'd4000000-0000-4000-8000-000000000001';

  begin
    perform public.smoke_from_humidor('d1000000-0000-4000-8000-000000000001', 999);
    raise exception 'FAIL: fumer 999 cigares sur 7 a ete accepte';
  exception when check_violation then null;
  end;

  select count(*) into v_after from public.reviews
   where user_id = 'd4000000-0000-4000-8000-000000000001';
  select qty into v_qty from public.humidor_items
   where id = 'd1000000-0000-4000-8000-000000000001';

  if v_after <> v_before then
    raise exception 'FAIL: le refus a laisse % entree(s) derriere lui', v_after - v_before;
  end if;
  if v_qty <> 7 then raise exception 'FAIL: le stock a bouge (%)', v_qty; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== V5  un evenement refuse APRES l entree annule aussi l entree'
-- L'atomicité de l'ADR 0006 D1, prise dans le sens qui compte : c'est le second
-- `insert` qui échoue ici, pas le premier. Sans transaction, l'entrée resterait.
-- Le lot compte 100 000 cigares — au-delà de ce qu'un evenement accepte — donc
-- le stock passe, et la borne de `humidor_events` refuse.
do $$
declare v_before integer; v_after integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','d4000000-0000-4000-8000-000000000001',true);

  select count(*) into v_before from public.reviews
   where user_id = 'd4000000-0000-4000-8000-000000000001';

  begin
    -- 100 001 ≤ 200 000, donc le stock accepte ; la borne de l'evenement refuse.
    perform public.smoke_from_humidor('d1000000-0000-4000-8000-000000000009', 100001);
    raise exception 'FAIL: un evenement hors bornes a ete accepte';
  exception when check_violation then null;
  end;

  select count(*) into v_after from public.reviews
   where user_id = 'd4000000-0000-4000-8000-000000000001';

  if v_after <> v_before then
    raise exception
      'FAIL: demi-resultat — % entree(s) de carnet sans evenement', v_after - v_before;
  end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== V6  l article d autrui est introuvable, jamais interdit'
do $$
declare v_exists integer;
begin
  -- D'abord la preuve, en contexte privilégié, que la ligne existe : sans elle
  -- l'assertion suivante passerait sur une table vide.
  select count(*) into v_exists from public.humidor_items
   where id = 'd1000000-0000-4000-8000-000000000001';
  if v_exists <> 1 then raise exception 'FAIL: la fixture n existe pas'; end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','e5000000-0000-4000-8000-000000000002',true);

  begin
    perform public.smoke_from_humidor('d1000000-0000-4000-8000-000000000001', 1);
    raise exception 'FAIL: le voisin a fume dans la cave du proprio';
  exception
    when no_data_found then raise notice 'PASS';
    when insufficient_privilege then
      raise exception 'FAIL: refus par privilege — la RLS confirme que l article existe';
  end;
  reset role;
end $$;

\echo '=== V7  le voisin ne voit ni la cave, ni le lot, ni le grand livre, ni les releves'
do $$
declare n_h integer; n_i integer; n_e integer; n_r integer; n_v integer;
begin
  insert into public.humidor_readings (humidor_id, rh, temp_c)
  values ('d0000000-0000-4000-8000-000000000001', 69.0, 18.5);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','e5000000-0000-4000-8000-000000000002',true);

  select count(*) into n_h from public.humidors        where user_id   = 'd4000000-0000-4000-8000-000000000001';
  select count(*) into n_i from public.humidor_items   where humidor_id= 'd0000000-0000-4000-8000-000000000001';
  select count(*) into n_e from public.humidor_events  where item_id   = 'd1000000-0000-4000-8000-000000000001';
  select count(*) into n_r from public.humidor_readings where humidor_id='d0000000-0000-4000-8000-000000000001';
  select count(*) into n_v from public.humidor_inventory where humidor_id='d0000000-0000-4000-8000-000000000001';

  if n_h <> 0 then raise exception 'FAIL: % cave(s) visible(s)', n_h; end if;
  if n_i <> 0 then raise exception 'FAIL: % lot(s) visible(s)', n_i; end if;
  if n_e <> 0 then raise exception 'FAIL: % evenement(s) visible(s)', n_e; end if;
  if n_r <> 0 then raise exception 'FAIL: % releve(s) visible(s)', n_r; end if;
  -- La vue est security_invoker : si elle ne l'etait pas, elle rendrait ici
  -- l'inventaire complet du proprio avec les droits de son proprietaire.
  if n_v <> 0 then raise exception 'FAIL: la vue montre % ligne(s) d autrui', n_v; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== V8  qty ne se met pas a jour a la main (ADR 0006, D3)'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','d4000000-0000-4000-8000-000000000001',true);
  begin
    update public.humidor_items set qty = 999
     where id = 'd1000000-0000-4000-8000-000000000001';
    raise exception 'FAIL: qty a ete modifiee a la main';
  exception when insufficient_privilege then raise notice 'PASS';
  end;
  reset role;
end $$;

\echo '=== V9  le grand livre est en ajout seul'
do $$
declare refused integer := 0;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','d4000000-0000-4000-8000-000000000001',true);

  begin
    update public.humidor_events set qty = 1
     where item_id = 'd1000000-0000-4000-8000-000000000001';
  exception when insufficient_privilege then refused := refused + 1;
  end;

  begin
    delete from public.humidor_events
     where item_id = 'd1000000-0000-4000-8000-000000000001';
  exception when insufficient_privilege then refused := refused + 1;
  end;

  if refused <> 2 then
    raise exception 'FAIL: le registre accepte % ecriture(s) sur 2 refusees attendues', 2 - refused;
  end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== V10 adjust est le seul type signe'
do $$
declare v_qty integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','d4000000-0000-4000-8000-000000000001',true);

  begin
    insert into public.humidor_events (item_id, type, qty)
    values ('d1000000-0000-4000-8000-000000000001', 'smoke', -3);
    raise exception 'FAIL: un smoke negatif a ete accepte';
  exception when check_violation then null;
  end;

  insert into public.humidor_events (item_id, type, qty)
  values ('d1000000-0000-4000-8000-000000000001', 'adjust', -2);

  select qty into v_qty from public.humidor_items
   where id = 'd1000000-0000-4000-8000-000000000001';
  if v_qty <> 5 then raise exception 'FAIL: apres ajustement le stock vaut % au lieu de 5', v_qty; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== V11 un brouillon n entre pas en cave'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','d4000000-0000-4000-8000-000000000001',true);
  begin
    insert into public.humidor_items (humidor_id, cigar_id, qty)
    values ('d0000000-0000-4000-8000-000000000001','dc000000-0000-4000-8000-000000000002', 1);
    raise exception 'FAIL: une fiche en brouillon a ete mise en cave';
  exception when insufficient_privilege then raise notice 'PASS';
  end;
  reset role;
end $$;

\echo '=== V12 deplacer un lot laisse le compte intact et se consigne'
do $$
declare v_qty_before integer; v_qty_after integer; v_moves integer;
begin
  insert into public.humidors (id,user_id,name,is_default) values
    ('d0000000-0000-4000-8000-000000000003','d4000000-0000-4000-8000-000000000001','Seconde cave',false)
  on conflict (id) do nothing;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','d4000000-0000-4000-8000-000000000001',true);

  select qty into v_qty_before from public.humidor_items
   where id = 'd1000000-0000-4000-8000-000000000001';

  update public.humidor_items set humidor_id = 'd0000000-0000-4000-8000-000000000003'
   where id = 'd1000000-0000-4000-8000-000000000001';

  select qty into v_qty_after from public.humidor_items
   where id = 'd1000000-0000-4000-8000-000000000001';
  select count(*) into v_moves from public.humidor_events
   where item_id = 'd1000000-0000-4000-8000-000000000001' and type = 'move';

  if v_qty_after <> v_qty_before then
    raise exception 'FAIL: le deplacement a change le compte (% -> %)', v_qty_before, v_qty_after;
  end if;
  if v_moves <> 1 then raise exception 'FAIL: % ligne(s) move au lieu de 1', v_moves; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== V13 effacer l entree de carnet ne defait pas le fait d avoir fume'
do $$
declare v_review uuid; v_qty_before integer; v_qty_after integer; v_orphans integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','d4000000-0000-4000-8000-000000000001',true);

  v_review := public.smoke_from_humidor('d1000000-0000-4000-8000-000000000001', 1,
                                        current_date, 'private', 70.0, null);
  select qty into v_qty_before from public.humidor_items
   where id = 'd1000000-0000-4000-8000-000000000001';

  delete from public.reviews where id = v_review;

  select qty into v_qty_after from public.humidor_items
   where id = 'd1000000-0000-4000-8000-000000000001';
  select count(*) into v_orphans from public.humidor_events
   where item_id = 'd1000000-0000-4000-8000-000000000001'
     and type = 'smoke' and review_id is null;

  if v_qty_after <> v_qty_before then
    raise exception 'FAIL: effacer l entree a rendu un cigare (% -> %)', v_qty_before, v_qty_after;
  end if;
  if v_orphans < 1 then
    raise exception 'FAIL: l evenement a disparu avec l entree';
  end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== V14 une seule cave par defaut et par personne'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','d4000000-0000-4000-8000-000000000001',true);
  begin
    insert into public.humidors (user_id, name, is_default)
    values ('d4000000-0000-4000-8000-000000000001', 'Cave en trop', true);
    raise exception 'FAIL: deux caves par defaut ont ete acceptees';
  exception when unique_violation then raise notice 'PASS';
  end;
  reset role;
end $$;

\echo '=== V15 la vue derive l age et la valorisation, et rien de plus'
do $$
declare v_age integer; v_value numeric; v_qty integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','d4000000-0000-4000-8000-000000000001',true);

  select aging_days, stock_value_eur, qty into v_age, v_value, v_qty
    from public.humidor_inventory
   where id = 'd1000000-0000-4000-8000-000000000001';

  if v_age is null or v_age < 399 then
    raise exception 'FAIL: age de vieillissement = % (attendu >= 399)', v_age;
  end if;
  if v_value is null or v_value <> round(12.50 * v_qty, 2) then
    raise exception 'FAIL: valorisation = % pour % cigares a 12,50', v_value, v_qty;
  end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== V16 le stock se repare tout seul : qty est la somme, pas un compteur'
-- Le trigger recalcule par la somme des evenements. Un compteur incremental se
-- tromperait une fois puis mentirait pour toujours ; celui-ci se rattrape des
-- que le grand livre est juste.
do $$
declare v_qty integer; v_sum integer;
begin
  -- En contexte privilégié : on casse la colonne pour verifier qu'un evenement
  -- suivant la remet d'aplomb. Aucun client ne peut faire ceci — c'est le sens
  -- de V8 — et c'est bien pour cela que le test doit le faire.
  update public.humidor_items set qty = 4242
   where id = 'd1000000-0000-4000-8000-000000000001';

  insert into public.humidor_events (item_id, type, qty)
  values ('d1000000-0000-4000-8000-000000000001', 'adjust', 0 - 0 + 1);

  select qty into v_qty from public.humidor_items
   where id = 'd1000000-0000-4000-8000-000000000001';
  select coalesce(sum(public.humidor_event_delta(type, qty)), 0) into v_sum
    from public.humidor_events where item_id = 'd1000000-0000-4000-8000-000000000001';

  if v_qty <> v_sum then
    raise exception 'FAIL: qty = % mais la somme du grand livre = %', v_qty, v_sum;
  end if;
  raise notice 'PASS';
end $$;

\echo '=== V17 fumer sans rien noter decompte le stock et n ecrit aucune entree'
-- ADR 0006, D2, second paragraphe. Le geste doit rester gratuit : exiger une
-- note pour decompter un stock produirait des notes inventees ou des cigares
-- que la cave ignore.
do $$
declare v_review uuid; v_before integer; v_qty_before integer; v_qty_after integer; v_after integer; v_silent integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','d4000000-0000-4000-8000-000000000001',true);

  select count(*) into v_before from public.reviews
   where user_id = 'd4000000-0000-4000-8000-000000000001';
  select qty into v_qty_before from public.humidor_items
   where id = 'd1000000-0000-4000-8000-000000000001';

  v_review := public.smoke_from_humidor('d1000000-0000-4000-8000-000000000001', 1);

  select count(*) into v_after from public.reviews
   where user_id = 'd4000000-0000-4000-8000-000000000001';
  select qty into v_qty_after from public.humidor_items
   where id = 'd1000000-0000-4000-8000-000000000001';
  select count(*) into v_silent from public.humidor_events
   where item_id = 'd1000000-0000-4000-8000-000000000001'
     and type = 'smoke' and review_id is null;

  if v_review is not null then
    raise exception 'FAIL: une entree vide a ete ecrite (%)', v_review;
  end if;
  if v_after <> v_before then
    raise exception 'FAIL: % entree(s) de carnet en trop', v_after - v_before;
  end if;
  if v_qty_after <> v_qty_before - 1 then
    raise exception 'FAIL: le stock n a pas bouge (% -> %)', v_qty_before, v_qty_after;
  end if;
  if v_silent < 1 then raise exception 'FAIL: aucun evenement smoke sans entree'; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== Cave : 17 assertions passees'
