-- =============================================================================
-- Assertions de comportement sur la marketplace (migration 0022, ADR 0016).
--
-- Exécuté en CI sur une base où 0001 à 0022 sont appliquées.
--
-- Ce fichier **n'accorde rien** et ne corrige rien : la régression future ne se
-- voit que d'ici.
--
-- Quatre personnes : `mk_ada` est promue admin, `mk_lea` gérera une boutique,
-- `mk_sam` une seconde, `mk_noa` reste simple membre. Les règles vérifiées
-- sont celles de l'ADR 0016 : l'entrée est humaine (l'admin crée, l'admin
-- active), le vendeur écrit des brouillons et NE PUBLIE PAS (le WITH CHECK
-- l'exige), la suspension coupe vitrine et produits, le trigger lexical
-- couvre brand et le nom du vendeur, et les colonnes gardées le restent.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- ---------- Fixtures, créées comme postgres (contexte privilégié) ------------
delete from shop.products where slug like 'mk-%-test';
delete from shop.vendors where slug like 'mk-%-test';

insert into auth.users (id, email, raw_user_meta_data) values
  ('aa220000-0000-4000-8000-000000000021','mk-ada@x.test','{"birth_date":"1980-01-01"}'),
  ('bb220000-0000-4000-8000-000000000022','mk-lea@x.test','{"birth_date":"1985-02-02"}'),
  ('cc220000-0000-4000-8000-000000000023','mk-sam@x.test','{"birth_date":"1990-03-03"}'),
  ('dd220000-0000-4000-8000-000000000024','mk-noa@x.test','{"birth_date":"1992-04-04"}')
on conflict (id) do nothing;

update public.profiles set handle='mk_ada', role='admin'
 where id='aa220000-0000-4000-8000-000000000021';
update public.profiles set handle='mk_lea'
 where id='bb220000-0000-4000-8000-000000000022';
update public.profiles set handle='mk_sam'
 where id='cc220000-0000-4000-8000-000000000023';
update public.profiles set handle='mk_noa'
 where id='dd220000-0000-4000-8000-000000000024';

\echo '=== M1  un membre ne cree pas de vendeur ; l admin oui, et il nait pending'
do $$
declare v_id uuid; v_status text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','dd220000-0000-4000-8000-000000000024',true);
  begin
    insert into shop.vendors (name, slug) values ('Chez Noa', 'mk-noa-test');
    raise exception 'FAIL: un membre a cree un vendeur — l entree n est plus humaine';
  exception when insufficient_privilege then null;
  end;
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa220000-0000-4000-8000-000000000021',true);
  insert into shop.vendors (name, slug, description, owner_id)
  values ('Atelier Léa', 'mk-lea-test', 'Coutellerie et petits objets.',
          'bb220000-0000-4000-8000-000000000022')
  returning id into v_id;
  select status::text into v_status from shop.vendors where id = v_id;
  if v_status <> 'pending' then
    raise exception 'FAIL: un vendeur nait % au lieu de pending', v_status;
  end if;
  reset role;

  perform set_config('vitola.vendor_lea', v_id::text, false);
  raise notice 'PASS';
end $$;

\echo '=== M2  pending est invisible du public ; l admin active, le public lit'
do $$
declare v_id uuid := current_setting('vitola.vendor_lea')::uuid; n integer;
begin
  set local role anon;
  select count(*) into n from shop.vendors where id = v_id;
  if n <> 0 then raise exception 'FAIL: un vendeur pending est lisible du public'; end if;
  reset role;

  -- Son propre gestionnaire, lui, le voit déjà (vendors_select_own).
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','bb220000-0000-4000-8000-000000000022',true);
  select count(*) into n from shop.vendors where id = v_id;
  if n <> 1 then raise exception 'FAIL: un gestionnaire ne voit pas sa boutique pending'; end if;
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa220000-0000-4000-8000-000000000021',true);
  update shop.vendors set status = 'active' where id = v_id;
  reset role;

  set local role anon;
  select count(*) into n from shop.vendors where id = v_id;
  if n <> 1 then raise exception 'FAIL: un vendeur actif reste invisible du public'; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== M3  le vendeur edite sa vitrine, jamais son statut ni son rattachement'
do $$
declare v_id uuid := current_setting('vitola.vendor_lea')::uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','bb220000-0000-4000-8000-000000000022',true);

  update shop.vendors set description = 'Coutellerie fine, depuis 1972.' where id = v_id;

  begin
    update shop.vendors set status = 'suspended' where id = v_id;
    raise exception 'FAIL: un vendeur a change son propre statut';
  exception when insufficient_privilege then null;
  end;

  begin
    update shop.vendors set owner_id = 'cc220000-0000-4000-8000-000000000023' where id = v_id;
    raise exception 'FAIL: un vendeur a donne sa boutique a quelqu un d autre';
  exception when insufficient_privilege then null;
  end;

  raise notice 'PASS';
  reset role;
end $$;

\echo '=== M4  le vendeur cree un brouillon chez LUI ; jamais publie, jamais ailleurs'
do $$
declare v_lea uuid := current_setting('vitola.vendor_lea')::uuid;
        v_other uuid; v_id uuid; v_status text;
begin
  -- Une seconde boutique, active, à Sam (contexte privilégié : la fixture).
  insert into shop.vendors (name, slug, status, owner_id)
  values ('Comptoir Sam', 'mk-sam-test', 'active', 'cc220000-0000-4000-8000-000000000023')
  returning id into v_other;
  perform set_config('vitola.vendor_sam', v_other::text, false);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','bb220000-0000-4000-8000-000000000022',true);

  insert into shop.products (vendor_id, category, title, slug, brand, price_eur, stock_qty, created_by)
  values (v_lea, 'coupe', 'Guillotine double lame', 'mk-guillotine-test',
          'Les Fines Lames', 49.00, 3, 'bb220000-0000-4000-8000-000000000022')
  returning id into v_id;
  select status::text into v_status from shop.products where id = v_id;
  if v_status <> 'draft' then
    raise exception 'FAIL: un produit de vendeur nait % au lieu de draft', v_status;
  end if;

  begin
    insert into shop.products (vendor_id, category, title, slug, price_eur, status, created_by)
    values (v_lea, 'coupe', 'Ciseaux de poche', 'mk-ciseaux-test', 30.00, 'published',
            'bb220000-0000-4000-8000-000000000022');
    raise exception 'FAIL: un vendeur a publie a l insertion — le WITH CHECK est defait';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into shop.products (vendor_id, category, title, slug, price_eur, created_by)
    values (v_other, 'coupe', 'Coupe intruse', 'mk-intruse-test', 10.00,
            'bb220000-0000-4000-8000-000000000022');
    raise exception 'FAIL: un vendeur a ecrit chez un autre vendeur';
  exception when insufficient_privilege then null;
  end;

  begin
    update shop.products set status = 'published' where id = v_id;
    raise exception 'FAIL: un vendeur a publie par UPDATE — le WITH CHECK est defait';
  exception when insufficient_privilege then null;
  end;

  reset role;
  perform set_config('vitola.product_lea', v_id::text, false);
  raise notice 'PASS';
end $$;

\echo '=== M5  soumettre, refuser avec motif : la note est a l admin, lisible du vendeur'
do $$
declare v_id uuid := current_setting('vitola.product_lea')::uuid; v_note text; n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','bb220000-0000-4000-8000-000000000022',true);
  update shop.products set submitted_at = now() where id = v_id;

  begin
    update shop.products set review_note = 'Tout va bien.' where id = v_id;
    raise exception 'FAIL: un vendeur a ecrit le motif de refus';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- Le vendeur de l'autre boutique ne voit pas ce brouillon soumis.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','cc220000-0000-4000-8000-000000000023',true);
  select count(*) into n from shop.products where id = v_id;
  if n <> 0 then raise exception 'FAIL: un vendeur lit les brouillons d un autre'; end if;
  reset role;

  -- L'admin relit la file et refuse, avec le motif dans le même geste.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa220000-0000-4000-8000-000000000021',true);
  select count(*) into n from shop.products
   where status = 'draft' and submitted_at is not null and id = v_id;
  if n <> 1 then raise exception 'FAIL: la file admin ne montre pas la soumission'; end if;
  update shop.products
     set review_note = 'Ajoutez la matière du manche.', submitted_at = null
   where id = v_id;
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','bb220000-0000-4000-8000-000000000022',true);
  select review_note into v_note from shop.products where id = v_id;
  if v_note is distinct from 'Ajoutez la matière du manche.' then
    raise exception 'FAIL: le vendeur ne lit pas le motif de son refus';
  end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== M6  l admin publie ; le public lit — et un brouillon jamais'
