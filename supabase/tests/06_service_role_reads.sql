-- =============================================================================
-- La clé de service peut lire tout ce que l'export RGPD doit rendre.
-- -----------------------------------------------------------------------------
-- Séparé de l'auto-contrôle de la migration 0007, et ce n'est pas de la
-- redondance : une migration corrige **puis** vérifie, donc son propre contrôle
-- ne peut jamais échouer sur ce qu'elle vient d'accorder. Ce fichier n'accorde
-- rien. C'est le seul endroit d'où une régression future se voit.
--
-- Ce qu'il aurait attrapé s'il avait existé : `/api/gdpr/export` a répondu 500 à
-- tout membre connecté depuis sa mise en service, sur
-- « permission denied for table cigars ». Le §2 du brief fait de l'article 15 une
-- obligation de la phase 1 ; elle n'était pas tenue, et rien dans le dépôt ne
-- pouvait le dire — la lecture publique passe par `anon`, la contribution par
-- `authenticated`, et personne n'avait joué `service_role` sur `ref`.
--
-- L'énoncé vérifié est volontairement plus large que le bug : « toute table de
-- `public` et de `ref` est lisible par la clé de service ». Une assertion
-- limitée aux quatorze sources d'aujourd'hui laisserait passer la quinzième.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

\echo '=== G1  la clé de service lit public et ref en entier'
do $$
declare offender text;
begin
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
  raise notice 'PASS';
end $$;

\echo '=== G2  elle n''écrit pas dans ref'
do $$
declare offender text;
begin
  -- L'export lit. Un droit d'écriture accordé « au cas où » est un droit que
  -- personne ne saura retirer plus tard, sur le référentiel dont la promesse
  -- entière est d'être relu avant publication.
  select string_agg(format('%I.%I', n.nspname, c.relname), ', ' order by 1)
    into offender
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r'
     and n.nspname = 'ref'
     and (has_table_privilege('service_role', c.oid, 'INSERT')
       or has_table_privilege('service_role', c.oid, 'DELETE'));
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: la clé de service écrit dans ref, sans justification : %', offender;
  end if;
  raise notice 'PASS';
end $$;

\echo '=== G3  elle ne lit pas mod directement — la porte est la fonction de 0006'
do $$
declare offender text;
begin
  select string_agg(format('%I.%I', n.nspname, c.relname), ', ' order by 1)
    into offender
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r'
     and n.nspname = 'mod'
     and has_table_privilege('service_role', c.oid, 'SELECT');
  if offender is not null then
    raise exception
      'VITOLA_SCOPE_GAP: la clé de service lit directement mod ; la porte de 0006 est contournée : %',
      offender;
  end if;
  raise notice 'PASS';
end $$;

\echo ''
\echo 'Lecture par la clé de service : 3 assertions passees.'
