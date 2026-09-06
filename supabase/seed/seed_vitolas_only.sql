-- =============================================================================
-- VITOLA — recharger le seul vitolario (03_vitolas.csv), sans toucher aux fiches
-- -----------------------------------------------------------------------------
--   cd supabase/seed && psql -v ON_ERROR_STOP=1 -f seed_vitolas_only.sql
--
-- Pourquoi un script à part : seed.sql recharge AUSSI 04_cigars.csv, dont les
-- colonnes vitola / force sont vides pour les 817 fiches de l'arrêté — le
-- rejouer sur une base où les propositions d'amorçage ont été acceptées
-- (apply_propositions.sql) remettrait ces colonnes à vide. Le vitolario, lui,
-- est sans danger : idempotent sur le slug, il ajoute les galeras nouvelles et
-- met à jour les cotes des existantes.
--
-- Ordre d'un amorçage complet des fiches cubaines, à rejouer sans risque :
--   1. seed_vitolas_only.sql                      — les galeras que les propositions visent
--   2. seed_propositions.sql   -v author=<uuid>   — les propositions, en attente
--   3. apply_propositions.sql  -v reviewer=<uuid> — leur acceptation d'un bloc (6 sept. 2026)
-- =============================================================================

\set ON_ERROR_STOP on

begin;

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

select 'vitoles' as what, count(*) as n from ref.vitolas
union all
select '  à vérifier', count(*) from ref.vitolas where notes like 'Dimensions à vérifier%';

commit;
