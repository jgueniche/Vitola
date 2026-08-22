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
  status text, notes text
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
  release_type, release_year, status, packaging
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
            else jsonb_build_object('seed_note', c.notes) end
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
       updated_at      = now();

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
union all select 'codes de boîte', count(*) from ref.box_codes;
