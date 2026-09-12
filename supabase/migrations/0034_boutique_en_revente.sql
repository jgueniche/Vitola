-- =============================================================================
-- VITOLA — 0034 : la boutique en revente, la marketplace retirée
-- -----------------------------------------------------------------------------
-- QA humaine du 12 septembre 2026 : « on va laisser tomber la marketplace ; on
-- va plutôt partir du principe qu'on achète nous à des partenaires et puis on
-- revend derrière nous, donc adapter le fonctionnement de la boutique en
-- rapport ». C'est un changement de modèle, pas un réglage d'écran, et il
-- annule trois des six règles de l'ADR 0016.
--
-- **Ce qui change, en une phrase : personne ne vend ici que nous.**
--
-- 1. **Un vendeur ne publie plus rien, parce qu'il n'y a plus de vendeur.**
--    Les quatre policies qui donnaient à `vendors.owner_id` un droit sur
--    `products` disparaissent — insert, update, delete, et le select qui
--    montrait ses brouillons. L'admin garde les quatre siennes. L'ADR 0016 D3
--    (« le vendeur ne publie pas : son WITH CHECK n'aboutit qu'à draft ») et
--    sa conséquence assumée (« modifier, c'est retirer ») n'ont plus d'objet.
--
-- 2. **`owner_id` s'en va.** Le rattachement d'un compte à une vitrine était
--    tout le mécanisme de l'espace vendeur (ADR 0016 D2). Sans vitrine, une
--    colonne qui désigne un membre est une donnée personnelle qui ne sert à
--    rien — et une colonne qui ne sert à rien finit par servir à autre chose.
--    Son trigger de garde part avec elle.
--
-- 3. **La lecture publique d'un produit ne dépend plus d'un tiers.** C'était
--    la D4 : « suspendre coupe tout en un UPDATE », la vitrine et les produits
--    disparaissant ensemble. En revente c'est faux, et pas seulement
--    approximatif : le stock est à nous. Cesser d'acheter chez quelqu'un ne
--    dé-vend pas ce qu'on a déjà acheté, et une policy qui le ferait
--    retirerait de la vente des articles payés, en silence, le jour où un
--    partenaire ferme.
--
-- **Ce que `shop.vendors` devient, et pourquoi le nom reste.** La table garde
-- ses lignes et son nom : elle porte désormais le PARTENAIRE, celui à qui l'on
-- achète. Et « vendor » est le mot juste — en achats, un vendor EST un
-- fournisseur, celui qui vend *à* vous. Ce qui était faux, c'était le mot à
-- l'écran : « espace vendeur », « vitrine du vendeur ». Ceux-là partent avec
-- les écrans. Il n'y a donc pas de dette de nommage à reporter ici.
--
-- **Ce que cela retire comme obligation, et il faut le dire.** L'art. 30 du
-- DSA — la traçabilité du professionnel — vise une plateforme qui permet à des
-- consommateurs de conclure un contrat avec un TIERS professionnel. En
-- revente, le professionnel c'est nous : l'obligation change de nature plutôt
-- que de disparaître, et devient celle du droit de la consommation
-- (information précontractuelle, droit de rétractation art. L221-18), qui
-- s'arme avec la caisse. Les colonnes de traçabilité (`legal_name`,
-- `registration`, `address`, `contact_email`) restent : savoir à qui l'on
-- achète est une obligation comptable indépendante de la première.
--
-- **Ce qui ne bouge pas.** L'enum fermé de `products.category`, le trigger
-- lexical §2 sur les deux tables, `shop_enabled` comme coupe-circuit, le
-- panier-cookie et le paiement de démonstration. La frontière tabac n'est pas
-- touchée par un changement de qui encaisse.
-- =============================================================================

begin;

-- --- 1 · un vendeur n'écrit plus dans le catalogue ---------------------------
drop policy if exists products_insert_vendor on shop.products;
drop policy if exists products_update_vendor on shop.products;
drop policy if exists products_delete_vendor on shop.products;
drop policy if exists products_select_vendor on shop.products;

-- --- 2 · la lecture publique ne dépend plus d'un partenaire actif -----------
drop policy if exists products_select_published on shop.products;

create policy products_select_published on shop.products
  for select
  to anon, authenticated
  using (status = 'published');

comment on policy products_select_published on shop.products is
  'A published product is readable by anybody. It used to also require an '
  'active vendor (ADR 0016, D4) — in a resale model that is wrong: the stock '
  'is ours, and ceasing to buy from a partner does not un-sell what we hold.';

-- --- 3 · plus de vitrine, plus de rattachement de compte --------------------
drop policy if exists vendors_select_active on shop.vendors;
drop policy if exists vendors_select_own on shop.vendors;
drop policy if exists vendors_update_own on shop.vendors;

drop trigger if exists vendors_protect_privileges on shop.vendors;
drop function if exists shop.tg_protect_vendor_privileges();

