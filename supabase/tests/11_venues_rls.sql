-- =============================================================================
-- Assertions de comportement sur les lieux (migration 0016, ADR 0011).
--
-- Exécuté en CI sur une base où 0001 à 0016 sont appliquées.
--
-- Ce fichier **n'accorde rien** et ne corrige rien : l'auto-contrôle d'une
-- migration vérifie ce qu'elle vient d'établir, donc il ne peut pas échouer
-- dessus. La régression future ne se voit que d'ici.
--
-- Trois personnes : `vera` propose un lieu, `walt` est promu editor et publie,
-- `yona` note — et se fait bloquer, pour prouver que la restrictive mord.
--
-- Deux leçons du dépôt, appliquées partout :
--   - une assertion « zéro ligne » prouve d'abord que la ligne existe ;
--   - un UPDATE qu'une policy refuse ne lève pas, il rend zéro ligne — mais un
--     WITH CHECK violé lève, et les deux cas sont testés pour ce qu'ils sont.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- ---------- Fixtures, créées comme postgres (contexte privilégié) ------------
-- Les UUID diffèrent sur leurs douze premiers caractères hexadécimaux :
-- `tg_handle_new_user()` en dérive le pseudo.

-- Un rejeu après échec trouve les lignes du tour précédent : on repart propre.
delete from public.venue_reviews where venue_id in
  (select id from public.venues where slug like '%-test');
delete from public.venues where slug like '%-test';

insert into auth.users (id, email, raw_user_meta_data) values
  ('aa100000-0000-4000-8000-000000000001','lieux-vera@x.test','{"birth_date":"1985-02-01"}'),
  ('bb100000-0000-4000-8000-000000000002','lieux-walt@x.test','{"birth_date":"1986-03-02"}'),
  ('cc100000-0000-4000-8000-000000000003','lieux-yona@x.test','{"birth_date":"1987-04-03"}')
on conflict (id) do nothing;

update public.profiles set handle='lieux_vera' where id='aa100000-0000-4000-8000-000000000001';
update public.profiles set handle='lieux_walt', role='editor' where id='bb100000-0000-4000-8000-000000000002';
update public.profiles set handle='lieux_yona' where id='cc100000-0000-4000-8000-000000000003';

\echo '=== V1  une proposition nait pending : visible de son auteur, de personne d autre'
do $$
declare v_id uuid; n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa100000-0000-4000-8000-000000000001',true);

  insert into public.venues (type, name, slug, city, created_by)
  values ('lounge','Le Fumoir d''essai','le-fumoir-d-essai-test','Paris',
          'aa100000-0000-4000-8000-000000000001')
  returning id into v_id;

  select count(*) into n from public.venues where id = v_id;
  if n <> 1 then raise exception 'FAIL: l auteur ne voit pas sa proposition'; end if;

  -- Un autre membre ne la voit pas.
  perform set_config('request.jwt.claim.sub','cc100000-0000-4000-8000-000000000003',true);
  select count(*) into n from public.venues where id = v_id;
  if n <> 0 then raise exception 'FAIL: une proposition pending est lisible d un tiers'; end if;

  reset role;
  set local role anon;
  select count(*) into n from public.venues where id = v_id;
  if n <> 0 then raise exception 'FAIL: une proposition pending est lisible d un anonyme'; end if;

  reset role;
  perform set_config('vitola.venue', v_id::text, false);
  raise notice 'PASS';
end $$;

\echo '=== V2  l auteur ne publie pas sa proposition (ADR 0011, D2)'
do $$
declare v_id uuid := current_setting('vitola.venue')::uuid; n integer;
begin
  -- La ligne existe — sans quoi le refus ci-dessous ne prouverait rien.
  select count(*) into n from public.venues where id = v_id and status = 'pending';
  if n <> 1 then raise exception 'FAIL: la donnee de test n existe pas'; end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa100000-0000-4000-8000-000000000001',true);
  begin
    update public.venues set status = 'published' where id = v_id;
    raise exception 'FAIL: l auteur a publie sa propre proposition';
  exception
    when insufficient_privilege then null;  -- le WITH CHECK leve en 42501
  end;

  -- Et il peut toujours la corriger, tant qu elle reste pending.
  update public.venues set phone = '01 42 00 00 00' where id = v_id;
  select count(*) into n from public.venues where id = v_id and phone = '01 42 00 00 00';
  if n <> 1 then raise exception 'FAIL: l auteur ne peut plus corriger sa proposition'; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== V3  un editor voit la file et publie ; le lieu devient lisible d un anonyme'
