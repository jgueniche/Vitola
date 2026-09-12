-- =============================================================================
-- VITOLA — 0031 : chercher un lieu parmi treize mille
-- -----------------------------------------------------------------------------
-- Le 12 septembre 2026, `venues` est passée de 200 lignes à 13 482 : tout le
-- registre DGDDI de France métropolitaine, à la demande de la QA humaine
-- (« il faut compléter la liste avec toute la France »). Ce que 200 lignes
-- pardonnaient, 13 482 ne le pardonnent plus.
--
-- **Mesuré avant d'écrire.** La recherche texte de `/lieux` est un
-- `name ilike '%…%' or city ilike '%…%'`, trié par ville puis nom, plafonné à
-- cent lignes. Sur la vraie base : `Seq Scan on venues … Rows Removed by
-- Filter: 13161`, **45,8 ms**. Un `ilike '%x%'` ne peut utiliser aucun index
-- B-tree — le joker en tête interdit la recherche par préfixe — donc
-- l'élargissement du seed a transformé une requête instantanée en balayage de
-- table à chaque frappe.
--
-- **Deux index GIN trigramme**, un par colonne cherchée. `pg_trgm` est déjà
-- installé (schéma `extensions`, migration 0001) et c'est le seul outil qui
-- indexe un joker des deux côtés : il découpe « civette » en trigrammes et
-- l'index répond sur leur intersection.
--
-- Un index par colonne plutôt qu'un index composite sur `name || ' ' || city` :
-- la requête est un `OR` de deux prédicats indépendants, et PostgreSQL sait
-- combiner deux index par BitmapOr. Un index sur une concaténation
-- répondrait aussi, mais il faudrait que la requête cherche la concaténation —
-- donc réécrire `lib/venues/queries.ts` autour de la forme de l'index, ce qui
-- est l'inverse du bon sens.
--
-- Pas de `concurrently` : la table est petite (13 482 lignes, ~2 Mo) et une
-- migration s'exécute dans une transaction. `concurrently` l'interdirait.
-- =============================================================================

begin;

create index if not exists venues_name_trgm
  on public.venues using gin (name extensions.gin_trgm_ops);

create index if not exists venues_city_trgm
  on public.venues using gin (city extensions.gin_trgm_ops);

comment on index public.venues_name_trgm is
  'Trigram index for the substring search of /lieux. A `%x%` ilike cannot use '
  'a B-tree; at 13 482 rows the sequential scan measured 45,8 ms per keystroke.';

analyze public.venues;

-- --- Auto-contrôle -----------------------------------------------------------
do $$
declare
  n integer;
begin
  select count(*) into n
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
    join pg_class t on t.oid = i.indrelid
    join pg_am am on am.oid = c.relam
   where t.relname = 'venues' and am.amname = 'gin';
  if n < 2 then
    raise exception
      'VITOLA_INDEX_GAP: % index GIN sur venues au lieu de 2 (nom, ville)', n;
  end if;

  -- L'index ne sert à rien si la RLS de la table a disparu avec lui.
  if not exists (
    select 1 from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relname = 'venues'
       and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'VITOLA_RLS_GAP: public.venues a perdu sa RLS forcée';
  end if;

  raise notice 'VITOLA 0031 OK — deux index trigramme, la recherche texte ne balaie plus la table.';
end $$;

commit;
