-- Contrôles d'intégrité de l'amorçage. Exécuté en CI après seed.sql.
-- Ce qui est vérifié est ce qui compte juridiquement ou fonctionnellement :
-- rien n'est publié sans relecture, et rien n'est orphelin.
do $$
declare
  n_brands int; n_cigars int; n_published int; n_orphan_brand int;
  n_vitolas int; n_unverified int; n_manuf int;
begin
  select count(*) into n_manuf   from ref.manufacturers;
  select count(*) into n_brands  from ref.brands;
  select count(*) into n_vitolas from ref.vitolas;
  select count(*) into n_cigars  from ref.cigars;

  if n_manuf < 25 then raise exception 'VITOLA_SEED: trop peu de manufactures (%)', n_manuf; end if;
  if n_brands < 100 then raise exception 'VITOLA_SEED: trop peu de marques (%)', n_brands; end if;
  if n_vitolas < 40 then raise exception 'VITOLA_SEED: trop peu de vitoles (%)', n_vitolas; end if;
  if n_cigars < 100 then raise exception 'VITOLA_SEED: trop peu de fiches (%)', n_cigars; end if;

  -- Le garde-fou central : l'amorçage ne publie rien.
  select count(*) into n_published from ref.cigars where status <> 'draft';
  if n_published > 0 then
    raise exception 'VITOLA_SEED: % fiche(s) amorcée(s) ne sont pas en brouillon. '
                    'Une donnée non relue ne doit jamais être publiée (PROVENANCE.md §2).', n_published;
  end if;

  -- Aucune fiche orpheline de marque.
  select count(*) into n_orphan_brand from ref.cigars where brand_id is null;
  if n_orphan_brand > 0 then
    raise exception 'VITOLA_SEED: % fiche(s) sans marque', n_orphan_brand;
  end if;

  -- Les vitoles douteuses doivent rester signalées : si le marqueur disparaît
  -- sans relecture, on perd la trace de ce qui n'est pas vérifié.
  select count(*) into n_unverified from ref.vitolas where notes like 'Dimensions à vérifier%';
  raise notice 'Amorçage : % manufactures, % marques, % vitoles (dont % à vérifier), % fiches en brouillon.',
    n_manuf, n_brands, n_vitolas, n_unverified, n_cigars;

  -- Un prix sans source ni date d'effet est une désinformation en quelques
  -- semaines : la contrainte de table l'interdit, ce test le confirme sur les
  -- données réelles.
  if exists (
    select 1 from ref.cigars
     where msrp_eur is not null
       and (msrp_source is null or msrp_effective_on is null)
  ) then
    raise exception 'VITOLA_SEED: un prix est enregistré sans source ni date d''effet';
  end if;

  -- Un prix unitaire à quatre chiffres trahit presque toujours un prix de boîte
  -- lu comme un prix unitaire. Le seuil est large : le cigare le plus cher de
  -- l'arrêté est à 750 EUR l'unité.
  if exists (select 1 from ref.cigars where msrp_eur > 1500) then
    raise exception 'VITOLA_SEED: prix unitaire invraisemblable, probable prix de boîte';
  end if;

  -- La recherche doit fonctionner sur les données réelles, pas seulement en théorie.
  if not exists (
    select 1 from ref.cigars c, to_tsquery('pg_catalog.simple','cohiba') q
     where c.search_vector @@ q
  ) then
    raise exception 'VITOLA_SEED: la recherche plein texte ne retourne rien sur un terme évident';
  end if;
end;
$$;
