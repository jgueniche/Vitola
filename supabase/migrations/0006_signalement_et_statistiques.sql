-- =============================================================================
-- VITOLA — 0006 : le mécanisme d'écriture du signalement, et la moyenne qui
--                 cesse d'être vide
-- -----------------------------------------------------------------------------
-- La 0004 a posé la file DSA (`mod.reports`) et déclaré le délai. Elle n'a pas
-- posé le moyen d'y écrire, et l'ADR 0005 exige les trois : un mécanisme, une
-- file, un délai. Ce fichier livre le premier.
--
-- Le point qui n'est pas évident, et qui décide de toute la forme du fichier :
-- **la clé de service ne suffit pas.** Le schéma `mod` n'est pas exposé à
-- PostgREST (0004, §3), et la clé de service passe par PostgREST comme tout le
-- monde — vérifié sur le projet réel, pas supposé : `service_role` n'a aucun
-- droit de table dans `mod`, seul `postgres` en a. Un `insert` depuis
-- `app/api/**` ne peut donc pas aboutir, quel que soit le code écrit au-dessus.
--
-- Le passage est celui que `lib/compliance/gdpr.ts` annonçait déjà en toutes
-- lettres : « Closing this needs a SECURITY DEFINER RPC in public, and it ships
-- with the reporting endpoint. » Deux fonctions dans `public`, propriété de
-- `postgres` (qui porte BYPASSRLS), appelables par `service_role` et par
-- personne d'autre. La seconde barrière — l'injoignabilité de `mod` — tient : ce
-- qui traverse n'est pas la table, c'est une porte de la taille exacte du geste.
--
-- Ordre de lecture :
--   §1  public.file_report()                 — déposer un signalement
--   §2  public.moderation_records_for_subject() — le rendre à son auteur (RGPD)
--   §3  Le rafraîchissement de cigar_stats
--   §4  Auto-contrôle
-- =============================================================================

begin;

-- =============================================================================
-- §1 · DÉPOSER UN SIGNALEMENT
-- -----------------------------------------------------------------------------
-- `p_reason` est du texte et non `mod.report_reason`, délibérément : un type
-- d'un schéma non exposé dans la signature d'une fonction exposée oblige
-- PostgREST à résoudre ce type pour la sérialiser. Le texte est cast à
-- l'intérieur, donc l'enum valide toujours — simplement une valeur inconnue
-- ressort en 22P02, que la route traduit en 400.
--
-- Ce que cette fonction ne fait PAS : vérifier que l'entité signalée existe et
-- qu'elle est visible. Ce contrôle vit dans la route, où il s'exerce avec le
-- client de session — donc sous RLS, donc « visible par ce demandeur » et non
-- « présente en base ». Le refaire ici en BYPASSRLS répondrait à une autre
-- question, et la mauvaise : elle divulguerait l'existence d'un brouillon.
-- =============================================================================

