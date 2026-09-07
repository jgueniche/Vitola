-- =============================================================================
-- VITOLA — 0026 : la source d'une proposition
-- -----------------------------------------------------------------------------
-- Demandé le 6 septembre 2026 (docs/audit-2026-09-06.md, n° 1) : le
-- référentiel se remplit par des propositions, et une proposition qui cite
-- d'où elle tient son fait se relit en un clic là où une proposition muette
-- se relit en une enquête. PROVENANCE §6 exige déjà « une origine documentée »
-- pour toute donnée ajoutée après l'amorçage ; jusqu'ici l'origine vivait,
-- au mieux, dans le commentaire libre — introuvable par une requête, et
-- indistinguable d'une opinion.
--
-- Une colonne, et rien de plus :
--
--   §1  ref.cigar_revisions.source — text, nullable, 500 caractères au plus.
--       L'URL d'une page officielle du fabricant (régime C de PROVENANCE) ou
--       la référence d'un document publié. Nullable parce qu'une correction
--       « la bague dans la main » n'a pas d'URL, et qu'exiger une source
--       fabriquerait des sources inventées — la leçon du registre de
--       consentements, à l'envers.
--
--   §2  Dans le GRANT INSERT (table entière depuis 0001, donc déjà couvert —
--       l'auto-contrôle le relit) et HORS du GRANT UPDATE : une source se dit
--       au dépôt. Un relecteur décide sur ce qu'il a lu ; si la source pouvait
--       changer après la décision, la trace citerait autre chose que ce qui a
--       été jugé. La corriger, c'est retirer la proposition et la refaire.
--
-- Ce que cette migration ne fait PAS : elle n'écrit aucune source sur les 170
-- propositions déjà décidées — leur origine est dans leur commentaire
-- (« Amorçage (PROVENANCE §9) — … »), et réécrire l'histoire n'est pas une
-- migration. Elle n'ouvre aucune policy : les sept de 0001 décident toujours.
-- =============================================================================

begin;

-- =============================================================================
-- §1 · LA COLONNE
-- =============================================================================

alter table ref.cigar_revisions
  add column source text;

alter table ref.cigar_revisions
  add constraint cigar_revisions_source_len
  check (source is null or (length(source) between 1 and 500));

comment on column ref.cigar_revisions.source is
  'Where the proposal takes its fact from: the URL of an official manufacturer '
  'page (PROVENANCE regime C) or the reference of a published document. '
  'Nullable — a correction made band-in-hand has no URL. Stated at proposal '
  'time and never updated: a reviewer decides on what they read.';

-- =============================================================================
-- §2 · DROITS
-- =============================================================================

-- 0001 accorde `insert` sur la table entière, donc la colonne nouvelle est
-- insérable sans un mot de plus. Le GRANT UPDATE, lui, est par colonne
-- (diff, comment, status, reviewed_by, reviewed_at, review_comment) et ne
-- gagne rien : la source ne se réécrit pas. Rien à écrire ici — mais tout à
-- vérifier, ci-dessous, parce qu'un grant de table qui deviendrait un grant
-- de colonnes un jour ferait tomber la source en silence (le piège de
-- `profile_settings.updated_at`).

-- =============================================================================
-- §3 · AUTO-CONTRÔLE
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'ref' and table_name = 'cigar_revisions' and column_name = 'source'
       and data_type = 'text' and is_nullable = 'YES'
  ) then
    raise exception 'VITOLA_MIGRATION_INCOMPLETE: ref.cigar_revisions.source manque ou n''est pas text nullable';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'ref.cigar_revisions'::regclass and conname = 'cigar_revisions_source_len'
  ) then
    raise exception 'VITOLA_MIGRATION_INCOMPLETE: la contrainte cigar_revisions_source_len manque';
  end if;

  -- Insérable par un membre : sans quoi le champ « Source » du formulaire
  -- serait décoratif, et l'écriture refusée en 42501 sans que rien ne le lise.
  if not has_column_privilege('authenticated', 'ref.cigar_revisions', 'source', 'INSERT') then
    raise exception 'VITOLA_GRANT_GAP: authenticated ne peut pas insérer ref.cigar_revisions.source';
  end if;

  -- Et jamais réécrite : le GRANT UPDATE est par colonne et ne la nomme pas.
  if has_column_privilege('authenticated', 'ref.cigar_revisions', 'source', 'UPDATE') then
    raise exception 'VITOLA_GRANT_GAP: ref.cigar_revisions.source est modifiable — une source se dit au dépôt';
  end if;

  -- §0.5 : la table touchée garde sa RLS, forcée.
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'ref' and c.relname = 'cigar_revisions'
       and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'VITOLA_RLS_GAP: ref.cigar_revisions a perdu sa RLS forcée';
  end if;

  raise notice 'VITOLA 0026 OK — une proposition peut citer sa source, et ne la réécrit pas.';
end $$;

commit;
