-- =============================================================================
-- VITOLA — 0011 : lire les trois clés de confidentialité chez quelqu'un d'autre
-- -----------------------------------------------------------------------------
-- Complète la 0010, qui a ouvert `privacy.show_humidor` par une policy. Les deux
-- autres clés — `show_reviews` et `show_country` — n'ont pas de policy à ouvrir,
-- et c'est la raison d'être de ce fichier : elles décident de ce qu'un ÉCRAN
-- montre, pas de ce qu'une lecture rend.
--
-- La distinction est réelle et vaut d'être écrite, parce qu'elle décide de la
-- honnêteté de l'interrupteur :
--
--   `show_humidor`  → un DROIT. La cave d'un tiers est illisible sans lui, et
--                     c'est la RLS qui l'applique (0010, `humidors_select_shown`).
--   `show_reviews`  → un AFFICHAGE. Une entrée `public` est publique : elle
--                     reste sur la fiche du cigare et dans la moyenne. Ce que la
--                     clé décide, c'est si le PROFIL en dresse la liste.
--   `show_country`  → un AFFICHAGE, et le plus faible des trois. `profiles` est
--                     un annuaire public ; une policy filtre des lignes et ne
--                     sait pas cacher une colonne. La clé retire le pays de la
--                     page de profil, elle n'en fait pas un secret.
--
-- Les trois se lisent chez autrui par la même porte, pour la même raison :
-- `profile_settings` n'est lisible que de son propriétaire (ADR 0006, D4), donc
-- un `select privacy from profile_settings where id = <autre>` ne renvoie pas
-- une erreur — il renvoie **rien**, ce qui se lit comme « tout est fermé ».
--
-- Ordre de lecture :
--   §1  profile_privacy() — la porte unique
--   §2  shows_humidor() — redéfinie pour ne plus lire la clé elle-même
--   §3  Grants
--   §4  Auto-contrôle
-- =============================================================================

begin;

-- =============================================================================
-- §1 · LA PORTE UNIQUE
-- -----------------------------------------------------------------------------
-- Les valeurs par défaut sont celles de `DEFAULT_PRIVACY` dans
-- `lib/settings/model.ts`, et l'asymétrie est voulue là-bas : `show_humidor` est
-- fermée par défaut, les deux autres ouvertes. Ce que l'on possède n'est pas du
-- même ordre que ce que l'on a pensé.
--
-- Le repli — ligne absente, clé absente, valeur illisible — reprend ces mêmes
-- défauts plutôt que de tout fermer. Fermer serait plus prudent et serait faux :
-- un membre dont la ligne de réglages n'existe pas encore n'a rien décidé, et le
-- traiter comme s'il avait tout masqué rendrait son profil vide sans qu'il l'ait
-- demandé.
-- =============================================================================

create or replace function public.profile_privacy(owner uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object(
              'show_humidor', coalesce(s.privacy->>'show_humidor', 'false') = 'true',
              'show_reviews', coalesce(s.privacy->>'show_reviews', 'true') <> 'false',
              'show_country', coalesce(s.privacy->>'show_country', 'true') <> 'false')
       from public.profile_settings s
      where s.id = owner),
    jsonb_build_object('show_humidor', false, 'show_reviews', true, 'show_country', true))
$$;

comment on function public.profile_privacy(uuid) is
  'The three privacy keys of another member, as the profile page needs them. '
  'SECURITY DEFINER because profile_settings is owner-only: reading it directly '
  'returns silence rather than a refusal (ADR 0006, D4). Falls back to the '
  'column defaults, not to everything-closed — a member who has decided nothing '
  'has not decided to hide.';

-- =============================================================================
-- §2 · shows_humidor() DÉLÈGUE
-- -----------------------------------------------------------------------------
-- Elle lisait `profile_settings` elle-même depuis la 0010. Deux fonctions qui
-- interprètent la même clé, c'est une clé qui finira par vouloir dire deux
-- choses — et celle-ci porte un droit, pas un affichage : la divergence se
-- verrait comme une cave montrée sur le profil et refusée par la policy, ou
-- l'inverse, ce qui est pire.
--
-- Le prédicat reste une fonction à part parce qu'une policy le veut booléen :
-- `humidors_select_shown` l'appelle, et lui faire extraire une clé jsonb à
-- chaque ligne serait payer un parseur pour une réponse binaire.
--
-- La signature ne change pas, donc la policy de la 0010 n'est pas retouchée.
-- =============================================================================

create or replace function public.shows_humidor(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (public.profile_privacy(owner) ->> 'show_humidor') = 'true'
$$;

comment on function public.shows_humidor(uuid) is
  'Whether this member shows their humidor. Delegates to profile_privacy() so '
  'the key has one interpretation: this one carries a right (0010, '
  'humidors_select_shown) and the other carries a display, and a drift between '
  'them would read as a humidor shown on a profile and refused by the policy.';

-- =============================================================================
-- §3 · GRANTS
-- =============================================================================

revoke execute on function public.profile_privacy(uuid) from public;
grant execute on function public.profile_privacy(uuid) to authenticated;

-- `shows_humidor` a été recréée : PostgreSQL réapplique le défaut PUBLIC à
-- chaque `create or replace`, et le retirer ici est ce qui empêche
-- `supabase/tests/02_function_grants.sql` d'échouer — à raison.
revoke execute on function public.shows_humidor(uuid) from public;
grant execute on function public.shows_humidor(uuid) to authenticated;

-- =============================================================================
-- §4 · AUTO-CONTRÔLE
-- =============================================================================

do $$
declare
  offender text;
begin
  -- 1. §0.5 du brief : aucune table sans RLS et sans policy. Cette migration
  --    n'en crée aucune, mais le contrôle est le portail du dépôt.
  select string_agg(format('%I.%I', n.nspname, c.relname), ', ' order by 1)
    into offender
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r'
     and n.nspname in ('public', 'ref', 'mod')
     and (c.relrowsecurity = false
          or not exists (select 1 from pg_policy p where p.polrelid = c.oid));
  if offender is not null then
    raise exception 'VITOLA_RLS_GAP: table(s) sans RLS ou sans policy : %', offender;
  end if;

  -- 2. Les deux fonctions doivent dire la même chose de la même clé. Vérifié
  --    sur la définition plutôt que sur une donnée : le corps de `shows_humidor`
  --    doit passer par `profile_privacy`, faute de quoi quelqu'un l'a réécrite
  --    en relisant `profile_settings` — ce qui remarche, et diverge ensuite.
  if position('profile_privacy' in pg_get_functiondef('public.shows_humidor(uuid)'::regprocedure)) = 0
  then
    raise exception
      'VITOLA_SCOPE_GAP: shows_humidor() ne délègue plus à profile_privacy() (0011, §2)';
  end if;

  -- 3. Aucune fonction nouvelle appelable au titre de PUBLIC.
  select string_agg(proname, ', ' order by proname) into offender
    from pg_proc
   where pronamespace = 'public'::regnamespace
     and array_to_string(coalesce(proacl, '{}')::text[], ' ') ~ '(^| )=X/';
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: EXECUTE accordé à PUBLIC sur : %', offender;
  end if;

  raise notice '0011 profile_privacy : une porte, trois clés, un seul interprète.';
end;
$$;

commit;
