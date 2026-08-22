-- §0.5 du brief : « Une table sans RLS = build cassé. »
--
-- Exécuté en CI après application des migrations. Volontairement indépendant de
-- pgTAP : c'est le contrôle le plus important du projet et il ne doit dépendre
-- d'aucune extension qui pourrait ne pas être installée.
do $$
declare
  offender text;
begin
  select string_agg(format('%I.%I', n.nspname, c.relname), ', ' order by n.nspname, c.relname)
    into offender
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r'
     and n.nspname in ('public', 'ref', 'shop', 'mod')
     and (
       c.relrowsecurity = false
       or not exists (select 1 from pg_policy p where p.polrelid = c.oid)
     );

  if offender is not null then
    raise exception 'VITOLA_RLS_GAP: table(s) without RLS or without any policy: %', offender;
  end if;

  raise notice 'RLS coverage: OK';
end;
$$;
