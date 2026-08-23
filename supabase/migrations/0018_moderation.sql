-- =============================================================================
-- VITOLA — 0018 : le back-office de modération — les portes du modérateur
-- -----------------------------------------------------------------------------
-- ADR 0013. La file DSA existe depuis 0004, son écriture depuis 0006, et
-- personne n'a jamais pu la relever : `mod` n'est pas exposé à PostgREST,
-- aucun rôle client n'y détient de droit de table, et les policies modérateur
-- de la 0004 gardent un chemin qui n'existe pas.
--
-- Le chemin est celui que la 0006 a établi deux fois : une fonction
-- `SECURITY DEFINER` dans `public`, propriété de `postgres`, de la taille
-- exacte du geste. Quatre gestes, quatre portes — et toujours aucun droit de
-- table dans `mod`, ce que l'auto-contrôle vérifie.
--
-- Deux choix de forme décidés par l'ADR :
--   - aucune porte ne rend `reporter_id` : un signalement se juge sur ce
--     qu'il vise, jamais sur qui l'envoie. Les décisions, elles, sont signées.
--   - `mod_decide()` emporte l'acte (masquer, rétablir) dans la même
--     transaction que la décision et sa trace : un contenu masqué sans trace
--     motivée est exactement l'état que le DSA interdit.
--
-- Ordre de lecture :
--   §1  mod_queue(), mod_report()   — lire la file, lire un dossier
--   §2  mod_acknowledge()           — l'accusé de réception
--   §3  mod_decide()                — la décision, sa trace, son acte
--   §4  Grants
--   §5  Auto-contrôle
-- =============================================================================

begin;

-- =============================================================================
-- §1 · LIRE LA FILE, LIRE UN DOSSIER
-- -----------------------------------------------------------------------------
-- Les enums de `mod` sortent en `text` : un type d'un schéma non exposé ne se
-- met pas dans la signature d'une fonction exposée (0006). L'ordre de `open`
-- est celui du délai publié — le plus ancien d'abord, parce que c'est lui qui
-- brûle les 72 h.
-- =============================================================================

