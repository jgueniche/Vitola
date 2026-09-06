-- =============================================================================
-- VITOLA — les propositions d'amorçage des fiches cubaines (PROVENANCE §9)
-- -----------------------------------------------------------------------------
--   cd supabase/seed && psql -v ON_ERROR_STOP=1 -v author='<uuid du compte>' -f seed_propositions.sql
--
-- Ce script n'écrit RIEN sur une fiche. Il verse des PROPOSITIONS dans la file
-- de relecture (ref.cigar_revisions, status = 'pending'), une par fiche, qu'un
-- relecteur accepte ou refuse depuis /contributions — c'est le chemin que
-- PROVENANCE §6 impose à toute donnée ajoutée après l'amorçage, et le seul qui
-- laisse une trace de qui a décidé quoi.
--
-- Deux faits par ligne du CSV, chacun sous son régime (PROVENANCE §9) :
--   - la vitole de galera, quand le rattachement est standard et que la galera
--     existe déjà dans ref.vitolas (aucune vitole n'est créée ici) ;
--   - la force, telle que Habanos S.A. la publie POUR LA MARQUE (ligero, medio,
--     fuerte et leurs deux intermédiaires), reportée sur l'échelle du §5.1.
-- Une cape n'est jamais proposée : elle varie d'une boîte à l'autre.
--
-- Idempotent, colonne par colonne : une colonne qu'une proposition d'amorçage
-- en attente propose déjà pour la fiche n'est pas proposée une seconde fois ;
-- une fiche dont la colonne est déjà renseignée ne reçoit pas de proposition
-- pour cette colonne ; une ligne sans rien à proposer est ignorée. Une fiche
-- peut donc porter deux propositions d'amorçage — la force d'un premier
-- passage, la vitole d'un second (le vitolario étendu du 6 septembre 2026) —
-- et apply_propositions.sql les replie par fiche. Le CSV se relit et se
-- corrige, le script se rejoue.
-- =============================================================================

\set ON_ERROR_STOP on

begin;

create temporary table _propositions (
  cigar_slug text, vitola_slug text, strength text, note text
) on commit drop;

\copy _propositions from '08_habanos_propositions.csv' with (format csv, header true)

with candidates as (
  select
    c.id as cigar_id,
    (case
       when v.id is not null and c.vitola_id is null
       then jsonb_build_object('vitola_id', jsonb_build_object('from', null, 'to', v.id::text))
       else '{}'::jsonb
     end)
    ||
    (case
       when nullif(p.strength, '') is not null and c.strength is null
       then jsonb_build_object('strength', jsonb_build_object('from', null, 'to', p.strength))
       else '{}'::jsonb
     end) as diff,
    'Amorçage (PROVENANCE §9) — ' || p.note as comment
  from _propositions p
  join ref.cigars c on c.slug = p.cigar_slug
  left join ref.vitolas v on v.slug = nullif(p.vitola_slug, '')
  where nullif(p.strength, '') is null
     or p.strength in ('leger', 'leger_moyen', 'moyen', 'moyen_corse', 'corse')
),
-- What a pending seed proposal already asks for this sheet is not asked twice:
-- the candidate keeps only the columns nobody proposed yet.
trimmed as (
  select k.cigar_id,
         k.diff - array(
           select jsonb_object_keys(r.diff)
             from ref.cigar_revisions r
            where r.cigar_id = k.cigar_id
              and r.status = 'pending'
              and r.comment like 'Amorçage (PROVENANCE §9) — %'
         )::text[] as diff,
         k.comment
    from candidates k
   where k.diff <> '{}'::jsonb
)
insert into ref.cigar_revisions (cigar_id, author_id, diff, comment)
select cigar_id, :'author'::uuid, diff, comment
  from trimmed
 where diff <> '{}'::jsonb;

select 'propositions en attente (amorçage)' as what, count(*) as n
  from ref.cigar_revisions
 where status = 'pending' and comment like 'Amorçage (PROVENANCE §9) — %';

commit;
