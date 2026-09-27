-- =============================================================================
-- VITOLA — 0038 : « Montrer ma cave » ne s'adresse qu'aux personnes invitées
-- -----------------------------------------------------------------------------
-- Arbitrage du porteur, le 27 septembre 2026, sur les deux questions que
-- l'ADR 0022 laissait ouvertes :
--
--   · « il peut juste consulter la cave » — le destinataire d'un partage lit et
--     n'écrit pas. C'est ce que la 0036 construit déjà (ADR 0022, D4) : rien ne
--     change ici pour lui ;
--   · « on garde la case montrer la cave, mais uniquement à quelqu'un à qui on
--     l'a partagée » — l'étagère du profil cesse de se montrer à tout membre
--     connecté.
--
-- `shared_humidor_shelf(owner)` rendait à tout membre connecté les lots de
-- TOUTES les caves d'un membre qui avait coché la case. Elle ne rend plus que
-- les caves de ce membre partagées avec l'appelant — acceptées, et pas
-- masquées. Trois conséquences, voulues :
--
--   · un membre sans partage ne lit rien, case cochée ou non ;
--   · un destinataire ne lit que la cave qu'on lui a partagée, jamais les autres
--     caves du même propriétaire : le partage se fait cave par cave (ADR 0022,
--     D2), et l'étagère ne peut pas ouvrir plus que lui ;
--   · une cave masquée ne revient pas par le profil. Masquer, c'est ne plus
--     l'avoir sous les yeux (ADR 0022, D5) ; la réafficher la rend partout.
--
-- La case reste un droit : décochée, l'étagère est vide pour tout le monde. Le
-- partage, lui, ne la lit pas — `shared_humidor_lots()` reste la porte d'une
-- cave acceptée, case cochée ou non. Deux gestes, deux portes, et aucune qui
-- dépende de l'autre : décocher la case ne reprend pas une cave qu'on a
-- partagée, et retirer un partage se fait sur la cave.
--
-- Le type de retour ne change pas : la projection de la 0010 (cave, cigare,
-- quantité, date de mise en vieillissement), jamais le prix. Le code qui
-- l'appelle n'a rien à apprendre, et `database.types.ts` non plus.
--
-- Ordre de lecture :
--   §1  L'étagère, restreinte aux destinataires
--   §2  Grants
--   §3  Auto-contrôle
-- =============================================================================

begin;

