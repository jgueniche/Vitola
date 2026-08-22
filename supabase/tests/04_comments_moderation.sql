-- =============================================================================
-- Assertions de comportement sur les commentaires et la modération
-- (migration 0004, ADR 0005).
--
-- Mêmes deux précautions que 03_carnet_rls.sql, pour les mêmes raisons payées :
--   1. chaque assertion vit dans un bloc `do $$ … $$`, qui est une transaction
--      implicite — `SET LOCAL ROLE` hors transaction est ignoré en silence ;
--   2. toute assertion de non-visibilité prouve d'abord, en contexte privilégié,
--      que la ligne existe. « Zéro ligne visible » et « aucune ligne insérée »
--      se ressemblent trop.
--
-- Une limite assumée, et déclarée plutôt que contournée : le schéma `mod` n'a
-- **aucun** USAGE pour anon ni authenticated. Ses policies sont donc une seconde
-- barrière inatteignable tant que la première tient, et aucun test ne peut les
-- exercer par le chemin normal. M8 vérifie la fermeture — la barrière réelle
-- d'aujourd'hui — et M9 vérifie que les policies existent bel et bien, pour que
-- le jour où un `grant usage` sera écrit il ne trouve pas une table nue.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- ---------- Fixtures, créées comme postgres (contexte privilégié) ------------
-- Préfixes d'UUID distincts sur les douze premiers caractères hexadécimaux :
-- `tg_handle_new_user()` en dérive le pseudo, et deux comptes qui les partagent
-- se heurtent sur `profiles_handle_key`.

insert into auth.users (id, email, raw_user_meta_data) values
  ('d4000000-0000-4000-8000-000000000001','com-auteur@x.test'   ,'{"birth_date":"1985-04-02"}'),
  ('e5000000-0000-4000-8000-000000000002','com-lecteur@x.test'  ,'{"birth_date":"1979-11-20"}'),
  ('f6000000-0000-4000-8000-000000000003','com-moderateur@x.test','{"birth_date":"1990-01-01"}')
on conflict (id) do nothing;

update public.profiles set handle='com_auteur'     where id='d4000000-0000-4000-8000-000000000001';
update public.profiles set handle='com_lecteur'    where id='e5000000-0000-4000-8000-000000000002';
update public.profiles set handle='com_moderateur', role='moderator'
                                                   where id='f6000000-0000-4000-8000-000000000003';

insert into ref.manufacturers (id,name,slug,country) values
  ('da000000-0000-4000-8000-000000000001','Manufacture Commentaire','manufacture-commentaire','CU')
on conflict (id) do nothing;
insert into ref.brands (id,manufacturer_id,name,slug,country,is_cuban) values
  ('db000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001','Marque Commentaire','marque-commentaire','CU',true)
on conflict (id) do nothing;
insert into ref.cigars (id,brand_id,commercial_name,slug,origin_country,status) values
  ('dc000000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001','Fiche Commentee','fiche-commentee','CU','published'),
  ('dc000000-0000-4000-8000-000000000002','db000000-0000-4000-8000-000000000001','Fiche Non Publiee','fiche-non-publiee-com','CU','draft')
on conflict (id) do nothing;

insert into public.comments (id,cigar_id,author_id,body) values
  ('33330000-0000-4000-8000-000000000001','dc000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','Commentaire visible'),
  ('33330000-0000-4000-8000-000000000002','dc000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','Commentaire masque')
on conflict (id) do nothing;

-- Masqué par un modérateur, avec un motif : la contrainte l'exige.
update public.comments
   set hidden_at = now(), hidden_by = 'f6000000-0000-4000-8000-000000000003',
       hidden_reason = 'Incitation a la consommation (§2)'
 where id = '33330000-0000-4000-8000-000000000002';

-- Un commentaire sur une fiche en brouillon, inséré en contexte privilégié :
-- c'est ce qui permet à M2 de prouver qu'il existe avant de constater qu'il
-- n'est pas visible.
insert into public.comments (id,cigar_id,author_id,body) values
  ('33330000-0000-4000-8000-000000000003','dc000000-0000-4000-8000-000000000002','d4000000-0000-4000-8000-000000000001','Commentaire sur brouillon')
on conflict (id) do nothing;

insert into mod.reports (id, reporter_id, entity_schema, entity_table, entity_id, reason, detail) values
  ('44440000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000002',
   'public','comments','33330000-0000-4000-8000-000000000002','tobacco_promotion','Fait l eloge du produit')
on conflict (id) do nothing;

\echo '=== M1  un visiteur anonyme voit un commentaire sur une fiche publiee'
do $$
declare n integer;
begin
  set local role anon;
  select count(*) into n from public.comments
   where cigar_id='dc000000-0000-4000-8000-000000000001';
  if n <> 1 then raise exception 'FAIL: anon voit % commentaires au lieu de 1', n; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== M2  aucun commentaire ne fuit depuis une fiche non publiee'
