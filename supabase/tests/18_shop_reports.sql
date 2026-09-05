-- =============================================================================
-- Assertions de comportement sur le signalement de la boutique (migration
-- 0024, ADR 0005 · ADR 0013 · ADR 0016).
--
-- Exécuté en CI sur une base où 0001 à 0024 sont appliquées.
--
-- Ce fichier **n'accorde rien** et ne corrige rien : la régression future ne se
-- voit que d'ici. Ce qu'il prouve que l'auto-contrôle de 0024 ne peut pas
-- prouver : qu'un signalement de produit et de vitrine ENTRE dans la file par
-- le chemin réel (`file_report()`, comme la route), qu'une modératrice le lit
-- du bon côté, que masquer y est refusé — la décision s'enregistre, l'acte
-- passe par le chemin de l'administration —, et que ce chemin existe sous sa
-- propre policy, pour l'admin et pas pour la modératrice.
--
-- Quatre personnes : `sr_mona` est modératrice, `sr_ada` est admin, `sr_lea`
-- gère la boutique visée, `sr_rene` est le membre qui signale.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- ---------- Fixtures, créées comme postgres (contexte privilégié) ------------
-- Idempotence : un run précédent interrompu ne doit pas faire échouer celui-ci.
delete from mod.moderation_actions
 where entity_schema = 'shop'
   and (entity_id in (select id::text from shop.products where slug like 'sr-%-test')
     or entity_id in (select id::text from shop.vendors where slug like 'sr-%-test'));
delete from mod.reports
 where entity_schema = 'shop'
   and (entity_id in (select id::text from shop.products where slug like 'sr-%-test')
     or entity_id in (select id::text from shop.vendors where slug like 'sr-%-test'));
delete from shop.products where slug like 'sr-%-test';
delete from shop.vendors where slug like 'sr-%-test';

insert into auth.users (id, email, raw_user_meta_data) values
  ('aa240000-0000-4000-8000-000000000001','sr-mona@x.test','{"birth_date":"1984-01-01"}'),
  ('bb240000-0000-4000-8000-000000000002','sr-rene@x.test','{"birth_date":"1985-02-02"}'),
  ('cc240000-0000-4000-8000-000000000003','sr-lea@x.test' ,'{"birth_date":"1986-03-03"}'),
  ('dd240000-0000-4000-8000-000000000004','sr-ada@x.test' ,'{"birth_date":"1980-04-04"}')
on conflict (id) do nothing;

update public.profiles set handle='sr_mona', role='moderator'
 where id='aa240000-0000-4000-8000-000000000001';
update public.profiles set handle='sr_rene'
 where id='bb240000-0000-4000-8000-000000000002';
update public.profiles set handle='sr_lea'
 where id='cc240000-0000-4000-8000-000000000003';
update public.profiles set handle='sr_ada', role='admin'
 where id='dd240000-0000-4000-8000-000000000004';

-- Une boutique active et un produit publié : exactement ce qu'un passant lit
-- sur /boutique, donc exactement ce qui peut être signalé.
insert into shop.vendors (id, name, slug, description, status, owner_id) values
  ('ee240000-0000-4000-8000-000000000005', 'Comptoir Signalement', 'sr-comptoir-test',
   'Accessoires de QA.', 'active', 'cc240000-0000-4000-8000-000000000003');

insert into shop.products (id, vendor_id, category, title, slug, description, price_eur,
                           stock_qty, status, created_by) values
  ('ff240000-0000-4000-8000-000000000006', 'ee240000-0000-4000-8000-000000000005',
   'hygrometre', 'Hygromètre de signalement', 'sr-hygrometre-test',
   'Cadran laiton, étalonnage au sel.', 34.50, 3, 'published',
   'cc240000-0000-4000-8000-000000000003');

