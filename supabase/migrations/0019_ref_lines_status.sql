-- =============================================================================
-- VITOLA — 0019 : ref.lines gagne le status qui lui manquait (ADR 0009, pièce 1)
-- -----------------------------------------------------------------------------
-- Applique l'ADR 0009, acceptée le 23 août 2026 (par délégation) :
--   docs/adr/0009-rouvrir-ref-lines.md
--
-- Le fait qui décide : contrairement à ref.cigars, une gamme était publique
-- DÈS SON INSERTION — pas de brouillon, pas de relecture possible avant
-- visibilité. Corriger la longueur d'un cigare passait par une file de
-- relecture ; créer une gamme entière aurait été immédiat et public.
-- L'asymétrie était à l'envers, et cette migration la remet à l'endroit.
--
-- Ce qu'elle fait, et rien de plus :
--   §1  ref.lines.status, défaut draft — le meilleur moment pour une migration
--       est une table vide : zéro ligne à migrer, aucune compatibilité à tenir
--   §2  la policy select publique se borne à published ; les relecteurs voient
--       les brouillons par une policy DE PLUS (jamais en recollant — la leçon
--       des quatre policies de reviews)
--   §3  auto-contrôle
--
-- Ce qu'elle ne fait PAS, et c'est la décision autant que le reste :
--   - aucun seed de gammes — PROVENANCE exige qu'une ligne soit justifiable,
--     et une gamme devinée ne l'est pas (option B de l'ADR, écartée) ;
--   - pas de policy insert pour les membres — la création de gamme par un
--     proposeur (pièce 3) attend que le rattachement ait du trafic, et porte
--     le problème de l'ADR 0008 (qui insère, sous quel nom) ;
--   - pas d'index nouveau — la table se comptera en dizaines de lignes pendant
--     des années, et lines_brand_idx existe déjà pour le sélecteur du wiki.
-- =============================================================================

begin;

-- =============================================================================
-- §1 · LA COLONNE
-- =============================================================================

-- ref.entry_status existe depuis 0001 (draft | published | merged | rejected).
-- Le défaut draft est la direction de sûreté : une gamme insérée sans y penser
-- n'est visible de personne, là où l'ancien état la publiait.
alter table ref.lines
  add column status ref.entry_status not null default 'draft';

comment on column ref.lines.status is
  'ADR 0009: a line is born draft and published by an editor. Before 0019 a '
  'line was public on insert — the wiki asymmetry, backwards.';

-- =============================================================================
-- §2 · ROW LEVEL SECURITY
-- =============================================================================

-- L'ancienne policy rendait toute ligne à tout le monde. La remplacer par deux
-- policies découpées par audience, OR-ées comme partout : le public lit le
-- publié, un relecteur lit aussi les brouillons — il ne peut pas relire ce
-- qu'il ne voit pas. `to authenticated` seul sur la seconde : une branche
-- qu'un anonyme ne peut pas évaluer n'est jamais planifiée pour lui.
drop policy lines_select_all on ref.lines;

create policy lines_select_published on ref.lines
  for select to anon, authenticated
  using (status = 'published');

create policy lines_select_editor on ref.lines
  for select to authenticated
  using ((select public.has_min_role('editor')));

-- lines_insert_editor et lines_update_editor restent telles quelles : une
-- gamme naît d'un editor (en brouillon par défaut) et se publie par lui — le
-- modèle du journal, où écrire EST le privilège. La pièce 3 de l'ADR ajoutera
-- la policy du proposeur le jour où elle s'ouvre.

-- =============================================================================
-- §3 · AUTO-CONTRÔLE
-- =============================================================================

do $$
declare
  v_default text;
  n integer;
begin
  -- 1. La colonne existe et son défaut est draft.
  select column_default into v_default
    from information_schema.columns
   where table_schema = 'ref' and table_name = 'lines' and column_name = 'status';
  if v_default is null or v_default !~ 'draft' then
    raise exception 'VITOLA_SHAPE_GAP: ref.lines.status manque ou ne nait plus draft';
  end if;

  -- 2. La policy ouverte est partie — c'est elle qui publiait une gamme dès
  --    son insertion.
  if exists (select 1 from pg_policies
              where schemaname = 'ref' and tablename = 'lines'
                and policyname = 'lines_select_all') then
    raise exception
      'VITOLA_RLS_GAP: lines_select_all existe encore — une gamme serait publique des l insertion';
  end if;

  -- 3. La lecture publique est bornée à published, et la branche relecteur
  --    existe. Les deux sens : une policy manquante ferme la table au public,
  --    une policy trop large republie les brouillons.
  select count(*) into n
    from pg_policies
   where schemaname = 'ref' and tablename = 'lines'
     and policyname = 'lines_select_published'
     and qual like '%published%';
  if n <> 1 then
    raise exception
      'VITOLA_RLS_GAP: lines_select_published manque ou ne filtre plus sur published';
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname = 'ref' and tablename = 'lines'
                    and policyname = 'lines_select_editor') then
    raise exception 'VITOLA_RLS_GAP: un relecteur ne voit plus les brouillons de gammes';
  end if;

  -- 4. RLS reste active et forcée sur la table.
  if not exists (select 1 from pg_class c
                  join pg_namespace s on s.oid = c.relnamespace
                 where s.nspname = 'ref' and c.relname = 'lines'
                   and c.relrowsecurity and c.relforcerowsecurity) then
    raise exception 'VITOLA_RLS_GAP: ref.lines a perdu sa RLS forcee';
  end if;

  raise notice
    '0019 : une gamme nait en brouillon, se lit publiee, et se relit en brouillon par un relecteur.';
end;
$$;

commit;
