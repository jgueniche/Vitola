-- =============================================================================
-- VITOLA — chargement du référentiel d'amorçage
-- -----------------------------------------------------------------------------
--   cd supabase/seed && psql -v ON_ERROR_STOP=1 -f seed.sql
--
-- Idempotent : rejouable autant de fois que nécessaire, la clé de rapprochement
-- étant le slug. Une ligne modifiée dans un CSV est mise à jour, pas dupliquée.
--
-- Tourne avec un rôle privilégié (migration / service_role), donc hors RLS.
-- Toutes les fiches cigares sont chargées en `draft` : rien n'est publié sans
-- relecture humaine. Voir PROVENANCE.md.
-- =============================================================================

\set ON_ERROR_STOP on

begin;

-- --- 1. Manufactures ---------------------------------------------------------
create temporary table _manufacturers (
  name text, slug text, country text, group_name text, notes text
) on commit drop;

\copy _manufacturers from '01_manufacturers.csv' with (format csv, header true)

insert into ref.manufacturers (name, slug, country, group_name, notes)
select name, slug, nullif(country, ''), nullif(group_name, ''), nullif(notes, '')
  from _manufacturers
on conflict (slug) do update
   set name       = excluded.name,
       country    = excluded.country,
       group_name = excluded.group_name,
       notes      = excluded.notes,
       updated_at = now();

-- --- 2. Marques ---------------------------------------------------------------
create temporary table _brands (
  name text, slug text, manufacturer_slug text, country text,
  founded_year text, is_cuban text, description text
) on commit drop;

\copy _brands from '02_brands.csv' with (format csv, header true)

insert into ref.brands (name, slug, manufacturer_id, country, founded_year, is_cuban, description)
select b.name,
       b.slug,
       m.id,
       nullif(b.country, ''),
       nullif(b.founded_year, '')::smallint,
       b.is_cuban::boolean,
       nullif(b.description, '')
  from _brands b
  left join ref.manufacturers m on m.slug = b.manufacturer_slug
on conflict (slug) do update
   set name            = excluded.name,
       manufacturer_id = excluded.manufacturer_id,
       country         = excluded.country,
       founded_year    = excluded.founded_year,
       is_cuban        = excluded.is_cuban,
       description     = excluded.description,
       updated_at      = now();

-- Une marque orpheline est une erreur de saisie, pas une donnée acceptable.
do $$
declare orphans int;
begin
  select count(*) into orphans
    from _brands b
    left join ref.manufacturers m on m.slug = b.manufacturer_slug
   where b.manufacturer_slug <> '' and m.id is null;
  if orphans > 0 then
    raise exception 'VITOLA_SEED: % marque(s) référencent une manufacture inconnue', orphans;
  end if;
end;
$$;

-- --- 3. Vitoles -----------------------------------------------------------------
create temporary table _vitolas (
  name_galera text, name_salida text, slug text,
  length_mm text, ring_gauge text, shape text, notes text
) on commit drop;

\copy _vitolas from '03_vitolas.csv' with (format csv, header true)

insert into ref.vitolas (name_galera, name_salida, slug, length_mm, ring_gauge, shape, notes)
select nullif(name_galera, ''),
       name_salida,
       slug,
       length_mm::smallint,
       ring_gauge::smallint,
       shape::ref.cigar_shape,
       nullif(notes, '')
  from _vitolas
on conflict (slug) do update
   set name_galera = excluded.name_galera,
       name_salida = excluded.name_salida,
       length_mm   = excluded.length_mm,
       ring_gauge  = excluded.ring_gauge,
       shape       = excluded.shape,
       notes       = excluded.notes,
       updated_at  = now();

-- --- 4. Cigares -------------------------------------------------------------------
create temporary table _cigars (
  brand_slug text, vitola_slug text, commercial_name text, slug text,
  origin_country text, wrapper_origin text, binder_origin text, filler_origins text,
  wrapper_shade text, strength text, release_type text, release_year text,
  status text, notes text,
  msrp_eur text, msrp_source text, msrp_effective_on text
) on commit drop;