\echo '=== S1  un produit se signale par la porte reelle, motif tabac compris'
do $$
declare v jsonb; stored record;
begin
  set local role service_role;
  v := public.file_report('bb240000-0000-4000-8000-000000000002',
    'shop', 'products', 'ff240000-0000-4000-8000-000000000006',
    'tobacco_promotion', 'La fiche vante la consommation — cas §2.');
  reset role;

  if v->>'status' <> 'created' then
    raise exception 'FAIL: le depot sur shop.products a rendu %', v;
  end if;
  perform set_config('vitola.sr_report_product', v->>'id', false);

  select * into stored from mod.reports where id = (v->>'id')::uuid;
  if stored.reason::text <> 'tobacco_promotion' or stored.status::text <> 'open' then
    raise exception 'FAIL: signalement de produit enregistre en % / %', stored.reason, stored.status;
  end if;
  raise notice 'PASS';
end $$;

\echo '=== S2  une vitrine aussi'
do $$
declare v jsonb;
begin
  set local role service_role;
  v := public.file_report('bb240000-0000-4000-8000-000000000002',
    'shop', 'vendors', 'ee240000-0000-4000-8000-000000000005', 'spam', null);
  reset role;
  if v->>'status' <> 'created' then
    raise exception 'FAIL: le depot sur shop.vendors a rendu %', v;
  end if;
  perform set_config('vitola.sr_report_vendor', v->>'id', false);
  raise notice 'PASS';
end $$;

\echo '=== S3  les avis produits restent hors de la file tant qu ils n ont pas de porte d ecriture'
do $$
declare refused boolean := false;
begin
  set local role service_role;
  begin
    perform public.file_report('bb240000-0000-4000-8000-000000000002',
      'shop', 'product_reviews', 'ff240000-0000-4000-8000-000000000099', 'spam', null);
  exception when check_violation then refused := true;
  end;
  reset role;
  if not refused then
    raise exception 'FAIL: shop.product_reviews est entre dans mod.reports (ADR 0015, D3)';
  end if;
  raise notice 'PASS';
end $$;

\echo '=== S4  la moderatrice lit les deux dossiers dans la file, du bon cote'
do $$
declare n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa240000-0000-4000-8000-000000000001',true);
  select count(*) into n from public.mod_queue('open')
   where id in (current_setting('vitola.sr_report_product')::uuid,
                current_setting('vitola.sr_report_vendor')::uuid);
  if n <> 2 then raise exception 'FAIL: % dossier(s) de boutique dans la file open au lieu de 2', n; end if;
  select count(*) into n from public.mod_queue('open')
   where entity_schema = 'shop' and entity_table = 'products'
     and id = current_setting('vitola.sr_report_product')::uuid;
  if n <> 1 then raise exception 'FAIL: la file ne nomme pas shop.products'; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== S5  la moderatrice lit le produit vise sous ses propres droits — l ecran du dossier'
do $$
declare n integer;
begin
  -- Ce que `targetPreview()` fait : lire la cible par la session, jamais par
  -- une porte (ADR 0013, D3). Un produit publié d'un vendeur actif se lit.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa240000-0000-4000-8000-000000000001',true);
  select count(*) into n from shop.products p
    join shop.vendors v on v.id = p.vendor_id
   where p.id = 'ff240000-0000-4000-8000-000000000006';
  if n <> 1 then raise exception 'FAIL: la moderatrice ne lit pas le produit publie qu elle doit juger'; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== S6  masquer un produit est refuse ; la decision sans acte passe, et le produit ne bouge pas'
do $$
declare v_status text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa240000-0000-4000-8000-000000000001',true);
  begin
    perform public.mod_decide(current_setting('vitola.sr_report_product')::uuid,
      'upheld', 'Retenu.', 'hide', 'Motif.');
    raise exception 'FAIL: hide est passe sur shop.products';
  exception when others then
    if sqlerrm not like 'VITOLA_TARGET_NOT_HIDEABLE%' then raise; end if;
  end;

  -- Sans verbe, la même décision s'enregistre : l'acte est ailleurs.
  perform public.mod_decide(current_setting('vitola.sr_report_product')::uuid,
    'upheld', 'Fiche promotionnelle au sens du §2 — a depublier depuis l administration.');
  reset role;

  select status::text into v_status from shop.products
   where id = 'ff240000-0000-4000-8000-000000000006';
  if v_status <> 'published' then
    raise exception 'FAIL: une decision sans acte a change le statut du produit (%)', v_status;
  end if;
  if not exists (select 1 from mod.reports
                  where id = current_setting('vitola.sr_report_product')::uuid
                    and status = 'upheld' and decided_by = 'aa240000-0000-4000-8000-000000000001') then
    raise exception 'FAIL: la decision retenue n est pas signee dans la file';
  end if;
  raise notice 'PASS';