do $$
declare v_id uuid := current_setting('vitola.venue')::uuid; n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','bb100000-0000-4000-8000-000000000002',true);

  select count(*) into n from public.venues where id = v_id;
  if n <> 1 then raise exception 'FAIL: l editor ne voit pas la proposition en attente'; end if;

  -- Le point de recherche des assertions V11/V12 est en Lozère, à plus de
  -- 100 km de toute commune du seed (PROVENANCE §7) : les comptes exacts de
  -- venues_nearby() restent vrais que les 200 lieux soient charges ou non.
  update public.venues
     set status = 'published',
         geo = extensions.st_setsrid(extensions.st_makepoint(3.2000, 44.8500), 4326)::extensions.geography
   where id = v_id;
  select count(*) into n from public.venues where id = v_id and status = 'published';
  if n <> 1 then raise exception 'FAIL: l editor n a pas pu publier'; end if;

  reset role;
  set local role anon;
  select count(*) into n from public.venues where id = v_id;
  if n <> 1 then raise exception 'FAIL: un lieu publie n est pas lisible d un anonyme'; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== V4  publiee, la fiche echappe a son auteur'
do $$
declare v_id uuid := current_setting('vitola.venue')::uuid; n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa100000-0000-4000-8000-000000000001',true);
  update public.venues set phone = '09 99 99 99 99' where id = v_id;
  select count(*) into n from public.venues where id = v_id and phone = '09 99 99 99 99';
  if n <> 0 then raise exception 'FAIL: l auteur modifie encore une fiche publiee'; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== V5  personne n ecrit claimed_by depuis un client (ADR 0011, D3)'
do $$
declare v_id uuid := current_setting('vitola.venue')::uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','bb100000-0000-4000-8000-000000000002',true);
  begin
    update public.venues set claimed_by = 'bb100000-0000-4000-8000-000000000002' where id = v_id;
    raise exception 'FAIL: claimed_by est ecrivable par un client (meme editor)';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== V6  le revendicateur tient sa fiche : il ferme, il ne depublie pas'
do $$
declare v_id uuid := current_setting('vitola.venue')::uuid; n integer;
begin
  -- La revendication est un acte privilégié : posgres pose la colonne.
  update public.venues set claimed_by = 'cc100000-0000-4000-8000-000000000003' where id = v_id;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','cc100000-0000-4000-8000-000000000003',true);

  update public.venues set hours = '{"mon": "10:00-19:00"}'::jsonb where id = v_id;
  select count(*) into n from public.venues where id = v_id and hours ? 'mon';
  if n <> 1 then raise exception 'FAIL: le revendicateur ne tient pas ses horaires'; end if;

  begin
    update public.venues set status = 'pending' where id = v_id;
    raise exception 'FAIL: le revendicateur a depublie sa fiche';
  exception when insufficient_privilege then null;
  end;

  reset role;
  -- On retire la revendication pour la suite du fichier.
  update public.venues set claimed_by = null where id = v_id;
  raise notice 'PASS';
end $$;

\echo '=== V7  un avis n a que trois colonnes ou exister, et sa note est engendree'
do $$
declare v_id uuid := current_setting('vitola.venue')::uuid; v_rating numeric;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','cc100000-0000-4000-8000-000000000003',true);

  insert into public.venue_reviews (venue_id, user_id, welcome, comfort, advice, body)
  values (v_id, 'cc100000-0000-4000-8000-000000000003', 5, 4, 4, 'Bon conseil, fauteuils fatigues.');

  select rating into v_rating from public.venue_reviews
   where venue_id = v_id and user_id = 'cc100000-0000-4000-8000-000000000003';
  if v_rating <> 4.3 then
    raise exception 'FAIL: rating vaut % au lieu de 4.3 — la moyenne a derive', v_rating;
  end if;

  begin
    update public.venue_reviews set rating = 5.0
     where venue_id = v_id and user_id = 'cc100000-0000-4000-8000-000000000003';
    raise exception 'FAIL: la note globale d un avis est ecrivable';
  exception
    -- Deux refus possibles, tous deux bons : le grant (42501) si la colonne
    -- sort un jour du GENERATED, la generation elle-meme (428C9) tant qu'elle
    -- y est. PostgreSQL verifie la generation avant les droits.
    when insufficient_privilege or generated_always then null;
  end;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== V8  un avis par membre et par lieu : le second est refuse'