\copy _cigars from '04_cigars.csv' with (format csv, header true)

do $$
declare orphans int;
begin
  select count(*) into orphans
    from _cigars c
    left join ref.brands b on b.slug = c.brand_slug
   where b.id is null;
  if orphans > 0 then
    raise exception 'VITOLA_SEED: % fiche(s) référencent une marque inconnue', orphans;
  end if;

  select count(*) into orphans
    from _cigars c
    left join ref.vitolas v on v.slug = c.vitola_slug
   where c.vitola_slug <> '' and v.id is null;
  if orphans > 0 then
    raise exception 'VITOLA_SEED: % fiche(s) référencent une vitole inconnue', orphans;
  end if;
end;
$$;

insert into ref.cigars (
  brand_id, vitola_id, commercial_name, slug, origin_country,
  wrapper_origin, binder_origin, filler_origins, wrapper_shade, strength,
  release_type, release_year, status, packaging,
  msrp_eur, msrp_source, msrp_effective_on
)
select b.id,
       v.id,
       c.commercial_name,
       c.slug,
       nullif(c.origin_country, ''),
       nullif(c.wrapper_origin, ''),
       nullif(c.binder_origin, ''),
       case when c.filler_origins = '' then '{}'::text[] else array[c.filler_origins] end,
       nullif(c.wrapper_shade, '')::ref.wrapper_shade,
       nullif(c.strength, '')::ref.strength,
       c.release_type::ref.release_type,
       nullif(c.release_year, '')::smallint,
       c.status::ref.entry_status,
       case when c.notes = '' then '{}'::jsonb
            else jsonb_build_object('seed_note', c.notes) end,
       nullif(c.msrp_eur, '')::numeric(10,2),
       nullif(c.msrp_source, ''),
       nullif(c.msrp_effective_on, '')::date
  from _cigars c
  join ref.brands b on b.slug = c.brand_slug
  left join ref.vitolas v on v.slug = nullif(c.vitola_slug, '')
on conflict (slug) do update
   set brand_id        = excluded.brand_id,
       vitola_id       = excluded.vitola_id,
       commercial_name = excluded.commercial_name,
       origin_country  = excluded.origin_country,
       wrapper_origin  = excluded.wrapper_origin,
       binder_origin   = excluded.binder_origin,
       filler_origins  = excluded.filler_origins,
       wrapper_shade   = excluded.wrapper_shade,
       strength        = excluded.strength,
       release_type    = excluded.release_type,
       release_year    = excluded.release_year,
       packaging       = excluded.packaging,
       msrp_eur          = excluded.msrp_eur,
       msrp_source       = excluded.msrp_source,
       msrp_effective_on = excluded.msrp_effective_on,
       updated_at        = now();

-- --- 5. Codes de boîte ---------------------------------------------------------------
create temporary table _box_codes (
  kind text, code text, factory_code text, month text, year text, notes text
) on commit drop;

\copy _box_codes from '05_box_codes.csv' with (format csv, header true)

insert into ref.box_codes (kind, code, factory_code, month, year, notes)
select kind::ref.box_code_kind,
       code,
       nullif(factory_code, ''),
       nullif(month, '')::smallint,
       nullif(year, '')::smallint,
       nullif(notes, '')
  from _box_codes
on conflict (kind, upper(code)) do update
   set factory_code = excluded.factory_code,
       month        = excluded.month,
       year         = excluded.year,
       notes        = excluded.notes,
       updated_at   = now();

