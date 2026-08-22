-- =============================================================================
-- VITOLA — 0005 : refermer dans `ref` ce que 0002 a refermé dans `public`
-- -----------------------------------------------------------------------------
-- Relevé par les security advisors Supabase le 22 août 2026, en vérifiant les
-- conséquences de 0003 et 0004. Ce n'est pas une régression de ces migrations :
-- c'est un trou d'origine que personne ne pouvait voir.
--
-- La migration 0002 a fermé les EXECUTE que personne n'avait accordés — mais
-- seulement dans `public`. Son auto-contrôle, et le test
-- `supabase/tests/02_function_grants.sql` qui le reprend, filtrent tous deux sur
-- `pronamespace = 'public'::regnamespace`. Les deux fonctions de trigger de
-- `ref` étaient donc hors du champ du contrôle **et** hors du champ de la
-- correction, depuis le premier jour :
--
--   ref.tg_cigars_search_vector()    SECURITY DEFINER, anon=true, authenticated=true
--   ref.tg_touch_dependent_cigars()  SECURITY DEFINER, anon=true, authenticated=true
--
-- Toutes deux sont exposées en `/rest/v1/rpc/…`, `ref` faisant partie des
-- schémas publiés à PostgREST. Les appeler directement échoue — PostgreSQL
-- refuse d'exécuter une fonction de trigger hors trigger — mais 0002 avait déjà
-- tranché ce point : « un point d'entrée REST qui ne peut que renvoyer une
-- erreur reste un point d'entrée ». La même règle vaut ici.
--
-- Ce que corrige ce fichier, et dans cet ordre d'importance :
--   1. le contrôle, élargi à `ref` et `mod` — sans quoi la correction se
--      reperdrait à la prochaine fonction créée hors de `public` ;
--   2. les deux fonctions ;
--   3. le défaut, pour que le prochain `create function` dans `ref` n'accorde
--      plus rien en douce.
-- =============================================================================

begin;

-- --- 1. Les deux fonctions -----------------------------------------------------
revoke execute on function ref.tg_cigars_search_vector()   from public, anon, authenticated;
revoke execute on function ref.tg_touch_dependent_cigars() from public, anon, authenticated;

-- --- 2. Le défaut, pour la suite ----------------------------------------------
-- Ne vaut que pour les fonctions créées par `postgres`, qui est le rôle des
-- migrations — c'est-à-dire toutes.
alter default privileges in schema ref revoke execute on functions from public, anon, authenticated;
alter default privileges in schema mod revoke execute on functions from public, anon, authenticated;

-- --- 3. Auto-contrôle, désormais sur les trois schémas -------------------------
-- C'est la partie qui compte. Une correction sans élargissement du contrôle se
-- reperd ; c'est très exactement ce qui s'est passé entre 0002 et aujourd'hui.
do $$
declare
  offender text;
begin
  -- Aucune fonction appelable au titre de PUBLIC, dans aucun de nos schémas.
  select string_agg(format('%I.%I', n.nspname, p.proname), ', ' order by 1) into offender
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'ref', 'mod')
     and array_to_string(coalesce(p.proacl, '{}')::text[], ' ') ~ '(^| )=X/';
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: EXECUTE accordé à PUBLIC sur : %', offender;
  end if;

  -- Aucune fonction de trigger appelable par un rôle client, dans aucun schéma.
  select string_agg(format('%I.%I', n.nspname, p.proname), ', ' order by 1) into offender
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'ref', 'mod')
     and pg_get_function_result(p.oid) = 'trigger'
     and (has_function_privilege('anon', p.oid, 'EXECUTE')
       or has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: fonction(s) de trigger appelables par un client : %', offender;
  end if;

  -- Et l'inverse, sans quoi un revoke trop large casserait la lecture publique
  -- en silence — c'est la leçon de `current_app_role()` en 0002.
  if not has_function_privilege('anon', 'public.has_min_role(public.app_role)', 'EXECUTE') then
    raise exception 'VITOLA_GRANT_GAP: anon a perdu has_min_role — la lecture publique est cassée';
  end if;
  if not has_function_privilege('authenticated', 'public.owns_review(uuid)', 'EXECUTE') then
    raise exception 'VITOLA_GRANT_GAP: authenticated a perdu owns_review — le partage est cassé';
  end if;

  raise notice '0005 : EXECUTE fermé sur public, ref et mod ; les fonctions de policy restent appelables.';
end;
$$;

commit;
