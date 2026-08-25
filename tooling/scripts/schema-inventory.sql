-- L'inventaire de ce que PostgREST expose, en JSON, pour check-types-drift.ts.
--
-- Quatre familles, parce que ce sont les quatre que le générateur de types
-- décrit : les tables, les vues, les enums et les fonctions **appelables**.
--
-- « Appelable » inclut `service_role`, et il le faut : `file_report()` et
-- `moderation_records_for_subject()` ne sont accordées qu'à elle, et elles sont
-- pourtant typées — « le type dit la signature, le GRANT dit qui l'utilise, et
-- confondre les deux est ainsi qu'un garde-fou se relâche par accident »
-- (lib/compliance/gdpr.ts). Une fonction que **personne** ne peut appeler, elle,
-- n'a pas de type à avoir, et les fonctions de trigger sont exclues par leur
-- type de retour.
--
-- `-tAc` sur ce fichier renvoie une seule ligne : le tableau JSON attendu.
select coalesce(json_agg(row_to_json(t)), '[]'::json)
  from (
    select n.nspname as schema, 'table' as kind, c.relname as name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r'
       and n.nspname in ('public', 'ref', 'shop')

    union all

    select n.nspname, 'view', c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where c.relkind in ('v', 'm')
       and n.nspname in ('public', 'ref', 'shop')

    union all

    select n.nspname, 'enum', t.typname
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
     where t.typtype = 'e'
       and n.nspname in ('public', 'ref', 'shop')

    union all

    select n.nspname, 'function', p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'ref', 'shop')
       and p.prokind = 'f'
       and p.prorettype <> 'trigger'::regtype
       and (has_function_privilege('anon', p.oid, 'EXECUTE')
         or has_function_privilege('authenticated', p.oid, 'EXECUTE')
         or has_function_privilege('service_role', p.oid, 'EXECUTE'))
  ) t;