-- --- 6. Roue des arômes ---------------------------------------------------------------
-- La seule section qui écrit dans `public` et non dans `ref` : ce n'est pas le
-- référentiel des cigares, c'est la nomenclature avec laquelle on les décrit
-- (§5.4). Elle vit ici plutôt que dans une migration parce que c'est du contenu
-- éditorial — il se relit, se corrige et se rejoue comme les CSV voisins, sans
-- migration à chaque libellé. Provenance : PROVENANCE.md, source D.
--
-- L'arbre tient en deux passes parce que `id` est `generated always as
-- identity` : on ne peut pas écrire de clé étrangère en dur dans un CSV, et on
-- ne veut pas. Les racines d'abord, les feuilles ensuite, rapprochées par slug.
--
-- `coalesce(parent_slug, '')` et non `parent_slug = ''` : en mode CSV, un champ
-- vide non quoté est lu comme NULL, pas comme une chaîne vide. Écrit à
-- l'identique, le filtre ne remontait aucune ligne — et les deux passes
-- inséraient zéro arôme sans rien signaler d'autre qu'un `INSERT 0 0`.
create temporary table _aromas (
  family text, slug text, label_fr text, label_en text, parent_slug text
) on commit drop;

\copy _aromas from '06_aroma_taxonomy.csv' with (format csv, header true)

-- Passe 1 : les onze familles. `parent_slug` vide = racine.
insert into public.aroma_taxonomy (family, slug, label_fr, label_en, parent_id)
select a.family::public.aroma_family, a.slug, a.label_fr, nullif(a.label_en, ''), null
  from _aromas a
 where coalesce(a.parent_slug, '') = ''
on conflict (slug) do update
   set family   = excluded.family,
       label_fr = excluded.label_fr,
       label_en = excluded.label_en;

-- Passe 2 : les descripteurs, rattachés à leur famille.
insert into public.aroma_taxonomy (family, slug, label_fr, label_en, parent_id)
select a.family::public.aroma_family, a.slug, a.label_fr, nullif(a.label_en, ''), p.id
  from _aromas a
  join public.aroma_taxonomy p on p.slug = a.parent_slug
 where coalesce(a.parent_slug, '') <> ''
on conflict (slug) do update
   set family    = excluded.family,
       label_fr  = excluded.label_fr,
       label_en  = excluded.label_en,
       parent_id = excluded.parent_id;

-- Un descripteur orphelin est une faute de frappe dans le CSV, pas une donnée.
-- Même garde-fou que pour une marque sans manufacture : on refuse plutôt que de
-- charger une roue à laquelle il manque une branche, en silence.
do $$
declare orphans int;
begin
  select count(*) into orphans
    from _aromas a
    left join public.aroma_taxonomy p on p.slug = a.parent_slug
   where coalesce(a.parent_slug, '') <> '' and p.id is null;
  if orphans > 0 then
    raise exception 'VITOLA_SEED: % arôme(s) référencent une famille inconnue', orphans;
  end if;

  -- Une feuille doit porter la famille de sa racine. Un descripteur rangé sous
  -- « Boisé » mais marqué `epice` fausserait tout regroupement par famille, et
  -- rien dans le schéma ne l'interdit : la contrainte est ici.
  select count(*) into orphans
    from public.aroma_taxonomy child
    join public.aroma_taxonomy parent on parent.id = child.parent_id
   where child.family <> parent.family;
  if orphans > 0 then
    raise exception 'VITOLA_SEED: % arôme(s) rangés sous une famille qui n''est pas la leur', orphans;
  end if;
end;
$$;

commit;

-- --- Récapitulatif -------------------------------------------------------------------
\echo ''
\echo 'Référentiel chargé :'
select 'manufactures' as table, count(*) from ref.manufacturers
union all select 'marques',      count(*) from ref.brands
union all select '  dont cubaines', count(*) from ref.brands where is_cuban
union all select 'vitoles',       count(*) from ref.vitolas
union all select '  à vérifier',  count(*) from ref.vitolas where notes like 'Dimensions à vérifier%'
union all select 'cigares',       count(*) from ref.cigars
union all select '  en brouillon', count(*) from ref.cigars where status = 'draft'
union all select '  sans vitole',  count(*) from ref.cigars where vitola_id is null
union all select '  avec prix officiel', count(*) from ref.cigars where msrp_eur is not null
union all select 'codes de boîte', count(*) from ref.box_codes
union all select 'arômes',         count(*) from public.aroma_taxonomy
union all select '  dont familles', count(*) from public.aroma_taxonomy where parent_id is null;