do $$
declare n integer;
begin
  if not exists (select 1 from public.comments
                  where id='33330000-0000-4000-8000-000000000003') then
    raise exception 'FAIL: le commentaire sur brouillon n existe pas — assertion vide de sens';
  end if;

  set local role anon;
  select count(*) into n from public.comments
   where cigar_id='dc000000-0000-4000-8000-000000000002';
  if n <> 0 then raise exception 'FAIL: % commentaire(s) visibles sous un brouillon', n; end if;
  reset role;

  -- Et un membre tiers non plus : ce n est pas un effet de l anonymat.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','e5000000-0000-4000-8000-000000000002',true);
  select count(*) into n from public.comments
   where cigar_id='dc000000-0000-4000-8000-000000000002';
  if n <> 0 then raise exception 'FAIL: un membre voit % commentaire(s) sous un brouillon', n; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== M3  un commentaire masque disparait pour les autres, pas pour son auteur'
do $$
declare n integer;
begin
  if not exists (select 1 from public.comments
                  where id='33330000-0000-4000-8000-000000000002' and hidden_at is not null) then
    raise exception 'FAIL: le commentaire masque n existe pas — assertion vide de sens';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','e5000000-0000-4000-8000-000000000002',true);
  select count(*) into n from public.comments where id='33330000-0000-4000-8000-000000000002';
  if n <> 0 then raise exception 'FAIL: un tiers voit un commentaire masque'; end if;
  reset role;

  -- L auteur le voit encore : le DSA veut une decision contestable, et on ne
  -- conteste pas ce qu on ne voit plus.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','d4000000-0000-4000-8000-000000000001',true);
  select count(*) into n from public.comments where id='33330000-0000-4000-8000-000000000002';
  if n <> 1 then raise exception 'FAIL: l auteur ne voit plus son commentaire masque'; end if;
  reset role;

  -- Le moderateur aussi, sinon il ne peut rien retablir.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-000000000003',true);
  select count(*) into n from public.comments where id='33330000-0000-4000-8000-000000000002';
  if n <> 1 then raise exception 'FAIL: le moderateur ne voit pas le commentaire masque'; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== M4  un client ne peut pas masquer un commentaire'
do $$
begin
  set local role authenticated;
  -- Meme un moderateur : masquer passe par du code a cle de service, comme
  -- l ecriture de audit_log. La colonne est hors grant pour tout le monde.
  perform set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-000000000003',true);
  begin
    update public.comments set hidden_at = now()
     where id='33330000-0000-4000-8000-000000000001';
    raise exception 'FAIL: hidden_at modifiable par un client';
  exception
    when insufficient_privilege then raise notice 'PASS (colonne hors grant)';
    when others then
      if sqlstate = '42501' then raise notice 'PASS (colonne hors grant)';
      else raise; end if;
  end;
  reset role;
end $$;

\echo '=== M5  on ne commente pas une fiche en brouillon'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','e5000000-0000-4000-8000-000000000002',true);
  begin
    insert into public.comments (cigar_id, author_id, body)
    values ('dc000000-0000-4000-8000-000000000002','e5000000-0000-4000-8000-000000000002','Tentative');
    raise exception 'FAIL: un commentaire sur brouillon a ete accepte';
  exception
    when insufficient_privilege then raise notice 'PASS (refuse)';
    when others then
      if sqlstate = '42501' then raise notice 'PASS (refuse)';
      else raise; end if;
  end;
  reset role;
end $$;

\echo '=== M6  on ne commente pas au nom d un autre'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','e5000000-0000-4000-8000-000000000002',true);
  begin
    insert into public.comments (cigar_id, author_id, body)
    values ('dc000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','Usurpation');
    raise exception 'FAIL: un commentaire a ete ecrit au nom d un autre';
  exception
    when insufficient_privilege then raise notice 'PASS (refuse)';
    when others then
      if sqlstate = '42501' then raise notice 'PASS (refuse)';
      else raise; end if;
  end;
  reset role;
end $$;

\echo '=== M7  on ne recrit pas un commentaire masque'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','d4000000-0000-4000-8000-000000000001',true);
  update public.comments set body='Reecriture apres masquage'
   where id='33330000-0000-4000-8000-000000000002';
  if found then
    raise exception 'FAIL: l auteur a recrit un commentaire masque';
  end if;
  raise notice 'PASS (0 ligne touchee par la policy)';
  reset role;
end $$;

\echo '=== M8  le schema mod est injoignable pour un role client'
do $$
begin
  if has_schema_privilege('anon','mod','USAGE')
     or has_schema_privilege('authenticated','mod','USAGE') then
    raise exception 'FAIL: le schema mod est joignable par un role client';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-000000000003',true);
  begin
    perform 1 from mod.reports;
    raise exception 'FAIL: un moderateur atteint mod.reports par le chemin normal';
  exception
    when insufficient_privilege then raise notice 'PASS (schema ferme)';
    when others then
      if sqlstate = '42501' then raise notice 'PASS (schema ferme)';
      else raise; end if;
  end;
  reset role;
