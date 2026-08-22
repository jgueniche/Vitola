-- =============================================================================
-- VITOLA — 0002 : refermer les EXECUTE que personne n'a accordés
-- -----------------------------------------------------------------------------
-- Relevé par les security advisors Supabase lors du premier chargement réel du
-- projet (22 août 2026). Invisible en local, et pour une raison structurelle :
--
--   * PostgreSQL accorde EXECUTE à PUBLIC sur toute fonction, par défaut.
--   * Supabase ajoute, dans le schéma `public`, un `alter default privileges`
--     qui accorde EXECUTE à anon, authenticated et service_role sur toute
--     fonction créée — y compris celles que le §8 de la migration 0001 avait
--     délibérément laissées hors de portée des clients.
--
-- Résultat : les neuf fonctions de `public` étaient appelables par un visiteur
-- anonyme via `/rest/v1/rpc/…`, dont deux en SECURITY DEFINER. Le §8 croyait
-- n'en exposer que quatre. La doublure de CI ne reproduisait que la ligne
-- `on tables` de ce mécanisme, jamais `on functions` : le contrôle ne pouvait
-- pas voir le trou. La doublure est corrigée dans le même commit.
--
-- Ce que cette migration ne fait PAS, et pourquoi :
--   `current_app_role()` reste exposée. Elle est appelée par `has_min_role()`,
--   qui est SECURITY INVOKER, elle-même appelée par les policies SELECT de
--   `ref.cigars` et `public.profiles` ouvertes à `anon`. Retirer EXECUTE à anon
--   casse la lecture publique du référentiel — vérifié, pas supposé :
--   « permission denied for function current_app_role » sur `select from
--   ref.cigars` en tant qu'anon. Le §8 de 0001 ne l'accordait qu'à
--   `authenticated` : c'était un bug latent, masqué par le défaut Supabase
--   ci-dessus. Le grant à `anon` est donc rendu explicite ici, à sa vraie place,
--   plutôt que subi. La sortir du schéma exposé est une décision d'architecture
--   qui appartient au propriétaire du projet, pas à cette migration.
-- =============================================================================

begin;

-- --- 1. Le grant implicite à PUBLIC, que personne n'a jamais écrit -----------
revoke execute on all functions in schema public from public;

-- --- 2. Les fonctions que le §8 n'a jamais accordées -------------------------
-- Fonctions de trigger : appelables par personne. PostgreSQL refuse déjà un
-- appel direct, mais un point d'entrée REST qui ne peut que renvoyer une erreur
-- reste un point d'entrée. `is_privileged_context()` est l'auxiliaire des
-- triggers de garde : elle décide qui peut écrire `role` ou `reputation`.
revoke execute on function public.tg_handle_new_user()            from anon, authenticated;
revoke execute on function public.tg_set_updated_at()             from anon, authenticated;
revoke execute on function public.tg_enforce_adult_birth_date()   from anon, authenticated;
revoke execute on function public.tg_protect_profile_privileges() from anon, authenticated;
revoke execute on function public.is_privileged_context()         from anon, authenticated;

-- --- 3. Les quatre fonctions du §8, réaffirmées explicitement ----------------
-- Idempotent, et surtout : ce bloc est désormais la seule source du droit
-- d'appel. Après le §1, plus rien n'est accordé par défaut.
grant execute on function public.immutable_unaccent(text)      to anon, authenticated, service_role;
grant execute on function public.slugify(text)                 to anon, authenticated, service_role;
grant execute on function public.has_min_role(public.app_role) to anon, authenticated, service_role;
-- anon : requis transitivement par has_min_role(), voir l'en-tête.
grant execute on function public.current_app_role()            to anon, authenticated, service_role;

-- --- 4. Que le prochain `create function` n'en accorde plus en douce ---------
-- Sans ceci, la migration suivante rouvre le trou sans que personne l'écrive.
-- Ne vaut que pour les fonctions créées par `postgres`, qui est le rôle des
-- migrations. Le §8 redevient la seule autorité sur les EXECUTE.
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- --- 5. Auto-contrôle --------------------------------------------------------
-- Même principe qu'au §11 de 0001 : l'invariant est asserté dans la transaction
-- qui l'établit, sinon il n'est vrai qu'au moment où on l'a écrit.
do $$
declare
  offender text;
begin
  -- Aucune fonction de `public` ne doit rester appelable par PUBLIC.
  select string_agg(proname, ', ' order by proname) into offender
    from pg_proc
   where pronamespace = 'public'::regnamespace
     -- une entrée PUBLIC s'écrit `=X/grantor` : grantee vide avant le `=`
     and array_to_string(coalesce(proacl, '{}')::text[], ' ') ~ '(^| )=X/';
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: EXECUTE encore accordé à PUBLIC sur : %', offender;
  end if;

  -- Aucune fonction de trigger ne doit rester appelable par un client.
  select string_agg(proname, ', ' order by proname) into offender
    from pg_proc
   where pronamespace = 'public'::regnamespace
     and pg_get_function_result(oid) = 'trigger'
     and (has_function_privilege('anon', oid, 'EXECUTE')
       or has_function_privilege('authenticated', oid, 'EXECUTE'));
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: fonction(s) de trigger appelables par un client : %', offender;
  end if;
end;
$$;

commit;
