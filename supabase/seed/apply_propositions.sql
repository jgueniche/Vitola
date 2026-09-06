-- =============================================================================
-- VITOLA — accepter d'un bloc les propositions d'amorçage (PROVENANCE §9)
-- -----------------------------------------------------------------------------
--   cd supabase/seed && psql -v ON_ERROR_STOP=1 -v reviewer='<uuid du relecteur>' -f apply_propositions.sql
--
-- Le 6 septembre 2026, le porteur a tranché : « publie tout ce que tu peux,
-- c'est pas grave, on fera les corrections derrière ». Ce script est ce
-- geste, écrit une fois pour être rejouable et lisible : il fait EXACTEMENT ce
-- que fait « Accepter » dans /contributions (app/(app)/contributions/actions.ts),
-- proposition par proposition, en une transaction —
--
--   1. la substance : la fiche reçoit la valeur proposée, à la condition de
--      fraîcheur du wiki (le `from` de chaque colonne est encore la valeur de
--      la fiche, ici NULL) ; une fiche qui a bougé entre-temps est laissée telle
--      quelle et sa proposition reste en attente, à relire à la main ;
--   2. la trace : la proposition passe `approved`, signée du relecteur, avec le
--      motif qui dit d'où vient la décision.
--
-- Rien d'autre : ni cape, ni arôme, ni fiche non cubaine, ni valeur qui
-- écraserait une valeur existante. La relecture n'est pas supprimée, elle est
-- déplacée après — et l'historique de chaque fiche le dit.
-- =============================================================================

\set ON_ERROR_STOP on

begin;

with pending as (
  select id, cigar_id, diff
    from ref.cigar_revisions
   where status = 'pending'
     and comment like 'Amorçage (PROVENANCE §9%'
),
applied as (
  update ref.cigars c
     set vitola_id = coalesce((p.diff -> 'vitola_id' ->> 'to')::uuid, c.vitola_id),
         strength  = coalesce((p.diff -> 'strength'  ->> 'to')::ref.strength, c.strength)
    from pending p
   where p.cigar_id = c.id
     -- the wiki's staleness rule: a proposed column is still what it was proposed from
     and (not (p.diff ? 'vitola_id') or c.vitola_id is null)
     and (not (p.diff ? 'strength')  or c.strength  is null)
  returning p.id as revision_id
)
update ref.cigar_revisions r
   set status         = 'approved',
       reviewed_by    = :'reviewer'::uuid,
       reviewed_at    = now(),
       review_comment = 'Accepté d''un bloc sur instruction du porteur du 6 septembre 2026 '
                     || '(« publie tout ce que tu peux, on fera les corrections derrière »). '
                     || 'Relecture à faire fiche par fiche — apply_propositions.sql.'
  from applied a
 where r.id = a.revision_id;

select 'propositions d''amorçage acceptées' as what,
       count(*) filter (where status = 'approved') as approved,
       count(*) filter (where status = 'pending')  as still_pending
  from ref.cigar_revisions
 where comment like 'Amorçage (PROVENANCE §9%';

select 'fiches publiées avec une vitole' as what, count(*) as n
  from ref.cigars where status = 'published' and vitola_id is not null
union all
select 'fiches publiées avec une force', count(*)
  from ref.cigars where status = 'published' and strength is not null;

commit;
