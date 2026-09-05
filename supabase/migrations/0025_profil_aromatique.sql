-- =============================================================================
-- VITOLA — 0025 : le profil aromatique d'une fiche, et les arômes les plus cités
-- -----------------------------------------------------------------------------
-- Demandé le 5 septembre 2026 par le porteur, pendant la refonte des pages
-- cigare : « je veux être sûr que dans les fiches cigares il y a bien les
-- arômes (cacao, boisé, etc.) ». La fiche ne portait aucun arôme : le carnet
-- en relève (reviews.aroma_tags, depuis 0003) mais rien ne les remontait, et
-- le référentiel n'avait pas de colonne pour dire ce qu'un cigare sent.
--
-- Deux réponses, qui ne se confondent pas :
--
--   §1  ref.cigars.aroma_tags — le PROFIL, un fait du référentiel : les
--       descripteurs de la roue (public.aroma_taxonomy) qu'une fiche porte.
--       Douze au plus, chacun un descripteur existant — un trigger le tient,
--       parce qu'une clé étrangère ne sait pas viser dans un tableau. La
--       colonne entre dans le GRANT UPDATE des relecteurs et dans l'allowlist
--       du wiki (lib/wiki/model.ts) : elle se propose, elle se relit, elle se
--       publie, comme la force ou la cape. Elle n'est amorcée par AUCUN script :
--       un profil aromatique deviné est exactement ce que PROVENANCE §6 refuse.
--
--   §3  public.cigar_stats.top_aromas — les arômes LES PLUS CITÉS par les
--       membres dans leurs entrées publiques, agrégés dans la vue matérialisée
--       qui porte déjà la moyenne. La même frontière que la note (ADR 0004,
--       D3) : `visibility = 'public'` est le prédicat de sécurité, une vue
--       matérialisée ne porte pas de RLS, et rien ne recompte en TypeScript.
--       La vue gagne aussi `entry_count`, le nombre d'entrées publiques notées
--       ou non — un mot sans note compte comme cité, pas comme noté.
--
-- Ce que cette migration ne fait PAS : elle n'écrit aucun arôme sur aucune
-- fiche. Les 940 profils naissent vides ; ils se remplissent par le wiki.
-- =============================================================================

begin;

-- =============================================================================
-- §1 · LA COLONNE
-- =============================================================================

alter table ref.cigars
  add column aroma_tags integer[] not null default '{}'::integer[];

alter table ref.cigars
  add constraint cigars_aroma_tags_len check (cardinality(aroma_tags) <= 12);

comment on column ref.cigars.aroma_tags is
  'Aroma profile of the sheet: descriptor ids of public.aroma_taxonomy (never a '
  'family), 12 at most, no duplicate — ref.guard_cigar_aroma_tags() enforces '
  'what an array cannot reference. Proposed and applied through the wiki like '
  'strength or wrapper_shade; never seeded (PROVENANCE §6).';

-- =============================================================================
-- §2 · LE GARDE-FOU
-- =============================================================================

-- Droits d'appelant, volontairement : la roue est en lecture publique, donc
-- tout rôle qui peut écrire une fiche peut vérifier qu'un descripteur existe.
-- `alter default privileges in schema ref` (0005) ferme EXECUTE aux clients ;
-- un trigger n'a besoin d'aucun droit d'appel pour se déclencher.
create or replace function ref.guard_cigar_aroma_tags()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  bad integer;
begin
  if cardinality(new.aroma_tags) = 0 then
    return new;
  end if;

  if (select count(distinct t) from unnest(new.aroma_tags) as t) <> cardinality(new.aroma_tags) then
    raise exception 'aroma_tags: a descriptor appears twice'
      using errcode = '23514';
  end if;

  select t into bad
    from unnest(new.aroma_tags) as t
   where not exists (
     select 1 from public.aroma_taxonomy a
      where a.id = t and a.parent_id is not null
   )
   limit 1;

  if bad is not null then
    raise exception 'aroma_tags: % is not a descriptor of the aroma wheel', bad
      using errcode = '23503';
  end if;

  return new;
end;
$$;

comment on function ref.guard_cigar_aroma_tags() is
  'BEFORE trigger on ref.cigars: every aroma_tags element is a DESCRIPTOR of '
  'public.aroma_taxonomy (parent_id not null) and appears once. Raises 23503 '
  'for an unknown id or a family, 23514 for a duplicate — the codes a foreign '
  'key and a check would have raised, so the app translates them the same way.';

create trigger cigars_aroma_tags_guard
  before insert or update of aroma_tags on ref.cigars
  for each row execute function ref.guard_cigar_aroma_tags();

-- Les relecteurs écrivent la colonne comme les autres colonnes proposables
-- (0001 §grants) ; l'allowlist du wiki décide de ce qui y arrive.
grant update (aroma_tags) on ref.cigars to authenticated;

-- =============================================================================
-- §3 · cigar_stats — LES ARÔMES LES PLUS CITÉS
-- =============================================================================

-- Une vue matérialisée ne s'altère pas : on la recrée, index et grants compris.
-- La définition garde `visibility = 'public'` en un seul prédicat lisible —
-- l'auto-contrôle de 0003 le cherche dans pg_get_viewdef(), et c'est lui qui
-- fait de la vue une frontière et non une optimisation.
drop materialized view public.cigar_stats;