/* Deux policies de `storage.objects` lisent `owner_id` : le droit d'un vendeur
   à déposer le logo de sa vitrine et les photos de ses fiches. Elles partent
   explicitement plutôt que par un DROP ... CASCADE — un CASCADE retire ce
   qu'on n'a pas nommé, et sur des policies de stockage c'est exactement ce
   qu'on veut lire dans une migration. Les quatre policies `admin` du même
   bucket restent : c'est nous qui déposons les images, maintenant. */
drop policy if exists storage_shop_images_vendor_insert on storage.objects;
drop policy if exists storage_shop_images_vendor_delete on storage.objects;

alter table shop.vendors drop column if exists owner_id;

comment on table shop.vendors is
  'A PARTNER we buy from — a supplier, which is what "vendor" means in '
  'procurement. Not a seller on the platform: the marketplace was dropped on '
  '12 septembre 2026 (QA) and nobody sells here but us. Admin-only, never '
  'exposed to a visitor: a supplier is who we buy from, which is our business '
  'and not the shopfront''s. legal_name/registration/address/contact_email '
  'stay because knowing who one buys from is an accounting obligation '
  'independent of the DSA art. 30 one, which resale moves onto us.';

-- --- 4 · un produit peut changer de partenaire ------------------------------
-- `vendor_id` était dans le GRANT INSERT et dans aucun GRANT UPDATE : « un
-- produit ne change pas de vendeur », qui était juste quand le vendeur était
-- l'auteur de la fiche. En revente, racheter le même article ailleurs est
-- ordinaire, et la fiche est la nôtre dans les deux cas.
alter table shop.products alter column vendor_id drop not null;
grant update (vendor_id) on shop.products to authenticated;

comment on column shop.products.vendor_id is
  'The partner this item was bought from, or null when it is not recorded. '
  'Internal: no screen shows it to a visitor. Updatable by an admin since '
  '0034 — re-buying the same item elsewhere is ordinary in resale, and the '
  'sheet is ours either way.';

-- --- Auto-contrôle -----------------------------------------------------------
do $$
declare
  n integer;
begin
  -- Aucune policy ne doit plus nommer owner_id : c'en serait une qui
  -- s'évalue sur une colonne disparue, donc une erreur à la première lecture.
  select count(*) into n from pg_policies
   where schemaname = 'shop'
     and (coalesce(qual, '') like '%owner_id%' or coalesce(with_check, '') like '%owner_id%');
  if n <> 0 then
    raise exception 'VITOLA_MIGRATION_INCOMPLETE: % policy(ies) de shop citent encore owner_id', n;
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'shop' and table_name = 'vendors' and column_name = 'owner_id'
  ) then
    raise exception 'VITOLA_MIGRATION_INCOMPLETE: shop.vendors.owner_id est encore là';
  end if;

  -- Un visiteur ne lit plus la table des partenaires. C'est la moitié de la
  -- décision : un fournisseur n'est pas une vitrine.
  if exists (
    select 1 from pg_policies
     where schemaname = 'shop' and tablename = 'vendors' and 'anon' = any (roles)
  ) then
    raise exception 'VITOLA_SCOPE_GAP: une policy de shop.vendors sert encore anon';
  end if;

  -- Et personne ne dépose plus d'image au nom d'un partenaire : les quatre
  -- policies admin du bucket restent, les deux policies vendeur non.
  select count(*) into n from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname like 'storage_shop_images_vendor%';
  if n <> 0 then
    raise exception 'VITOLA_MIGRATION_INCOMPLETE: % policy(ies) de dépôt vendeur subsistent', n;
  end if;

  select count(*) into n from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in ('storage_shop_images_read', 'storage_shop_images_insert',
                        'storage_shop_images_update', 'storage_shop_images_delete');
  if n <> 4 then
    raise exception
      'VITOLA_GRANT_GAP: le bucket shop-images n''a plus ses quatre policies (%)', n;
  end if;

  -- Et la lecture publique d'un produit ne dépend plus de personne.
  if exists (
    select 1 from pg_policies
     where schemaname = 'shop' and tablename = 'products'
       and policyname = 'products_select_published'
       and coalesce(qual, '') like '%vendors%'
  ) then
    raise exception
      'VITOLA_SCOPE_GAP: products_select_published dépend encore d''un vendeur actif';
  end if;

  -- Ce qui ne devait PAS bouger : la frontière tabac, sur les deux tables.
  select count(*) into n from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace ns on ns.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
   where ns.nspname = 'shop' and p.proname = 'tg_refuse_tobacco_listing'
     and not t.tgisinternal;
  if n < 2 then
    raise exception
      'VITOLA_COMPLIANCE_GAP: le trigger lexical §2 ne couvre plus les deux tables (%)', n;
  end if;

  if not exists (
    select 1 from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'shop' and c.relname in ('products', 'vendors')
       and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'VITOLA_RLS_GAP: shop a perdu sa RLS forcée';
  end if;

  raise notice 'VITOLA 0034 OK — la boutique revend, les partenaires sont des fournisseurs, la frontière §2 tient.';
end $$;

commit;
