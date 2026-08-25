-- =============================================================================
-- VITOLA — 0021 : le catalogue de la boutique (ADR 0015)
-- -----------------------------------------------------------------------------
-- Applique l'ADR 0015, acceptée le 25 août 2026 :
--   docs/adr/0015-le-catalogue-avant-la-caisse.md
--
-- Le catalogue naît AVANT la caisse : l'ADR 0003 (acceptée : Checkout, boutique
-- propre) attend ses clés Stripe, et le porteur alimente son catalogue sans
-- développeur depuis /admin/boutique. Aucune route publique ne naît ici — un
-- rayon sans caisse est une promesse à l'écran.
--
-- Les décisions, et où elles vivent dans ce fichier :
--   D1  Catalogue maintenant, caisse aux clés                  → tout le fichier
--   D2  Trois barrières anti-tabac : l'enum fermé, le trigger  → §2, §3
--       (lexique de lib/compliance/tobacco-terms.ts, gardé par
--       tests/compliance/shop-lexicon-drift.test.ts), l'écran
--   D3  product_reviews existe, RIEN ne peut y écrire          → §4, §7
--   D4  admin seul écrit, par la session — pas de porte        → §6, §7
--
-- shop est un schéma NEUF : l'amorçage Supabase l'ignore (leçons 0005 et
-- 0007), donc chaque grant s'écrit ici, service_role compris — l'export RGPD
-- lira product_reviews le jour où une ligne existe. Le schéma doit aussi être
-- exposé à PostgREST (db_schema += shop) : réglage de console, documenté dans
-- docs/setup/supabase.md, qu'aucune migration ne sait rejouer.
--
-- Ordre : §1 schéma · §2 enums · §3 garde-fou · §4 tables · §5 index ·
--         §6 grants · §7 RLS · §8 storage · §9 auto-contrôle
-- =============================================================================

begin;

-- =============================================================================
-- §1 · LE SCHÉMA
-- =============================================================================

create schema if not exists shop;

grant usage on schema shop to anon, authenticated, service_role;

-- L'export RGPD lit tout, n'écrit rien — le régime de ref depuis la 0007.
alter default privileges in schema shop grant select on tables to service_role;

-- PostgreSQL accorde EXECUTE à PUBLIC sur toute fonction, en silence (0002).
-- Un schéma neuf ferme la porte d'avance, plutôt qu'une fonction à la fois.
alter default privileges in schema shop revoke execute on functions from public;

-- =============================================================================
-- §2 · ENUMS
-- =============================================================================

-- La vraie barrière du §2 : il n'existe AUCUNE valeur tabac à choisir. `autre`
-- n'affaiblit rien — la catégorie ne vend pas, elle range — et évite une
-- migration au premier accessoire inclassable.
create type shop.product_category as enum (
  'coupe', 'briquet', 'cendrier', 'cave', 'hygrometre',
  'etui', 'humidification', 'livre', 'entretien', 'autre'
);

-- `published` veut dire « prêt pour l'ouverture » : la policy de lecture
-- publique existe dès aujourd'hui pour que /boutique n'ait rien à changer le
-- jour où Checkout arrive.
create type shop.product_status as enum ('draft', 'published', 'archived');

-- =============================================================================
-- §3 · LE GARDE-FOU LEXICAL (§5.8)
-- -----------------------------------------------------------------------------
-- Le lexique de lib/compliance/tobacco-terms.ts, dupliqué en SQL — une
-- duplication de LOGIQUE, assumée par l'ADR 0015 et gardée par
-- tests/compliance/shop-lexicon-drift.test.ts dans les deux sens. L'ordre est
-- la subtilité mesurée par l'ADR 0005 : les composés d'accessoires (dont les
-- noms contiennent le mot) se retirent AVANT le test des termes interdits.
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
  remaining := lower(public.immutable_unaccent(
    coalesce(new.title, '') || ' ' || coalesce(new.description, '')
  ));
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

-- =============================================================================
-- §4 · TABLES
-- =============================================================================

create table shop.products (
  id           uuid primary key default gen_random_uuid(),
  category     shop.product_category not null,
  title        text not null,
  slug         text not null,
  description  text,
  price_eur    numeric(8,2) not null,
  stock_qty    integer not null default 0,
  image_path   text,
  status       shop.product_status not null default 'draft',
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint products_title_len       check (length(title) between 2 and 140),
  constraint products_slug_format     check (slug = public.slugify(slug) and length(slug) between 1 and 160),
  constraint products_description_len check (description is null or length(description) <= 4000),
  -- Un accessoire à zéro euro est un cadeau, pas un produit ; un prix à cinq
  -- chiffres est une faute de frappe qu'on préfère au panier.
  constraint products_price_range     check (price_eur > 0 and price_eur < 100000),
  -- Déclaratif jusqu'à Checkout (ADR 0015) ; le décompte transactionnel
  -- arrive avec la première vente.
  constraint products_stock_positive  check (stock_qty >= 0),
  constraint products_image_in_bucket check (image_path is null or image_path ~ '^products/')
);