do $$
declare v_id uuid := current_setting('vitola.product_lea')::uuid; n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa220000-0000-4000-8000-000000000021',true);
  update shop.products set status = 'published' where id = v_id;
  reset role;

  set local role anon;
  select count(*) into n from shop.products where id = v_id;
  if n <> 1 then raise exception 'FAIL: un produit publie d un vendeur actif est invisible'; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== M7  le lexique couvre brand et le nom du vendeur'
do $$
declare refused boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','bb220000-0000-4000-8000-000000000022',true);
  refused := false;
  begin
    update shop.products set brand = 'Habanos'
     where id = current_setting('vitola.product_lea')::uuid;
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'FAIL: une marque tabac est entree en boutique'; end if;
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa220000-0000-4000-8000-000000000021',true);
  refused := false;
  begin
    update shop.vendors set name = 'La Civette du Tabac'
     where id = current_setting('vitola.vendor_lea')::uuid;
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'FAIL: un nom de vendeur tabac est passe'; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== M8  suspendre un vendeur coupe sa vitrine ET ses produits, et sa plume'
do $$
declare v_vendor uuid := current_setting('vitola.vendor_lea')::uuid;
        v_id uuid := current_setting('vitola.product_lea')::uuid; n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa220000-0000-4000-8000-000000000021',true);
  update shop.vendors set status = 'suspended' where id = v_vendor;
  reset role;

  set local role anon;
  select count(*) into n from shop.vendors where id = v_vendor;
  if n <> 0 then raise exception 'FAIL: un vendeur suspendu garde sa vitrine'; end if;
  select count(*) into n from shop.products where id = v_id;
  if n <> 0 then raise exception 'FAIL: le produit publie d un vendeur suspendu se lit encore'; end if;
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','bb220000-0000-4000-8000-000000000022',true);
  begin
    insert into shop.products (vendor_id, category, title, slug, price_eur, created_by)
    values (v_vendor, 'etui', 'Etui trois doigts', 'mk-etui-test', 60.00,
            'bb220000-0000-4000-8000-000000000022');
    raise exception 'FAIL: un vendeur suspendu ecrit encore';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- Réactivé pour la suite.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa220000-0000-4000-8000-000000000021',true);
  update shop.vendors set status = 'active' where id = v_vendor;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== M9  retirer, puis supprimer : les deux gestes du vendeur — et vendor_id jamais'