end $$;

\echo '=== M9  la seconde barriere existe : RLS et policies sur les tables mod'
do $$
declare manquantes text;
begin
  -- M8 montre que la premiere barriere tient, donc les policies ne sont pas
  -- exercables aujourd hui. Elles sont verifiees structurellement pour qu un
  -- futur `grant usage on schema mod` ne trouve pas une table nue.
  select string_agg(format('%I.%I', n.nspname, c.relname), ', ' order by 1)
    into manquantes
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'mod' and c.relkind = 'r'
     and (c.relrowsecurity = false
          or not exists (select 1 from pg_policy p where p.polrelid = c.oid));
  if manquantes is not null then
    raise exception 'FAIL: table(s) mod sans RLS ou sans policy : %', manquantes;
  end if;

  if not exists (select 1 from pg_policy where polname = 'reports_select_own') then
    raise exception 'FAIL: un signalant ne pourra pas suivre son signalement';
  end if;
  if not exists (select 1 from pg_policy where polname = 'reports_select_moderator') then
    raise exception 'FAIL: aucune policy de lecture pour les moderateurs';
  end if;
  raise notice 'PASS';
end $$;

\echo '=== M10 mod.moderation_actions n est ecrivable par aucun role client'
do $$
declare accorde text;
begin
  select string_agg(distinct grantee, ', ') into accorde
    from information_schema.role_table_grants
   where table_schema='mod' and table_name='moderation_actions'
     and grantee in ('anon','authenticated');
  if accorde is not null then
    raise exception 'FAIL: moderation_actions accessible a : %', accorde;
  end if;
  -- Et aucune policy d ecriture, pour que le jour ou un grant apparait la
  -- table reste en lecture seule.
  if exists (select 1 from pg_policy p
              join pg_class c on c.oid = p.polrelid
              join pg_namespace n on n.oid = c.relnamespace
             where n.nspname='mod' and c.relname='moderation_actions'
               and p.polcmd in ('a','w','d')) then
    raise exception 'FAIL: une policy d ecriture existe sur moderation_actions';
  end if;
  raise notice 'PASS';
end $$;

\echo '=== M11 un signalement sur une cible inconnue est refuse'
do $$
begin
  begin
    insert into mod.reports (reporter_id, entity_schema, entity_table, entity_id, reason)
    values ('e5000000-0000-4000-8000-000000000002','public','secrets','x','other');
    raise exception 'FAIL: une cible hors liste a ete acceptee';
  exception when check_violation then raise notice 'PASS';
  end;
end $$;

\echo '=== M12 une decision sans auteur ni date est refusee'
do $$
begin
  begin
    update mod.reports set status='upheld'
     where id='44440000-0000-4000-8000-000000000001';
    raise exception 'FAIL: un signalement tranche sans decideur a ete accepte';
  exception when check_violation then raise notice 'PASS';
  end;
end $$;

\echo '=== M13 un masquage sans motif est refuse'
do $$
begin
  begin
    update public.comments set hidden_at = now()
     where id='33330000-0000-4000-8000-000000000001';
    raise exception 'FAIL: un masquage sans motif a ete accepte';
  exception when check_violation then raise notice 'PASS';
  end;
end $$;

\echo '=== M14 le seuil de prise de parole est bien lu dans le drapeau'
do $$
declare n integer;
begin
  if public.comment_min_role() <> 'member' then
    raise exception 'FAIL: le defaut n est pas member mais %', public.comment_min_role();
  end if;

  -- Le mecanisme, pas seulement le defaut : on resserre, et un simple membre
  -- doit cesser de pouvoir ecrire.
  update public.feature_flags set payload = '{"min_role": "editor"}'::jsonb
   where key = 'comments_min_role';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','e5000000-0000-4000-8000-000000000002',true);
  begin
    insert into public.comments (cigar_id, author_id, body)
    values ('dc000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000002','Sous seuil');
    raise exception 'FAIL: un membre a commente alors que le seuil est editor';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlstate <> '42501' then raise; end if;
  end;
  reset role;

  update public.feature_flags set payload = '{"min_role": "member"}'::jsonb
   where key = 'comments_min_role';

  -- Et desserre, il peut de nouveau : sinon on aurait teste un refus permanent.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','e5000000-0000-4000-8000-000000000002',true);
  insert into public.comments (cigar_id, author_id, body)
  values ('dc000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000002','Au dessus du seuil');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: le desserrage du seuil ne rouvre pas la parole'; end if;
  raise notice 'PASS (seuil applique dans les deux sens)';
  reset role;
end $$;

\echo '=== Commentaires et moderation : 14 assertions passees'
