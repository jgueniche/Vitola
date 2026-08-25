-- =============================================================================
-- VITOLA — 0022 : la marketplace d'accessoires (ADR 0016)
-- -----------------------------------------------------------------------------
-- Applique l'ADR 0016, acceptée le 25 août 2026 (GO du porteur) :
--   docs/adr/0016-la-marketplace-d-accessoires.md
--
-- Le modèle cible est celui d'Amazon, à deux entrées : la recherche
-- transversale sur tous les produits publiés, ET une vitrine par vendeur. Le
-- vendeur (qui vend, vendor_id) et la marque d'accessoire (qui fabrique,
-- brand) sont deux colonnes — les marques d'accessoires ne touchent PAS
-- ref.brands, qui reste aux marques de cigares. Rien de monétaire ne se
-- construit (D7 ouverte) ; tout l'écran public vit derrière `shop_enabled`,
-- né ici, FERMÉ.
--
-- Les décisions, et où elles vivent dans ce fichier :
--   D1  L'entrée est humaine : vendors, insert admin seul, naissance
--       pending, traçabilité DSA art. 30 posée et nullable        → §2, §4, §7
--   D2  Le rattachement est vendors.owner_id, unique, hors échelle
--       has_min_role ; « ma boutique » est un prédicat d'une ligne → §4, §7
--   D3  Le vendeur ne publie pas : son WITH CHECK exige draft ;
--       submitted_at est la soumission, review_note le motif de
--       refus, deux triggers de garde tiennent les colonnes que le
--       grant ne sait pas séparer                                  → §3, §6, §7
--   D4  Le vendeur « Vitola » naît ici, active ; les produits
--       basculent dessus, vendor_id devient NOT NULL               → §5
--   D5  brand est une colonne, sous le trigger lexical             → §3, §4
--   D6  product_reviews : rien ne change, rien n'écrit             → (0021)
--
-- Ordre : §1 enum · §2 vendors · §3 garde-fous (lexical élargi, triggers de
--         garde) · §4 colonnes de products · §5 le premier vendeur · §6 grants
--         · §7 RLS · §8 storage · §9 drapeau · §10 auto-contrôle
-- =============================================================================

begin;

-- =============================================================================
-- §1 · ENUM
-- =============================================================================

-- `pending` : créé, pas encore ouvert — la naissance uniforme (0016, lieux).
-- `active` : la vitrine vit. `suspended` : coupé, réversible — et la coupure
-- retire aussi ses produits de la lecture publique (voir §7).
create type shop.vendor_status as enum ('pending', 'active', 'suspended');

-- =============================================================================
-- §2 · LA TABLE DES VENDEURS
-- -----------------------------------------------------------------------------
-- L'identité de vitrine (name, slug, description, logo, contact) et la
-- traçabilité DSA art. 30 (legal_name, registration, address), NULLABLE : la
-- contrainte dure « pas d'activation sans traçabilité » arrive avec la caisse
-- — l'imposer aujourd'hui exigerait un numéro au registre que la boutique
-- propre n'a pas (Q10), donc fabriquerait une donnée inventée dans une
-- colonne juridique (ADR 0016, D1).
-- =============================================================================

create table shop.vendors (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null,
  description   text,
  logo_path     text,
  contact_email text,
  contact_phone text,
  legal_name    text,
  registration  text,
  address       text,
  status        shop.vendor_status not null default 'pending',
  -- The one account that manages this shopfront (ADR 0016, D2). Not a role:
  -- a vendor is neither above nor below a member. `set null` because a GDPR
  -- erasure of the manager must not take the catalogue with it — the admin
  -- re-attaches or suspends an orphaned vendor.
  owner_id      uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint vendors_name_len          check (length(name) between 2 and 120),
  constraint vendors_slug_format       check (slug = public.slugify(slug) and length(slug) between 1 and 160),
  constraint vendors_description_len   check (description is null or length(description) <= 2000),
  constraint vendors_contact_email_len check (contact_email is null or length(contact_email) <= 320),
  constraint vendors_contact_phone_len check (contact_phone is null or length(contact_phone) <= 40),
  constraint vendors_legal_name_len    check (legal_name is null or length(legal_name) <= 200),
  constraint vendors_registration_len  check (registration is null or length(registration) <= 40),
  constraint vendors_address_len       check (address is null or length(address) <= 500),
  constraint vendors_logo_in_bucket    check (logo_path is null or logo_path ~ '^vendors/')
);