-- =============================================================================
-- §1 · L'ÉTAGÈRE, RESTREINTE AUX DESTINATAIRES
-- -----------------------------------------------------------------------------
-- Toujours SECURITY DEFINER, pour la raison de la 0010 (ADR 0007, D5) : une
-- policy filtre des lignes et ne sait pas cacher une colonne, et `humidors` est
-- fermée à tout autre que son propriétaire par les verrous de la 0036. Elle
-- revérifie donc elle-même les quatre conditions, et ne répond que sur son
-- appelant : le partage se lit sur `auth.uid()`, jamais sur un argument.
--
-- Le propriétaire n'est le destinataire d'aucune de ses caves (la policy
-- d'insertion de la 0036 refuse de se partager une cave à soi-même) : il lit
-- ses caves par « Ma cave », et cette porte ne lui rend rien. C'est voulu — le
-- profil lui dit à qui il se montre au lieu de lui montrer ce qu'il possède.
-- =============================================================================

create or replace function public.shared_humidor_shelf(owner uuid)
returns table (
  humidor_id   uuid,
  humidor_name text,
  cigar_id     uuid,
  qty          integer,
  aging_start_date date
)
language sql
stable
security definer
set search_path = ''
as $$
  select h.id, h.name, i.cigar_id, i.qty, i.aging_start_date
    from public.humidors h
    join public.humidor_shares s
      on s.humidor_id = h.id
     and s.recipient_id = (select auth.uid())
     and s.accepted_at is not null
     and s.hidden_at is null
    join public.humidor_items i on i.humidor_id = h.id
   where h.user_id = owner
     and i.qty > 0
     and public.shows_humidor(owner)
     and not public.blocks_between(owner)
   order by h.created_at, i.aging_start_date nulls last
$$;

comment on function public.shared_humidor_shelf(uuid) is
  'What a member shows of their humidors on their profile, and to whom: only the '
  'humidors shared with the caller, accepted and not hidden, and only while the '
  'owner ticks show_humidor (0038). Which cigars, how many, since when — never '
  'the price, never the ledger. SECURITY DEFINER because a policy filters rows '
  'and cannot project a column set (ADR 0007, D5).';

-- La clé garde une lecture et une seule, mais ce n'est plus une policy qui la
-- lit : `humidors_select_shown` est partie avec la 0036. Le commentaire de la
-- 0011 le disait encore.
comment on function public.shows_humidor(uuid) is
  'Whether this member shows their humidors on their profile. Read by '
  'shared_humidor_shelf() only, which answers the members a humidor is shared '
  'with and nobody else (0038). Delegates to profile_privacy() so the key has '
  'one interpretation. A share does not read it: shared_humidor_lots() opens an '
  'accepted humidor whatever this says.';

comment on table public.humidors is
  'A member''s humidor. Owner-only by any route through RLS: humidors_owner_only is '
  'RESTRICTIVE and FOR ALL, so no permissive policy can open it (ADR 0022, D1). '
  'Third parties read through SECURITY DEFINER projections only, and only once '
  'invited and accepted: shared_humidor_lots() (the humidor page) and '
  'shared_humidor_shelf() (the owner''s profile, when show_humidor is ticked).';

-- =============================================================================
-- §2 · GRANTS
-- -----------------------------------------------------------------------------
-- `create or replace` garde les droits d'une fonction qui existe ; on les
-- redit quand même, comme la 0011, parce que `tests/02_function_grants.sql`
-- relit tout et qu'une porte se déclare là où elle change.
-- =============================================================================

revoke execute on function public.shared_humidor_shelf(uuid) from public, anon;
grant execute on function public.shared_humidor_shelf(uuid) to authenticated;

-- =============================================================================
-- §3 · AUTO-CONTRÔLE
-- -----------------------------------------------------------------------------
-- `supabase/tests/25_cave_montree.sql` éprouve la porte telle qu'un tiers, un
-- invité et un destinataire la rencontrent ; ceci attrape la migration future
-- qui rouvrirait l'étagère à tous.
-- =============================================================================

do $$
declare
  src text;
  cols text;
begin
  select prosrc into src
    from pg_proc
   where oid = 'public.shared_humidor_shelf(uuid)'::regprocedure
     and prosecdef
     and array_to_string(proconfig, ',') like '%search_path=%';
  if src is null then
    raise exception 'VITOLA_SCOPE_GAP: shared_humidor_shelf() doit rester SECURITY DEFINER, search_path fixé';
  end if;

  -- 1. Elle ne répond qu'aux destinataires d'un partage accepté et pas masqué.
  if position('humidor_shares' in src) = 0
     or position('auth.uid()' in src) = 0
     or position('accepted_at is not null' in src) = 0
     or position('hidden_at is null' in src) = 0 then
    raise exception 'VITOLA_SCOPE_GAP: shared_humidor_shelf() ne se borne plus aux destinataires (0038)';
  end if;

  -- 2. La case et le blocage sont toujours lus.
  if position('shows_humidor(owner)' in src) = 0
     or position('blocks_between(owner)' in src) = 0 then
    raise exception 'VITOLA_SCOPE_GAP: shared_humidor_shelf() ne lit plus la case ou le blocage';
  end if;

  -- 3. Une projection : jamais le prix, le vendeur, les notes, le code de
  --    boîte, l'emplacement ni la date d'achat.
  cols := pg_get_function_result('public.shared_humidor_shelf(uuid)'::regprocedure);
  if cols ~* '(price|vendor|note|box|position|purchase)' then
    raise exception 'VITOLA_SCOPE_GAP: shared_humidor_shelf() expose %', cols;
  end if;

  -- 4. Ni PUBLIC ni anon.
  if has_function_privilege('anon', 'public.shared_humidor_shelf(uuid)', 'EXECUTE') then
    raise exception 'VITOLA_GRANT_GAP: anon peut appeler shared_humidor_shelf()';
  end if;

  raise notice '0038 cave montrée : l''étagère ne répond plus qu''aux destinataires d''un partage accepté.';
end;
$$;

commit;
