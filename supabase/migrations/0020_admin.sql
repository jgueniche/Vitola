-- =============================================================================
-- VITOLA — 0020 : l'administration (ADR 0014)
-- -----------------------------------------------------------------------------
-- Applique l'ADR 0014, acceptée le 25 août 2026 :
--   docs/adr/0014-le-back-office-d-administration.md
--
-- Presque tous les pouvoirs de /admin passent par des policies qui existent
-- déjà (profiles_select_directory, cigars_update_editor, lines_*_editor) : la
-- session suffit, et cette migration ne les touche pas. Elle ne fait que deux
-- choses :
--
--   §1  public.admin_set_flag() — LA porte, parce que feature_flags n'a aucun
--       grant d'écriture client (« a flag change is a deployment event », 0001)
--       et audit_log aucun grant d'insertion : changer un drapeau et écrire sa
--       trace doivent être une transaction, et aucune policy ne peut le faire.
--       C'est le renversement conscient de la position de la 0001 : un drapeau
--       devient un acte d'administration — signé, tracé, transactionnel.
--   §2  lines_delete_admin — une policy, pas une porte : une gamme créée par
--       erreur ne doit pas demander un geste SQL pour disparaître. Le régime de
--       cigars_delete_admin, appliqué aux gammes. `on delete set null` protège
--       les fiches attachées.
--   §3  Auto-contrôle.
-- =============================================================================

begin;

-- =============================================================================
-- §1 · LA PORTE DES DRAPEAUX
-- =============================================================================

create or replace function public.admin_set_flag(
  p_key     text,
  p_enabled boolean,
  p_payload jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after  jsonb;
begin
  if not public.has_min_role('admin') then
    raise exception 'VITOLA_ADMIN_ONLY' using errcode = '42501';
  end if;

  -- Un drapeau naît dans une migration, avec le code qui le lit : la porte
  -- modifie, elle ne crée jamais (ADR 0014, D2).
  select to_jsonb(f) into v_before from public.feature_flags f where f.key = p_key;
  if v_before is null then
    raise exception 'VITOLA_FLAG_UNKNOWN: %', p_key;
  end if;

  if p_payload is not null and jsonb_typeof(p_payload) <> 'object' then
    raise exception 'VITOLA_FLAG_PAYLOAD: la charge utile doit etre un objet';
  end if;

  update public.feature_flags f
     set enabled = p_enabled,
         payload = coalesce(p_payload, f.payload)
   where f.key = p_key;

  select to_jsonb(f) into v_after from public.feature_flags f where f.key = p_key;

  -- La trace dans la même transaction : un drapeau changé sans histoire est
  -- l'état que la 0018 a refusé pour la modération. auth.uid() survit au
  -- changement de rôle d'exécution (constaté en 0018 pour hidden_by).
  insert into public.audit_log
    (actor_id, action, entity_schema, entity_table, entity_id, before_state, after_state)
  values
    (auth.uid(), 'flag_set', 'public', 'feature_flags', p_key, v_before, v_after);

  return v_after;
end;
$$;

comment on function public.admin_set_flag(text, boolean, jsonb) is
  'ADR 0014: the one admin door. Updates an EXISTING flag and writes its '
  'audit_log trace in the same transaction. Guarded by has_min_role(admin) '
  'inside; the grant only narrows who may knock.';

revoke execute on function public.admin_set_flag(text, boolean, jsonb) from public;
revoke execute on function public.admin_set_flag(text, boolean, jsonb) from anon, service_role;
grant  execute on function public.admin_set_flag(text, boolean, jsonb) to authenticated;

-- =============================================================================
-- §2 · SUPPRIMER UNE GAMME EST UN GESTE D'ADMIN
-- =============================================================================

grant delete on ref.lines to authenticated;   -- narrowed to admin by policy

create policy lines_delete_admin on ref.lines
  for delete to authenticated
  using ((select public.has_min_role('admin')));

-- =============================================================================
-- §3 · AUTO-CONTRÔLE
-- =============================================================================

do $$
declare
  v_acl text;
  n integer;
begin
  -- 1. La porte existe, en DEFINER, propriété de postgres.
  select array_to_string(coalesce(p.proacl, '{}')::text[], ' ') into v_acl
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname = 'admin_set_flag' and p.prosecdef
     and p.proowner = 'postgres'::regrole;
  if v_acl is null then
    raise exception 'VITOLA_DOOR_GAP: admin_set_flag manque, ou n est plus DEFINER/postgres';
  end if;

  -- 2. Accordée à authenticated seul — ni PUBLIC, ni anon, ni service_role.
  if v_acl ~ '(^| )=X/' or v_acl ~ 'anon=' or v_acl ~ 'service_role=' then
    raise exception 'VITOLA_GRANT_GAP: admin_set_flag est appelable au-dela d authenticated : %', v_acl;
  end if;
  if v_acl !~ 'authenticated=X' then
    raise exception 'VITOLA_GRANT_GAP: admin_set_flag n est plus appelable par authenticated';
  end if;

  -- 3. feature_flags reste sans grant d'écriture client : la porte est le seul
  --    chemin, parce qu'elle est le seul qui trace.
  select count(*) into n
    from information_schema.table_privileges
   where table_schema = 'public' and table_name = 'feature_flags'
     and grantee in ('anon', 'authenticated')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  if n <> 0 then
    raise exception 'VITOLA_GRANT_GAP: feature_flags a gagne un droit d ecriture client';
  end if;

  -- 4. La policy de suppression des gammes existe, et son grant avec.
  if not exists (select 1 from pg_policies
                  where schemaname = 'ref' and tablename = 'lines'
                    and policyname = 'lines_delete_admin') then
    raise exception 'VITOLA_RLS_GAP: lines_delete_admin manque';
  end if;
  if not exists (select 1 from information_schema.table_privileges
                  where table_schema = 'ref' and table_name = 'lines'
                    and grantee = 'authenticated' and privilege_type = 'DELETE') then
    raise exception 'VITOLA_GRANT_GAP: le DELETE de ref.lines n est pas accorde';
  end if;

  raise notice
    '0020 : un drapeau se change par la porte qui le trace, une gamme se supprime par un admin.';
end;
$$;

commit;
