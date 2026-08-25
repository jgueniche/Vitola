-- Contrôles sur les droits d'appel des fonctions, sur TOUS nos schémas.
-- Exécuté en CI après les migrations 0002 et 0005.
--
-- Élargi à `ref` et `mod` le 22 août 2026. Il ne regardait que `public`, et ce
-- angle mort a coûté exactement ce qu'un angle mort coûte : les deux fonctions
-- de trigger de `ref` sont restées appelables par un visiteur anonyme depuis le
-- premier jour, sans que ce fichier — qui existe pour cela — puisse le voir.
-- Relevé par les advisors Supabase, pas par la CI. Voir 0005.
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
  select string_agg(format('%I.%I', n.nspname, p.proname), ', ' order by 1) into offender
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'ref', 'mod', 'shop')
     -- une entrée PUBLIC s'écrit `=X/grantor` : grantee vide avant le `=`
     and array_to_string(coalesce(p.proacl, '{}')::text[], ' ') ~ '(^| )=X/';
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: EXECUTE accordé à PUBLIC sur : %', offender;
  end if;

  -- 2. Aucune fonction de trigger n'est appelable par un client.
  select string_agg(format('%I.%I', n.nspname, p.proname), ', ' order by 1) into offender
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'ref', 'mod', 'shop')
     and pg_get_function_result(p.oid) = 'trigger'
     and (has_function_privilege('anon', p.oid, 'EXECUTE')
       or has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: fonction(s) de trigger appelables par un client : %', offender;
  end if;

  -- 3. La garde que la 0009 a écrite, et qui remplace celle d'avant.
  --
  --    L'ancienne vérifiait que `is_privileged_context()` restait fermée aux
  --    clients. Elle était juste et elle a coûté six mois de profils non
  --    modifiables : le trigger `tg_protect_profile_privileges()` l'appelait,
  --    en **droits d'appelant**, donc tout `update public.profiles` d'un membre
  --    échouait sur « permission denied for function is_privileged_context ».
  --    Aucun écran n'écrivait dans `profiles`, donc rien ne l'a vu.
  --
  --    Cette version-ci est plus générale et aurait attrapé le bug le jour de
  --    son écriture : **aucune fonction de trigger en droits d'appelant ne doit
  --    appeler une fonction que `authenticated` ne peut pas appeler.** Elle lit
  --    les corps, parce que plpgsql ne déclare aucune dépendance — c'est
  --    exactement ce qui a rendu ce bug invisible aux outils.
  with trigger_functions as (
    select distinct p.oid, p.proname, p.prosecdef, p.prosrc
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
      join pg_namespace n on n.oid = p.pronamespace
     where not t.tgisinternal
       and n.nspname in ('public', 'ref')
       and p.prosecdef = false
  ), called as (
    select f.proname as caller,
           (regexp_matches(f.prosrc, '(public|ref)\.([a-z_]+)\s*\(', 'g'))[2] as callee
      from trigger_functions f
  )
  select string_agg(distinct format('%s -> %s()', c.caller, c.callee), ', ')
    into offender
    from called c
    join pg_proc p
      on p.proname = c.callee
     and p.pronamespace in ('public'::regnamespace, 'ref'::regnamespace)
   where not has_function_privilege('authenticated', p.oid, 'EXECUTE');

  if offender is not null then
    raise exception
      'VITOLA_GRANT_GAP: trigger(s) en droits d''appelant appelant une fonction fermée : %',
      offender;
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

  -- Les deux fonctions ajoutées par 0003 et 0004 sont appelées depuis des
  -- policies, donc évaluées avec le rôle du client : leur retirer EXECUTE
  -- casserait le partage d'une entrée de carnet et la prise de parole.
  if not has_function_privilege('authenticated', 'public.owns_review(uuid)', 'EXECUTE') then
    raise exception 'VITOLA_GRANT_GAP: authenticated a perdu owns_review — le partage est cassé';
  end if;
  foreach fn in array array['anon', 'authenticated'] loop
    if not has_function_privilege(fn, 'public.comment_min_role()', 'EXECUTE') then
      raise exception 'VITOLA_GRANT_GAP: % a perdu comment_min_role', fn;
    end if;
  end loop;

  raise notice 'Droits d''appel : PUBLIC fermé sur public/ref/mod/shop, triggers fermés, fonctions de policy exposées comme prévu.';
end;
$$;
