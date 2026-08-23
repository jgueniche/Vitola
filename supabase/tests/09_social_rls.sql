-- =============================================================================
-- Assertions de comportement sur le social (migration 0010, ADR 0007).
--
-- Exécuté en CI sur une base où 0001 à 0010 sont appliquées.
--
-- Ce fichier **n'accorde rien** et ne corrige rien. C'est sa raison d'être :
-- l'auto-contrôle d'une migration vérifie ce que cette migration vient
-- d'établir, donc il ne peut pas échouer dessus. La régression future ne se voit
-- que d'ici.
--
-- Les pièges du dépôt, évités explicitement :
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
--      et rapporte zéro. Les refus de policy se comptent en lignes réellement
--      touchées ; les refus de grant attrapent `insufficient_privilege`.
--
-- Trois personnes : `alice` publie, `bob` la suit, `carol` ne la suit pas.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- ---------- Fixtures, créées comme postgres (contexte privilégié) ------------

-- Les trois UUID diffèrent sur leurs douze premiers caractères hexadécimaux, et
-- ce n'est pas cosmétique : `tg_handle_new_user()` en dérive le pseudo par
-- défaut, et trois comptes qui partagent ce préfixe se heurtent sur
-- `profiles_handle_key` — l'insertion échoue depuis l'intérieur d'un trigger,
-- donc l'erreur ne nomme pas la fixture fautive.
insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-000000000001','social-alice@x.test','{"birth_date":"1985-02-01"}'),
  ('b2000000-0000-4000-8000-000000000002','social-bob@x.test'  ,'{"birth_date":"1986-03-02"}'),
  ('c3000000-0000-4000-8000-000000000003','social-carol@x.test','{"birth_date":"1987-04-03"}')
on conflict (id) do nothing;

update public.profiles set handle='social_alice' where id='a1000000-0000-4000-8000-000000000001';
update public.profiles set handle='social_bob'   where id='b2000000-0000-4000-8000-000000000002';
update public.profiles set handle='social_carol' where id='c3000000-0000-4000-8000-000000000003';

insert into ref.manufacturers (id,name,slug,country) values
  ('aa000000-0000-4000-8000-000000000001','Manufacture Sociale','manufacture-sociale','NI')
on conflict (id) do nothing;
insert into ref.brands (id,manufacturer_id,name,slug,country,is_cuban) values
  ('ab000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001',
   'Marque Sociale','marque-sociale','NI',false)
on conflict (id) do nothing;
insert into ref.cigars (id,brand_id,commercial_name,slug,origin_country,status) values
  ('ac000000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000001',
   'Fiche Sociale','fiche-sociale','NI','published')
on conflict (id) do nothing;

-- Le carnet d'alice : une entrée `followers`, qui est la dette n° 1.
insert into public.reviews (id, user_id, cigar_id, kind, visibility, score_total, body) values
  ('ad000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
   'ac000000-0000-4000-8000-000000000001','log','followers', 88.0, 'Pour mes abonnes')
on conflict (id) do nothing;

-- La cave d'alice, pour la dette n° 2. `show_humidor` est à false par défaut :
-- l'assertion H1 le vérifie fermé avant que H2 ne l'ouvre.
insert into public.humidors (id,user_id,name,capacity,is_default) values
  ('ae000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Cave alice',50,true)
on conflict (id) do nothing;
insert into public.humidor_items (id,humidor_id,cigar_id,qty,purchase_price_eur) values
  ('af000000-0000-4000-8000-000000000001','ae000000-0000-4000-8000-000000000001',
   'ac000000-0000-4000-8000-000000000001', 7, 12.50)
on conflict (id) do nothing;

-- `profile_settings` naît avec le compte, par trigger. On repart de son défaut
-- plutôt que de le supposer : le fichier doit être rejouable.
update public.profile_settings
   set privacy = jsonb_build_object('show_humidor', false, 'show_reviews', true, 'show_country', true)
 where id = 'a1000000-0000-4000-8000-000000000001';

