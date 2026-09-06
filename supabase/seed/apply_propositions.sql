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
-- One sheet may carry several seed proposals, one per fact (the strength of a
-- first pass, the vitola of a second). `update … from` would pick one of them
-- at random for the sheet, so they are folded per sheet first.
wanted as (
  select cigar_id,
         (array_agg(diff -> 'vitola_id' ->> 'to') filter (where diff ? 'vitola_id'))[1]::uuid         as vitola_to,
         (array_agg(diff -> 'strength'  ->> 'to') filter (where diff ? 'strength'))[1]::ref.strength as strength_to
    from pending
   group by cigar_id
),
applied as (
  update ref.cigars c
     set vitola_id = coalesce(c.vitola_id, w.vitola_to),
         strength  = coalesce(c.strength,  w.strength_to)
    from wanted w
   where w.cigar_id = c.id
     -- the wiki's staleness rule: a column is written only from the value it
     -- was proposed from, here NULL — a sheet that moved keeps its value
     and ((c.vitola_id is null and w.vitola_to  is not null)
       or (c.strength  is null and w.strength_to is not null))
  returning c.id as cigar_id, c.vitola_id, c.strength
)
update ref.cigar_revisions r
   set status         = 'approved',
       reviewed_by    = :'reviewer'::uuid,
       reviewed_at    = now(),
       review_comment = 'Accepté d''un bloc sur instruction du porteur du 6 septembre 2026 '
                     || '(« publie tout ce que tu peux, on fera les corrections derrière »). '
                     || 'Relecture à faire fiche par fiche — apply_propositions.sql.'
  from pending p
  join applied a on a.cigar_id = p.cigar_id
 where r.id = p.id
   -- approved only when every value it proposed is now the sheet's value;
   -- a proposal the sheet contradicts stays pending, to be read by a person
   and (not (p.diff ? 'vitola_id') or a.vitola_id = (p.diff -> 'vitola_id' ->> 'to')::uuid)
   and (not (p.diff ? 'strength')  or a.strength  = (p.diff -> 'strength'  ->> 'to')::ref.strength);

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
