-- =============================================================================
-- VITOLA — 0027 : d'où une fiche tient ce qu'elle dit — la porte des sources
-- -----------------------------------------------------------------------------
-- La fiche cigare doit dire « selon le fabricant » quand son profil aromatique
-- (ou sa force, ou sa vitole) vient d'une proposition qui citait une source
-- (0026), et « selon le référentiel » sinon — sans jamais mélanger ce fait avec
-- les arômes que les membres citent (cigar_stats.top_aromas, 0025).
--
-- Le fait vit dans ref.cigar_revisions : la dernière proposition ACCEPTÉE qui
-- a touché une colonne, et la source qu'elle citait. Or cette table est
-- privée par policy — son auteur et les relecteurs la lisent, personne d'autre
-- (0001) — et c'est juste : une proposition porte un nom et une opinion. Ce
-- que la fiche a besoin de rendre public n'est ni le nom ni le diff, c'est une
-- URL et une date par colonne. Une porte de la taille du geste, donc, comme
-- file_report() (0006) et non une policy de plus : une fonction SECURITY
-- DEFINER qui projette trois colonnes et rien d'autre — pas d'auteur, pas de
-- relecteur, pas de diff, pas de commentaire.
--
-- Pourquoi la DERNIÈRE acceptée, sourcée ou non : la provenance d'une valeur
-- est celle du dernier geste qui l'a écrite. Un profil transcrit du fabricant
-- puis corrigé de mémoire par un membre n'est plus « selon le fabricant », et
-- la fonction rend alors une source nulle pour cette colonne — la fiche
-- retombe sur « selon le référentiel ».
-- =============================================================================

begin;

create or replace function public.sheet_sources(p_cigar_id uuid)
returns table (column_name text, source text, decided_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (k.column_name)
         k.column_name,
         r.source,
         r.reviewed_at
    from ref.cigar_revisions r
    cross join lateral jsonb_object_keys(r.diff) as k(column_name)
   where r.cigar_id = p_cigar_id
     and r.status = 'approved'
   order by k.column_name, r.reviewed_at desc nulls last, r.created_at desc
$$;

comment on function public.sheet_sources(uuid) is
  'Per column of a sheet, the source cited by the LAST approved proposal that '
  'wrote it (null when that proposal cited none), and when it was decided. '
  'SECURITY DEFINER over the private ref.cigar_revisions: projects a URL and a '
  'date, never an author, a reviewer, a diff or a comment. What lets the sheet '
  'say « selon le fabricant » without opening the queue.';

-- Le défaut de PostgreSQL accorde EXECUTE à PUBLIC : on le retire, puis on
-- accorde aux trois rôles clients — la fiche se lit sans session.
revoke execute on function public.sheet_sources(uuid) from public;
grant execute on function public.sheet_sources(uuid) to anon, authenticated, service_role;

-- =============================================================================
-- AUTO-CONTRÔLE
-- =============================================================================

do $$
declare
  cols text;
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'sheet_sources' and p.prosecdef
  ) then
    raise exception 'VITOLA_MIGRATION_INCOMPLETE: public.sheet_sources() manque ou n''est pas SECURITY DEFINER';
  end if;

  if not has_function_privilege('anon', 'public.sheet_sources(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.sheet_sources(uuid)', 'EXECUTE') then
    raise exception 'VITOLA_GRANT_GAP: sheet_sources() n''est pas appelable par un lecteur de fiche';
  end if;

  -- La porte projette exactement trois colonnes : une colonne de plus serait
  -- une fuite (auteur, diff, commentaire) passée par la forme.
  select string_agg(o.attname, ',' order by o.attnum) into cols
    from pg_proc p
    cross join lateral unnest(p.proargnames, p.proargmodes) with ordinality as o(attname, mode, attnum)
   where p.oid = 'public.sheet_sources(uuid)'::regprocedure and o.mode = 't';
  if cols <> 'column_name,source,decided_at' then
    raise exception 'VITOLA_SHAPE_GAP: sheet_sources() rend « % » au lieu de column_name,source,decided_at', cols;
  end if;

  -- Et la table qu'elle lit reste fermée : aucun client n'y gagne un droit.
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'ref' and c.relname = 'cigar_revisions'
       and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'VITOLA_RLS_GAP: ref.cigar_revisions a perdu sa RLS forcée';
  end if;

  raise notice 'VITOLA 0027 OK — la fiche peut dire d''où vient ce qu''elle dit, sans ouvrir la file.';
end $$;

commit;
