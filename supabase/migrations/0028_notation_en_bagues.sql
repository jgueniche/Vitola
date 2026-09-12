-- =============================================================================
-- VITOLA — 0028 : la note se lit en bagues, sur cinq
-- -----------------------------------------------------------------------------
-- QA humaine du 12 septembre 2026 : « système de notation on passe en bague et
-- notation sur 5 ».
--
-- Ce que cette migration NE fait PAS, et c'est la décision : elle ne touche
-- pas à `reviews.score_total`. La note reste stockée sur cent.
--
-- Trois raisons, dans l'ordre où elles comptent.
--   1. Une bague est une ÉCHELLE D'AFFICHAGE, pas une donnée. Convertir la
--      colonne, ce serait perdre les six sous-notes de la dégustation (§5.4) :
--      leur moyenne × 10 donne 78,3 et non 4 — arrondir à l'écriture rendrait
--      les six critères décoratifs, ce que `docs/decisions-log.md` a déjà
--      refusé une fois.
--   2. `cigar_stats.bayesian_score` a un a priori de 10 avis calibré sur
--      cent. Le rebaser sur cinq, c'est refaire l'arithmétique de l'ADR 0004
--      pour gagner une division.
--   3. Un jour on affichera peut-être les deux. Une colonne sur cent sait
--      rendre des bagues ; une colonne sur cinq ne sait plus rendre 78,3.
--
-- Ce qu'elle fait, donc, tient en une chose : la DISTRIBUTION de la vue
-- devient une distribution de bagues. Les cinq tranches de 0003 ('lt60',
-- 'b60_69'…) étaient des tranches de dix points ; en bagues, deux d'entre
-- elles se confondent (20 et 40 tombent tous deux dans 'lt60') et un
-- histogramme qui confond une bague et deux est un histogramme faux. Cinq
-- clés, une par bague, et l'inverse exact de la conversion de l'interface :
-- N bagues valent N × 20, donc ceil(note / 20) rend N, plancher à une bague
-- pour qu'une note de 0 ne tombe pas hors échelle.
--
-- Le reste de la définition est recopié tel quel depuis l'état en base
-- (0003 § 4, augmentée par la 0025 de `top_aromas` et `entry_count`) : le
-- `where visibility = 'public'` est la frontière de sécurité entière — une vue
-- matérialisée ne porte pas de RLS — et l'auto-contrôle du §7 de la 0003 le
-- relit. Le recréer à l'identique est la seule façon de changer une colonne
-- d'une vue matérialisée.
-- =============================================================================

begin;

drop materialized view public.cigar_stats;

create materialized view public.cigar_stats as
with public_entries as (
  select r.cigar_id, r.score_total, r.created_at, r.aroma_tags
    from public.reviews r
   where r.visibility = 'public'
),
scored as (
  select cigar_id, score_total, created_at
    from public_entries
   where score_total is not null
),
prior as (
  select coalesce(avg(score_total), 80.0)::numeric as mean from scored
),
cited as (
  select e.cigar_id, t.tag, count(*)::integer as n
    from public_entries e
    cross join lateral unnest(e.aroma_tags) t(tag)
   group by e.cigar_id, t.tag
),
ranked as (
  select cigar_id, tag, n,
         row_number() over (partition by cigar_id order by n desc, tag) as rank
    from cited
),
top as (
  select cigar_id,
         jsonb_agg(jsonb_build_object('id', tag, 'n', n) order by n desc, tag) as top_aromas
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
  -- Une bague par clé. ceil(note / 20) est l'inverse de « N bagues = N × 20 »,
  -- et le greatest(1, …) garde une note de 0 dans l'échelle plutôt qu'en
  -- dessous : personne ne note zéro bague, mais rien ne l'interdit.
  jsonb_build_object(
    'r1', count(*) filter (where greatest(1, ceil(e.score_total / 20.0)) = 1),
    'r2', count(*) filter (where greatest(1, ceil(e.score_total / 20.0)) = 2),
    'r3', count(*) filter (where greatest(1, ceil(e.score_total / 20.0)) = 3),
    'r4', count(*) filter (where greatest(1, ceil(e.score_total / 20.0)) = 4),
    'r5', count(*) filter (where greatest(1, ceil(e.score_total / 20.0)) = 5)
  )                                                    as distribution,
  max(e.created_at) filter (where e.score_total is not null)
                                                       as last_review_at,
  coalesce(t.top_aromas, '[]'::jsonb)                  as top_aromas,
  count(*)::integer                                    as entry_count
from public_entries e
left join top t on t.cigar_id = e.cigar_id
group by e.cigar_id, t.top_aromas;

comment on materialized view public.cigar_stats is
  'Public rating aggregate (§5.4). Reads ONLY visibility = ''public'' — a '
  'materialized view cannot carry RLS, so that predicate is the security '
  'boundary, not an optimisation. Scores are stored out of 100 and READ in '
  'bands out of 5 (QA of 12 septembre 2026): `distribution` therefore has one '
  'key per band, r1..r5, and ten-point brackets would confuse one band with '
  'two. Refreshed by public.refresh_cigar_stats().';

-- Obligatoires pour REFRESH … CONCURRENTLY, et perdus avec la vue.
create unique index cigar_stats_cigar_key on public.cigar_stats (cigar_id);
create index cigar_stats_bayesian_idx on public.cigar_stats (bayesian_score desc);

revoke all on public.cigar_stats from anon, authenticated;
grant select on public.cigar_stats to anon, authenticated;

refresh materialized view public.cigar_stats;

-- --- Auto-contrôle -----------------------------------------------------------
do $$
declare
  def text;
  keys text;
begin
  def := pg_get_viewdef('public.cigar_stats'::regclass);

  -- La frontière de l'ADR 0004, D3. La 0003 § 7 la vérifie aussi ; la vérifier
  -- ici est ce qui rend un `drop … create` de cette vue sûr à rejouer.
  if position('visibility = ''public''' in def) = 0 then
    raise exception
      'VITOLA_SCOPE_GAP: cigar_stats ne filtre plus visibility = public (ADR 0004, D3)';
  end if;

  -- Les cinq clés, nommées. Une distribution à quatre clés serait un
  -- histogramme dont une barre a disparu, et rien ne le dirait à l'écran.
  -- `distinct`, et la leçon est petite mais vraie : sans lui l'agrégat compte
  -- une clé par ligne de la vue et rend « r1,r1,r1,r1,r2,… ». Une assertion
  -- qui échoue pour sa propre forme n'a rien vérifié de ce qu'elle visait.
  select string_agg(k, ',' order by k) into keys
    from (select distinct jsonb_object_keys(distribution) as k
            from public.cigar_stats) d;
  if keys is not null and keys <> 'r1,r2,r3,r4,r5' then
    raise exception 'VITOLA_SHAPE_GAP: distribution rend « % » au lieu de r1..r5', keys;
  end if;

  if not exists (
    select 1 from pg_index i
     where i.indrelid = 'public.cigar_stats'::regclass and i.indisunique
  ) then
    raise exception
      'VITOLA_INDEX_GAP: cigar_stats a perdu son index unique — REFRESH CONCURRENTLY est mort';
  end if;

  raise notice 'VITOLA 0028 OK — la distribution se compte en bagues, la note reste sur cent.';
end $$;

commit;