create or replace function public.file_report(
  p_reporter_id   uuid,
  p_entity_schema text,
  p_entity_table  text,
  p_entity_id     text,
  p_reason        text,
  p_detail        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing uuid;
  created  uuid;
  recent   integer;
begin
  -- Un même signalant, une même cible, un dossier encore ouvert : c'est le même
  -- signalement. Le renvoyer plutôt que d'en créer un second garde la file
  -- lisible et évite qu'un double-clic compte pour deux au titre du délai.
  -- Pas de déduplication sur un signalant anonyme : deux personnes différentes
  -- ne sont pas un doublon, et un NULL ne dit pas qui c'est.
  if p_reporter_id is not null then
    select r.id into existing
      from mod.reports r
     where r.reporter_id = p_reporter_id
       and r.entity_schema = p_entity_schema
       and r.entity_table  = p_entity_table
       and r.entity_id     = p_entity_id
       and r.status in ('open', 'reviewing')
     limit 1;

    if existing is not null then
      return jsonb_build_object('status', 'duplicate', 'id', existing);
    end if;

    -- Le seul frein disponible aujourd'hui. Le §8 prévoit Upstash pour le
    -- rate limiting, mais il arrive en P4 : compter des lignes est le garde-fou
    -- que l'on a, et il vit ici parce que la route ne sait pas lire `mod`.
    -- Généreux à dessein : il vise le script, pas la personne qui signale
    -- plusieurs commentaires d'un même fil.
    select count(*) into recent
      from mod.reports r
     where r.reporter_id = p_reporter_id
       and r.created_at >= now() - interval '1 hour';

    if recent >= 20 then
      return jsonb_build_object('status', 'throttled', 'id', null);
    end if;
  end if;

  insert into mod.reports (reporter_id, entity_schema, entity_table, entity_id, reason, detail)
  values (
    p_reporter_id,
    p_entity_schema,
    p_entity_table,
    p_entity_id,
    p_reason::mod.report_reason,
    nullif(btrim(coalesce(p_detail, '')), '')
  )
  returning id into created;

  return jsonb_build_object('status', 'created', 'id', created);
end;
$$;

comment on function public.file_report(uuid, text, text, text, text, text) is
  'The only write path into mod.reports. SECURITY DEFINER because mod is not '
  'exposed to PostgREST and service_role holds no privilege there — checked on '
  'the project, not assumed. Grants EXECUTE to service_role alone: this is a '
  'door the size of one gesture, not a re-opening of the schema.';

revoke execute on function public.file_report(uuid, text, text, text, text, text) from public;
revoke execute on function public.file_report(uuid, text, text, text, text, text)
  from anon, authenticated;
grant execute on function public.file_report(uuid, text, text, text, text, text) to service_role;

-- =============================================================================
-- §2 · RENDRE SES SIGNALEMENTS À CELUI QUI LES A FAITS
-- -----------------------------------------------------------------------------
-- L'art. 15 du RGPD ne connaît pas d'exception « ce schéma est difficile à
-- lire ». Tant qu'aucun signalement n'existait, l'omission était théorique et
-- `lib/compliance/gdpr.ts` la déclarait comme telle. Le §1 ci-dessus la rend
-- réelle dans la même migration : elle se referme donc dans la même migration.
--
-- Trois liens, une fonction. `decided_by` et `moderator_id` sont les actes d'un
-- modérateur sur son propre compte — un modérateur est aussi une personne
-- concernée, et ce qu'il a décidé le désigne.
--
-- Ce que la fonction ne rend pas : le contenu des autres. Un signalement rendu
-- à son auteur porte ce qu'il a écrit et ce qu'il visait, jamais l'identité
-- d'un tiers ni la note interne d'une décision.
-- =============================================================================

create or replace function public.moderation_records_for_subject(p_subject uuid)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'reportsFiled', coalesce(
      (select jsonb_agg(to_jsonb(x) order by x.created_at)
         from (select r.id, r.entity_schema, r.entity_table, r.entity_id,
                      r.reason::text, r.detail, r.status::text,
                      r.created_at, r.acknowledged_at, r.decided_at
                 from mod.reports r
                where r.reporter_id = p_subject) x),
      '[]'::jsonb),
    'reportsDecided', coalesce(
      (select jsonb_agg(to_jsonb(x) order by x.decided_at)
         from (select r.id, r.entity_schema, r.entity_table, r.entity_id,
                      r.status::text, r.decided_at, r.decision_note
                 from mod.reports r
                where r.decided_by = p_subject) x),
      '[]'::jsonb),
    'moderationActions', coalesce(
      (select jsonb_agg(to_jsonb(x) order by x.created_at)
         from (select a.id, a.report_id, a.verb::text, a.entity_schema,
                      a.entity_table, a.entity_id, a.reason, a.created_at
                 from mod.moderation_actions a
                where a.moderator_id = p_subject) x),
      '[]'::jsonb)
  )
$$;

comment on function public.moderation_records_for_subject(uuid) is
  'Subject access (art. 15 GDPR) for the three links into mod that the export '
  'could not reach. Ships with file_report(), as lib/compliance/gdpr.ts said it '
  'would: the omission stopped being theoretical the moment a report could exist.';

revoke execute on function public.moderation_records_for_subject(uuid) from public;
revoke execute on function public.moderation_records_for_subject(uuid) from anon, authenticated;
grant execute on function public.moderation_records_for_subject(uuid) to service_role;

