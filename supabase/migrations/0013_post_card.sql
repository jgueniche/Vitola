-- =============================================================================
-- VITOLA — 0013 : une publication se lit à son adresse, quelle que soit sa portée
-- -----------------------------------------------------------------------------
-- Corrige la 0010 par omission, et le bug a été trouvé par le NETTOYAGE d'un
-- parcours plutôt que par une de ses assertions : trois publications réservées
-- aux abonnés survivaient à chaque exécution, parce que la page qui porte leur
-- bouton « Supprimer » répondait 404.
--
-- La cause est un raccourci. `getPost()` lisait une publication en demandant à
-- `feed_page()` une page d'une seule ligne, avec la portée `discover`, sur
-- l'argument que c'était « la plus large » et que la RLS déciderait de toute
-- façon. C'est faux, et c'est la distinction que l'ADR 0007 prend soin de faire
-- ailleurs : `discover` filtre `visibility = 'public'` **dans le corps de la
-- fonction**, et ce filtre-là dit de quoi l'onglet parle, pas qui a le droit de
-- lire. Une publication réservée à ses abonnés n'était donc lisible à son
-- adresse par personne — pas même par son auteur.
--
-- La correction n'est pas d'élargir le filtre d'onglet : ce serait retirer à
-- `discover` ce qui le définit. C'est une fonction pour l'autre geste. Lire
-- **le fil** et lire **une publication** sont deux questions, et seule la
-- première a une notion d'onglet.
--
-- Elle rend exactement la même forme de ligne que `feed_page()`, et c'est
-- délibéré : l'ADR 0007 interdit une seconde implémentation du keyset, et la
-- même raison vaut pour la forme d'une ligne de fil. Une carte qui gagnerait
-- une colonne ici et pas là afficherait deux choses différentes selon qu'on
-- arrive par le fil ou par un lien.
-- =============================================================================

begin;

-- =============================================================================
-- §1 · post_card()
-- -----------------------------------------------------------------------------
-- SECURITY INVOKER, comme `feed_page()` et pour la même raison : un appel
-- PostgREST est une transaction, pas un privilège. Ici c'est plus visible
-- encore — il n'y a aucun prédicat d'audience dans le corps, donc **la RLS est
-- la seule chose qui décide**. Une publication qu'on ne peut pas lire rend zéro
-- ligne, et l'écran en fait un 404 qui ne distingue pas « n'existe pas » de
-- « pas pour vous ».
-- =============================================================================

create or replace function public.post_card(p_id uuid)
returns table (
  id            uuid,
  author_id     uuid,
  kind          public.post_kind,
  visibility    public.review_visibility,
  body          text,
  cigar_id      uuid,
  review_id     uuid,
  ember_count   integer,
  comment_count integer,
  created_at    timestamptz,
  updated_at    timestamptz,
  viewer_embered boolean,
  author_handle       text,
  author_display_name text,
  cigar_slug          text,
  cigar_name          text,
  brand_name          text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.author_id,
    p.kind,
    p.visibility,
    p.body,
    p.cigar_id,
    p.review_id,
    p.ember_count,
    p.comment_count,
    p.created_at,
    p.updated_at,
    exists (select 1 from public.post_reactions r
             where r.post_id = p.id and r.user_id = (select auth.uid())),
    pr.handle,
    pr.display_name,
    c.slug,
    c.commercial_name,
    b.name
  from public.posts p
  left join public.profiles pr on pr.id = p.author_id
  left join ref.cigars      c  on c.id  = p.cigar_id
  left join ref.brands      b  on b.id  = c.brand_id
  where p.id = p_id
$$;

comment on function public.post_card(uuid) is
  'One publication, in the same row shape feed_page() returns. No audience '
  'predicate at all: the RLS of posts is the only thing that decides, unlike '
  'feed_page() whose scope argument says which tab is being read. Reading the '
  'feed and reading one publication are two questions.';

revoke execute on function public.post_card(uuid) from public;
grant execute on function public.post_card(uuid) to authenticated;

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

  -- 2. En droits d'appelant, sans quoi la fonction deviendrait le juge de
  --    l'audience à la place de la RLS — et sur celle-ci, qui n'a AUCUN
  --    prédicat, cela voudrait dire toutes les publications du site.
  if exists (select 1 from pg_proc
              where oid = 'public.post_card(uuid)'::regprocedure and prosecdef)
  then
    raise exception 'VITOLA_SCOPE_GAP: post_card() est passée en SECURITY DEFINER';
  end if;

  -- 3. Les deux fonctions doivent rendre la même forme. Une colonne ajoutée
  --    d'un côté afficherait deux cartes différentes selon le chemin d'arrivée.
  if pg_get_function_result('public.post_card(uuid)'::regprocedure)
     <> replace(
          pg_get_function_result(
            'public.feed_page(public.feed_scope,timestamptz,uuid,integer)'::regprocedure),
          '', '')
  then
    raise exception
      'VITOLA_SHAPE_GAP: post_card() et feed_page() ne rendent plus la même ligne';
  end if;

  -- 4. Aucune fonction nouvelle appelable au titre de PUBLIC.
  select string_agg(proname, ', ' order by proname) into offender
    from pg_proc
   where pronamespace = 'public'::regnamespace
     and array_to_string(coalesce(proacl, '{}')::text[], ' ') ~ '(^| )=X/';
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: EXECUTE accordé à PUBLIC sur : %', offender;
  end if;

  raise notice '0013 : une publication se lit à son adresse, pas à travers un onglet.';
end;
$$;

commit;