\echo '=== S1  un abonnement est libre : bob s abonne, sans que personne n approuve'
do $$
declare n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);

  insert into public.follows (follower_id, followee_id)
  values ('b2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001')
  on conflict do nothing;

  select count(*) into n from public.follows
   where follower_id='b2000000-0000-4000-8000-000000000002'
     and followee_id='a1000000-0000-4000-8000-000000000001';
  if n <> 1 then raise exception 'FAIL: % abonnement(s) au lieu de 1', n; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== S2  on ne s abonne pas a la place de quelqu un d autre'
do $$
declare n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
  begin
    insert into public.follows (follower_id, followee_id)
    values ('c3000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001');
    raise exception 'FAIL: bob a abonne carol a alice';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.follows
   where follower_id='c3000000-0000-4000-8000-000000000003';
  if n <> 0 then raise exception 'FAIL: % ligne(s) ecrite(s) pour carol', n; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== S3  LA DETTE 1 : une entree followers devient lisible d un abonne'
do $$
declare n_bob integer; n_carol integer;
begin
  -- On prouve d'abord que la ligne existe, en contexte privilégié : une
  -- assertion « zéro ligne » sur une donnée absente réussit sans rien tester.
  if not exists (select 1 from public.reviews
                  where id='ad000000-0000-4000-8000-000000000001'
                    and visibility='followers') then
    raise exception 'FAIL: la fixture followers n existe pas';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
  select count(*) into n_bob from public.reviews
   where id='ad000000-0000-4000-8000-000000000001';

  perform set_config('request.jwt.claim.sub','c3000000-0000-4000-8000-000000000003',true);
  select count(*) into n_carol from public.reviews
   where id='ad000000-0000-4000-8000-000000000001';

  if n_bob <> 1 then
    raise exception 'FAIL: l abonne ne voit pas l entree followers (% ligne)', n_bob;
  end if;
  if n_carol <> 0 then
    raise exception 'FAIL: un non-abonne voit l entree followers (% ligne)', n_carol;
  end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== S4  se desabonner referme la lecture'
do $$
declare n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);

  delete from public.follows
   where follower_id='b2000000-0000-4000-8000-000000000002'
     and followee_id='a1000000-0000-4000-8000-000000000001';

  select count(*) into n from public.reviews where id='ad000000-0000-4000-8000-000000000001';
  if n <> 0 then raise exception 'FAIL: l entree reste lisible apres desabonnement'; end if;

  -- On rétablit pour la suite du fichier.
  insert into public.follows (follower_id, followee_id)
  values ('b2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001');
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== S5  ADR 0007 D1 : le suivi retire un abonne, et c est le contrepoids'
do $$
declare n integer;
begin
  set local role authenticated;
  -- alice, pas bob : c'est la policy `follows_delete_followee`.
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);

  delete from public.follows
   where follower_id='b2000000-0000-4000-8000-000000000002'
     and followee_id='a1000000-0000-4000-8000-000000000001';

  select count(*) into n from public.follows
   where follower_id='b2000000-0000-4000-8000-000000000002'
     and followee_id='a1000000-0000-4000-8000-000000000001';
  if n <> 0 then raise exception 'FAIL: alice n a pas pu retirer son abonne'; end if;

  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
  insert into public.follows (follower_id, followee_id)
  values ('b2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001');
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== P1  une publication followers se lit d un abonne, pas d un autre'
do $$
declare n_bob integer; n_carol integer; v_post uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  insert into public.posts (author_id, kind, visibility, body)
  values ('a1000000-0000-4000-8000-000000000001','post','followers','Pour mes abonnes seulement')
  returning id into v_post;

  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
  select count(*) into n_bob from public.posts where id = v_post;

  perform set_config('request.jwt.claim.sub','c3000000-0000-4000-8000-000000000003',true);
  select count(*) into n_carol from public.posts where id = v_post;

  if n_bob <> 1   then raise exception 'FAIL: l abonne ne voit pas la publication'; end if;
  if n_carol <> 0 then raise exception 'FAIL: un non-abonne voit la publication'; end if;

  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  delete from public.posts where id = v_post;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== P2  une publication ne peut etre ni privee ni partagee (ADR 0007 D2)'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  begin
    insert into public.posts (author_id, kind, visibility, body)
    values ('a1000000-0000-4000-8000-000000000001','post','private','Pour moi');
    raise exception 'FAIL: une publication privee a ete acceptee';
  exception when check_violation then null;
  end;
  begin
    insert into public.posts (author_id, kind, visibility, body)
    values ('a1000000-0000-4000-8000-000000000001','post','shared','Pour vous deux');
    raise exception 'FAIL: une publication partagee a ete acceptee';
  exception when check_violation then null;
  end;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== P3  ADR 0004 : un review_share ne peut pas etre plus visible que son entree'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  -- L'entrée est `followers` ; la publication se déclare `public`. La policy
  -- INSERT compare les deux, et un refus de policy lève `42501`.
  begin
    insert into public.posts (author_id, kind, visibility, review_id)
    values ('a1000000-0000-4000-8000-000000000001','review_share','public',
            'ad000000-0000-4000-8000-000000000001');
    raise exception 'FAIL: une publication plus visible que son entree a ete acceptee';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== P4  on ne partage pas l entree d un autre'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
  begin
    insert into public.posts (author_id, kind, visibility, review_id)
    values ('b2000000-0000-4000-8000-000000000002','review_share','followers',
            'ad000000-0000-4000-8000-000000000001');
    raise exception 'FAIL: bob a publie l entree d alice';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== P5  la cascade de portee suit l entree, et la supprime quand il le faut'