-- =============================================================================
-- §3 · LE RAFRAÎCHISSEMENT DE cigar_stats
-- -----------------------------------------------------------------------------
-- `public.refresh_cigar_stats()` existe depuis 0003 et rien ne l'appelait :
-- la moyenne d'une fiche serait restée vide pour toujours.
--
-- Deux chemins, et ils ne se remplacent pas :
--
--   1. **À l'écriture**, depuis l'application, pour que l'auteur d'une entrée
--      publique voie sa note compter tout de suite. C'est le chemin qui sert
--      la personne ; il arrive avec le carnet, qui est ce qui écrit.
--   2. **Planifié**, ici. C'est le filet : il ne dépend d'aucun code futur qui
--      se souviendrait d'appeler, et il rattrape la fenêtre de 90 jours de
--      `review_count_90d`, qui se périme toute seule sans qu'aucune écriture
--      n'ait lieu. Une moyenne à 90 jours calculée uniquement à l'écriture est
--      fausse dès qu'on cesse d'écrire.
--
-- pg_cron n'existe pas sur une base PostgreSQL nue — ni celle de la CI, ni
-- celle qu'on lance en local. La section se déclare donc absente **à voix
-- haute** plutôt que de faire échouer le fichier ailleurs que sur Supabase ;
-- l'auto-contrôle du §4 vérifie la planification partout où l'extension est là.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice
      '0006 : pg_cron indisponible sur cette base — le rafraîchissement planifié '
      'de cigar_stats n''est pas installé ici. Attendu hors Supabase (CI, local).';
    return;
  end if;

  create extension if not exists pg_cron;

  -- Idempotence : rejouer la migration ne doit pas empiler les planifications.
  perform cron.unschedule(jobid)
     from cron.job
    where jobname = 'vitola-refresh-cigar-stats';

  -- Toutes les cinq minutes. La vue est un agrégat sur les seules entrées
  -- publiques ; à l'échelle du référentiel, le recalcul se compte en
  -- millisecondes. À revoir si `reviews` dépasse la centaine de milliers de
  -- lignes : le bon geste sera alors l'incrémental, pas l'espacement.
  perform cron.schedule(
    'vitola-refresh-cigar-stats',
    '*/5 * * * *',
    $cron$select public.refresh_cigar_stats()$cron$
  );

  raise notice '0006 : cigar_stats rafraîchie toutes les cinq minutes par pg_cron.';
end;
$$;

-- =============================================================================
-- §4 · AUTO-CONTRÔLE
-- =============================================================================

do $$
declare
  offender  text;
  scheduled integer;
begin
  -- 1. §0.5 du brief, sur les trois schémas. Rien n'est créé ici, mais un
  --    fichier qui ne vérifie pas est un fichier dont on ne sait rien.
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

  -- 2. Le schéma `mod` reste fermé aux rôles clients. Ce fichier ouvre une
  --    porte ; elle ne doit pas en avoir ouvert une autre au passage.
  if has_schema_privilege('anon', 'mod', 'USAGE')
     or has_schema_privilege('authenticated', 'mod', 'USAGE') then
    raise exception 'VITOLA_SCOPE_GAP: le schéma mod est devenu joignable par un rôle client';
  end if;

  -- 3. Les deux fonctions nouvelles ne sont appelables que par la clé de
  --    service. Une porte accessible à `authenticated` serait une écriture
  --    directe dans la file DSA depuis un navigateur.
  if has_function_privilege('anon', 'public.file_report(uuid, text, text, text, text, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.file_report(uuid, text, text, text, text, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.moderation_records_for_subject(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.moderation_records_for_subject(uuid)', 'EXECUTE') then
    raise exception 'VITOLA_GRANT_GAP: une fonction de modération est appelable par un client';
  end if;

  -- 4. L'inverse : sans EXECUTE pour service_role, la route répond 500 à chaque
  --    signalement, et le seul symptôme est un « permission denied » de log.
  if not has_function_privilege('service_role', 'public.file_report(uuid, text, text, text, text, text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.moderation_records_for_subject(uuid)', 'EXECUTE') then
    raise exception 'VITOLA_GRANT_GAP: service_role ne peut pas appeler les fonctions de modération';
  end if;

  -- 5. Aucune fonction de `public` appelable au titre de PUBLIC.
  select string_agg(proname, ', ' order by proname) into offender
    from pg_proc
   where pronamespace = 'public'::regnamespace
     and array_to_string(coalesce(proacl, '{}')::text[], ' ') ~ '(^| )=X/';
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: EXECUTE accordé à PUBLIC sur : %', offender;
  end if;

  -- 6. Là où pg_cron existe, la planification existe. Le §3 se tait sur une
  --    base nue ; il n'a pas le droit de se taire sur Supabase.
  --
  --    En SQL dynamique, et ce n'est pas une coquetterie : PostgreSQL analyse
  --    une condition d'un seul tenant. Écrite `if pg_cron existe and cron.job
  --    ne contient rien`, elle échouait sur « relation "cron.job" does not
  --    exist » là même où la garde devait l'éviter — la branche courte-circuitée
  --    est quand même analysée. `execute` diffère l'analyse à l'exécution.
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute 'select count(*) from cron.job where jobname = $1'
       into scheduled using 'vitola-refresh-cigar-stats';
    if scheduled = 0 then
      raise exception 'VITOLA_SCHEDULE_GAP: pg_cron est installé mais cigar_stats n''est pas planifiée';
    end if;
  end if;

  raise notice
    '0006 signalement : porte de service ouverte sur mod, schéma toujours fermé aux clients.';
end;
$$;

commit;
