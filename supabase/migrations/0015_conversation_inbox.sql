-- =============================================================================
-- VITOLA — 0015 : la boîte de réception en un appel
-- -----------------------------------------------------------------------------
-- Une liste de conversations pose trois questions **par ligne** : qui est
-- l'autre, quel est le dernier message, combien n'ai-je pas lu. C'est la forme
-- exacte du N+1 que le critère de sortie de P3 interdit au fil, et la 0010 y a
-- répondu par `feed_page()`. La messagerie mérite la même réponse plutôt qu'une
-- discipline à se rappeler : trois allers-retours par conversation, c'est
-- trente et un pour dix conversations.
--
-- Ce que cette fonction n'est PAS :
--   * un filtre d'audience. Elle n'a aucun prédicat de droit — ni `member_a =
--     auth.uid()`, ni le blocage. `conversations_select_own` et
--     `conversations_block_restrictive` décident, et une requête qui les
--     doublerait survivrait à ce qu'elle double (ADR 0004, la règle centrale).
--   * un keyset. Le fil grandit sans borne, une boîte de réception non : on ne
--     peut écrire qu'à quelqu'un que l'on suit ou qui nous suit (ADR 0010, D5),
--     donc le graphe d'abonnement la borne déjà. Elle rend les `p_limit` plus
--     récentes et **l'écran le dit** quand la page est pleine, parce qu'un
--     plafond muet se lit comme une liste complète.
--
-- Les messages d'une conversation, eux, sont bien en keyset — `messages_keyset_idx`
-- existe depuis la 0014 et `lib/social/group-queries.ts` s'en sert. C'est là
-- que la croissance est réelle.
-- =============================================================================

begin;

-- =============================================================================
-- §1 · conversation_inbox()
-- -----------------------------------------------------------------------------
-- SECURITY INVOKER, comme `feed_page()`, `post_card()` et `conversation_with()`.
-- Un appel PostgREST est une transaction, pas un privilège : la fonction lit ce
-- que l'appelant lit, et rien de plus. C'est ce qui rend le `left join` sur
-- `profiles` sûr — un profil non découvrable rend `null`, la conversation
-- reste, et l'écran affiche « Membre » plutôt qu'un identifiant.
-- =============================================================================

create or replace function public.conversation_inbox(p_limit integer default 100)
returns table (
  conversation_id     uuid,
  other_id            uuid,
  other_handle        text,
  other_display_name  text,
  last_message_at     timestamptz,
  last_body           text,
  last_sender_id      uuid,
  unread_count        integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    other.id,
    pr.handle,
    pr.display_name,
    c.last_message_at,
    latest.body,
    latest.sender_id,
    coalesce(unread.n, 0)::integer
  from public.conversations c
  -- L'autre, déduit de la paire ordonnée : `member_a < member_b` est une clé
  -- canonique, pas un rôle, donc « l'autre » se calcule et ne se stocke pas.
  cross join lateral (
    select case when c.member_a = (select auth.uid()) then c.member_b else c.member_a end as id
  ) other
  left join public.profiles pr on pr.id = other.id
  -- Un LATERAL par conversation, et non une sous-requête corrélée par colonne :
  -- le dernier message se lit une fois pour ses deux colonnes, sur l'index
  -- `messages_keyset_idx` qui porte déjà l'ordre demandé.
  left join lateral (
    select m.body, m.sender_id
      from public.messages m
     where m.conversation_id = c.id
     order by m.created_at desc, m.id desc
     limit 1
  ) latest on true
  left join lateral (
    select count(*) as n
      from public.messages m
     where m.conversation_id = c.id
       and m.sender_id <> (select auth.uid())
       and m.read_at is null
  ) unread on true
  order by c.last_message_at desc nulls last, c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 200))
$$;

comment on function public.conversation_inbox(integer) is
  'The inbox in one call: the other member, the last message and the unread '
  'count are per-row questions, which is the N+1 shape feed_page() exists to '
  'avoid. No audience predicate — conversations_select_own and the RESTRICTIVE '
  'block policy decide, as everywhere else.';

revoke execute on function public.conversation_inbox(integer) from public;
grant execute on function public.conversation_inbox(integer) to authenticated;

-- =============================================================================
-- §2 · AUTO-CONTRÔLE
-- =============================================================================

do $$
declare
  offender text;
begin
  -- 1. §0.5 du brief.
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

  -- 2. En droits d'appelant. En DEFINER, une fonction sans prédicat d'audience
  --    rendrait toutes les conversations privées du site — c'est-à-dire
  --    exactement ce que la 0013 a déjà écrit pour `post_card()`.
  if exists (select 1 from pg_proc
              where oid = 'public.conversation_inbox(integer)'::regprocedure
                and prosecdef)
  then
    raise exception 'VITOLA_SCOPE_GAP: conversation_inbox() est passée en SECURITY DEFINER';
  end if;

  -- 3. Aucune fonction nouvelle appelable au titre de PUBLIC.
  select string_agg(proname, ', ' order by proname) into offender
    from pg_proc
   where pronamespace = 'public'::regnamespace
     and array_to_string(coalesce(proacl, '{}')::text[], ' ') ~ '(^| )=X/';
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: EXECUTE accordé à PUBLIC sur : %', offender;
  end if;

  raise notice '0015 : la boîte de réception tient en un appel.';
end;
$$;

commit;