do $$
declare v_post uuid; v_vis public.review_visibility; n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);

  insert into public.posts (author_id, kind, visibility, review_id)
  values ('a1000000-0000-4000-8000-000000000001','review_share','followers',
          'ad000000-0000-4000-8000-000000000001')
  returning id into v_post;

  -- L'entrée s'ouvre : la publication suit.
  update public.reviews set visibility='public'
   where id='ad000000-0000-4000-8000-000000000001';
  select visibility into v_vis from public.posts where id = v_post;
  if v_vis <> 'public' then
    raise exception 'FAIL: la publication est restee % apres ouverture', v_vis;
  end if;

  -- L'entrée redescend sous ce qu'un fil peut montrer : la publication part.
  update public.reviews set visibility='private'
   where id='ad000000-0000-4000-8000-000000000001';
  select count(*) into n from public.posts where id = v_post;
  if n <> 0 then raise exception 'FAIL: la publication a survecu au passage en prive'; end if;

  update public.reviews set visibility='followers'
   where id='ad000000-0000-4000-8000-000000000001';
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== P6  une publication reservee se lit A SON ADRESSE, par les bonnes personnes'
do $$
declare v_post uuid; n integer;
begin
  -- Le bug trouvé par le NETTOYAGE d'un parcours, pas par une assertion : la
  -- page d'une publication passait par la portée `discover` de `feed_page()`,
  -- qui filtre `visibility = 'public'` — un filtre d'ONGLET, pas de droit. Une
  -- publication réservée était donc introuvable à son adresse, y compris pour
  -- son auteur, donc impossible à supprimer. Corrigé par la 0013.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  insert into public.posts (author_id, kind, visibility, body)
  values ('a1000000-0000-4000-8000-000000000001','post','followers','Reservee, et adressable')
  returning id into v_post;

  select count(*) into n from public.post_card(v_post);
  if n <> 1 then raise exception 'FAIL: l auteur ne lit pas sa propre publication reservee'; end if;

  -- Un abonné aussi : bob suit alice depuis S1.
  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
  select count(*) into n from public.post_card(v_post);
  if n <> 1 then raise exception 'FAIL: l abonne ne lit pas la publication a son adresse'; end if;

  -- Carol, non.
  perform set_config('request.jwt.claim.sub','c3000000-0000-4000-8000-000000000003',true);
  select count(*) into n from public.post_card(v_post);
  if n <> 0 then raise exception 'FAIL: un non-abonne lit la publication a son adresse'; end if;

  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  delete from public.posts where id = v_post;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== B1  la braise est comptee par un count(), et se retire'
