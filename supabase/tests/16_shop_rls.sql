-- =============================================================================
-- Assertions de comportement sur le catalogue (migration 0021, ADR 0015).
--
-- Exécuté en CI sur une base où 0001 à 0021 sont appliquées.
--
-- Ce fichier **n'accorde rien** et ne corrige rien : la régression future ne se
-- voit que d'ici.
--
-- Deux personnes : `vera` est promue admin, `noe` est membre. Les règles
-- vérifiées sont celles de l'ADR : l'admin seul écrit le catalogue, le trigger
-- lexical refuse un produit du tabac mais laisse passer les composés
-- d'accessoires, un brouillon est invisible du public, et PERSONNE n'écrit un
-- avis tant que la caisse n'existe pas.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- ---------- Fixtures, créées comme postgres (contexte privilégié) ------------
delete from shop.products where slug like 'produit-%-test';

insert into auth.users (id, email, raw_user_meta_data) values
  ('aa210000-0000-4000-8000-000000000011','shop-vera@x.test','{"birth_date":"1982-03-03"}'),
  ('bb210000-0000-4000-8000-000000000012','shop-noe@x.test','{"birth_date":"1989-04-04"}')
on conflict (id) do nothing;

update public.profiles set handle='shop_vera', role='admin'
 where id='aa210000-0000-4000-8000-000000000011';
update public.profiles set handle='shop_noe'
 where id='bb210000-0000-4000-8000-000000000012';

\echo '=== B1  un membre n ecrit pas le catalogue'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','bb210000-0000-4000-8000-000000000012',true);
  begin
    insert into shop.products (category, title, slug, price_eur)
    values ('coupe', 'Coupe de Noé', 'produit-de-noe-test', 10.00);
    raise exception 'FAIL: un membre a ecrit un produit';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== B2  l admin cree un brouillon ; le public ne le voit pas, lui si'
do $$
declare v_id uuid; n integer; v_status text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa210000-0000-4000-8000-000000000011',true);
  insert into shop.products (category, title, slug, description, price_eur, stock_qty)
  values ('coupe', 'Coupe-cigare guillotine', 'produit-guillotine-test',
          'Double lame, acier inoxydable.', 24.90, 5)
  returning id into v_id;

  select status::text into v_status from shop.products where id = v_id;
  if v_status <> 'draft' then
    raise exception 'FAIL: un produit nait % au lieu de draft', v_status;
  end if;
  reset role;

  set local role anon;
  select count(*) into n from shop.products where id = v_id;
  if n <> 0 then raise exception 'FAIL: un brouillon de produit est lisible du public'; end if;
  reset role;

  perform set_config('vitola.product', v_id::text, false);
  raise notice 'PASS';
end $$;

\echo '=== B3  le trigger lexical refuse un produit du tabac, avec sa raison'
do $$
declare refused boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa210000-0000-4000-8000-000000000011',true);
  begin
    insert into shop.products (category, title, slug, price_eur)
    values ('autre', 'Boîte de 25 havanes', 'produit-havanes-test', 100.00);
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'FAIL: un produit du tabac est entre au catalogue'; end if;

  -- Et la subtilité mesurée : le composé d'accessoire passe, y compris en
  -- description, y compris accentué.
  begin
    update shop.products
       set description = 'Étui à cigares en cuir, trois modules.'
     where slug = 'produit-guillotine-test';
  exception when check_violation then
    raise exception 'FAIL: un compose d accessoire legitime est refuse';
  end;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== B4  publie, le produit se lit du public — la policy que /boutique lira'
do $$
declare v_id uuid := current_setting('vitola.product')::uuid; n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa210000-0000-4000-8000-000000000011',true);
  update shop.products set status = 'published' where id = v_id;
  reset role;

  set local role anon;
  select count(*) into n from shop.products where id = v_id;
  if n <> 1 then raise exception 'FAIL: un produit publie reste invisible du public'; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== B5  personne n ecrit un avis — la D3, dans les deux sens'
do $$
declare n integer;
begin
  -- La ligne fixture existe (contexte privilégié) : une assertion « zéro
  -- écriture » doit d'abord prouver que la table sait porter une ligne.
  insert into shop.product_reviews (product_id, author_id, rating, body)
  values (current_setting('vitola.product')::uuid,
          'bb210000-0000-4000-8000-000000000012', 4, 'Tres bonne coupe.');
  select count(*) into n from shop.product_reviews
   where product_id = current_setting('vitola.product')::uuid;
  if n <> 1 then raise exception 'FAIL: la fixture d avis n a pas ete posee'; end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','bb210000-0000-4000-8000-000000000012',true);

  select count(*) into n from shop.product_reviews
   where product_id = current_setting('vitola.product')::uuid;
  if n <> 1 then raise exception 'FAIL: un avis visible n est pas lisible'; end if;

  begin
    insert into shop.product_reviews (product_id, author_id, rating)
    values (current_setting('vitola.product')::uuid,
            'bb210000-0000-4000-8000-000000000012', 5);
    raise exception 'FAIL: un membre a ecrit un avis — la caisse n existe pas encore';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== B6  slug et updated_at sont hors du GRANT UPDATE'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa210000-0000-4000-8000-000000000011',true);
  begin
    update shop.products set slug = 'produit-renomme-test'
     where slug = 'produit-guillotine-test';
    raise exception 'FAIL: le slug d un produit s est reecrit';
  exception when insufficient_privilege then null;
  end;
  begin
    update shop.products set updated_at = now()
     where slug = 'produit-guillotine-test';
    raise exception 'FAIL: updated_at s ecrit a la main';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== B7  l admin supprime ; l avis part avec le produit'
do $$
declare v_id uuid := current_setting('vitola.product')::uuid; n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa210000-0000-4000-8000-000000000011',true);
  delete from shop.products where id = v_id;
  reset role;

  select count(*) into n from shop.products where id = v_id;
  if n <> 0 then raise exception 'FAIL: l admin n a pas pu supprimer son produit'; end if;
  select count(*) into n from shop.product_reviews where product_id = v_id;
  if n <> 0 then raise exception 'FAIL: un avis orphelin survit a son produit'; end if;
  raise notice 'PASS';
end $$;

-- ---------- Nettoyage, en contexte privilégié --------------------------------
delete from shop.products where slug like 'produit-%-test';

\echo 'Catalogue : 7 assertions, base laissee comme trouvee (les fixtures d auth restent).'
