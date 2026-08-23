-- =============================================================================
-- Assertions de comportement sur les portes de modération (migration 0018,
-- ADR 0013).
--
-- Exécuté en CI sur une base où 0001 à 0018 sont appliquées.
--
-- Ce fichier **n'accorde rien** et ne corrige rien : la régression future ne se
-- voit que d'ici.
--
-- Deux personnes : `mona` est promue moderator et relève la file, `rene` est
-- membre, écrit le commentaire visé, et prouve que les portes ne s'ouvrent
-- qu'aux modérateurs.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- ---------- Fixtures, créées comme postgres (contexte privilégié) ------------
-- Idempotence : un run précédent interrompu ne doit pas faire échouer celui-ci.
delete from mod.moderation_actions where entity_id in
  (select id::text from public.comments where body like '%moderation-test%');
delete from mod.reports where entity_id in
  (select id::text from public.comments where body like '%moderation-test%');
delete from mod.reports where entity_schema = 'ref' and entity_table = 'cigars'
  and entity_id in (select id::text from ref.cigars where slug = 'cigare-de-moderation-test');
delete from public.comments where body like '%moderation-test%';

insert into auth.users (id, email, raw_user_meta_data) values
  ('aa200000-0000-4000-8000-000000000001','mod-mona@x.test','{"birth_date":"1984-01-01"}'),
  ('bb200000-0000-4000-8000-000000000002','mod-rene@x.test','{"birth_date":"1985-02-02"}')
on conflict (id) do nothing;

update public.profiles set handle='mod_mona', role='moderator'
 where id='aa200000-0000-4000-8000-000000000001';
update public.profiles set handle='mod_rene'
 where id='bb200000-0000-4000-8000-000000000002';

insert into ref.brands (id, name, slug)
values ('cc200000-0000-4000-8000-00000000000e','Marque moderation','marque-de-moderation-test')
on conflict (id) do nothing;
insert into ref.cigars (id, brand_id, commercial_name, slug, status)
values ('cc200000-0000-4000-8000-00000000000f','cc200000-0000-4000-8000-00000000000e',
        'Cigare moderation','cigare-de-moderation-test','draft')
on conflict (id) do nothing;

insert into public.comments (id, cigar_id, author_id, body)
values ('dd200000-0000-4000-8000-000000000003','cc200000-0000-4000-8000-00000000000f',
        'bb200000-0000-4000-8000-000000000002','Un commentaire moderation-test.')
on conflict (id) do nothing;

\echo '=== M1  un membre ne releve pas la file'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','bb200000-0000-4000-8000-000000000002',true);
  begin
    perform * from public.mod_queue();
    raise exception 'FAIL: un membre a lu la file de moderation';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== M2  un anonyme ne frappe meme pas a la porte'
do $$
begin
  set local role anon;
  begin
    perform * from public.mod_queue();
    raise exception 'FAIL: anon a pu appeler mod_queue';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS';
  reset role;
end $$;

-- Le signalement, déposé par le chemin réel (file_report, comme la route).
do $$
declare v jsonb;
begin
  select public.file_report('bb200000-0000-4000-8000-000000000002',
    'public','comments','dd200000-0000-4000-8000-000000000003','spam',
    'Signalement moderation-test') into v;
  if v->>'status' <> 'created' then
    raise exception 'FAIL: le depot du signalement a rendu %', v;
  end if;
  perform set_config('vitola.report1', v->>'id', false);
end $$;

\echo '=== M3  la moderatrice voit le dossier dans la file, du bon cote'
do $$
declare n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa200000-0000-4000-8000-000000000001',true);
  select count(*) into n from public.mod_queue('open')
   where id = current_setting('vitola.report1')::uuid;
  if n <> 1 then raise exception 'FAIL: le signalement n est pas dans la file open'; end if;
  select count(*) into n from public.mod_queue('decided')
   where id = current_setting('vitola.report1')::uuid;
  if n <> 0 then raise exception 'FAIL: un dossier ouvert apparait dans les tranches'; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== M4  l accuse de reception se pose une fois et ne bouge plus'
do $$
declare v jsonb; t1 timestamptz; t2 timestamptz;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa200000-0000-4000-8000-000000000001',true);

  select public.mod_acknowledge(current_setting('vitola.report1')::uuid) into v;
  if v->>'status' <> 'reviewing' then
    raise exception 'FAIL: accuser reception n a pas passe le dossier en reviewing';
  end if;
  t1 := (v->>'acknowledgedAt')::timestamptz;

  select public.mod_acknowledge(current_setting('vitola.report1')::uuid) into v;
  t2 := (v->>'acknowledgedAt')::timestamptz;
  if t1 <> t2 then
    raise exception 'FAIL: un second regard a change la date du premier';
  end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== M5  un acte exige une decision retenue, et un verbe sans bras est refuse'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa200000-0000-4000-8000-000000000001',true);
  begin
    perform public.mod_decide(current_setting('vitola.report1')::uuid,
      'dismissed', 'Rejet.', 'hide', 'Motif.');
    raise exception 'FAIL: un acte a accompagne un rejet';
  exception when others then
    if sqlerrm not like 'VITOLA_ACT_NEEDS_UPHELD%' then raise; end if;
  end;
  begin
    perform public.mod_decide(current_setting('vitola.report1')::uuid,
      'upheld', 'Retenu.', 'suspend', null);
    raise exception 'FAIL: suspend est passe sans bras';
  exception when others then
    if sqlerrm not like 'VITOLA_VERB_UNARMED%' then raise; end if;
  end;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== M6  retenir et masquer : une transaction, trace comprise, la salle ne voit plus, l auteur si'