do $$
declare v_post uuid; n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  insert into public.posts (author_id, kind, visibility, body)
  values ('a1000000-0000-4000-8000-000000000001','post','public','Publique et braisable')
  returning id into v_post;

  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
  insert into public.post_reactions (post_id, user_id) values (v_post, 'b2000000-0000-4000-8000-000000000002');
  select ember_count into n from public.posts where id = v_post;
  if n <> 1 then raise exception 'FAIL: ember_count vaut % au lieu de 1', n; end if;

  delete from public.post_reactions where post_id = v_post and user_id='b2000000-0000-4000-8000-000000000002';
  select ember_count into n from public.posts where id = v_post;
  if n <> 0 then raise exception 'FAIL: ember_count vaut % apres retrait', n; end if;

  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  delete from public.posts where id = v_post;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== B2  la colonne dénormalisée se répare, elle ne dérive pas (ADR 0006)'
do $$
declare v_post uuid; n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  insert into public.posts (author_id, kind, visibility, body)
  values ('a1000000-0000-4000-8000-000000000001','post','public','Compteur casse a la main')
  returning id into v_post;
  reset role;

  -- On casse la colonne en contexte privilégié : un trigger qui incrémente
  -- garderait le mensonge, un trigger qui recompte le répare au geste suivant.
  update public.posts set ember_count = 41 where id = v_post;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
  insert into public.post_reactions (post_id, user_id) values (v_post,'b2000000-0000-4000-8000-000000000002');

  select ember_count into n from public.posts where id = v_post;
  if n <> 1 then raise exception 'FAIL: ember_count vaut % au lieu de 1 — il a derive', n; end if;

  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  delete from public.posts where id = v_post;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== B3  aucun client n ecrit un compteur'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  begin
    update public.posts set ember_count = 999 where author_id='a1000000-0000-4000-8000-000000000001';
    raise exception 'FAIL: ember_count est modifiable par un client';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== K1  feed_page rend un keyset : deux pages disjointes, ordre total'
do $$
declare page1 uuid[]; page2 uuid[]; cur_at timestamptz; cur_id uuid; i integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);

  for i in 1..5 loop
    insert into public.posts (author_id, kind, visibility, body)
    values ('a1000000-0000-4000-8000-000000000001','post','public','Keyset ' || i);
  end loop;

  select array_agg(f.id order by f.created_at desc, f.id desc)
    into page1
    from public.feed_page('discover', null, null, 2) f;
  if array_length(page1,1) <> 2 then
    raise exception 'FAIL: la premiere page rend % lignes au lieu de 2', array_length(page1,1);
  end if;

  select f.created_at, f.id into cur_at, cur_id
    from public.feed_page('discover', null, null, 2) f
   order by f.created_at desc, f.id desc offset 1 limit 1;

  select array_agg(f.id order by f.created_at desc, f.id desc)
    into page2
    from public.feed_page('discover', cur_at, cur_id, 2) f;

  if page1 && page2 then
    raise exception 'FAIL: les deux pages se recouvrent — le keyset saute ou repete';
  end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== K2  feed_page reste en droits d appelant : carol ne voit pas le followers d alice'
do $$
declare v_post uuid; n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  insert into public.posts (author_id, kind, visibility, body)
  values ('a1000000-0000-4000-8000-000000000001','post','followers','Fil reserve')
  returning id into v_post;

  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
  select count(*) into n from public.feed_page('following', null, null, 50) f where f.id = v_post;
  if n <> 1 then raise exception 'FAIL: l abonne ne recoit pas la publication dans son fil'; end if;

  perform set_config('request.jwt.claim.sub','c3000000-0000-4000-8000-000000000003',true);
  select count(*) into n from public.feed_page('following', null, null, 50) f where f.id = v_post;
  if n <> 0 then raise exception 'FAIL: un non-abonne recoit la publication'; end if;
  select count(*) into n from public.feed_page('discover', null, null, 50) f where f.id = v_post;
  if n <> 0 then raise exception 'FAIL: une publication followers apparait en decouverte'; end if;

  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  delete from public.posts where id = v_post;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== X1  bloquer retire l abonnement dans les deux sens'
