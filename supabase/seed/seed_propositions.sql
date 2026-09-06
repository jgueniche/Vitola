-- =============================================================================
-- VITOLA — les propositions d'amorçage des fiches (PROVENANCE §9 et §10)
-- -----------------------------------------------------------------------------
--   cd supabase/seed && psql -v ON_ERROR_STOP=1 -v author='<uuid du compte>' \
--        -v csv=09_fabricants_propositions.csv -v section='§10' -f seed_propositions.sql
--
--   Sans -v csv ni -v section, le script charge 09_fabricants_propositions.csv
--   sous le régime C de PROVENANCE §10. La première vague (08, Habanos, §9) se
--   rejoue avec -v csv=08_habanos_propositions.csv -v section='§9'.
--
-- Ce script n'écrit RIEN sur une fiche. Il verse des PROPOSITIONS dans la file
-- de relecture (ref.cigar_revisions, status = 'pending'), une par fiche, qu'un
-- relecteur accepte ou refuse depuis /contributions ou /admin/fiches/relire —
-- c'est le chemin que PROVENANCE §6 impose à toute donnée ajoutée après
-- l'amorçage, et le seul qui laisse une trace de qui a décidé quoi.
--
-- Le CSV a six colonnes, pour les deux vagues :
--   cigar_slug, vitola_slug, strength, aroma_tags, source_url, note
--   - la vitole, quand la cote publiée est EXACTEMENT celle d'une vitole de la
--     base (aucune vitole n'est créée ici) ;
--   - la force, reportée sur l'échelle du §5.1 depuis ce que le fabricant écrit ;
--   - les arômes, des DESCRIPTEURS de la roue (public.aroma_taxonomy, jamais une
--     famille), séparés par « | », transcrits des notes que le fabricant publie ;
--     un slug inconnu fait échouer le script — on ne crée pas de descripteur ;
--   - la source (0026) : l'adresse de la page officielle du fabricant ou la
--     référence du document publié. Sous le régime §10, une ligne sans source
--     N'ENTRE PAS : le script s'arrête.
-- Une cape n'est jamais proposée : elle varie d'une boîte à l'autre.
--
-- Idempotent, colonne par colonne : une colonne qu'une proposition d'amorçage
-- en attente propose déjà pour la fiche n'est pas proposée une seconde fois ;
-- une fiche dont la colonne est déjà renseignée ne reçoit pas de proposition
-- pour cette colonne ; une ligne sans rien à proposer est ignorée. Le CSV se
-- relit et se corrige, le script se rejoue.
-- =============================================================================

\set ON_ERROR_STOP on
\if :{?csv}
\else
\set csv 09_fabricants_propositions.csv
\endif
\if :{?section}
\else
\set section §10
\endif

begin;

select set_config('vitola.section', :'section', true);

create temporary table _propositions (
  cigar_slug text, vitola_slug text, strength text, aroma_tags text, source_url text, note text
) on commit drop;

-- \copy n'interpole pas les variables : la commande est assemblée d'abord.
\set copycmd '\\copy _propositions from ''' :csv ''' with (format csv, header true)'
:copycmd

-- Les gardes, avant d'écrire une ligne : une valeur hors échelle, un descripteur
-- inconnu, une fiche introuvable ou une source manquante sont des erreurs du
-- CSV, pas des lignes à ignorer en silence.
do $$
declare
  bad text;
  n integer;
begin
  select string_agg(distinct strength, ', ') into bad
    from _propositions
   where nullif(strength, '') is not null
     and strength not in ('leger', 'leger_moyen', 'moyen', 'moyen_corse', 'corse');
  if bad is not null then
    raise exception 'VITOLA_SEED: force hors échelle dans le CSV : %', bad;
  end if;

  select string_agg(distinct s.slug, ', ') into bad
    from _propositions p
    cross join lateral unnest(string_to_array(nullif(p.aroma_tags, ''), '|')) as s(slug)
   where not exists (select 1 from public.aroma_taxonomy a
                      where a.slug = s.slug and a.parent_id is not null);
  if bad is not null then
    raise exception 'VITOLA_SEED: descripteur inconnu ou famille dans le CSV : % — on ne crée pas de descripteur (PROVENANCE §10)', bad;
  end if;

  select string_agg(p.cigar_slug, ', ') into bad
    from _propositions p
   where not exists (select 1 from ref.cigars c where c.slug = p.cigar_slug);
  if bad is not null then
    raise exception 'VITOLA_SEED: fiche introuvable : %', bad;
  end if;

  select string_agg(p.vitola_slug, ', ') into bad
    from _propositions p
   where nullif(p.vitola_slug, '') is not null
     and not exists (select 1 from ref.vitolas v where v.slug = p.vitola_slug);
  if bad is not null then
    raise exception 'VITOLA_SEED: vitole introuvable (aucune vitole n''est créée ici) : %', bad;
  end if;

  if current_setting('vitola.section', true) <> '§9' then
    select count(*) into n from _propositions where nullif(source_url, '') is null;
    if n > 0 then
      raise exception 'VITOLA_SEED: % ligne(s) sans source_url — sous le régime %, une ligne sans source n''entre pas', n, current_setting('vitola.section', true);
    end if;
  end if;
end $$;

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
     end)
    ||
    (case
       when nullif(p.aroma_tags, '') is not null and cardinality(c.aroma_tags) = 0
       then jsonb_build_object('aroma_tags', jsonb_build_object('from', null, 'to', (
              -- descriptor ids as strings, in the CSV's order: the shape a diff
              -- holds every list in (lib/wiki/model.ts), cast back on apply
              select jsonb_agg(a.id::text order by s.ord)
                from unnest(string_to_array(p.aroma_tags, '|')) with ordinality as s(slug, ord)
                join public.aroma_taxonomy a on a.slug = s.slug and a.parent_id is not null
            )))
       else '{}'::jsonb
     end) as diff,
    'Amorçage (PROVENANCE ' || current_setting('vitola.section', true) || ') — ' || p.note as comment,
    nullif(p.source_url, '') as source
  from _propositions p
  join ref.cigars c on c.slug = p.cigar_slug
  left join ref.vitolas v on v.slug = nullif(p.vitola_slug, '')
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
              and r.comment like 'Amorçage (PROVENANCE §%'
         )::text[] as diff,
         k.comment,
         k.source
    from candidates k
   where k.diff <> '{}'::jsonb
)
insert into ref.cigar_revisions (cigar_id, author_id, diff, comment, source)
select cigar_id, :'author'::uuid, diff, comment, source
  from trimmed
 where diff <> '{}'::jsonb;

select 'propositions en attente (amorçage, toutes vagues)' as what, count(*) as n
  from ref.cigar_revisions
 where status = 'pending' and comment like 'Amorçage (PROVENANCE §%'
union all
select 'dont avec source', count(*)
  from ref.cigar_revisions
 where status = 'pending' and comment like 'Amorçage (PROVENANCE §%' and source is not null;

commit;
