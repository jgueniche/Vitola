-- =============================================================================
-- VITOLA — chargement des lieux (ADR 0011, D1)
-- -----------------------------------------------------------------------------
--   cd supabase/seed && psql -v ON_ERROR_STOP=1 -f seed_venues.sql
--
-- Séparé de seed.sql parce qu'il exige la migration 0016 (postgis,
-- public.venues), que la base de seed de la CI n'applique pas — le référentiel
-- se charge sur 0001–0003, les lieux sur la base complète.
--
-- Idempotent, clé de rapprochement : le slug. Deux choses que le rejeu ne
-- touche JAMAIS :
--   - `status` — un lieu passé `closed` depuis (signalement, revendicateur)
--     ne se rouvre pas parce qu'on recharge un registre de 2018 ;
--   - les colonnes vivantes (horaires, téléphone, site, fumoir) — elles
--     n'existent pas dans le registre, et un revendicateur a pu les remplir.
--
-- Provenance : « Adresses des buralistes de France métropolitaine — 2018 »,
-- DGDDI, Licence Ouverte v2.0 (Etalab), data.economie.gouv.fr. Chaque ligne
-- porte source et source_date ; la règle de sélection des 200 est dans
-- PROVENANCE.md §7. OSM est explicitement refusé (ODbL) — voir l'ADR 0011.
-- =============================================================================

\set ON_ERROR_STOP on

begin;

create temporary table _venues (
  type text, name text, slug text, address text, city text, postal_code text,
  country text, lat double precision, lng double precision,
  status text, source text, source_date text
) on commit drop;

\copy _venues from '07_venues.csv' with (format csv, header true)

insert into public.venues
  (type, name, slug, address, city, postal_code, country, geo,
   status, source, source_date)
select v.type::public.venue_type,
       v.name,
       v.slug,
       nullif(v.address, ''),
       v.city,
       nullif(v.postal_code, ''),
       v.country,
       extensions.st_setsrid(extensions.st_makepoint(v.lng, v.lat), 4326)::extensions.geography,
       v.status::public.venue_status,
       v.source,
       v.source_date::date
  from _venues v
on conflict (slug) do update
   set name        = excluded.name,
       address     = excluded.address,
       city        = excluded.city,
       postal_code = excluded.postal_code,
       country     = excluded.country,
       geo         = excluded.geo,
       source      = excluded.source,
       source_date = excluded.source_date,
       updated_at  = now();
       -- status délibérément absent : voir l'en-tête.

-- --- Intégrité ---------------------------------------------------------------
do $$
declare n integer;
begin
  select count(*) into n from public.venues where source = 'douane-fr-2018';
  if n < 200 then
    raise exception 'VITOLA_SEED_GAP: % lieux du registre au lieu de 200 au moins', n;
  end if;

  -- Le critère de sortie suppose des points : une ligne du registre sans
  -- géographie serait invisible de la seule recherche qui compte.
  select count(*) into n from public.venues where source = 'douane-fr-2018' and geo is null;
  if n <> 0 then
    raise exception 'VITOLA_SEED_GAP: % lieux du registre sans geolocalisation', n;
  end if;

  -- Une provenance sans date est une désinformation en devenir (règle msrp).
  select count(*) into n from public.venues where source is not null and source_date is null;
  if n <> 0 then
    raise exception 'VITOLA_SEED_GAP: % lieux avec source sans date', n;
  end if;

  -- Rien du registre ne reste en attente : un fait officiel n'a pas de
  -- relecture à attendre (ADR 0011, D1) — et rien n'est revendiqué d'office.
  select count(*) into n from public.venues where source = 'douane-fr-2018' and status = 'pending';
  if n <> 0 then
    raise exception 'VITOLA_SEED_GAP: % lieux du registre en pending', n;
  end if;
  select count(*) into n from public.venues where source is not null and claimed_by is not null;
  if n <> 0 then
    raise exception 'VITOLA_SEED_GAP: une ligne de seed porte une revendication';
  end if;

  select count(*) into n from public.venues where source = 'douane-fr-2018';
  raise notice 'Lieux : % lignes du registre DGDDI 2018, toutes geolocalisees.', n;
end $$;

commit;