do $$
declare n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
  insert into public.follows (follower_id, followee_id)
  values ('b2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001')
  on conflict do nothing;

  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  insert into public.blocks (blocker_id, blocked_id)
  values ('a1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002');

  select count(*) into n from public.follows
   where (follower_id='b2000000-0000-4000-8000-000000000002' and followee_id='a1000000-0000-4000-8000-000000000001')
      or (follower_id='a1000000-0000-4000-8000-000000000001' and followee_id='b2000000-0000-4000-8000-000000000002');
  if n <> 0 then raise exception 'FAIL: % abonnement(s) survivent au blocage', n; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== X2  le blocage s applique DANS LE SENS QUE LA PERSONNE BLOQUEE NE VOIT PAS'
do $$
declare v_post uuid; n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  insert into public.posts (author_id, kind, visibility, body)
  values ('a1000000-0000-4000-8000-000000000001','post','public','Publique mais pas pour bob')
  returning id into v_post;

  -- C'est alice qui a bloqué (X1). bob n'a aucune ligne de `blocks` lisible, et
  -- doit pourtant ne rien voir : c'est toute la raison d'être de
  -- `blocks_between()` en SECURITY DEFINER.
  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
  select count(*) into n from public.blocks;
  if n <> 0 then raise exception 'FAIL: bob voit le blocage dont il fait l objet'; end if;

  select count(*) into n from public.posts where id = v_post;
  if n <> 0 then raise exception 'FAIL: bob lit la publication de qui l a bloque'; end if;

  select count(*) into n from public.feed_page('discover', null, null, 50) f where f.id = v_post;
  if n <> 0 then raise exception 'FAIL: la publication apparait dans le fil de bob'; end if;

  select count(*) into n from public.profiles where id='a1000000-0000-4000-8000-000000000001';
  if n <> 0 then raise exception 'FAIL: bob lit le profil de qui l a bloque'; end if;

  -- carol, qui n'est dans aucun blocage, voit toujours.
  perform set_config('request.jwt.claim.sub','c3000000-0000-4000-8000-000000000003',true);
  select count(*) into n from public.posts where id = v_post;
  if n <> 1 then raise exception 'FAIL: le blocage a debord sur un tiers'; end if;

  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  delete from public.posts where id = v_post;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== X3  bloquer ne rend pas son propre carnet illisible'
do $$
declare n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  select count(*) into n from public.reviews where id='ad000000-0000-4000-8000-000000000001';
  if n <> 1 then raise exception 'FAIL: alice ne lit plus sa propre entree'; end if;
  select count(*) into n from public.profiles where id='a1000000-0000-4000-8000-000000000001';
  if n <> 1 then raise exception 'FAIL: alice ne lit plus son propre profil'; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== X4  on ne s abonne pas a qui l on a bloque'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
  begin
    insert into public.follows (follower_id, followee_id)
    values ('b2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001');
    raise exception 'FAIL: bob s est reabonne a qui l a bloque';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== X6  celui qui bloque VOIT encore le profil, donc il peut debloquer'
