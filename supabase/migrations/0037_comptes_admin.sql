-- =============================================================================
-- VITOLA — 0037 : la liste des comptes dit à qui l'on a affaire
-- -----------------------------------------------------------------------------
-- Demandé par le porteur le 26 septembre 2026 : la liste des comptes de
-- `/admin/comptes` titrait chaque ligne par son pseudo, et quatre comptes sur
-- neuf portent celui que `tg_handle_new_user()` fabrique quand personne n'en a
-- choisi — `membre_` suivi de douze chiffres hexadécimaux. « Ce n'est pas du
-- tout évident pour nous de savoir qui c'est » : il faut le nom, l'adresse
-- e-mail et, s'ils sont renseignés, le téléphone et l'adresse.
--
-- Le nom affiché et la ville vivent dans `profiles`, que la policy des
-- modérateurs ouvre déjà. **L'adresse e-mail vit dans `auth.users`**, que
-- PostgREST n'expose pas et sur laquelle aucun rôle client n'a de droit — aucune
-- policy ne peut donc l'ouvrir. D'où une porte de la taille du geste, sur le
-- modèle exact des quatre portes du modérateur de la 0018 (ADR 0013) :
--
--   · SECURITY DEFINER, gardée par `has_min_role('admin')` À L'INTÉRIEUR — un
--     membre qui l'appelle reçoit 42501, pas une liste vide ;
--   · une projection : le nom affiché, l'adresse e-mail, le téléphone s'il
--     existe, la ville et le pays, et ce que la page montrait déjà. Jamais le
--     mot de passe haché, les jetons, les métadonnées brutes ni la date de
--     naissance — l'auto-contrôle relit les colonnes de sortie ;
--   · une recherche qui porte aussi sur l'adresse e-mail, parce que c'est par
--     elle qu'un administrateur retrouve quelqu'un qui lui a écrit.
--
-- Le téléphone est lu par son nom dans la ligne (`to_jsonb(u) ->> 'phone'`) et
-- non comme une colonne : le `auth.users` de Supabase a une colonne `phone`,
-- le simulacre de la CI (`03b-verification.sql`) n'en a pas. Écrite ainsi, la
-- même fonction tourne sur les deux, et une colonne absente se lit comme un
-- téléphone non renseigné — ce qu'il est, pour tous les comptes aujourd'hui :
-- le site ne demande de numéro nulle part.
--
-- Ordre de lecture :
--   §1  La porte : admin_accounts()
--   §2  Grants
--   §3  Auto-contrôle
-- =============================================================================

begin;

-- =============================================================================
-- §1 · LA PORTE
-- =============================================================================

create or replace function public.admin_accounts(
  p_search text    default null,
  p_limit  integer default 100
)
returns table (
  id              uuid,
  handle          text,
  display_name    text,
  email           text,
  phone           text,
  city            text,
  country         text,
  role            public.app_role,
  reputation      integer,
  is_discoverable boolean,
  created_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  term text := lower(nullif(btrim(coalesce(p_search, '')), ''));
begin
  if not public.has_min_role('admin') then
    raise exception 'VITOLA_ADMIN_ONLY' using errcode = '42501';
  end if;

  -- `position()` plutôt que `ilike` : un `%` ou un `_` tapé dans la recherche
  -- reste du texte, sans échappement à se rappeler.
  return query
    select p.id,
           p.handle,
           p.display_name,
           u.email::text,
           nullif(btrim(to_jsonb(u) ->> 'phone'), ''),
           p.city,
           p.country::text,
           p.role,
           p.reputation,
           p.is_discoverable,
           p.created_at
      from public.profiles p
      join auth.users u on u.id = p.id
     where term is null
        or position(term in lower(p.handle)) > 0
        or position(term in lower(coalesce(p.display_name, ''))) > 0
        or position(term in lower(coalesce(u.email::text, ''))) > 0
     order by p.created_at desc
     limit greatest(1, least(coalesce(p_limit, 100), 200));
end;
$$;

comment on function public.admin_accounts(text, integer) is
  'The accounts directory for /admin/comptes: display name, e-mail, phone when '
  'present, city and country. SECURITY DEFINER because the e-mail lives in '
  'auth.users, which no client role reads; guarded by has_min_role(''admin'') '
  'inside, so a member gets 42501. Never the password hash, tokens, raw '
  'metadata or birth date.';

-- =============================================================================
-- §2 · GRANTS
-- -----------------------------------------------------------------------------
-- `authenticated` et personne d'autre : la garde est dans le corps, mais une
-- fonction qu'un anonyme ne peut pas appeler est une porte de moins à tester.
-- =============================================================================

revoke execute on function public.admin_accounts(text, integer) from public, anon;
grant execute on function public.admin_accounts(text, integer) to authenticated;

-- =============================================================================
-- §3 · AUTO-CONTRÔLE
-- -----------------------------------------------------------------------------
-- `supabase/tests/24_comptes_admin.sql` éprouve la garde et la recherche ; ceci
-- attrape la migration future qui défera l'une des trois décisions.
-- =============================================================================

do $$
declare
  offender text;
begin
  -- 1. SECURITY DEFINER, avec un search_path fixé — sans lui, une porte en
  --    droits de propriétaire résoudrait ses noms dans le chemin de l'appelant.
  if not exists (
    select 1 from pg_proc
     where oid = 'public.admin_accounts(text,integer)'::regprocedure
       and prosecdef
       and array_to_string(proconfig, ',') like '%search_path=%'
  ) then
    raise exception 'VITOLA_SCOPE_GAP: admin_accounts() doit rester SECURITY DEFINER, search_path fixé';
  end if;

  -- 2. La garde est dans le corps. Une porte qui ne la porte plus rend
  --    l'adresse e-mail de tout le monde à tout membre connecté.
  if not exists (
    select 1 from pg_proc
     where oid = 'public.admin_accounts(text,integer)'::regprocedure
       and prosrc like '%has_min_role(''admin'')%'
  ) then
    raise exception 'VITOLA_SCOPE_GAP: admin_accounts() a perdu sa garde has_min_role(''admin'')';
  end if;

  -- 3. Une projection, pas une copie de auth.users.
  select pg_get_function_result(p.oid) into offender
    from pg_proc p
   where p.oid = 'public.admin_accounts(text,integer)'::regprocedure
     and pg_get_function_result(p.oid)
         ~* '(password|token|meta|birth|confirm|recovery|provider|factor|secret)';
  if offender is not null then
    raise exception 'VITOLA_SCOPE_GAP: admin_accounts() expose trop : %', offender;
  end if;

  -- 4. Ni PUBLIC ni anon.
  if has_function_privilege('anon', 'public.admin_accounts(text,integer)', 'EXECUTE') then
    raise exception 'VITOLA_GRANT_GAP: anon peut appeler admin_accounts()';
  end if;
  select string_agg(proname, ', ' order by proname) into offender
    from pg_proc
   where pronamespace = 'public'::regnamespace
     and array_to_string(coalesce(proacl, '{}')::text[], ' ') ~ '(^| )=X/';
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: EXECUTE accordé à PUBLIC sur : %', offender;
  end if;

  raise notice '0037 comptes : une porte admin, une projection, la recherche par adresse e-mail.';
end;
$$;

commit;
