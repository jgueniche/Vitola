-- Contrôles sur les droits d'appel des fonctions de `public`.
-- Exécuté en CI après la migration 0002.
--
-- Pourquoi un test dédié : PostgreSQL accorde EXECUTE à PUBLIC sur toute
-- fonction, et Supabase y ajoute un `alter default privileges` qui l'accorde à
-- anon et authenticated. Les deux sont silencieux. Le §8 de la migration 0001
-- croyait n'exposer que quatre fonctions ; il y en avait neuf sur le projet
-- réel. Ce fichier fait de la liste du §8 une liste vérifiée, pas déclarative.
do $$
declare
  offender text;
  fn text;
begin
  -- 1. Personne n'appelle une fonction de `public` au titre de PUBLIC.
  select string_agg(proname, ', ' order by proname) into offender
    from pg_proc
   where pronamespace = 'public'::regnamespace
     -- une entrée PUBLIC s'écrit `=X/grantor` : grantee vide avant le `=`
     and array_to_string(coalesce(proacl, '{}')::text[], ' ') ~ '(^| )=X/';
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: EXECUTE accordé à PUBLIC sur : %', offender;
  end if;

  -- 2. Aucune fonction de trigger n'est appelable par un client.
  select string_agg(proname, ', ' order by proname) into offender
    from pg_proc
   where pronamespace = 'public'::regnamespace
     and pg_get_function_result(oid) = 'trigger'
     and (has_function_privilege('anon', oid, 'EXECUTE')
       or has_function_privilege('authenticated', oid, 'EXECUTE'));
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: fonction(s) de trigger appelables par un client : %', offender;
  end if;

  -- 3. is_privileged_context() décide qui peut écrire `role` et `reputation`.
  --    Le §8 ne l'accorde à personne : ce n'est pas un point d'entrée REST.
  if has_function_privilege('anon', 'public.is_privileged_context()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.is_privileged_context()', 'EXECUTE') then
    raise exception 'VITOLA_GRANT_GAP: is_privileged_context() est appelable par un client';
  end if;

  -- 4. L'inverse : les quatre fonctions du §8 doivent RESTER appelables.
  --    Un revoke trop large casse la lecture publique, et le casse en silence :
  --    « permission denied for function current_app_role » n'apparaît qu'à la
  --    première requête d'un visiteur anonyme sur ref.cigars.
  foreach fn in array array[
    'public.immutable_unaccent(text)',
    'public.slugify(text)',
    'public.has_min_role(public.app_role)',
    'public.current_app_role()'
  ] loop
    if not has_function_privilege('anon', fn, 'EXECUTE') then
      raise exception 'VITOLA_GRANT_GAP: anon a perdu EXECUTE sur % — la lecture publique est cassée', fn;
    end if;
    if not has_function_privilege('authenticated', fn, 'EXECUTE') then
      raise exception 'VITOLA_GRANT_GAP: authenticated a perdu EXECUTE sur %', fn;
    end if;
  end loop;

  raise notice 'Droits d''appel : PUBLIC fermé, triggers fermés, 4 fonctions exposées comme prévu.';
end;
$$;