do $$
declare n integer;
begin
  -- Le bug trouvé en navigateur : la policy cachait le profil dans les deux
  -- sens, et le seul écran portant « Débloquer » est ce profil. Un blocage
  -- était donc définitif. Corrigé par la 0012, et asserté ici dans les deux
  -- directions parce qu'une seule des deux est le bug.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  insert into public.blocks (blocker_id, blocked_id)
  values ('a1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002')
  on conflict do nothing;

  -- Celui qui a bloqué voit toujours le profil de sa cible.
  select count(*) into n from public.profiles
   where id = 'b2000000-0000-4000-8000-000000000002';
  if n <> 1 then raise exception 'FAIL: le bloquant ne voit plus qui il a bloque'; end if;

  -- Mais pas son contenu : le profil est une coquille.
  select count(*) into n from public.posts
   where author_id = 'b2000000-0000-4000-8000-000000000002';
  if n <> 0 then raise exception 'FAIL: le bloquant lit encore le contenu de sa cible'; end if;

  -- Et la personne bloquée, elle, ne voit rien.
  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
  select count(*) into n from public.profiles
   where id = 'a1000000-0000-4000-8000-000000000001';
  if n <> 0 then raise exception 'FAIL: la personne bloquee voit le profil de qui l a bloquee'; end if;

  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  delete from public.blocks
   where blocker_id='a1000000-0000-4000-8000-000000000001'
     and blocked_id='b2000000-0000-4000-8000-000000000002';
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== X5  debloquer rend la lecture, sans rendre l abonnement'
do $$
declare n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  delete from public.blocks
   where blocker_id='a1000000-0000-4000-8000-000000000001'
     and blocked_id='b2000000-0000-4000-8000-000000000002';

  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
  select count(*) into n from public.profiles where id='a1000000-0000-4000-8000-000000000001';
  if n <> 1 then raise exception 'FAIL: le deblocage ne rend pas le profil'; end if;

  select count(*) into n from public.follows
   where follower_id='b2000000-0000-4000-8000-000000000002'
     and followee_id='a1000000-0000-4000-8000-000000000001';
  if n <> 0 then raise exception 'FAIL: le deblocage a ressuscite un abonnement'; end if;

  insert into public.follows (follower_id, followee_id)
  values ('b2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001');
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== H1  LA DETTE 2 : show_humidor a false, la cave reste invisible'
do $$
declare n integer;
begin
  if not exists (select 1 from public.humidors where id='ae000000-0000-4000-8000-000000000001') then
    raise exception 'FAIL: la fixture de cave n existe pas';
  end if;
  if public.shows_humidor('a1000000-0000-4000-8000-000000000001') then
    raise exception 'FAIL: show_humidor est deja a true avant le test';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
  select count(*) into n from public.humidors where id='ae000000-0000-4000-8000-000000000001';
  if n <> 0 then raise exception 'FAIL: la cave est visible sans show_humidor'; end if;
  select count(*) into n from public.shared_humidor_shelf('a1000000-0000-4000-8000-000000000001');
  if n <> 0 then raise exception 'FAIL: shared_humidor_shelf rend sans show_humidor'; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== H2  show_humidor a true : la cave s ouvre, le grand livre NON'
do $$
declare n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  update public.profile_settings
     set privacy = privacy || '{"show_humidor": true}'::jsonb
   where id = 'a1000000-0000-4000-8000-000000000001';
  reset role;

  if not public.shows_humidor('a1000000-0000-4000-8000-000000000001') then
    raise exception 'FAIL: shows_humidor ne lit pas la cle qu on vient d ecrire';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);

  select count(*) into n from public.humidors where id='ae000000-0000-4000-8000-000000000001';
  if n <> 1 then raise exception 'FAIL: la cave montree reste invisible'; end if;

  -- Le cœur de D5. Sans les policies restrictives, l'EXISTS de `humidor_items`
  -- sur `humidors` suffirait à ouvrir les lots, le grand livre et les relevés.
  select count(*) into n from public.humidor_items
   where humidor_id='ae000000-0000-4000-8000-000000000001';
  if n <> 0 then raise exception 'FAIL: % lot(s) d autrui lisibles en direct', n; end if;

  select count(*) into n from public.humidor_events e
    join public.humidor_items i on i.id = e.item_id
   where i.humidor_id='ae000000-0000-4000-8000-000000000001';
  if n <> 0 then raise exception 'FAIL: % ligne(s) de grand livre d autrui lisibles', n; end if;

  select count(*) into n from public.humidor_readings
   where humidor_id='ae000000-0000-4000-8000-000000000001';
  if n <> 0 then raise exception 'FAIL: des releves d autrui sont lisibles'; end if;

  raise notice 'PASS';
  reset role;
end $$;

\echo '=== H3  la projection rend le contenu, jamais le prix'
do $$
declare n integer; v_qty integer; cols text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);

  select count(*), max(s.qty) into n, v_qty
    from public.shared_humidor_shelf('a1000000-0000-4000-8000-000000000001') s;
  if n <> 1     then raise exception 'FAIL: % lot(s) rendus au lieu de 1', n; end if;
  if v_qty <> 7 then raise exception 'FAIL: qty vaut % au lieu de 7', v_qty; end if;
  reset role;

  -- Le prix ne doit pas être une colonne de sortie. Le vérifier sur la
  -- signature plutôt que sur une ligne : une valeur absente peut être un hasard
  -- de données, une colonne absente est une décision.
  select string_agg(a, ',') into cols
    from unnest(string_to_array(
      pg_get_function_result('public.shared_humidor_shelf(uuid)'::regprocedure), ',')) as a
   where a ilike '%price%' or a ilike '%purchase_date%';
  if cols is not null then
    raise exception 'FAIL: shared_humidor_shelf expose % (ADR 0007, D5)', cols;
  end if;
  raise notice 'PASS';