revoke execute on function shop.tg_refuse_tobacco_listing() from public, anon, authenticated, service_role;

comment on table shop.products is
  'ADR 0015: the catalogue, fed from /admin/boutique before the checkout '
  'exists. Accessories only — the closed category enum is the §2 barrier, the '
  'trigger below the second net.';

create unique index products_slug_key on shop.products (slug);

create trigger products_set_updated_at
  before update on shop.products
  for each row execute function public.tg_set_updated_at();

create trigger products_refuse_tobacco
  before insert or update of title, description on shop.products
  for each row execute function shop.tg_refuse_tobacco_listing();

-- Les avis clients (D3) : déclarés partout où une donnée personnelle se
-- déclare, et SANS aucune porte d'écriture — l'écriture s'ouvre avec la
-- caisse, qui tranchera « achat vérifié » et ajoutera la surface DSA.
create table shop.product_reviews (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references shop.products(id) on delete cascade,
  author_id     uuid not null references auth.users(id) on delete cascade,
  rating        smallint not null,
  body          text,
  hidden_at     timestamptz,
  hidden_by     uuid references auth.users(id) on delete set null,
  hidden_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint product_reviews_rating_range check (rating between 1 and 5),
  constraint product_reviews_body_len     check (body is null or length(body) <= 2000),
  constraint product_reviews_one_per_member unique (product_id, author_id),
  -- Les trois ensemble ou aucune : un masquage sans motif ni signature est
  -- l'état que le DSA interdit (le régime de comments, 0004).
  constraint product_reviews_hidden_all_or_none check (
    (hidden_at is null and hidden_by is null and hidden_reason is null)
    or (hidden_at is not null and hidden_by is not null and hidden_reason is not null)
  )
);

comment on table shop.product_reviews is
  'ADR 0015 D3: exists so the GDPR inventory is true from day one; no client '
  'may write until P7 decides verified-purchase and wires the DSA surface.';

create trigger product_reviews_set_updated_at
  before update on shop.product_reviews
  for each row execute function public.tg_set_updated_at();

-- =============================================================================
-- §5 · INDEX
-- =============================================================================

create index products_status_category_idx on shop.products (status, category);
create index product_reviews_product_idx  on shop.product_reviews (product_id, created_at desc);

-- =============================================================================
-- §6 · GRANTS
-- =============================================================================

revoke all on all tables in schema shop from anon, authenticated;

grant select on shop.products, shop.product_reviews to anon, authenticated, service_role;

-- Colonne par colonne, la règle de posts : id et created_at aux défauts,
-- updated_at au trigger (l'écrire à la main lève 42501 — la leçon de la
-- bascule /100 ↔ /20), slug immuable après la naissance, created_by posé à
-- l'insertion et plus jamais.
grant insert (category, title, slug, description, price_eur, stock_qty, image_path, status, created_by)
  on shop.products to authenticated;
grant update (category, title, description, price_eur, stock_qty, image_path, status)
  on shop.products to authenticated;
grant delete on shop.products to authenticated;

-- product_reviews : AUCUN grant d'écriture, à personne. C'est la D3.

-- =============================================================================
-- §7 · ROW LEVEL SECURITY
-- =============================================================================

alter table shop.products enable row level security;
alter table shop.products force row level security;

create policy products_select_published on shop.products
  for select to anon, authenticated
  using (status = 'published');

create policy products_select_admin on shop.products
  for select to authenticated
  using ((select public.has_min_role('admin')));

create policy products_insert_admin on shop.products
  for insert to authenticated
  with check ((select public.has_min_role('admin')));

create policy products_update_admin on shop.products
  for update to authenticated
  using ((select public.has_min_role('admin')))
  with check ((select public.has_min_role('admin')));

create policy products_delete_admin on shop.products
  for delete to authenticated
  using ((select public.has_min_role('admin')));

alter table shop.product_reviews enable row level security;
alter table shop.product_reviews force row level security;

-- L'audience se déduit du produit par un EXISTS soumis à SA RLS (le mécanisme
-- de cigar_images, ligne 1230 de la 0001) ; un avis masqué reste lisible de
-- son auteur, qui doit pouvoir lire le motif (le régime des commentaires).
create policy product_reviews_select_visible on shop.product_reviews
  for select to anon, authenticated
  using (
    hidden_at is null
    and exists (select 1 from shop.products p where p.id = product_id)
  );

