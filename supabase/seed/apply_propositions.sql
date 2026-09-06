-- =============================================================================
-- VITOLA — accepter d'un bloc les propositions d'amorçage QUI CITENT UNE SOURCE
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
--      la fiche, ici NULL ou un profil vide) ; une fiche qui a bougé entre-temps
--      est laissée telle quelle et sa proposition reste en attente, à relire ;
--   2. la trace : la proposition passe `approved`, signée du relecteur, avec le
--      motif qui dit d'où vient la décision.
--
-- Depuis la 0026, le bloc ne prend QUE les propositions qui citent une source
-- (`source is not null`) : c'est ce que « publie tout ce que tu peux » veut
-- dire une fois qu'on peut distinguer une transcription d'une supposition. Une
-- proposition d'amorçage sans source reste en attente et se relit à la main,
-- dans /admin/fiches/relire.
--
-- Rien d'autre : ni cape, ni valeur qui écraserait une valeur existante, ni
-- descripteur qui ne serait pas de la roue (le trigger de 0025 le refuserait).
-- La relecture n'est pas supprimée, elle est déplacée après — et l'historique
-- de chaque fiche le dit, source comprise.
-- =============================================================================

\set ON_ERROR_STOP on

begin;

with pending as (
  select id, cigar_id, diff
    from ref.cigar_revisions
   where status = 'pending'
     and comment like 'Amorçage (PROVENANCE §%'
     and source is not null
),
-- One sheet may carry several seed proposals, one per fact. `update … from`
-- would pick one of them at random for the sheet, so they are folded per sheet
-- first. The aroma list travels as text ids in the diff and comes back as the
-- integer[] the column is — the cast `approveRevision` performs.
folded as (
  select cigar_id,
         (array_agg(diff -> 'vitola_id' ->> 'to') filter (where diff ? 'vitola_id'))[1]::uuid         as vitola_to,
         (array_agg(diff -> 'strength'  ->> 'to') filter (where diff ? 'strength'))[1]::ref.strength as strength_to,
         (array_agg(diff -> 'aroma_tags' -> 'to')  filter (where diff ? 'aroma_tags'))[1]            as aromas_json
    from pending
   group by cigar_id
),
wanted as (
  select f.cigar_id, f.vitola_to, f.strength_to,
         case when f.aromas_json is null then null
              else array(select x::integer from jsonb_array_elements_text(f.aromas_json) as x)
         end as aromas_to
    from folded f
),
applied as (
  update ref.cigars c
     set vitola_id  = coalesce(c.vitola_id, w.vitola_to),
         strength   = coalesce(c.strength,  w.strength_to),
         aroma_tags = case when cardinality(c.aroma_tags) = 0 and coalesce(cardinality(w.aromas_to), 0) > 0
                           then w.aromas_to else c.aroma_tags end
    from wanted w
   where w.cigar_id = c.id
     -- the wiki's staleness rule: a column is written only from the value it
     -- was proposed from, here NULL or empty — a sheet that moved keeps its value
     and ((c.vitola_id is null and w.vitola_to  is not null)
       or (c.strength  is null and w.strength_to is not null)
       or (cardinality(c.aroma_tags) = 0 and coalesce(cardinality(w.aromas_to), 0) > 0))
  returning c.id as cigar_id, c.vitola_id, c.strength, c.aroma_tags
)
update ref.cigar_revisions r
   set status         = 'approved',
       reviewed_by    = :'reviewer'::uuid,
       reviewed_at    = now(),
       review_comment = 'Accepté d''un bloc sur instruction du porteur du 6 septembre 2026 '
                     || '(« publie tout ce que tu peux, on fera les corrections derrière ») — '
                     || 'proposition sourcée (PROVENANCE §10), transcrite de la page citée. '
                     || 'Relecture à faire fiche par fiche — apply_propositions.sql.'
  from pending p
  join applied a on a.cigar_id = p.cigar_id
 where r.id = p.id
   -- approved only when every value it proposed is now the sheet's value;
   -- a proposal the sheet contradicts stays pending, to be read by a person
   and (not (p.diff ? 'vitola_id') or a.vitola_id = (p.diff -> 'vitola_id' ->> 'to')::uuid)
   and (not (p.diff ? 'strength')  or a.strength  = (p.diff -> 'strength'  ->> 'to')::ref.strength)
   and (not (p.diff ? 'aroma_tags') or a.aroma_tags =
          array(select x::integer from jsonb_array_elements_text(p.diff -> 'aroma_tags' -> 'to') as x));

select 'propositions d''amorçage sourcées' as what,
       count(*) filter (where status = 'approved') as approved,
       count(*) filter (where status = 'pending')  as still_pending
  from ref.cigar_revisions
 where comment like 'Amorçage (PROVENANCE §%' and source is not null;

select 'fiches publiées avec une vitole' as what, count(*) as n
  from ref.cigars where status = 'published' and vitola_id is not null
union all
select 'fiches publiées avec une force', count(*)
  from ref.cigars where status = 'published' and strength is not null
union all
select 'fiches publiées avec des arômes', count(*)
  from ref.cigars where status = 'published' and cardinality(aroma_tags) > 0
union all
select 'propositions avec source', count(*)
  from ref.cigar_revisions where source is not null;

commit;