end $$;

\echo '=== H4  un blocage referme une cave montree'
do $$
declare n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  insert into public.blocks (blocker_id, blocked_id)
  values ('a1000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000003');

  perform set_config('request.jwt.claim.sub','c3000000-0000-4000-8000-000000000003',true);
  select count(*) into n from public.shared_humidor_shelf('a1000000-0000-4000-8000-000000000001');
  if n <> 0 then raise exception 'FAIL: la cave reste ouverte a une personne bloquee'; end if;

  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  delete from public.blocks
   where blocker_id='a1000000-0000-4000-8000-000000000001'
     and blocked_id='c3000000-0000-4000-8000-000000000003';
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== N1  une notification naît d un geste, et jamais d un client'
do $$
declare n integer; v_post uuid;
begin
  -- On repart d'une boîte vide pour compter sans ambiguïté.
  delete from public.notifications
   where user_id in ('a1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002');

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  insert into public.posts (author_id, kind, visibility, body)
  values ('a1000000-0000-4000-8000-000000000001','post','public','A braiser')
  returning id into v_post;

  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
  insert into public.post_reactions (post_id, user_id) values (v_post,'b2000000-0000-4000-8000-000000000002');
  insert into public.post_comments (post_id, author_id, body) values (v_post,'b2000000-0000-4000-8000-000000000002','Bien vu');

  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  select count(*) into n from public.notifications
   where user_id='a1000000-0000-4000-8000-000000000001' and kind in ('ember','post_comment');
  if n <> 2 then raise exception 'FAIL: % notification(s) au lieu de 2', n; end if;

  begin
    insert into public.notifications (user_id, kind, actor_id)
    values ('b2000000-0000-4000-8000-000000000002','follow','a1000000-0000-4000-8000-000000000001');
    raise exception 'FAIL: un client a insere une notification';
  exception when insufficient_privilege then null;
  end;

  delete from public.posts where id = v_post;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== N2  on lit et on marque les siennes, jamais celles d un autre'
do $$
declare n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
  select count(*) into n from public.notifications
   where user_id='a1000000-0000-4000-8000-000000000001';
  if n <> 0 then raise exception 'FAIL: bob lit la boite d alice'; end if;

  update public.notifications set read_at = now()
   where user_id='a1000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: bob a marque % notification(s) d alice', n; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== C1  un commentaire de publication suit l audience de sa publication'
do $$
declare v_post uuid; v_comment uuid; n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  insert into public.posts (author_id, kind, visibility, body)
  values ('a1000000-0000-4000-8000-000000000001','post','followers','Reservee, et commentee')
  returning id into v_post;

  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
  insert into public.post_comments (post_id, author_id, body)
  values (v_post,'b2000000-0000-4000-8000-000000000002','Vu et lu') returning id into v_comment;

  perform set_config('request.jwt.claim.sub','c3000000-0000-4000-8000-000000000003',true);
  select count(*) into n from public.post_comments where id = v_comment;
  if n <> 0 then raise exception 'FAIL: un non-abonne lit le commentaire d une publication reservee'; end if;

  -- L'hôte modère chez lui : `post_comments_delete_host`.
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  delete from public.post_comments where id = v_comment;
  select count(*) into n from public.post_comments where id = v_comment;
  if n <> 0 then raise exception 'FAIL: l hote n a pas pu retirer un commentaire chez lui'; end if;

  delete from public.posts where id = v_post;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== H5  LES DETTES 2 ET 3 : les trois cles se lisent chez autrui, par une seule porte'
