-- =============================================================================
-- VITOLA — 0009 : le garde-fou du profil se gardait lui-même
-- -----------------------------------------------------------------------------
-- **Aucun membre n'a jamais pu modifier son profil.** Pas depuis P1, pas une
-- fois : tout `update public.profiles` en tant que `authenticated` échouait sur
--
--   42501 : permission denied for function is_privileged_context
--
-- Le mécanisme, en trois faits qui sont chacun corrects et qui, ensemble, sont
-- un mur :
--
--   1. `tg_protect_profile_privileges()` est un trigger **BEFORE UPDATE en
--      droits d'appelant** — c'est ce qui lui permet de refuser une écriture de
--      `role` ou de `reputation` en sachant qui écrit ;
--   2. il commence par demander `public.is_privileged_context()`, pour laisser
--      passer les écritures de service ;
--   3. la 0002 a révoqué l'EXECUTE de cette fonction à `anon` et
--      `authenticated`, délibérément et avec raison : « ce n'est pas un point
--      d'entrée REST ».
--
-- Un trigger en droits d'appelant ne peut appeler que ce que l'appelant peut
-- appeler. Le garde-fou fermait donc la porte qu'il était censé surveiller, et
-- rien ne l'a vu : aucun écran n'écrivait dans `profiles` avant `/parametres`.
-- Les 165 tests unitaires, les 56 e2e et `pnpm check` étaient verts pendant tout
-- ce temps ; il a fallu remplir un champ « Ville » dans un navigateur.
--
-- **Ce que cette migration ne fait pas**, et pourquoi :
--
--   · *Accorder l'EXECUTE à `authenticated`.* Ce serait le plus petit diff, et
--     ce serait défaire la décision de la 0002 pour réparer une conséquence
--     qu'elle n'avait pas prévue. La fonction est en droits d'appelant et n'a
--     jamais été conçue pour être appelée — contrairement à
--     `current_app_role()`, qui est SECURITY DEFINER *et* accordée exprès.
--
--   · *Passer le trigger en SECURITY DEFINER.* Il s'exécuterait alors en tant
--     que `postgres`, donc `current_user in ('postgres', …)` serait **vrai**,
--     donc le garde-fou serait sauté pour tout le monde. La correction la plus
--     tentante est ici la pire : elle rend le test vert en le désarmant.
--
-- Ce qu'elle fait : le prédicat descend **dans** le trigger, qui n'a alors plus
-- rien à appeler, et la fonction devenue sans appelant est retirée. Une
-- fonction qu'aucun trigger en droits d'appelant ne peut appeler n'est pas un
-- auxiliaire, c'est un piège tendu au prochain garde-fou.
--
-- Ordre de lecture :
--   §1  Le trigger, prédicat inclus
--   §2  Le retrait de l'auxiliaire
--   §3  Auto-contrôle — la garde générale qui aurait attrapé ceci
-- =============================================================================

begin;

-- =============================================================================
-- §1 · LE TRIGGER, PRÉDICAT INCLUS
-- -----------------------------------------------------------------------------
-- Le corps est mot pour mot celui de la 0001, avec l'appel remplacé par ce que
-- la fonction faisait. Rien d'autre ne change : mêmes refus, mêmes codes, même
-- horodatage.
-- =============================================================================

create or replace function public.tg_protect_profile_privileges()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  jwt_role text;
  privileged boolean;
begin
  -- Le prédicat de feu `is_privileged_context()`, inline. La lecture du claim
  -- est enveloppée parce qu'un `request.jwt.claims` malformé ne doit pas faire
  -- échouer une mise à jour de profil : l'absence de preuve de privilège est
  -- traitée comme une absence de privilège, ce qui est le sens sûr.
  begin
    jwt_role := coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
      ''
    );
  exception when others then
    jwt_role := '';
  end;

  privileged := jwt_role = 'service_role'
             or current_user in ('postgres', 'supabase_admin', 'service_role');

  if privileged then
    new.updated_at := now();
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'VITOLA_FORBIDDEN: role is not client-writable' using errcode = '42501';
  end if;

  if new.reputation is distinct from old.reputation then
    raise exception 'VITOLA_FORBIDDEN: reputation is not client-writable' using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.tg_protect_profile_privileges() is
  'Refuses client writes to profiles.role and profiles.reputation. The '
  'privileged-context test is inlined rather than called: this trigger runs '
  'with the caller''s rights, so any function it calls must be executable by '
  'the caller — and the helper it used to call was, correctly, executable by '
  'nobody. See migration 0009.';

revoke execute on function public.tg_protect_profile_privileges() from public;
revoke execute on function public.tg_protect_profile_privileges() from anon, authenticated;

-- =============================================================================
-- §2 · LE RETRAIT DE L'AUXILIAIRE
-- -----------------------------------------------------------------------------
-- Elle n'a plus d'appelant, et elle ne peut en avoir aucun : tout trigger en
-- droits d'appelant qui l'appellerait reproduirait exactement ce bug. La
-- laisser en place serait laisser l'amorce.
--
-- `drop` et non `revoke` : PostgreSQL ne suit pas les dépendances dans un corps
-- plpgsql, donc rien ne signalerait qu'on vient de la rebrancher. Une fonction
-- absente, si.
-- =============================================================================

drop function if exists public.is_privileged_context();

-- =============================================================================
-- §3 · AUTO-CONTRÔLE
-- -----------------------------------------------------------------------------
-- La garde générale, celle qui aurait attrapé le bug le jour où il a été écrit :
-- **aucune fonction de trigger en droits d'appelant ne doit appeler une fonction
-- que `authenticated` ne peut pas appeler.**
--
-- Elle lit les corps plutôt que les dépendances, parce que plpgsql n'en déclare
-- aucune : c'est précisément ce qui a rendu ce bug invisible à tout outil.
-- Elle vit aussi dans `supabase/tests/02_function_grants.sql`, qui n'accorde
-- rien — un auto-contrôle ne peut pas échouer sur ce que sa migration vient de
-- réparer.
-- =============================================================================

do $$
declare
  offender text;
begin
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
      'VITOLA_TRIGGER_GAP: trigger(s) en droits d''appelant appelant une fonction fermée aux clients : %',
      offender;
  end if;

  -- Et l'inverse de ce que la 0002 asserte : la fonction retirée ne doit pas
  -- réapparaître par un `create or replace` distrait dans une migration future.
  if exists (
    select 1 from pg_proc
     where pronamespace = 'public'::regnamespace and proname = 'is_privileged_context'
  ) then
    raise exception 'VITOLA_TRIGGER_GAP: is_privileged_context() est revenue (migration 0009)';
  end if;

  raise notice '0009 : le garde-fou du profil n''appelle plus rien, et rien ne le referme.';
end;
$$;

commit;
