-- =============================================================================
-- VITOLA — 0032 : cinq bagues à essayer, déduites du carnet
-- -----------------------------------------------------------------------------
-- QA humaine du 12 septembre 2026 : « créer une section / feature : suggestion
-- — il prend les 5 bagues avec une moyenne de ce que le client a fumé et il
-- fait des propositions, avec ce qu'il a pas fumé, l'ambiance etc. »
--
-- **Pourquoi en SQL et pas en TypeScript.** Trois raisons, et la première est
-- la seule qui compte : le calcul lit le carnet du membre, qui est la donnée
-- que quatre policies SELECT protègent (ADR 0004). Une fonction
-- `SECURITY INVOKER` lit exactement ce que l'appelant pourrait lire à la main,
-- donc elle ne peut pas inventer un accès. Les deux autres : 940 fiches ne
-- traversent pas le réseau pour être triées en mémoire, et le score s'écrit
-- une fois plutôt que dans chaque écran qui voudra le montrer.
--
-- INVOKER et non DEFINER, comme `smoke_from_humidor()` (0008) : un appel
-- PostgREST EST une transaction, et il n'y a ici aucune frontière à acheter.
-- L'auto-contrôle du bas échoue si elle repasse un jour en DEFINER.
--
-- **Le profil de goût, et ce qu'il fait quand il n'a rien.** Il est fait de
-- trois choses mesurées sur ce que le membre a fumé :
--
--   1. Les ARÔMES. D'abord ceux que ses propres entrées citent
--      (`reviews.aroma_tags`) ; quand elles n'en citent aucun — le cas de
--      quelqu'un qui note sans détailler — ceux du référentiel sur les fiches
--      qu'il a fumées (`ref.cigars.aroma_tags`, 0025). Deux sources, dans cet
--      ordre, et jamais mélangées : ce qu'il a dit vaut mieux que ce que la
--      fiche dit.
--   2. La FORCE moyenne, sur l'échelle ordinale du §5.1 (leger = 1 …
--      corse = 5). Un écart d'un cran coûte peu, deux crans beaucoup.
--   3. Le CEPO moyen, parce qu'un module se choisit aussi à la main.
--
-- Pondéré par la note quand il y en a une : une fiche notée quatre bagues
-- compte plus qu'une notée deux. Une entrée sans note compte une fois — elle
-- dit « j'ai fumé ça », ce qui est déjà une information.
--
-- **Un carnet vide ne rend pas une liste vide.** Sans rien à quoi ressembler,
-- la fonction rend les fiches les mieux notées par les membres qui ont un
-- profil aromatique — le seul classement honnête quand on ne sait rien de
-- quelqu'un. `reason = 'popular'` le dit, et l'écran l'écrit.
--
-- **Ce qu'elle ne fait jamais** : proposer une fiche dont le membre a déjà une
-- entrée. « Avec ce qu'il a pas fumé » est la moitié de la demande.
-- =============================================================================

begin;