do $$
declare v_id uuid := current_setting('vitola.venue')::uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','cc100000-0000-4000-8000-000000000003',true);
  begin
    insert into public.venue_reviews (venue_id, user_id, welcome, comfort, advice)
    values (v_id, 'cc100000-0000-4000-8000-000000000003', 1, 1, 1);
    raise exception 'FAIL: un deuxieme avis du meme membre est passe';
  exception when unique_violation then null;
  end;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== V9  on ne note pas une proposition en attente'
do $$
declare v_pending uuid;
begin
  insert into public.venues (type, name, slug, city, status)
  values ('cave','Cave en attente','cave-en-attente-test','Lyon','pending')
  returning id into v_pending;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','cc100000-0000-4000-8000-000000000003',true);
  begin
    insert into public.venue_reviews (venue_id, user_id, welcome, comfort, advice)
    values (v_pending, 'cc100000-0000-4000-8000-000000000003', 3, 3, 3);
    raise exception 'FAIL: un avis sur un lieu pending est passe';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== V10 le blocage retire l avis, en restrictif : rien d autre ne peut le faire'
do $$
declare v_id uuid := current_setting('vitola.venue')::uuid; n integer;
begin
  -- La ligne existe (leçon T8) : l avis de yona est là avant qu on prouve
  -- qu il disparaît.
  select count(*) into n from public.venue_reviews where venue_id = v_id;
  if n <> 1 then raise exception 'FAIL: la donnee de test n existe pas'; end if;

  set local role authenticated;
  -- vera bloque yona…
  perform set_config('request.jwt.claim.sub','aa100000-0000-4000-8000-000000000001',true);
  insert into public.blocks (blocker_id, blocked_id)
  values ('aa100000-0000-4000-8000-000000000001','cc100000-0000-4000-8000-000000000003')
  on conflict do nothing;

  select count(*) into n from public.venue_reviews where venue_id = v_id;
  if n <> 0 then raise exception 'FAIL: l avis d une personne bloquee est encore lisible'; end if;

  -- …yona garde le sien…
  perform set_config('request.jwt.claim.sub','cc100000-0000-4000-8000-000000000003',true);
  select count(*) into n from public.venue_reviews where venue_id = v_id;
  if n <> 1 then raise exception 'FAIL: l auteur bloque ne voit plus son propre avis'; end if;

  reset role;
  -- …et un anonyme n est bloque par personne.
  set local role anon;
  select count(*) into n from public.venue_reviews where venue_id = v_id;
  if n <> 1 then raise exception 'FAIL: le blocage de quelqu un d autre retire l avis a un anonyme'; end if;

  reset role;
  delete from public.blocks
   where blocker_id = 'aa100000-0000-4000-8000-000000000001'
     and blocked_id = 'cc100000-0000-4000-8000-000000000003';
  raise notice 'PASS';
end $$;