do $$
declare v_id uuid := current_setting('vitola.product_lea')::uuid; n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','bb220000-0000-4000-8000-000000000022',true);

  begin
    update shop.products set vendor_id = current_setting('vitola.vendor_sam')::uuid
     where id = v_id;
    raise exception 'FAIL: un produit a change de vendeur';
  exception when insufficient_privilege then null;
  end;

  -- Une fiche publiée ne se supprime pas d'un geste…
  delete from shop.products where id = v_id;
  select count(*) into n from shop.products where id = v_id;
  if n <> 1 then raise exception 'FAIL: une fiche publiee s est supprimee sans etre retiree'; end if;

  -- …elle se retire d'abord (published → draft passe le WITH CHECK)…
  update shop.products set status = 'draft' where id = v_id;
  select count(*) into n from shop.products where id = v_id and status = 'draft';
  if n <> 1 then raise exception 'FAIL: le vendeur n a pas pu retirer sa fiche de la vente'; end if;

  -- …puis se supprime.
  delete from shop.products where id = v_id;
  select count(*) into n from shop.products where id = v_id;
  if n <> 0 then raise exception 'FAIL: le vendeur n a pas pu supprimer son brouillon'; end if;

  raise notice 'PASS';
  reset role;
end $$;

\echo '=== M10 la boutique maison se gere toujours par l admin, sans espace vendeur'
do $$
declare v_id uuid; n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa220000-0000-4000-8000-000000000021',true);
  insert into shop.products (vendor_id, category, title, slug, price_eur, created_by)
  select v.id, 'cendrier', 'Cendrier de comptoir', 'mk-maison-test', 35.00,
         'aa220000-0000-4000-8000-000000000021'
    from shop.vendors v where v.slug = 'vitola'
  returning id into v_id;
  update shop.products set status = 'published' where id = v_id;
  reset role;

  set local role anon;
  select count(*) into n from shop.products where id = v_id;
  if n <> 1 then raise exception 'FAIL: le produit maison publie est invisible du public'; end if;
  raise notice 'PASS';
  reset role;
end $$;

-- ---------- Nettoyage, en contexte privilégié --------------------------------
delete from shop.products where slug like 'mk-%-test';
delete from shop.vendors where slug like 'mk-%-test';

\echo 'Marketplace : 10 assertions, base laissee comme trouvee (les fixtures d auth restent).'
