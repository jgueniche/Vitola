-- =============================================================================
-- Assertions de comportement sur l'administration (migration 0020, ADR 0014).
--
-- Exécuté en CI sur une base où 0001 à 0020 sont appliquées.
--
-- Ce fichier **n'accorde rien** et ne corrige rien : la régression future ne se
-- voit que d'ici.
--
-- Deux personnes : `alba` est promue admin, `rémi` est membre. La règle
-- vérifiée est celle de l'ADR : un drapeau ne se change que par la porte, la
-- porte trace dans la même transaction, et une gamme ne se supprime que par un
-- admin.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- ---------- Fixtures, créées comme postgres (contexte privilégié) ------------
delete from ref.lines  where slug = 'gamme-admin-test';
delete from ref.brands where slug = 'marque-admin-test';

insert into auth.users (id, email, raw_user_meta_data) values
  ('aa200000-0000-4000-8000-000000000001','admin-alba@x.test','{"birth_date":"1983-01-01"}'),
  ('bb200000-0000-4000-8000-000000000002','admin-remi@x.test','{"birth_date":"1988-02-02"}')
on conflict (id) do nothing;

update public.profiles set handle='admin_alba', role='admin'
 where id='aa200000-0000-4000-8000-000000000001';
update public.profiles set handle='admin_remi'
 where id='bb200000-0000-4000-8000-000000000002';

insert into ref.brands (id, name, slug)
values ('cc200000-0000-4000-8000-000000000003', 'Marque admin', 'marque-admin-test')
on conflict (id) do nothing;
insert into ref.lines (id, brand_id, name, slug, status)
values ('dd200000-0000-4000-8000-000000000004', 'cc200000-0000-4000-8000-000000000003',
        'Gamme admin', 'gamme-admin-test', 'draft');

\echo '=== A1  les fixtures existent, et le drapeau du test aussi'
do $$
declare n integer;
begin
  select count(*) into n from public.feature_flags where key = 'show_indicative_prices';
  if n <> 1 then raise exception 'FAIL: le drapeau du test n existe pas'; end if;
  select count(*) into n from ref.lines where slug = 'gamme-admin-test';
  if n <> 1 then raise exception 'FAIL: la gamme fixture n existe pas'; end if;
  raise notice 'PASS';
end $$;

\echo '=== A2  un membre ne passe pas la porte, ni la table en direct'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','bb200000-0000-4000-8000-000000000002',true);

  begin
    perform public.admin_set_flag('show_indicative_prices', true);
    raise exception 'FAIL: un membre a change un drapeau par la porte';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.feature_flags set enabled = true where key = 'show_indicative_prices';
    raise exception 'FAIL: un membre a ecrit feature_flags en direct';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== A3  l admin change le drapeau, et la trace est dans la meme transaction'
do $$
declare before_logs integer; after_logs integer; v jsonb; v_enabled boolean;
begin
  select count(*) into before_logs from public.audit_log where action = 'flag_set';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa200000-0000-4000-8000-000000000001',true);
  select public.admin_set_flag('show_indicative_prices', true) into v;
  reset role;

  if (v->>'enabled')::boolean is distinct from true then
    raise exception 'FAIL: la porte ne rend pas l etat d apres';
  end if;
  select enabled into v_enabled from public.feature_flags where key = 'show_indicative_prices';
  if v_enabled is distinct from true then
    raise exception 'FAIL: le drapeau n a pas change';
  end if;

  select count(*) into after_logs from public.audit_log where action = 'flag_set';
  if after_logs <> before_logs + 1 then
    raise exception 'FAIL: le changement n a pas laisse sa trace (% -> %)', before_logs, after_logs;
  end if;
  if not exists (select 1 from public.audit_log
                  where action = 'flag_set' and entity_id = 'show_indicative_prices'
                    and actor_id = 'aa200000-0000-4000-8000-000000000001'
                    and (before_state->>'enabled')::boolean = false
                    and (after_state->>'enabled')::boolean = true) then
    raise exception 'FAIL: la trace ne porte pas l acteur et les deux etats';
  end if;
  raise notice 'PASS';
end $$;

\echo '=== A4  retour a l etat d origine, par la porte — la trace s ajoute'
do $$
declare v_enabled boolean; n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa200000-0000-4000-8000-000000000001',true);
  perform public.admin_set_flag('show_indicative_prices', false);
  reset role;

  select enabled into v_enabled from public.feature_flags where key = 'show_indicative_prices';
  if v_enabled is distinct from false then
    raise exception 'FAIL: le drapeau n est pas revenu a false';
  end if;
  select count(*) into n from public.audit_log
   where action = 'flag_set' and entity_id = 'show_indicative_prices';
  if n < 2 then raise exception 'FAIL: le retour n a pas ete trace'; end if;
  raise notice 'PASS';
end $$;

\echo '=== A5  une cle inconnue est refusee, une charge non-objet aussi'
do $$
declare refused boolean;
begin
  -- Un « FAIL » est lui-même un raise_exception : le refus attendu se constate
  -- par un drapeau, jamais dans le même bloc que le handler qui l'attend.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa200000-0000-4000-8000-000000000001',true);

  refused := false;
  begin
    perform public.admin_set_flag('flag_qui_n_existe_pas', true);
  exception when raise_exception then refused := true;
  end;
  if not refused then raise exception 'FAIL: une cle inconnue est passee'; end if;

  refused := false;
  begin
    perform public.admin_set_flag('show_indicative_prices', false, '"pas un objet"'::jsonb);
  exception when raise_exception then refused := true;
  end;
  if not refused then raise exception 'FAIL: une charge non-objet est passee'; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== A6  un membre ne supprime pas une gamme (zero ligne), un admin oui'
do $$
declare n integer;
begin
  select count(*) into n from ref.lines where slug = 'gamme-admin-test';
  if n <> 1 then raise exception 'FAIL: la gamme fixture a disparu avant le test'; end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','bb200000-0000-4000-8000-000000000002',true);
  delete from ref.lines where slug = 'gamme-admin-test';
  reset role;
  select count(*) into n from ref.lines where slug = 'gamme-admin-test';
  if n <> 1 then raise exception 'FAIL: un membre a supprime une gamme'; end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa200000-0000-4000-8000-000000000001',true);
  delete from ref.lines where slug = 'gamme-admin-test';
  reset role;
  select count(*) into n from ref.lines where slug = 'gamme-admin-test';
  if n <> 0 then raise exception 'FAIL: l admin n a pas pu supprimer la gamme'; end if;
  raise notice 'PASS';
end $$;

-- ---------- Nettoyage, en contexte privilégié --------------------------------
-- La gamme est partie par A6. audit_log ne se nettoie pas : c'est un journal.
delete from ref.brands where slug = 'marque-admin-test';

\echo 'Administration : 6 assertions, base laissee comme trouvee (audit_log garde ses traces, c est un journal).'
