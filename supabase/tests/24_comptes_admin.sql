-- =============================================================================
-- Assertions de comportement : la liste des comptes de l'administration
-- (migration 0037).
--
-- Exécuté en CI sur une base où 0001 à 0037 sont appliquées. Ce fichier
-- n'accorde rien : il éprouve la porte telle qu'un membre et un administrateur
-- la rencontrent.
--
-- Les pièges du dépôt, évités : chaque assertion vit dans un bloc `do $$ … $$`
-- (donc une transaction, pour que `SET LOCAL ROLE` porte), et chaque « rien »
-- prouve d'abord, en contexte privilégié, que la ligne existe.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- ---------- Fixtures, créées comme postgres (contexte privilégié) ------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('ad370001-0000-4000-8000-000000000001','annuaire-admin@x.test' ,'{"birth_date":"1979-01-02"}'),
  ('ad370002-0000-4000-8000-000000000002','Annuaire.Membre@x.test','{"birth_date":"1991-03-04"}')
on conflict (id) do nothing;

-- Le rôle s'écrit ici en contexte privilégié : le garde-fou de la 0009 le
-- refuse à tout client, et c'est ce qu'il doit faire.
update public.profiles set role = 'admin' where id = 'ad370001-0000-4000-8000-000000000001';
update public.profiles set display_name = 'Camille Annuaire', city = 'Lyon', country = 'FR'
 where id = 'ad370002-0000-4000-8000-000000000002';

\echo '=== C1  un membre qui appelle la porte est refuse, pas servi a vide'
do $$
begin
  if not exists (select 1 from public.profiles where id = 'ad370002-0000-4000-8000-000000000002') then
    raise exception 'FAIL: la fixture de membre n existe pas';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'ad370002-0000-4000-8000-000000000002', true);
  begin
    perform * from public.admin_accounts();
    raise exception 'FAIL: un membre a lu l annuaire des comptes';
  exception when insufficient_privilege then null;
  end;

  raise notice 'PASS';
  reset role;
end $$;

\echo '=== C2  un administrateur lit le nom, l adresse e-mail, la ville'
do $$
declare r record; n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'ad370001-0000-4000-8000-000000000001', true);

  select * into r from public.admin_accounts()
   where id = 'ad370002-0000-4000-8000-000000000002';
  if r.id is null then raise exception 'FAIL: le membre manque a l annuaire'; end if;
  if r.email <> 'Annuaire.Membre@x.test' then
    raise exception 'FAIL: adresse e-mail % au lieu de Annuaire.Membre@x.test', r.email;
  end if;
  if r.display_name <> 'Camille Annuaire' or r.city <> 'Lyon' or r.country <> 'FR' then
    raise exception 'FAIL: nom ou ville manquants (%, %, %)', r.display_name, r.city, r.country;
  end if;
  -- Personne n'a de téléphone : le site n'en demande nulle part. La colonne
  -- est là pour le jour où il y en aura un, et vaut null d'ici là.
  if r.phone is not null then raise exception 'FAIL: un telephone invente : %', r.phone; end if;

  select count(*) into n from public.admin_accounts();
  if n < 2 then raise exception 'FAIL: % compte(s) au lieu de tous', n; end if;

  raise notice 'PASS';
  reset role;
end $$;

\echo '=== C3  la recherche porte sur l adresse e-mail, le nom et le pseudo, sans casse'
do $$
declare n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'ad370001-0000-4000-8000-000000000001', true);

  select count(*) into n from public.admin_accounts('annuaire.membre@');
  if n <> 1 then raise exception 'FAIL: la recherche par adresse rend % ligne(s)', n; end if;

  select count(*) into n from public.admin_accounts('CAMILLE');
  if n <> 1 then raise exception 'FAIL: la recherche par nom rend % ligne(s)', n; end if;

  -- Le pseudo fabriqué reste cherchable : c'est lui qu'on lit dans une URL.
  select count(*) into n from public.admin_accounts('membre_ad3700020000');
  if n <> 1 then raise exception 'FAIL: la recherche par pseudo rend % ligne(s)', n; end if;

  -- Un `%` tapé est du texte, pas un joker.
  select count(*) into n from public.admin_accounts('%');
  if n <> 0 then raise exception 'FAIL: « %% » a servi de joker (% ligne(s))', n; end if;

  select count(*) into n from public.admin_accounts(null, 1);
  if n <> 1 then raise exception 'FAIL: la limite n est pas tenue (% lignes)', n; end if;

  raise notice 'PASS';
  reset role;
end $$;

\echo '=== C4  anon ne l appelle pas, et la porte ne rend rien de auth.users au-dela de l adresse'
do $$
declare cols text;
begin
  if has_function_privilege('anon', 'public.admin_accounts(text,integer)', 'EXECUTE') then
    raise exception 'FAIL: anon peut appeler admin_accounts()';
  end if;

  select pg_get_function_result('public.admin_accounts(text,integer)'::regprocedure) into cols;
  if cols ~* '(password|token|meta|birth|confirm|recovery|provider|factor|secret)' then
    raise exception 'FAIL: la porte expose %', cols;
  end if;
  if cols !~ 'email text' then
    raise exception 'FAIL: la porte ne rend plus l adresse e-mail (%)', cols;
  end if;

  raise notice 'PASS';
end $$;

\echo ''
\echo 'Comptes de l administration : 4 assertions passees.'