end $$;

\echo '=== S7  l acte est celui de l admin, pas de la moderatrice : depublier passe par products_update_admin'
do $$
declare n integer;
begin
  -- La modératrice ne dépublie pas : aucune policy UPDATE ne l'atteint, et une
  -- écriture refusée par la RLS rend zéro ligne au lieu de lever.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa240000-0000-4000-8000-000000000001',true);
  update shop.products set status = 'draft' where id = 'ff240000-0000-4000-8000-000000000006';
  reset role;
  select count(*) into n from shop.products
   where id = 'ff240000-0000-4000-8000-000000000006' and status = 'published';
  if n <> 1 then raise exception 'FAIL: la moderatrice a depublie un produit'; end if;

  -- L'admin, si — c'est le bras que /admin/boutique tend au dossier.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','dd240000-0000-4000-8000-000000000004',true);
  update shop.products set status = 'draft' where id = 'ff240000-0000-4000-8000-000000000006';
  reset role;
  select count(*) into n from shop.products
   where id = 'ff240000-0000-4000-8000-000000000006' and status = 'draft';
  if n <> 1 then raise exception 'FAIL: l admin n a pas pu depublier le produit signale'; end if;

  -- Et le retrait se lit depuis le dossier : la cible devient « introuvable
  -- ou retirée » pour la modératrice, ce qui est une information, pas un bug.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa240000-0000-4000-8000-000000000001',true);
  select count(*) into n from shop.products where id = 'ff240000-0000-4000-8000-000000000006';
  if n <> 0 then raise exception 'FAIL: un produit depublie reste lisible d une moderatrice non admin'; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== S8  un vendeur suspendu rend sa vitrine signalee illisible, meme pour la file'
do $$
declare n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','dd240000-0000-4000-8000-000000000004',true);
  update shop.vendors set status = 'suspended' where id = 'ee240000-0000-4000-8000-000000000005';
  reset role;

  -- Le dossier, lui, reste dans la file : une décision se prend sur ce qui a
  -- été signalé, même quand l'acte a déjà eu lieu par ailleurs.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa240000-0000-4000-8000-000000000001',true);
  select count(*) into n from public.mod_queue('open')
   where id = current_setting('vitola.sr_report_vendor')::uuid;
  if n <> 1 then raise exception 'FAIL: le dossier de la vitrine a quitte la file avec la suspension'; end if;
  select count(*) into n from shop.vendors where id = 'ee240000-0000-4000-8000-000000000005';
  if n <> 0 then raise exception 'FAIL: une vitrine suspendue reste lisible d une moderatrice non admin'; end if;
  perform public.mod_decide(current_setting('vitola.sr_report_vendor')::uuid,
    'dismissed', 'Vitrine deja suspendue par l administration.');
  raise notice 'PASS';
  reset role;
end $$;

-- ---------- Nettoyage, en contexte privilégié --------------------------------
delete from mod.moderation_actions
 where report_id in (current_setting('vitola.sr_report_product')::uuid,
                     current_setting('vitola.sr_report_vendor')::uuid);
delete from mod.reports
 where id in (current_setting('vitola.sr_report_product')::uuid,
              current_setting('vitola.sr_report_vendor')::uuid);
delete from shop.products where slug like 'sr-%-test';
delete from shop.vendors where slug like 'sr-%-test';

\echo 'Signalement de la boutique : 8 assertions, base laissee comme trouvee (les fixtures d auth restent).'