comment on table shop.vendors is
  'ADR 0016: who sells. Human-gated — the admin creates and activates, no '
  'self-service signup. Traceability columns are the DSA art. 30 collection; '
  'the hard CHECK that active requires them ships with the checkout.';

create unique index vendors_slug_key on shop.vendors (slug);
-- One account manages at most one shopfront in v1 (D2). The day a shop needs
-- several hands, this column becomes a link table — one migration.
create unique index vendors_owner_key on shop.vendors (owner_id) where owner_id is not null;

create trigger vendors_set_updated_at
  before update on shop.vendors
  for each row execute function public.tg_set_updated_at();

-- =============================================================================
-- §3 · LES GARDE-FOUS
-- -----------------------------------------------------------------------------
-- 3a. Le trigger lexical de la 0021, élargi : il couvre désormais `brand`
--     (une marque d'accessoire nommée « Habanos » est exactement ce que le §2
--     interdit d'afficher) et la table `vendors` (name + description). Une
--     seule fonction, un seul lexique — la branche se choisit sur
--     TG_TABLE_NAME, et les champs de NEW sont résolus à l'exécution, donc la
--     branche non prise ne lit jamais un champ absent.
--     tests/compliance/shop-lexicon-drift.test.ts lit la DERNIÈRE définition
--     à travers les migrations (la leçon du CHECK de mod.reports).
-- =============================================================================

create or replace function shop.tg_refuse_tobacco_listing()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  compounds constant text[] := array[
    'coupe-cigare',
    'coupe cigare',
    'coupe-cigares',
    'coupe cigares',
    'porte-cigare',
    'porte-cigares',
    'etui a cigare',
    'etui a cigares',
    'cave a cigare',
    'cave a cigares',
    'cendrier a cigare',
    'cendrier a cigares',
    'briquet a cigare',
    'briquet a cigares',
    'humidificateur a cigare',
    'humidificateur a cigares',
    'perce-cigare',
    'perce cigare',
    'cigar cutter',
    'cigar case',
    'cigar ashtray',
    'cigar humidor'
  ];
  forbidden constant text[] := array[
    'cigare',
    'cigares',
    'cigarillo',
    'cigarillos',
    'havane',
    'habano',
    'habanos',
    'tabac',
    'tobacco',
    'cigarette',
    'puro',
    'puros',
    'vitole',
    'boite de 25',
    'boite de 10'
  ];
  remaining text;
  compound text;
  term text;
begin
  if tg_table_name = 'vendors' then
    remaining := coalesce(new.name, '') || ' ' || coalesce(new.description, '');
  else
    remaining := coalesce(new.title, '') || ' ' || coalesce(new.brand, '')
              || ' ' || coalesce(new.description, '');
  end if;

  remaining := lower(public.immutable_unaccent(remaining));
  remaining := replace(replace(remaining, '''', ' '), '’', ' ');
  remaining := regexp_replace(remaining, '\s+', ' ', 'g');

  foreach compound in array compounds loop
    remaining := replace(remaining, compound, ' ');
  end loop;

  foreach term in array forbidden loop
    if remaining ~ ('(^|\s)' || term || '($|\s|,|\.)') then
      raise exception 'VITOLA_TOBACCO_LISTING: « % »', term
        using errcode = '23514',
              hint = 'Le catalogue ne vend que des accessoires (§2). '
                     'Un composé d''accessoire légitime manque peut-être au lexique.';
    end if;
  end loop;

  return new;
end;
$$;

-- CREATE OR REPLACE garde les ACL de la 0021 (tout EXECUTE révoqué) ; le
-- déclenchement d'un trigger ne lit pas ces ACL, seul un appel direct le fait.

drop trigger products_refuse_tobacco on shop.products;

create trigger vendors_refuse_tobacco
  before insert or update of name, description on shop.vendors
  for each row execute function shop.tg_refuse_tobacco_listing();

-- (rebranché en §4, une fois la colonne brand née)

-- =============================================================================
-- 3b. Les triggers de garde : un grant de colonne ne sait pas distinguer deux
--     rôles applicatifs du même rôle PostgreSQL, donc `vendors.status`,
--     `vendors.owner_id` et `products.review_note` sont dans le GRANT UPDATE
--     et gardés ici — le motif exact de tg_protect_profile_privileges (0009),
--     avec sa leçon : le prédicat de privilège est INLINE, jamais un appel à
--     une fonction fermée aux clients, et le trigger reste SECURITY INVOKER
--     (le passer en DEFINER rendrait current_user = postgres, donc le
--     garde-fou sauté pour tout le monde). `has_min_role()` est accordée à
--     authenticated depuis la 0002 : un trigger en droits d'appelant peut
--     l'appeler.
-- =============================================================================

create or replace function shop.tg_protect_vendor_privileges()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  jwt_role text;
begin
  begin
    jwt_role := coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
      ''
    );
  exception when others then
    jwt_role := '';
  end;

  if jwt_role = 'service_role'
     or current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  if public.has_min_role('admin') then
    return new;
  end if;

  if new.status is distinct from old.status then
    raise exception 'VITOLA_FORBIDDEN: vendors.status is admin-only' using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'VITOLA_FORBIDDEN: vendors.owner_id is admin-only' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function shop.tg_protect_vendor_privileges()
  from public, anon, authenticated, service_role;

create trigger vendors_protect_privileges
  before update on shop.vendors
  for each row execute function shop.tg_protect_vendor_privileges();

create or replace function shop.tg_protect_product_review_note()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  jwt_role text;
begin
  begin
    jwt_role := coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
      ''
    );
  exception when others then
    jwt_role := '';
  end;

  if jwt_role = 'service_role'
     or current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  if public.has_min_role('admin') then
    return new;
  end if;

  if new.review_note is distinct from old.review_note then
    raise exception 'VITOLA_FORBIDDEN: products.review_note is admin-only' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function shop.tg_protect_product_review_note()
  from public, anon, authenticated, service_role;

-- =============================================================================
-- §4 · LES COLONNES DE PRODUCTS
-- -----------------------------------------------------------------------------
-- vendor_id : qui vend. brand : qui fabrique (D5 — une colonne, pas une
-- table ; le seuil des ~200 produits de l'ADR 0015 rouvrira la question).
-- submitted_at : la soumission à relecture — pas un quatrième statut, donc
-- pas d'ALTER TYPE ; la file admin est `status = 'draft' AND submitted_at IS
-- NOT NULL`, du plus ancien au plus récent. review_note : le motif d'un
-- refus, lisible du vendeur, écrit par l'admin seul (trigger de garde).
-- =============================================================================

alter table shop.products
  add column vendor_id    uuid references shop.vendors(id) on delete restrict,
  add column brand        text,
  add column submitted_at timestamptz,
  add column review_note  text;

alter table shop.products
  add constraint products_brand_len       check (brand is null or length(brand) between 2 and 80),
  add constraint products_review_note_len check (review_note is null or length(review_note) <= 500);

comment on column shop.products.vendor_id is
  'ADR 0016: who sells this. NOT NULL after backfill, in no UPDATE grant — a '
  'product does not change vendor (the reviews.user_id rule).';
comment on column shop.products.brand is
  'ADR 0016 D5: who makes this. Facet value, under the tobacco lexicon '
  'trigger. Not ref.brands — that schema is cigar brands only.';
comment on column shop.products.submitted_at is
  'ADR 0016 D3: set by the vendor to ask for review, cleared on refusal or '
  'publication. The admin queue orders by it; forging it reorders a queue one '
  'human reads, and publishes nothing.';

create trigger products_refuse_tobacco
  before insert or update of title, description, brand on shop.products
  for each row execute function shop.tg_refuse_tobacco_listing();

create trigger products_protect_review_note
  before update of review_note on shop.products
  for each row execute function shop.tg_protect_product_review_note();

create index products_vendor_status_idx on shop.products (vendor_id, status);

-- =============================================================================
-- §5 · LE PREMIER VENDEUR
-- -----------------------------------------------------------------------------
-- La boutique propre devient le premier vendeur (D4) : active, sans
-- owner_id — elle se gère depuis /admin/boutique par les policies admin,
-- jamais par l'espace vendeur. Rien ne se refait : les produits existants
-- basculent, puis vendor_id devient NOT NULL.
-- =============================================================================

insert into shop.vendors (name, slug, status, description)
values ('Vitola', 'vitola', 'active',
        'La boutique de la maison : les accessoires que nous choisissons et '
        'vendons nous-mêmes.')
on conflict do nothing;

update shop.products
   set vendor_id = (select id from shop.vendors where slug = 'vitola')
 where vendor_id is null;

alter table shop.products alter column vendor_id set not null;

-- =============================================================================
-- §6 · GRANTS
-- -----------------------------------------------------------------------------
-- vendors : la lecture pour tous (la RLS borne aux actifs) ; l'écriture
-- colonne par colonne. `status` est HORS du GRANT INSERT — un vendeur naît
-- pending, uniformément — et DANS le GRANT UPDATE, gardé par le trigger de
-- 3b, comme owner_id. id, slug (immuable après la naissance), created_at et
-- updated_at ne s'écrivent jamais à la main.
-- products : vendor_id s'insère et ne se modifie jamais ; review_note ne
-- s'insère pas (un produit naît sans motif de refus) et se modifie sous le
-- trigger de garde ; submitted_at se pose et se retire (vendeur et admin).
-- service_role lit tout (défauts de schéma de la 0021 — export RGPD) et
-- n'écrit rien.
-- =============================================================================

grant select on shop.vendors to anon, authenticated, service_role;

grant insert (name, slug, description, logo_path, contact_email, contact_phone,
              legal_name, registration, address, owner_id)
  on shop.vendors to authenticated;

grant update (name, description, logo_path, contact_email, contact_phone,
              legal_name, registration, address, status, owner_id)
  on shop.vendors to authenticated;

grant delete on shop.vendors to authenticated;

grant insert (vendor_id, brand) on shop.products to authenticated;
grant update (brand, submitted_at, review_note) on shop.products to authenticated;

-- =============================================================================
-- §7 · ROW LEVEL SECURITY
-- =============================================================================

alter table shop.vendors enable row level security;
alter table shop.vendors force row level security;

-- La vitrine publique : seuls les vendeurs actifs existent pour le public.
-- Un pending ou un suspended répond 404 — jamais « accès refusé ».
create policy vendors_select_active on shop.vendors
  for select to anon, authenticated
  using (status = 'active');

create policy vendors_select_own on shop.vendors
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy vendors_select_admin on shop.vendors
  for select to authenticated
  using ((select public.has_min_role('admin')));

-- D1 : l'entrée est humaine. Aucune inscription libre, par aucun écran.
create policy vendors_insert_admin on shop.vendors
  for insert to authenticated
  with check ((select public.has_min_role('admin')));

-- Le vendeur édite SA vitrine (description, logo, contact, traçabilité) ;
-- status et owner_id sont dans le grant mais tenus par le trigger de 3b.
create policy vendors_update_own on shop.vendors
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy vendors_update_admin on shop.vendors
  for update to authenticated
  using ((select public.has_min_role('admin')))
  with check ((select public.has_min_role('admin')));

-- La FK des produits est ON DELETE RESTRICT : supprimer un vendeur est le
-- geste rare d'une boutique vide ; suspendre est le verbe normal.
create policy vendors_delete_admin on shop.vendors
  for delete to authenticated
  using ((select public.has_min_role('admin')));

-- ---------------------------------------------------------------------------
-- products : la lecture publique exige désormais un vendeur ACTIF — suspendre
-- un vendeur coupe sa vitrine ET retire ses produits de la recherche en un
-- UPDATE d'une ligne. L'EXISTS est soumis à la RLS de vendors (le mécanisme
-- de cigar_images) ; anon a le SELECT sur vendors, donc la branche s'évalue
-- (la leçon de reviews/review_shares).
-- ---------------------------------------------------------------------------

drop policy products_select_published on shop.products;

create policy products_select_published on shop.products
  for select to anon, authenticated
  using (
    status = 'published'
    and exists (
      select 1 from shop.vendors v
      where v.id = shop.products.vendor_id and v.status = 'active'
    )
  );

-- « Mes produits » : le vendeur voit tout ce qui est à sa boutique, quel que
-- soit le statut — ses brouillons, ses soumis, ses publiés, ses archivés.
create policy products_select_vendor on shop.products
  for select to authenticated
  using (
    exists (
      select 1 from shop.vendors v
      where v.id = shop.products.vendor_id and v.owner_id = (select auth.uid())
    )
  );

-- D3 : le WITH CHECK est la barrière. Un vendeur ne peut ni créer ni amener
-- une ligne vers published ou archived, quelle que soit la requête forgée —
-- publier est le geste de l'admin. `shop.products.status` est qualifié : une
-- policy résout un nom nu dans la portée la plus interne, et vendors a aussi
-- une colonne status (la leçon de posts_insert, P3).
create policy products_insert_vendor on shop.products
  for insert to authenticated
  with check (
    shop.products.status = 'draft'
    and created_by = (select auth.uid())
    and exists (
      select 1 from shop.vendors v
      where v.id = shop.products.vendor_id
        and v.owner_id = (select auth.uid())
        and v.status = 'active'
    )
  );

-- Modifier, c'est retirer (ADR 0016, D3) : l'UPDATE d'un vendeur ne peut
-- aboutir qu'à un brouillon — corriger une fiche publiée la repasse donc en
-- relecture. Et il peut TOUJOURS retirer sa fiche de la vente (published →
-- draft passe le USING puis le WITH CHECK).
create policy products_update_vendor on shop.products
  for update to authenticated
  using (
    exists (
      select 1 from shop.vendors v
      where v.id = shop.products.vendor_id
        and v.owner_id = (select auth.uid())
        and v.status = 'active'
    )
  )
  with check (
    shop.products.status = 'draft'
    and exists (
      select 1 from shop.vendors v
      where v.id = shop.products.vendor_id
        and v.owner_id = (select auth.uid())
        and v.status = 'active'
    )
  );

-- Un vendeur ne supprime que ses brouillons : une fiche publiée se retire
-- d'abord (update → draft), puis se supprime — deux gestes, chacun visible.
create policy products_delete_vendor on shop.products
  for delete to authenticated
  using (
    shop.products.status = 'draft'
    and exists (
      select 1 from shop.vendors v
      where v.id = shop.products.vendor_id
        and v.owner_id = (select auth.uid())
        and v.status = 'active'
    )
  );

-- =============================================================================
-- §8 · STORAGE
-- -----------------------------------------------------------------------------
-- Le vendeur téléverse le logo de SA vitrine (vendors/<son id>/…) et les
-- images de SES produits (products/<id d'un de ses produits>/…), rien
-- d'autre. `objects.name` est qualifié PARTOUT : vendors a une colonne name,
-- et un nom nu se résoudrait dans la portée la plus interne — le bug de
-- posts_insert, qui aurait ici ouvert le bucket entier.
-- =============================================================================

create policy storage_shop_images_vendor_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'shop-images'
    and (
      exists (
        select 1 from shop.vendors v
        where v.owner_id = (select auth.uid()) and v.status = 'active'
          and objects.name like 'vendors/' || v.id || '/%'
      )
      or exists (
        select 1
        from shop.products p
        join shop.vendors v on v.id = p.vendor_id
        where v.owner_id = (select auth.uid()) and v.status = 'active'
          and objects.name like 'products/' || p.id || '/%'
      )
    )
  );

create policy storage_shop_images_vendor_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'shop-images'
    and (
      exists (
        select 1 from shop.vendors v
        where v.owner_id = (select auth.uid()) and v.status = 'active'
          and objects.name like 'vendors/' || v.id || '/%'
      )
      or exists (
        select 1
        from shop.products p
        join shop.vendors v on v.id = p.vendor_id
        where v.owner_id = (select auth.uid()) and v.status = 'active'
          and objects.name like 'products/' || p.id || '/%'
      )
    )
  );

-- =============================================================================
-- §9 · LE DRAPEAU
-- -----------------------------------------------------------------------------
-- Né FERMÉ, dans la migration, avec le code qui le lit (admin_set_flag
-- refuse une clé inconnue). L'ouvrir est le geste d'ouverture commerciale du
-- porteur — un acte tracé, pas un déploiement. C'est lui qui tient le
-- renversement conscient de l'ADR 0015 D1 (« aucune route publique »).
-- =============================================================================

insert into public.feature_flags (key, enabled, description, payload) values
  ('shop_enabled', false,
   'La boutique publique (ADR 0016) : /boutique, fiches produit et vitrines '
   'de vendeurs. Fermé jusqu''à l''ouverture commerciale — l''ouvrir est le '
   'geste du porteur, tracé par admin_set_flag.',
   '{}'::jsonb)
on conflict (key) do nothing;

-- =============================================================================
-- §10 · AUTO-CONTRÔLE
-- =============================================================================

do $$
declare
  offender text;
  n integer;
begin
  -- 1. RLS forcée et au moins une policy sur toute table de shop.
  select string_agg(c.relname, ', ') into offender
    from pg_class c
    join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'shop' and c.relkind = 'r'
     and (not c.relrowsecurity or not c.relforcerowsecurity
          or not exists (select 1 from pg_policy p where p.polrelid = c.oid));
  if offender is not null then
    raise exception 'VITOLA_RLS_GAP: table(s) shop sans RLS forcee ou sans policy : %', offender;
  end if;

  -- 2. D3 : le WITH CHECK vendeur exige draft — les deux policies vendeur qui
  --    écrivent portent le prédicat, lu depuis le catalogue et non supposé.
  select count(*) into n
    from pg_policies
   where schemaname = 'shop' and tablename = 'products'
     and policyname in ('products_insert_vendor', 'products_update_vendor')
     and with_check like '%''draft''%';
  if n <> 2 then
    raise exception 'VITOLA_RLS_GAP: le WITH CHECK vendeur n exige plus draft — un vendeur peut publier';
  end if;

  -- 3. La lecture publique des produits exige un vendeur actif.
  select count(*) into n
    from pg_policies
   where schemaname = 'shop' and tablename = 'products'
     and policyname = 'products_select_published'
     and qual like '%vendors%' and qual like '%active%';
  if n <> 1 then
    raise exception 'VITOLA_RLS_GAP: products_select_published ne lit plus le statut du vendeur';
  end if;

  -- 4. Le trigger lexical est branché sur les DEUX tables, et sa définition
  --    couvre brand — sans quoi une marque d'accessoire tabac passerait.
  if (select count(*) from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
      where (c.relname, t.tgname) in (('products', 'products_refuse_tobacco'),
                                      ('vendors', 'vendors_refuse_tobacco'))) <> 2 then
    raise exception 'VITOLA_TOBACCO_GAP: le trigger lexical manque sur products ou vendors';
  end if;
  if position('new.brand' in pg_get_functiondef('shop.tg_refuse_tobacco_listing()'::regprocedure)) = 0 then
    raise exception 'VITOLA_TOBACCO_GAP: le trigger lexical ne lit pas brand';
  end if;

  -- 5. Les deux triggers de garde sont branchés, et SECURITY INVOKER — en
  --    DEFINER, current_user vaudrait postgres et la garde sauterait (0009).
  select string_agg(p.proname, ', ') into offender
    from pg_proc p
    join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'shop'
     and p.proname in ('tg_protect_vendor_privileges', 'tg_protect_product_review_note')
     and p.prosecdef;
  if offender is not null then
    raise exception 'VITOLA_GUARD_GAP: trigger de garde passe en SECURITY DEFINER : %', offender;
  end if;
  if (select count(*) from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
      where (c.relname, t.tgname) in (('vendors', 'vendors_protect_privileges'),
                                      ('products', 'products_protect_review_note'))) <> 2 then
    raise exception 'VITOLA_GUARD_GAP: un trigger de garde n est pas branche';
  end if;

  -- 6. Les colonnes fermées le restent : vendor_id de products hors de tout
  --    UPDATE, review_note hors de tout INSERT, status de vendors hors de
  --    tout INSERT, et les colonnes de naissance hors de tout grant.
  select string_agg(table_name || '.' || column_name || ':' || privilege_type, ', ')
    into offender
    from information_schema.column_privileges
   where table_schema = 'shop'
     and grantee in ('anon', 'authenticated')
     and ((table_name = 'products' and column_name = 'vendor_id' and privilege_type = 'UPDATE')
       or (table_name = 'products' and column_name = 'review_note' and privilege_type = 'INSERT')
       or (table_name = 'vendors' and column_name = 'status' and privilege_type = 'INSERT')
       or (table_name = 'vendors' and column_name in ('id', 'slug', 'created_at', 'updated_at')
           and privilege_type = 'UPDATE'));
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: colonne(s) fermee(s) devenue(s) ecrivable(s) : %', offender;
  end if;

  -- 7. D4 : le premier vendeur existe, actif, et aucun produit n'est orphelin.
  if not exists (select 1 from shop.vendors where slug = 'vitola' and status = 'active') then
    raise exception 'VITOLA_SHAPE_GAP: le vendeur maison manque ou n est pas actif';
  end if;
  if exists (select 1 from pg_attribute
              where attrelid = 'shop.products'::regclass
                and attname = 'vendor_id' and not attnotnull) then
    raise exception 'VITOLA_SHAPE_GAP: products.vendor_id est redevenu nullable';
  end if;

  -- 8. La clé de service lit vendors (export RGPD — owner_id) et n'y écrit pas.
  if not has_table_privilege('service_role', 'shop.vendors', 'SELECT')
     or has_table_privilege('service_role', 'shop.vendors', 'INSERT')
     or has_table_privilege('service_role', 'shop.vendors', 'DELETE') then
    raise exception 'VITOLA_GRANT_GAP: droits service_role incorrects sur shop.vendors';
  end if;

  -- 9. Le drapeau est né, et né fermé.
  if not exists (select 1 from public.feature_flags where key = 'shop_enabled' and not enabled) then
    raise exception 'VITOLA_SHAPE_GAP: shop_enabled manque ou est ne ouvert';
  end if;

  -- 10. D6 : les avis restent sans porte d'écriture (la D3 de l'ADR 0015).
  select count(*) into n
    from information_schema.table_privileges
   where table_schema = 'shop' and table_name = 'product_reviews'
     and grantee in ('anon', 'authenticated')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  if n <> 0 then
    raise exception 'VITOLA_GRANT_GAP: product_reviews a gagne un droit d ecriture client';
  end if;

  raise notice
    '0022 : le vendeur existe et ne publie pas, la maison est le premier vendeur, et le drapeau attend l ouverture.';
end;
$$;

commit;