create policy product_reviews_select_own on shop.product_reviews
  for select to authenticated
  using (author_id = (select auth.uid()));

create policy product_reviews_select_moderator on shop.product_reviews
  for select to authenticated
  using ((select public.has_min_role('moderator')));

-- =============================================================================
-- §8 · STORAGE
-- =============================================================================

-- Privé, comme tout bucket du projet (§8 : « jamais de bucket public sauf
-- articles-media ») : l'admin écrit, la lecture passe par URL signée.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('shop-images', 'shop-images', false, 8388608,
   array['image/webp', 'image/jpeg', 'image/png', 'image/avif'])
on conflict (id) do nothing;

create policy storage_shop_images_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'shop-images');

create policy storage_shop_images_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'shop-images' and (select public.has_min_role('admin')));

create policy storage_shop_images_update on storage.objects
  for update to authenticated
  using (bucket_id = 'shop-images' and (select public.has_min_role('admin')))
  with check (bucket_id = 'shop-images' and (select public.has_min_role('admin')));

create policy storage_shop_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'shop-images' and (select public.has_min_role('admin')));

-- =============================================================================
-- §9 · AUTO-CONTRÔLE
-- =============================================================================

do $$
declare
  offender text;
  n integer;
begin
  -- 1. RLS forcée et au moins une policy, sur les deux tables.
  select string_agg(c.relname, ', ') into offender
    from pg_class c
    join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'shop' and c.relkind = 'r'
     and (not c.relrowsecurity or not c.relforcerowsecurity
          or not exists (select 1 from pg_policy p where p.polrelid = c.oid));
  if offender is not null then
    raise exception 'VITOLA_RLS_GAP: table(s) shop sans RLS forcee ou sans policy : %', offender;
  end if;

  -- 2. La barrière n°1 : aucune valeur de l'enum catégorie n'est un terme
  --    tabac. Comparaison au lexique du trigger, pas à une liste recopiée.
  select string_agg(e.enumlabel, ', ') into offender
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace s on s.oid = t.typnamespace
   where s.nspname = 'shop' and t.typname = 'product_category'
     and e.enumlabel in ('cigare','cigares','cigarillo','cigarillos','havane',
                         'habano','habanos','tabac','tobacco','cigarette',
                         'puro','puros','vitole');
  if offender is not null then
    raise exception 'VITOLA_TOBACCO_GAP: l enum categorie porte une valeur tabac : %', offender;
  end if;

  -- 3. La barrière n°2 est branchée, sur l'insertion ET la modification.
  if (select count(*) from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
      where c.relname = 'products' and t.tgname = 'products_refuse_tobacco') <> 1 then
    raise exception 'VITOLA_TOBACCO_GAP: le trigger lexical n est pas branche sur shop.products';
  end if;

  -- 4. D3 : personne n'écrit un avis. Aucun droit INSERT/UPDATE/DELETE client.
  select count(*) into n
    from information_schema.table_privileges
   where table_schema = 'shop' and table_name = 'product_reviews'
     and grantee in ('anon', 'authenticated')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  if n <> 0 then
    raise exception 'VITOLA_GRANT_GAP: product_reviews a un droit d ecriture client — la D3 est defaite';
  end if;

  -- 5. updated_at, slug et created_by restent hors du GRANT UPDATE de products.
  select string_agg(column_name, ', ') into offender
    from information_schema.column_privileges
   where table_schema = 'shop' and table_name = 'products'
     and grantee = 'authenticated' and privilege_type = 'UPDATE'
     and column_name in ('updated_at', 'slug', 'created_by', 'id', 'created_at');
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: colonne(s) fermee(s) de products devenue(s) modifiable(s) : %', offender;
  end if;

  -- 6. La clé de service lit le schéma entier (export RGPD) et n'y écrit pas.
  select string_agg(c.relname, ', ') into offender
    from pg_class c
    join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'shop' and c.relkind = 'r'
     and (not has_table_privilege('service_role', c.oid, 'SELECT')
          or has_table_privilege('service_role', c.oid, 'INSERT')
          or has_table_privilege('service_role', c.oid, 'DELETE'));
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: droits service_role incorrects sur : %', offender;
  end if;

  -- 7. Le bucket existe, et il est privé.
  if not exists (select 1 from storage.buckets where id = 'shop-images' and public = false) then
    raise exception 'VITOLA_SHAPE_GAP: le bucket shop-images manque ou est devenu public';
  end if;

  raise notice
    '0021 : le catalogue est ouvert a l admin, ferme au tabac par trois barrieres, et les avis attendent la caisse.';
end;
$$;

commit;