\echo '=== V11 venues_nearby : le publie geolocalise dans le rayon, le plus proche d abord'
do $$
declare n integer; first_slug text; d1 double precision; d2 double precision;
begin
  -- Trois lieux de plus autour du premier (44.85, 3.20 — Lozère) : un publie
  -- a ~4,5 km, un publie SANS geo, un publie a ~65 km. Loin des villes du
  -- seed, pour que les comptes tiennent avec ou sans lui.
  insert into public.venues (type, name, slug, city, status, geo) values
    ('civette','Civette du causse','civette-du-causse-test','Mende','published',
     extensions.st_setsrid(extensions.st_makepoint(3.2500, 44.8700), 4326)::extensions.geography),
    ('lounge','Salon sans adresse','salon-sans-geo-test','Mende','published', null),
    ('civette','Civette des gorges','civette-des-gorges-test','Florac','published',
     extensions.st_setsrid(extensions.st_makepoint(3.9000, 44.5200), 4326)::extensions.geography);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','cc100000-0000-4000-8000-000000000003',true);

  select count(*) into n
    from public.venues_nearby(44.8500, 3.2000, 25);
  if n <> 2 then
    raise exception 'FAIL: % lieux rendus au lieu de 2 (pending, sans geo et hors rayon exclus)', n;
  end if;

  select r.slug, r.distance_m into first_slug, d1
    from public.venues_nearby(44.8500, 3.2000, 25) r limit 1;
  if first_slug <> 'le-fumoir-d-essai-test' then
    raise exception 'FAIL: le plus proche est %, attendu le-fumoir-d-essai-test', first_slug;
  end if;

  select max(r.distance_m) into d2 from public.venues_nearby(44.8500, 3.2000, 25) r;
  if d1 > 100 or d2 not between 3000 and 6000 then
    raise exception 'FAIL: distances % et % hors des ordres de grandeur attendus', d1, d2;
  end if;

  -- A 100 km, la civette des gorges entre dans le rayon.
  select count(*) into n from public.venues_nearby(44.8500, 3.2000, 100);
  if n <> 3 then raise exception 'FAIL: % lieux a 100 km au lieu de 3', n; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== V12 ferme, un lieu reste lisible et sort de la recherche'
do $$
declare v_id uuid := current_setting('vitola.venue')::uuid; n integer;
begin
  update public.venues set status = 'closed' where id = v_id;

  set local role anon;
  select count(*) into n from public.venues where id = v_id;
  if n <> 1 then raise exception 'FAIL: un lieu ferme n est plus lisible — on va le re-proposer'; end if;

  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','cc100000-0000-4000-8000-000000000003',true);
  select count(*) into n from public.venues_nearby(44.8500, 3.2000, 25);
  if n <> 1 then raise exception 'FAIL: un lieu ferme apparait encore dans la recherche'; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== V13 un avis masque disparait pour les autres, jamais pour son auteur'
do $$
declare v_id uuid := current_setting('vitola.venue')::uuid; n integer;
begin
  update public.venue_reviews
     set hidden_at = now(), hidden_by = 'bb100000-0000-4000-8000-000000000002',
         hidden_reason = 'test'
   where venue_id = v_id;

  set local role anon;
  select count(*) into n from public.venue_reviews where venue_id = v_id;
  if n <> 0 then raise exception 'FAIL: un avis masque est encore public'; end if;

  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','cc100000-0000-4000-8000-000000000003',true);
  select count(*) into n from public.venue_reviews where venue_id = v_id;
  if n <> 1 then raise exception 'FAIL: l auteur ne voit plus son avis masque'; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== V14 l auteur retire sa proposition en attente ; personne ne supprime un lieu publie'
do $$
declare v_pending uuid; v_pub uuid; n integer;
begin
  insert into public.venues (type, name, slug, city, created_by)
  values ('restaurant','Table d''essai','table-d-essai-test','Nice',
          'aa100000-0000-4000-8000-000000000001')
  returning id into v_pending;
  select id into v_pub from public.venues where slug = 'civette-du-causse-test';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa100000-0000-4000-8000-000000000001',true);

  delete from public.venues where id = v_pending;
  reset role;
  select count(*) into n from public.venues where id = v_pending;
  if n <> 0 then raise exception 'FAIL: l auteur n a pas pu retirer sa proposition'; end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa100000-0000-4000-8000-000000000001',true);
  delete from public.venues where id = v_pub;
  reset role;
  select count(*) into n from public.venues where id = v_pub;
  if n <> 1 then raise exception 'FAIL: un membre a supprime un lieu publie'; end if;
  raise notice 'PASS';
end $$;

-- ---------- Nettoyage, en contexte privilégié --------------------------------
delete from public.venue_reviews where venue_id in
  (select id from public.venues where slug like '%-test');
delete from public.venues where slug like '%-test';
delete from public.blocks where blocker_id = 'aa100000-0000-4000-8000-000000000001';

\echo 'Lieux : 14 assertions, base laissee comme trouvee (les fixtures d auth restent).'