do $$
declare v jsonb; n integer; v_by uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa200000-0000-4000-8000-000000000001',true);
  select public.mod_decide(current_setting('vitola.report1')::uuid,
    'upheld', 'Spam manifeste.', 'hide', 'Contenu repetitif sans rapport avec la fiche.') into v;
  if v->>'status' <> 'upheld' then
    raise exception 'FAIL: la decision a rendu %', v;
  end if;
  reset role;

  select hidden_by into v_by from public.comments
   where id = 'dd200000-0000-4000-8000-000000000003' and hidden_at is not null;
  if v_by is distinct from 'aa200000-0000-4000-8000-000000000001'::uuid then
    raise exception 'FAIL: le commentaire n est pas masque, ou pas signe par la moderatrice';
  end if;

  select count(*) into n from mod.moderation_actions
   where report_id = current_setting('vitola.report1')::uuid and verb = 'hide';
  if n <> 1 then raise exception 'FAIL: l acte n a pas laisse sa trace'; end if;

  -- La salle ne le voit plus…
  set local role anon;
  select count(*) into n from public.comments
   where id = 'dd200000-0000-4000-8000-000000000003';
  if n <> 0 then raise exception 'FAIL: un commentaire masque reste visible de la salle'; end if;
  reset role;

  -- …et son auteur, si : le DSA veut une décision contestable, et on ne
  -- conteste pas ce qu'on ne voit plus (0004, comments_select_own).
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','bb200000-0000-4000-8000-000000000002',true);
  select count(*) into n from public.comments
   where id = 'dd200000-0000-4000-8000-000000000003';
  if n <> 1 then raise exception 'FAIL: l auteur ne voit plus son commentaire masque — indecontestable'; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== M7  un dossier tranche ne se retranche pas'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa200000-0000-4000-8000-000000000001',true);
  begin
    perform public.mod_decide(current_setting('vitola.report1')::uuid,
      'dismissed', 'Revenons dessus.');
    raise exception 'FAIL: un dossier tranche a ete retranche';
  exception when others then
    if sqlerrm not like 'VITOLA_REPORT_ALREADY_DECIDED%' then raise; end if;
  end;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== M8  la contestation est un nouveau signalement, qui peut porter restore'
do $$
declare v jsonb; n integer;
begin
  select public.file_report('bb200000-0000-4000-8000-000000000002',
    'public','comments','dd200000-0000-4000-8000-000000000003','other',
    'Contestation moderation-test') into v;
  perform set_config('vitola.report2', v->>'id', false);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa200000-0000-4000-8000-000000000001',true);
  perform public.mod_decide(current_setting('vitola.report2')::uuid,
    'upheld', 'La contestation est fondee.', 'restore', null);
  reset role;

  select count(*) into n from public.comments
   where id = 'dd200000-0000-4000-8000-000000000003'
     and hidden_at is null and hidden_by is null and hidden_reason is null;
  if n <> 1 then raise exception 'FAIL: le retablissement n a pas remis les trois colonnes a null'; end if;
  raise notice 'PASS';
end $$;

\echo '=== M9  masquer ne sait viser que les quatre surfaces a colonnes hidden_*'
do $$
declare v jsonb;
begin
  select public.file_report('bb200000-0000-4000-8000-000000000002',
    'ref','cigars','cc200000-0000-4000-8000-00000000000f','inaccurate',
    'Cible non masquable moderation-test') into v;
  perform set_config('vitola.report3', v->>'id', false);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa200000-0000-4000-8000-000000000001',true);
  begin
    perform public.mod_decide(current_setting('vitola.report3')::uuid,
      'upheld', 'Retenu.', 'hide', 'Motif.');
    raise exception 'FAIL: hide est passe sur ref.cigars';
  exception when others then
    if sqlerrm not like 'VITOLA_TARGET_NOT_HIDEABLE%' then raise; end if;
  end;

  -- Sans verbe, la meme decision passe : la fiche releve du wiki, pas du masque.
  perform public.mod_decide(current_setting('vitola.report3')::uuid,
    'dismissed', 'Relecture de fiche, pas moderation — repart vers le wiki.');
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== M10  un membre ne tranche pas'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','bb200000-0000-4000-8000-000000000002',true);
  begin
    perform public.mod_decide(current_setting('vitola.report2')::uuid,
      'dismissed', 'Essai.');
    raise exception 'FAIL: un membre a tranche un signalement';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== M11  une decision sans motivation n est pas une decision'
do $$
declare v jsonb;
begin
  select public.file_report(null,
    'public','comments','dd200000-0000-4000-8000-000000000003','spam',
    'Sans note moderation-test') into v;
  perform set_config('vitola.report4', v->>'id', false);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa200000-0000-4000-8000-000000000001',true);
  begin
    perform public.mod_decide(current_setting('vitola.report4')::uuid, 'dismissed', '   ');
    raise exception 'FAIL: une decision sans note est passee';
  exception when others then
    if sqlerrm not like 'VITOLA_NOTE_REQUIRED%' then raise; end if;
  end;
  perform public.mod_decide(current_setting('vitola.report4')::uuid, 'dismissed', 'Doublon.');
  raise notice 'PASS';
  reset role;
end $$;

-- ---------- Nettoyage, en contexte privilégié --------------------------------
delete from mod.moderation_actions where entity_id = 'dd200000-0000-4000-8000-000000000003';
delete from mod.reports where id in (
  current_setting('vitola.report1')::uuid, current_setting('vitola.report2')::uuid,
  current_setting('vitola.report3')::uuid, current_setting('vitola.report4')::uuid);
delete from public.comments where id = 'dd200000-0000-4000-8000-000000000003';
delete from ref.cigars where slug = 'cigare-de-moderation-test';
delete from ref.brands where slug = 'marque-de-moderation-test';

\echo 'Moderation : 11 assertions, base laissee comme trouvee (les fixtures d auth restent).'