do $$
declare v jsonb;
begin
  -- Défaut : humidor fermé, les deux autres ouvertes. C'est `DEFAULT_PRIVACY`
  -- de `lib/settings/model.ts`, et l'asymétrie est la décision.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  update public.profile_settings
     set privacy = jsonb_build_object('show_humidor', false, 'show_reviews', true, 'show_country', true)
   where id = 'a1000000-0000-4000-8000-000000000001';

  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
  v := public.profile_privacy('a1000000-0000-4000-8000-000000000001');
  if v->>'show_humidor' <> 'false' then raise exception 'FAIL: show_humidor lu %', v; end if;
  if v->>'show_reviews' <> 'true'  then raise exception 'FAIL: show_reviews lu %', v; end if;
  if v->>'show_country' <> 'true'  then raise exception 'FAIL: show_country lu %', v; end if;

  -- Et la même porte suit un changement.
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  update public.profile_settings
     set privacy = privacy || '{"show_reviews": false, "show_country": false}'::jsonb
   where id = 'a1000000-0000-4000-8000-000000000001';

  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
  v := public.profile_privacy('a1000000-0000-4000-8000-000000000001');
  if v->>'show_reviews' <> 'false' then raise exception 'FAIL: show_reviews n a pas suivi'; end if;
  if v->>'show_country' <> 'false' then raise exception 'FAIL: show_country n a pas suivi'; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== H6  un membre sans ligne de reglages n a rien masque'
do $$
declare v jsonb;
begin
  -- Le repli reprend les défauts de colonne plutôt que de tout fermer. Fermer
  -- serait plus prudent et serait faux : quelqu'un qui n'a rien décidé n'a pas
  -- décidé de se cacher, et son profil serait vide sans qu'il l'ait demandé.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
  v := public.profile_privacy('00000000-0000-4000-8000-00000000dead');
  if v->>'show_humidor' <> 'false' then raise exception 'FAIL: repli show_humidor ouvert'; end if;
  if v->>'show_reviews' <> 'true'  then raise exception 'FAIL: repli show_reviews ferme'; end if;
  if v->>'show_country' <> 'true'  then raise exception 'FAIL: repli show_country ferme'; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== H7  le droit et l affichage lisent la meme cle'
do $$
begin
  -- Deux fonctions qui interprètent la même clé finiraient par en dire deux
  -- choses, et la divergence se lirait comme une cave montrée sur le profil et
  -- refusée par la policy. Vérifié sur les deux valeurs, dans les deux sens.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  update public.profile_settings set privacy = privacy || '{"show_humidor": true}'::jsonb
   where id = 'a1000000-0000-4000-8000-000000000001';

  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
  if not public.shows_humidor('a1000000-0000-4000-8000-000000000001')
     or (public.profile_privacy('a1000000-0000-4000-8000-000000000001')->>'show_humidor') <> 'true'
  then raise exception 'FAIL: le droit et l affichage divergent, cle a true'; end if;

  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  update public.profile_settings set privacy = privacy || '{"show_humidor": false}'::jsonb
   where id = 'a1000000-0000-4000-8000-000000000001';

  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
  if public.shows_humidor('a1000000-0000-4000-8000-000000000001')
     or (public.profile_privacy('a1000000-0000-4000-8000-000000000001')->>'show_humidor') <> 'false'
  then raise exception 'FAIL: le droit et l affichage divergent, cle a false'; end if;
  raise notice 'PASS';
  reset role;
end $$;

-- ---------- Nettoyage : le fichier doit être rejouable -----------------------

delete from public.posts where author_id in (
  'a1000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002',
  'c3000000-0000-4000-8000-000000000003');
delete from public.follows where follower_id in (
  'a1000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002',
  'c3000000-0000-4000-8000-000000000003');
delete from public.blocks where blocker_id in (
  'a1000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002',
  'c3000000-0000-4000-8000-000000000003');
delete from public.notifications where user_id in (
  'a1000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002',
  'c3000000-0000-4000-8000-000000000003');
update public.profile_settings
   set privacy = jsonb_build_object('show_humidor', false, 'show_reviews', true, 'show_country', true)
 where id = 'a1000000-0000-4000-8000-000000000001';

\echo '=== 09_social_rls : toutes les assertions ont passe'
