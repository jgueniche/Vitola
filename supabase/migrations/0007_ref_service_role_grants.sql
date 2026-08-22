-- =============================================================================
-- VITOLA — 0007 : rendre le schéma `ref` lisible par la clé de service
-- -----------------------------------------------------------------------------
-- **L'export RGPD répondait 500 à tout membre connecté.** Trouvé en exerçant le
-- chemin authentifié complet contre le projet réel — ce que la reprise de
-- session demandait de faire une fois, et que personne n'avait fait :
--
--     [gdpr/export] collection failed
--     Error: ref.cigars.created_by: permission denied for table cigars
--
-- La cause est la leçon de la 0005, prise par l'autre bout. **`alter default
-- privileges` est par schéma — et l'amorçage de Supabase aussi.** Supabase
-- accorde tout à `anon`, `authenticated` et `service_role` sur les nouvelles
-- tables de `public` ; il ne connaît pas `ref`, que la migration 0001 a créé.
-- Chaque table de `ref` a donc reçu ses grants **explicites** pour `anon` et
-- `authenticated`, et rien pour `service_role`, à qui personne n'avait pensé.
--
-- Le trou était invisible de partout :
--   - la lecture publique passe par `anon`, qui a ses droits ;
--   - la contribution passe par `authenticated`, qui a les siens ;
--   - `service_role` contourne la RLS, donc on le suppose capable de tout — et
--     BYPASSRLS ne dit rien des droits de table. Il ne les remplace pas.
--   - la CI n'a pas d'endpoint ; les tests SQL n'ont jamais joué `service_role`
--     sur `ref` ; le §9 du brief ne mesure pas un export.
--
-- Ce que cela cassait exactement, art. 15 et 17 du RGPD en main :
--   1. `/api/gdpr/export` — 500 pour tout le monde. Un droit refusé.
--   2. `/api/gdpr/delete` — l'effacement aboutissait, mais le décompte des
--      révisions détruites échouait sans être lu et retombait sur `0`. La trace
--      d'audit annonçait donc « aucune perte » là où il pouvait y en avoir une.
--      Corrigé dans la route au même commit : une valeur inconnue s'écrit
--      `null`, jamais zéro.
--
-- SELECT seulement, et c'est délibéré : l'export lit. Aucune écriture de
-- `service_role` dans `ref` n'est nécessaire aujourd'hui, et le jour où elle le
-- serait, elle devra se justifier plutôt que d'avoir été accordée d'avance.
-- =============================================================================

begin;

-- =============================================================================
-- §1 · LECTURE DE `ref` PAR LA CLÉ DE SERVICE
-- =============================================================================

grant usage on schema ref to service_role;
grant select on all tables in schema ref to service_role;

-- Pour les tables à venir. Sans cette ligne, la prochaine table de `ref`
-- rouvrirait exactement le même trou, et de la même façon : en silence.
alter default privileges in schema ref grant select on tables to service_role;

-- `public` aussi, et ce n'est pas redondant. Sur le projet réel, Supabase l'a
-- déjà accordé par son amorçage — mais cet amorçage ne vit dans aucun fichier
-- de ce dépôt, exactement comme les trois réglages de `docs/setup/supabase.md`.
-- Une base reconstruite depuis `supabase/migrations/` seule n'en hérite pas, et
-- l'export RGPD y échouerait pour la même raison, à un schéma près. Écrit ici,
-- l'invariant du §2 devient vrai partout — y compris sur la base nue de la CI,
-- qui est le seul endroit où il sera vérifié avant qu'un membre ne le découvre.
grant select on all tables in schema public to service_role;
alter default privileges in schema public grant select on tables to service_role;

-- =============================================================================
-- §2 · AUTO-CONTRÔLE
-- -----------------------------------------------------------------------------
-- L'invariant vérifié ici n'est pas « la 0007 a été appliquée » mais
-- « l'inventaire des données personnelles est intégralement lisible ». C'est le
-- seul énoncé qui protège l'export : il tient encore quand une table est ajoutée
-- demain, et il échoue à la migration qui l'oublie plutôt qu'à la première
-- demande d'accès.
-- =============================================================================

do $$
declare
  offender text;
begin
  -- 1. Toute table de `public` et de `ref` est lisible par la clé de service.
  --    `mod` est délibérément absent : son unique porte est
  --    `public.moderation_records_for_subject()` (0006), et lui accorder des
  --    droits de table ici défairait cette décision sans le dire.
  select string_agg(format('%I.%I', n.nspname, c.relname), ', ' order by 1)
    into offender
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r'
     and n.nspname in ('public', 'ref')
     and not has_table_privilege('service_role', c.oid, 'SELECT');
  if offender is not null then
    raise exception
      'VITOLA_GRANT_GAP: la clé de service ne peut pas lire % — l''export RGPD répondra 500', offender;
  end if;

  -- 2. Et elle n'écrit pas dans `ref`. Le §1 accorde SELECT ; si un INSERT
  --    apparaît ici, c'est qu'un `grant all` a été écrit par commodité.
  select string_agg(format('%I.%I', n.nspname, c.relname), ', ' order by 1)
    into offender
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r'
     and n.nspname = 'ref'
     and has_table_privilege('service_role', c.oid, 'INSERT');
  if offender is not null then
    raise exception
      'VITOLA_GRANT_GAP: la clé de service peut écrire dans ref — non justifié : %', offender;
  end if;

  -- 3. Le schéma `mod` reste fermé aux rôles clients, et ses tables restent
  --    hors de portée de la clé de service : la porte est la fonction.
  if has_schema_privilege('anon', 'mod', 'USAGE')
     or has_schema_privilege('authenticated', 'mod', 'USAGE') then
    raise exception 'VITOLA_SCOPE_GAP: le schéma mod est devenu joignable par un rôle client';
  end if;

  select string_agg(format('%I.%I', n.nspname, c.relname), ', ' order by 1)
    into offender
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r'
     and n.nspname = 'mod'
     and has_table_privilege('service_role', c.oid, 'SELECT');
  if offender is not null then
    raise exception
      'VITOLA_SCOPE_GAP: la clé de service lit directement mod, la porte de 0006 est contournée : %',
      offender;
  end if;

  raise notice '0007 : ref lisible par la clé de service, non inscriptible ; mod inchangé.';
end;
$$;

commit;