create or replace function public.suggest_cigars(p_limit integer default 5)
returns table (
  cigar_id uuid,
  slug text,
  commercial_name text,
  brand_name text,
  vitola_name text,
  ring_gauge integer,
  length_mm integer,
  strength text,
  wrapper_shade text,
  aroma_tags integer[],
  shared_aromas integer,
  score numeric,
  reason text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_limit integer := least(greatest(coalesce(p_limit, 5), 1), 20);
  v_entries integer := 0;
  v_strength numeric;
  v_ring numeric;
begin
  if v_uid is null then
    return;
  end if;

  /* CTEs and not temporary tables, and the reason is a refusal worth keeping:
     `CREATE TABLE AS is not allowed in a non-volatile function`. A `stable`
     function may not write, which is exactly the promise this one wants to
     make — so the profile is computed inside the statement that uses it. */
  select count(*) into v_entries
    from public.reviews r
   where r.user_id = v_uid and r.cigar_id is not null;

  /* Nothing to resemble: the honest answer is what the members rate highest
     among the sheets that carry an aroma profile. Said as `popular`, so the
     screen can write "en attendant que votre carnet parle" rather than
     implying a deduction nobody made. */
  if v_entries = 0 then
    return query
    select c.id, c.slug, c.commercial_name, b.name, v.name_salida,
           /* `ref.vitolas` measures a cepo and a length in smallint — the
              honest width for 52 and 164 — and a function's OUT column is
              typed integer. PostgreSQL refuses the row rather than widening
              it, which is the right way round and is why both branches cast. */
           v.ring_gauge::integer, v.length_mm::integer,
           c.strength::text, c.wrapper_shade::text,
           c.aroma_tags, 0,
           coalesce(s.bayesian_score, 0)::numeric,
           'popular'::text
      from ref.cigars c
      left join ref.brands b on b.id = c.brand_id
      left join ref.vitolas v on v.id = c.vitola_id
      left join public.cigar_stats s on s.cigar_id = c.id
     where c.status = 'published'
       and cardinality(c.aroma_tags) > 0
     order by coalesce(s.bayesian_score, 0) desc, c.commercial_name
     limit v_limit;
    return;
  end if;

  /* The weighted mean strength and ring gauge of what they smoked. The weight
     of one entry: a note of five bands is worth two and a half entries, one
     band half of one, and an UNSCORED entry exactly one. `score_total / 40`
     puts the neutral point at two bands and a half — the middle of the scale
     rather than the middle of the data, so a member who rates everything four
     bands is still told what they like best instead of having it flattened. */
  select sum(
           case c.strength
             when 'leger' then 1 when 'leger_moyen' then 2 when 'moyen' then 3
             when 'moyen_corse' then 4 when 'corse' then 5
           end * coalesce(r.score_total / 40.0, 1.0)
         ) / nullif(sum(case when c.strength is null then 0
                             else coalesce(r.score_total / 40.0, 1.0) end), 0),
         sum(v.ring_gauge * coalesce(r.score_total / 40.0, 1.0))
           / nullif(sum(case when v.ring_gauge is null then 0
                             else coalesce(r.score_total / 40.0, 1.0) end), 0)
    into v_strength, v_ring
    from public.reviews r
    join ref.cigars c on c.id = r.cigar_id
    left join ref.vitolas v on v.id = c.vitola_id
   where r.user_id = v_uid and r.cigar_id is not null;

  return query
  with mine as (
    select r.cigar_id, r.score_total, r.aroma_tags
      from public.reviews r
     where r.user_id = v_uid and r.cigar_id is not null
  ),
  weighted as (
    select m.cigar_id, coalesce(m.score_total / 40.0, 1.0) as w, m.aroma_tags as said
      from mine m
  ),
  said as (
    select t.tag, sum(w.w) as weight
      from weighted w cross join lateral unnest(w.said) as t(tag)
     group by t.tag
  ),
  /* The referential's own profile of what they smoked — the fallback for a
     member who notes without naming aromas. Read only when `said` is empty:
     what someone said about a cigar outranks what the sheet says about it. */
  sheeted as (
    select t.tag, sum(w.w) as weight
      from weighted w
      join ref.cigars c on c.id = w.cigar_id
      cross join lateral unnest(c.aroma_tags) as t(tag)
     group by t.tag
  ),
  taste as (
    select tag, weight from said
     union all
    select tag, weight from sheeted where not exists (select 1 from said)
  ),
  candidate as (
    select c.id, c.slug, c.commercial_name, b.name as brand_name,
           v.name_salida as vitola_name, v.ring_gauge, v.length_mm,
           c.strength, c.wrapper_shade, c.aroma_tags,
           coalesce(s.bayesian_score, 0)::numeric as public_note,
           (select coalesce(sum(t.weight), 0) from taste t
             where t.tag = any (c.aroma_tags)) as aroma_weight,
           (select count(*) from taste t
             where t.tag = any (c.aroma_tags)) as shared
      from ref.cigars c
      left join ref.brands b on b.id = c.brand_id
      left join ref.vitolas v on v.id = c.vitola_id
      left join public.cigar_stats s on s.cigar_id = c.id
     where c.status = 'published'
       and not exists (select 1 from mine m where m.cigar_id = c.id)
  ),
  scored as (
  select k.id, k.slug, k.commercial_name, k.brand_name, k.vitola_name,
         k.ring_gauge::integer as ring_gauge, k.length_mm::integer as length_mm,
         k.strength::text as strength, k.wrapper_shade::text as wrapper_shade,
         k.aroma_tags,
         k.shared::integer as shared,
         /*
          * The score, and every term is a measurement rather than a taste.
          *
          *   + 3 per unit of shared aroma weight — the strongest signal, and
          *     the only one that comes from words the member wrote;
          *   − 1,2 per step of strength away from their average, so one step
          *     costs little and two cost more than one shared aroma;
          *   − 0,06 per ring unit away, which makes ten units cost about half
          *     a step of strength;
          *   + 0,4 per band of public note, as a tie-break between sheets the
          *     profile cannot separate — never as the main term, or this is a
          *     popularity list wearing a deduction's clothes.
          *
          * A sheet with no strength or no vitola is charged the default
          * distance (one step, eight ring units) rather than nothing: 601 of
          * the 940 sheets have neither, and treating silence as a perfect
          * match would fill the five slots with the emptiest fiches on the
          * site.
          */
         (3.0 * k.aroma_weight
          - 1.2 * coalesce(abs(
              case k.strength
                when 'leger' then 1 when 'leger_moyen' then 2 when 'moyen' then 3
                when 'moyen_corse' then 4 when 'corse' then 5
              end - v_strength), 1.0)
          - 0.06 * coalesce(abs(k.ring_gauge - v_ring), 8.0)
          + 0.4 * (k.public_note / 20.0)
          /*
           * And a term for what the sheet can SAY. Measured on the real base
           * before it was added: with the referential as it stands — 601
           * sheets with neither vitola nor strength, 48 with an aroma profile
           * — every `moyen` candidate tied at the same score and the five
           * slots went to whatever sorted first alphabetically. Five
           * Plasencias in a row, in order, is not a suggestion.
           *
           * Preferring a documented sheet is not a thumb on the scale: a
           * suggestion is an invitation to open a page, and a page that says
           * « vitole non renseignée » is an invitation to nothing. It stays
           * small — half a band of public note — so one shared aroma still
           * outranks any amount of completeness.
           */
          + 0.5 * (case when cardinality(k.aroma_tags) > 0 then 1 else 0 end)
          + 0.25 * (case when k.ring_gauge is not null then 1 else 0 end)
          + 0.15 * (case when k.strength is not null then 1 else 0 end)
         )::numeric as score,
         /* What to tell the reader this suggestion rests on. `profile` claims
            a deduction, so it is only used when the profile actually held
            something: a notebook of six unscored entries on blank sheets
            deduces nothing, and saying otherwise would be the interface
            lying about its own reasoning. */
         case
           when k.shared > 0 then 'aroma'
           when v_strength is not null or v_ring is not null then 'profile'
           else 'popular'
         end::text as reason
    from candidate k
  ),
  /*
   * One sheet per maison, and it is the rule that makes this a suggestion
   * rather than a list. Measured on the real base: without it the five slots
   * went to five Plasencias in alphabetical order, because 48 sheets carry an
   * aroma profile and most of them are Plasencia's. Five bands from one house
   * is one suggestion shown five times.
   *
   * The diversity is on the BRAND and not on the line or the vitola: a maison
   * is what someone recognises on a shelf, and it is the level at which
   * "something else" means something. A sheet with no brand at all
   * (`brand_id` is nullable) competes on its own id, so it is never collapsed
   * with another orphan.
   */
  diverse as (
    select s.*,
           row_number() over (
             partition by coalesce(s.brand_name, s.id::text)
             order by s.score desc, cardinality(s.aroma_tags) desc, s.commercial_name
           ) as rank_in_brand
      from scored s
  )
  select d.id, d.slug, d.commercial_name, d.brand_name, d.vitola_name,
         d.ring_gauge, d.length_mm, d.strength, d.wrapper_shade, d.aroma_tags,
         d.shared, d.score, d.reason
    from diverse d
   where d.rank_in_brand = 1
   order by d.score desc, cardinality(d.aroma_tags) desc, d.commercial_name
   limit v_limit;
end;
$$;

comment on function public.suggest_cigars(integer) is
  'Five sheets the caller has no entry for, ranked against the taste their '
  'notebook describes: the aromas they name (falling back to the referential '
  'profile of what they smoked), their weighted mean strength and ring gauge, '
  'with the public note as a tie-break only. SECURITY INVOKER — it reads the '
  'caller''s own reviews under the four SELECT policies of ADR 0004 and can '
  'see nothing they could not read by hand. An empty notebook returns the '
  'best-rated profiled sheets, flagged `popular`.';

revoke execute on function public.suggest_cigars(integer) from public;
revoke execute on function public.suggest_cigars(integer) from anon;
grant execute on function public.suggest_cigars(integer) to authenticated;

-- --- Auto-contrôle -----------------------------------------------------------
do $$
declare
  cols text;
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'suggest_cigars'
  ) then
    raise exception 'VITOLA_MIGRATION_INCOMPLETE: public.suggest_cigars() manque';
  end if;

  /* The whole security argument of this function is that it holds no
     privilege: it reads the caller's notebook as the caller. A DEFINER here
     would read EVERYBODY's notebook and rank against it, which is the
     inference channel ADR 0004's D3 exists to close. */
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'suggest_cigars' and p.prosecdef
  ) then
    raise exception
      'VITOLA_PRIVILEGE_CREEP: suggest_cigars() est passée en SECURITY DEFINER';
  end if;

  -- A visitor has no notebook, so there is nothing for them to ask.
  if has_function_privilege('anon', 'public.suggest_cigars(integer)', 'EXECUTE') then
    raise exception 'VITOLA_GRANT_GAP: suggest_cigars() est appelable par un anonyme';
  end if;
  if not has_function_privilege('authenticated', 'public.suggest_cigars(integer)', 'EXECUTE') then
    raise exception 'VITOLA_GRANT_GAP: suggest_cigars() n''est pas appelable par un membre';
  end if;

  -- The shape the screen reads. A column added silently would be a column the
  -- screen never shows; one removed would be a runtime error on a page.
  select string_agg(o.attname, ',' order by o.attnum) into cols
    from pg_proc p
    cross join lateral unnest(p.proargnames, p.proargmodes) with ordinality as o(attname, mode, attnum)
   where p.oid = 'public.suggest_cigars(integer)'::regprocedure and o.mode = 't';
  if cols <> 'cigar_id,slug,commercial_name,brand_name,vitola_name,ring_gauge,'
             'length_mm,strength,wrapper_shade,aroma_tags,shared_aromas,score,reason' then
    raise exception 'VITOLA_SHAPE_GAP: suggest_cigars() rend « % »', cols;
  end if;

  raise notice 'VITOLA 0032 OK — cinq bagues déduites du carnet, sans privilège.';
end $$;

commit;
