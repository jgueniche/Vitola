-- =============================================================================
-- VITOLA — 0012 : on doit pouvoir défaire ce qu'on a fait
-- -----------------------------------------------------------------------------
-- Corrige la 0010, et le bug a été trouvé de la seule façon dont il pouvait
-- l'être : en bloquant quelqu'un dans un navigateur, puis en cherchant comment
-- le débloquer.
--
-- `profiles_block_restrictive` cachait le profil **dans les deux sens**. C'était
-- l'intention — un blocage est réciproque — et c'était faux d'un côté :
--
--   1. Le seul écran qui porte « Débloquer » est le profil de la personne
--      bloquée. Bloquer le rendait introuvable. **Un blocage était donc
--      définitif**, ce que personne n'a décidé et que rien n'annonçait.
--   2. Même une liste des personnes bloquées n'aurait pas suffi : les profils
--      étant masqués, elle aurait affiché des identifiants. On ne relit pas une
--      décision présentée sous forme d'uuid.
--
-- La correction est de rendre le prédicat **directionnel** sur `profiles`, et
-- sur `profiles` seulement :
--
--   `posts`, `post_comments`, `reviews`, `comments` — réciproque, inchangé.
--     Bloquer quelqu'un, c'est ne plus lire ce qu'il écrit, et cela vaut dans
--     les deux sens.
--   `profiles` — à sens unique. Celui qui bloque continue de voir le profil de
--     celui qu'il a bloqué ; l'inverse n'est pas vrai. Cacher à quelqu'un la
--     cible de sa propre décision ne protège personne : c'est son geste, et il
--     doit pouvoir le défaire.
--
-- Ce que cela ne rouvre pas, et il faut le dire : celui qui bloque voit le
-- profil, jamais le contenu. La page de la personne bloquée lui rend une
-- coquille — nom, pseudo, dates — et « rien que vous puissiez lire » partout
-- ailleurs, plus le bandeau qui explique pourquoi.
-- =============================================================================

begin;

-- =============================================================================
-- §1 · L'ACCESSEUR DIRECTIONNEL
-- -----------------------------------------------------------------------------
-- Le pendant de `blocked_user_ids()`, qui garde les deux sens. Même motif, même
-- raison d'être SECURITY DEFINER — `blocks` n'est lisible que de ses parties, et
-- celui-ci doit répondre sur le sens que l'appelant ne voit pas.
--
-- Il rend un TABLEAU pour la même raison mesurée qu'en 0010 : enveloppé dans un
-- `(select …)`, il s'évalue une fois par requête en InitPlan, et non une fois
-- par ligne examinée.
-- =============================================================================

create or replace function public.blockers_of_me()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(b.blocker_id), '{}'::uuid[])
    from public.blocks b
   where b.blocked_id = (select auth.uid())
$$;

comment on function public.blockers_of_me() is
  'Everyone who has blocked the caller — one direction only, unlike '
  'blocked_user_ids(). Used by profiles so that blocking someone does not hide '
  'the one screen from which the block can be lifted.';

revoke execute on function public.blockers_of_me() from public;
grant execute on function public.blockers_of_me() to authenticated;

-- =============================================================================
-- §2 · LA POLICY DE PROFIL, RENDUE DIRECTIONNELLE
-- -----------------------------------------------------------------------------
-- Elle est remplacée et non complétée, ce qui est une exception à la règle du
-- dépôt — « on ajoute une policy, on n'en modifie aucune ». La règle vise les
-- policies d'une phase antérieure, dont on ne connaît plus tous les appelants ;
-- celle-ci a deux heures, elle vient de la 0010, et une policy RESTRICTIVE ne se
-- corrige de toute façon pas en en ajoutant une autre : elles sont AND-ées,
-- donc une seconde ne peut que retirer davantage.
-- =============================================================================

drop policy if exists profiles_block_restrictive on public.profiles;

create policy profiles_block_restrictive on public.profiles
  as restrictive for select to authenticated
  using (
    id = (select auth.uid())
    or not (id = any ((select public.blockers_of_me())::uuid[]))
  );

-- =============================================================================
-- §3 · AUTO-CONTRÔLE
-- =============================================================================

do $$
declare
  offender text;
  n        integer;
begin
  -- 1. §0.5 du brief.
  select string_agg(format('%I.%I', ns.nspname, c.relname), ', ' order by 1)
    into offender
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
   where c.relkind = 'r'
     and ns.nspname in ('public', 'ref', 'mod')
     and (c.relrowsecurity = false
          or not exists (select 1 from pg_policy p where p.polrelid = c.oid));
  if offender is not null then
    raise exception 'VITOLA_RLS_GAP: table(s) sans RLS ou sans policy : %', offender;
  end if;

  -- 2. Les cinq policies de blocage existent toujours, et toutes restrictives.
  select count(*) into n
    from pg_policy where polname like '%\_block\_restrictive' and polpermissive = false;
  if n <> 5 then
    raise exception 'VITOLA_SCOPE_GAP: % policies de blocage restrictives, 5 attendues', n;
  end if;
  if exists (select 1 from pg_policy where polname like '%\_block\_restrictive' and polpermissive)
  then
    raise exception 'VITOLA_SCOPE_GAP: une policy de blocage est redevenue permissive';
  end if;

  -- 3. `profiles` lit le sens unique, les quatre autres les deux sens. Une
  --    inversion rendrait le contenu lisible d'une personne bloquée, ce qui est
  --    exactement le contraire du bug corrigé ici — et resterait vert.
  if position('blockers_of_me' in pg_get_expr(
       (select polqual from pg_policy where polname = 'profiles_block_restrictive'),
       'public.profiles'::regclass)) = 0
  then
    raise exception 'VITOLA_SCOPE_GAP: profiles_block_restrictive ne lit plus blockers_of_me()';
  end if;

  select string_agg(p.polname, ', ' order by p.polname) into offender
    from pg_policy p
   where p.polname in ('posts_block_restrictive', 'post_comments_block_restrictive',
                       'reviews_block_restrictive', 'comments_block_restrictive')
     and position('blocked_user_ids' in pg_get_expr(p.polqual, p.polrelid)) = 0;
  if offender is not null then
    raise exception
      'VITOLA_SCOPE_GAP: policy(s) de contenu qui ne lisent plus les deux sens : %', offender;
  end if;

  -- 4. Aucune fonction nouvelle appelable au titre de PUBLIC.
  select string_agg(proname, ', ' order by proname) into offender
    from pg_proc
   where pronamespace = 'public'::regnamespace
     and array_to_string(coalesce(proacl, '{}')::text[], ' ') ~ '(^| )=X/';
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: EXECUTE accordé à PUBLIC sur : %', offender;
  end if;

  raise notice '0012 : un blocage se défait, parce que sa cible reste visible de qui l a posé.';
end;
$$;

commit;