create or replace function public.mod_queue(
  p_scope text default 'open',
  p_limit integer default 50
)
returns table (
  id              uuid,
  entity_schema   text,
  entity_table    text,
  entity_id       text,
  reason          text,
  detail          text,
  status          text,
  created_at      timestamptz,
  acknowledged_at timestamptz,
  decided_at      timestamptz,
  decided_by      uuid,
  decision_note   text
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not public.has_min_role('moderator') then
    raise exception 'VITOLA_MODERATOR_ONLY' using errcode = '42501';
  end if;

  if p_scope = 'open' then
    return query
      select r.id, r.entity_schema, r.entity_table, r.entity_id,
             r.reason::text, r.detail, r.status::text,
             r.created_at, r.acknowledged_at, r.decided_at, r.decided_by,
             r.decision_note
        from mod.reports r
       where r.status in ('open', 'reviewing')
       order by r.created_at asc
       limit greatest(1, least(coalesce(p_limit, 50), 100));
  elsif p_scope = 'decided' then
    return query
      select r.id, r.entity_schema, r.entity_table, r.entity_id,
             r.reason::text, r.detail, r.status::text,
             r.created_at, r.acknowledged_at, r.decided_at, r.decided_by,
             r.decision_note
        from mod.reports r
       where r.status in ('upheld', 'dismissed')
       order by r.decided_at desc
       limit greatest(1, least(coalesce(p_limit, 50), 100));
  else
    raise exception 'VITOLA_SCOPE_UNKNOWN: %', p_scope using errcode = '22023';
  end if;
end;
$$;

comment on function public.mod_queue(text, integer) is
  'The moderation queue (ADR 0013). SECURITY DEFINER because mod is not exposed '
  'and no client role holds table rights there; gated on has_min_role(moderator) '
  'inside. Never returns reporter_id: a report is judged on what it targets.';

create or replace function public.mod_report(p_id uuid)
returns table (
  id              uuid,
  entity_schema   text,
  entity_table    text,
  entity_id       text,
  reason          text,
  detail          text,
  status          text,
  created_at      timestamptz,
  acknowledged_at timestamptz,
  decided_at      timestamptz,
  decided_by      uuid,
  decision_note   text
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not public.has_min_role('moderator') then
    raise exception 'VITOLA_MODERATOR_ONLY' using errcode = '42501';
  end if;

  return query
    select r.id, r.entity_schema, r.entity_table, r.entity_id,
           r.reason::text, r.detail, r.status::text,
           r.created_at, r.acknowledged_at, r.decided_at, r.decided_by,
           r.decision_note
      from mod.reports r
     where r.id = p_id;
end;
$$;

comment on function public.mod_report(uuid) is
  'One report, same shape and same guard as mod_queue(). The screen reads the '
  'targeted content under the CALLER''s rights, never through this door.';

-- =============================================================================
-- §2 · L'ACCUSÉ DE RÉCEPTION
-- -----------------------------------------------------------------------------
-- Premier regard d'un modérateur sur un dossier : `acknowledged_at` se pose une
-- fois et ne bouge plus (c'est la date que le délai regarde), le statut passe à
-- `reviewing`. Idempotent à dessein — deux modérateurs qui ouvrent le même
-- dossier ne sont pas une erreur.
-- =============================================================================

create or replace function public.mod_acknowledge(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status mod.report_status;
  v_ack    timestamptz;
begin
  if not public.has_min_role('moderator') then
    raise exception 'VITOLA_MODERATOR_ONLY' using errcode = '42501';
  end if;

  update mod.reports r
     set acknowledged_at = coalesce(r.acknowledged_at, now()),
         status = case when r.status = 'open' then 'reviewing'::mod.report_status
                       else r.status end
   where r.id = p_id
  returning r.status, r.acknowledged_at into v_status, v_ack;

  if not found then
    raise exception 'VITOLA_REPORT_UNKNOWN';
  end if;

  return jsonb_build_object('id', p_id, 'status', v_status::text,
                            'acknowledgedAt', v_ack);
end;
$$;

comment on function public.mod_acknowledge(uuid) is
  'First touch on a report: acknowledged_at set once, status open -> reviewing. '
  'Idempotent — two moderators opening the same case is not an error.';

-- =============================================================================
-- §3 · LA DÉCISION, SA TRACE, SON ACTE — UNE TRANSACTION
-- -----------------------------------------------------------------------------
-- Trois écritures qui n'ont pas le droit de se séparer : le statut du rapport,
-- la ligne de `moderation_actions`, le masquage sur la cible. L'ADR 0006 a
-- tranché la famille (un geste multi-tables est une fonction) ; ici le
-- privilège n'achète pas l'atomicité — elle serait gratuite — mais le passage
-- vers `mod`, comme pour `file_report()`.
--
-- Ce que la fonction refuse, et pourquoi :
--   - un verbe sur une décision `dismissed` : tout acte pend à une décision
--     motivée qui retient le signalement ;
--   - `hide`/`restore` hors des quatre surfaces à colonnes `hidden_*` : le
--     masquage est un fait de schéma, pas une intention ;
--   - `warn`, `suspend`, `delete` : dans l'enum et sans bras en v1 (ADR 0013,
--     D4) — un verbe sans effet fabriquerait un enregistrement, pas un acte ;
--   - redécider un dossier tranché : la contestation est un nouveau
--     signalement, qui peut porter `restore`.
-- =============================================================================

create or replace function public.mod_decide(
  p_report     uuid,
  p_decision   text,
  p_note       text,
  p_verb       text default null,
  p_act_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r         mod.reports%rowtype;
  v_target  text;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_reason  text := nullif(btrim(coalesce(p_act_reason, '')), '');
  v_moderator uuid := (select auth.uid());
  v_affected integer;
begin
  if not public.has_min_role('moderator') then
    raise exception 'VITOLA_MODERATOR_ONLY' using errcode = '42501';
  end if;

  if p_decision not in ('upheld', 'dismissed') then
    raise exception 'VITOLA_DECISION_UNKNOWN: %', p_decision using errcode = '22023';
  end if;

  -- Une décision sans motivation n'est pas contestable, donc pas une décision
  -- (DSA, art. 17 — l'exposé des motifs accompagne la mesure).
  if v_note is null then
    raise exception 'VITOLA_NOTE_REQUIRED';
  end if;

  select * into r from mod.reports where id = p_report;
  if not found then
    raise exception 'VITOLA_REPORT_UNKNOWN';
  end if;
  if r.status in ('upheld', 'dismissed') then
    raise exception 'VITOLA_REPORT_ALREADY_DECIDED';
  end if;

  v_target := r.entity_schema || '.' || r.entity_table;

  if p_verb is not null then
    if p_decision <> 'upheld' then
      raise exception 'VITOLA_ACT_NEEDS_UPHELD';
    end if;
    if p_verb in ('warn', 'suspend', 'delete') then
      raise exception 'VITOLA_VERB_UNARMED: % (ADR 0013, D4)', p_verb;
    end if;
    if p_verb not in ('hide', 'restore') then
      raise exception 'VITOLA_VERB_UNKNOWN: %', p_verb using errcode = '22023';
    end if;
    if v_target not in ('public.comments', 'public.posts',
                        'public.post_comments', 'public.venue_reviews') then
      raise exception 'VITOLA_TARGET_NOT_HIDEABLE: %', v_target;
    end if;
    if p_verb = 'hide' and v_reason is null then
      raise exception 'VITOLA_ACT_REASON_REQUIRED';
    end if;

    -- L'acte. Quatre tables, deux sens ; `hidden_by` porte l'auth.uid() du
    -- modérateur — les claims JWT survivent au changement de rôle d'exécution.
    if v_target = 'public.comments' then
      update public.comments set
        hidden_at     = case when p_verb = 'hide' then now() end,
        hidden_by     = case when p_verb = 'hide' then v_moderator end,
        hidden_reason = case when p_verb = 'hide' then v_reason end
       where id = r.entity_id::uuid;
    elsif v_target = 'public.posts' then
      update public.posts set
        hidden_at     = case when p_verb = 'hide' then now() end,
        hidden_by     = case when p_verb = 'hide' then v_moderator end,
        hidden_reason = case when p_verb = 'hide' then v_reason end
       where id = r.entity_id::uuid;
    elsif v_target = 'public.post_comments' then
      update public.post_comments set
        hidden_at     = case when p_verb = 'hide' then now() end,
        hidden_by     = case when p_verb = 'hide' then v_moderator end,
        hidden_reason = case when p_verb = 'hide' then v_reason end
       where id = r.entity_id::uuid;
    else
      update public.venue_reviews set
        hidden_at     = case when p_verb = 'hide' then now() end,
        hidden_by     = case when p_verb = 'hide' then v_moderator end,
        hidden_reason = case when p_verb = 'hide' then v_reason end
       where id = r.entity_id::uuid;
    end if;

    get diagnostics v_affected = row_count;
    if v_affected = 0 then
      -- La cible a disparu entre le signalement et la décision. L'acte est
      -- sans objet ; le modérateur tranche sans verbe, et la note le dit.
      raise exception 'VITOLA_TARGET_GONE';
    end if;

    insert into mod.moderation_actions
      (report_id, moderator_id, verb, entity_schema, entity_table, entity_id, reason)
    values
      (r.id, v_moderator, p_verb::mod.moderation_verb,
       r.entity_schema, r.entity_table, r.entity_id,
       coalesce(v_reason, v_note));
  end if;

  update mod.reports set
    status          = p_decision::mod.report_status,
    acknowledged_at = coalesce(acknowledged_at, now()),
    decided_at      = now(),
    decided_by      = v_moderator,
    decision_note   = v_note
   where id = r.id;

  return jsonb_build_object(
    'id', r.id, 'status', p_decision, 'verb', p_verb, 'target', v_target);
end;
$$;

comment on function public.mod_decide(uuid, text, text, text, text) is
  'The whole decision in one transaction (ADR 0013, D2): report status + '
  'signature, the moderation_actions trace, and the hide/restore on the target '
  'when a verb is given. Refuses verbs without an arm (warn/suspend/delete), '
  'acts on dismissed reports, and hidden_* writes outside the four surfaces '
  'that carry the columns.';

-- =============================================================================
-- §4 · GRANTS
-- -----------------------------------------------------------------------------
-- `authenticated` seul : un anonyme n'a rien à faire ici, et la clé de service
-- n'en a pas besoin — l'écran parle pour un modérateur connecté. La garde
-- réelle est DANS chaque fonction ; le grant ne fait que fermer la porte aux
-- rôles qui n'ont même pas à frapper.
-- =============================================================================

revoke execute on function public.mod_queue(text, integer)                from public;
revoke execute on function public.mod_report(uuid)                        from public;
revoke execute on function public.mod_acknowledge(uuid)                   from public;
revoke execute on function public.mod_decide(uuid, text, text, text, text) from public;

revoke execute on function public.mod_queue(text, integer)                from anon, service_role;
revoke execute on function public.mod_report(uuid)                        from anon, service_role;
revoke execute on function public.mod_acknowledge(uuid)                   from anon, service_role;
revoke execute on function public.mod_decide(uuid, text, text, text, text) from anon, service_role;

grant execute on function public.mod_queue(text, integer)                 to authenticated;
grant execute on function public.mod_report(uuid)                         to authenticated;
grant execute on function public.mod_acknowledge(uuid)                    to authenticated;
grant execute on function public.mod_decide(uuid, text, text, text, text) to authenticated;

-- =============================================================================
-- §5 · AUTO-CONTRÔLE
-- =============================================================================

do $$
declare
  bad    text;
  n      integer;
  labels text;
begin
  -- 1. Les quatre portes : DEFINER, propriété de postgres, search_path épinglé.
  select string_agg(p.proname, ', ' order by p.proname) into bad
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('mod_queue', 'mod_report', 'mod_acknowledge', 'mod_decide')
     and (not p.prosecdef
          or p.proowner <> 'postgres'::regrole
          or coalesce(array_to_string(p.proconfig, ','), '') not like '%search_path=%');
  if bad is not null then
    raise exception 'VITOLA_DOOR_SHAPE: % (definer + postgres + search_path exiges)', bad;
  end if;

  select count(*) into n
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('mod_queue', 'mod_report', 'mod_acknowledge', 'mod_decide');
  if n <> 4 then
    raise exception 'VITOLA_DOOR_COUNT: % portes au lieu de 4', n;
  end if;

  -- 2. authenticated passe, anon ne frappe même pas.
  if not has_function_privilege('authenticated', 'public.mod_queue(text, integer)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.mod_report(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.mod_acknowledge(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.mod_decide(uuid, text, text, text, text)', 'EXECUTE') then
    raise exception 'VITOLA_GRANT_GAP: authenticated ne peut pas appeler une porte';
  end if;
  if has_function_privilege('anon', 'public.mod_queue(text, integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.mod_decide(uuid, text, text, text, text)', 'EXECUTE') then
    raise exception 'VITOLA_GRANT_LEAK: anon peut appeler une porte de moderation';
  end if;

  -- 3. Toujours AUCUN droit de table dans mod pour les rôles clients : les
  --    portes sont tout le chemin (ADR 0013). Une ligne ici serait le signe
  --    qu'une migration a rouvert le schéma sans le dire.
  select count(*) into n
    from information_schema.role_table_grants
   where table_schema = 'mod'
     and grantee in ('anon', 'authenticated');
  if n <> 0 then
    raise exception 'VITOLA_MOD_REOPENED: % grants de table dans mod pour un role client', n;
  end if;

  -- 4. L'enum moderation_verb n'a pas bougé. Si une valeur apparaît, la liste
  --    des refus de mod_decide() ment — c'est elle qu'il faut mettre à jour.
  select string_agg(e.enumlabel, ',' order by e.enumlabel) into labels
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace ns on ns.oid = t.typnamespace
   where ns.nspname = 'mod' and t.typname = 'moderation_verb';
  if labels <> 'delete,hide,restore,suspend,warn' then
    raise exception 'VITOLA_VERB_DRIFT: moderation_verb = [%] — relire mod_decide()', labels;
  end if;
end $$;

commit;