create materialized view public.cigar_stats as
with public_entries as (
  select r.cigar_id, r.score_total, r.created_at, r.aroma_tags
    from public.reviews r
   where r.visibility = 'public'
),
scored as (
  select cigar_id, score_total, created_at from public_entries where score_total is not null
),
prior as (
  -- 80/100 quand il n'existe encore aucune note : une valeur neutre haute, qui
  -- ne récompense ni ne punit un cigare dont personne n'a rien dit.
  select coalesce(avg(score_total), 80.0)::numeric as mean from scored
),
cited as (
  select e.cigar_id, t.tag, count(*)::integer as n
    from public_entries e
    cross join unnest(e.aroma_tags) as t(tag)
   group by e.cigar_id, t.tag
),
ranked as (
  select cigar_id, tag, n,
         row_number() over (partition by cigar_id order by n desc, tag asc) as rank
    from cited
),
top as (
  -- Huit au plus : au-delà, une liste d'arômes cesse d'être un profil et
  -- devient la roue entière. Ordre stable (compte, puis identifiant) pour
  -- qu'un rafraîchissement ne fasse pas danser la fiche.
  select cigar_id,
         jsonb_agg(jsonb_build_object('id', tag, 'n', n) order by n desc, tag asc) as top_aromas
    from ranked
   where rank <= 8
   group by cigar_id
)
select
  e.cigar_id,
  count(e.score_total)::integer                        as review_count,
  round(avg(e.score_total), 1)                         as mean_score,
  round(
    (10 * (select mean from prior) + sum(e.score_total)) / (10 + count(e.score_total)),
    1
  )                                                    as bayesian_score,
  count(e.score_total) filter (where e.created_at >= now() - interval '90 days')::integer
                                                       as review_count_90d,
  round(avg(e.score_total) filter (where e.created_at >= now() - interval '90 days'), 1)
                                                       as mean_score_90d,
  jsonb_build_object(
    'lt60',    count(*) filter (where e.score_total <  60),
    'b60_69',  count(*) filter (where e.score_total >= 60 and e.score_total < 70),
    'b70_79',  count(*) filter (where e.score_total >= 70 and e.score_total < 80),
    'b80_89',  count(*) filter (where e.score_total >= 80 and e.score_total < 90),
    'b90_100', count(*) filter (where e.score_total >= 90)
  )                                                    as distribution,
  max(e.created_at) filter (where e.score_total is not null)
                                                       as last_review_at,
  coalesce(t.top_aromas, '[]'::jsonb)                  as top_aromas,
  count(*)::integer                                    as entry_count
from public_entries e
left join top t on t.cigar_id = e.cigar_id
group by e.cigar_id, t.top_aromas;

comment on materialized view public.cigar_stats is
  'Public rating aggregate (§5.4) and most-cited aromas. Reads ONLY visibility = '
  '''public'' — a materialized view cannot carry RLS, so that predicate is the '
  'security boundary, not an optimisation. review_count counts scored entries; '
  'entry_count counts every public entry; top_aromas lists at most eight '
  'descriptor ids with their citation count. Refreshed by public.refresh_cigar_stats().';

-- Obligatoire pour REFRESH … CONCURRENTLY, qui est le seul mode qui ne verrouille
-- pas la fiche cigare pendant le calcul.
create unique index cigar_stats_cigar_key on public.cigar_stats (cigar_id);
create index cigar_stats_bayesian_idx on public.cigar_stats (bayesian_score desc);

-- Mêmes droits qu'en 0003 : lecture pour tous, écriture pour personne — la vue
-- s'écrit par refresh_cigar_stats(), SECURITY DEFINER.
revoke all on public.cigar_stats from anon, authenticated;
grant select on public.cigar_stats to anon, authenticated;

-- =============================================================================
-- §4 · AUTO-CONTRÔLE
-- =============================================================================

do $$
declare
  viewdef text;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'ref' and table_name = 'cigars' and column_name = 'aroma_tags'
  ) then
    raise exception 'VITOLA_MIGRATION_INCOMPLETE: ref.cigars.aroma_tags manque';
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'ref.cigars'::regclass and tgname = 'cigars_aroma_tags_guard'
  ) then
    raise exception 'VITOLA_MIGRATION_INCOMPLETE: le trigger cigars_aroma_tags_guard manque';
  end if;

  if not exists (
    select 1 from information_schema.column_privileges
     where table_schema = 'ref' and table_name = 'cigars'
       and column_name = 'aroma_tags' and grantee = 'authenticated'
       and privilege_type = 'UPDATE'
  ) then
    raise exception 'VITOLA_MIGRATION_INCOMPLETE: authenticated n''a pas UPDATE sur aroma_tags';
  end if;

  viewdef := pg_get_viewdef('public.cigar_stats'::regclass);
  if position('visibility = ''public''' in viewdef) = 0 then
    raise exception 'VITOLA_MIGRATION_INCOMPLETE: cigar_stats ne filtre plus sur visibility = public';
  end if;
  if position('top_aromas' in viewdef) = 0 then
    raise exception 'VITOLA_MIGRATION_INCOMPLETE: cigar_stats ne porte pas top_aromas';
  end if;

  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and tablename = 'cigar_stats' and indexname = 'cigar_stats_cigar_key'
  ) then
    raise exception 'VITOLA_MIGRATION_INCOMPLETE: cigar_stats a perdu son index unique (REFRESH CONCURRENTLY)';
  end if;

  -- §0.5 : la table touchée garde sa RLS.
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'ref' and c.relname = 'cigars' and c.relrowsecurity
  ) then
    raise exception 'VITOLA_RLS_GAP: ref.cigars sans RLS';
  end if;

  raise notice 'VITOLA 0025 OK — profil aromatique en place, arômes cités agrégés, RLS intacte.';
end $$;

commit;
