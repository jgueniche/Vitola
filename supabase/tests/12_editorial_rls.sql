-- =============================================================================
-- Assertions de comportement sur le journal (migration 0017, ADR 0012).
--
-- Exécuté en CI sur une base où 0001 à 0017 sont appliquées.
--
-- Ce fichier **n'accorde rien** et ne corrige rien : la régression future ne se
-- voit que d'ici.
--
-- Deux personnes : `elsa` est promue editor et écrit, `marc` est membre et
-- prouve que le journal ne s'écrit pas depuis la salle.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- ---------- Fixtures, créées comme postgres (contexte privilégié) ------------
delete from public.article_links where article_id in
  (select id from public.articles where slug like '%-test');
delete from public.articles where slug like '%-test';

insert into auth.users (id, email, raw_user_meta_data) values
  ('dd100000-0000-4000-8000-000000000001','journal-elsa@x.test','{"birth_date":"1985-02-01"}'),
  ('ee100000-0000-4000-8000-000000000002','journal-marc@x.test','{"birth_date":"1986-03-02"}')
on conflict (id) do nothing;

update public.profiles set handle='journal_elsa', role='editor'
 where id='dd100000-0000-4000-8000-000000000001';
update public.profiles set handle='journal_marc'
 where id='ee100000-0000-4000-8000-000000000002';

-- Une fiche à pointer. Draft : le lien ne dépend pas du statut de la fiche.
insert into ref.brands (id, name, slug)
values ('ff200000-0000-4000-8000-00000000000e', 'Marque du journal', 'marque-du-journal-test')
on conflict (id) do nothing;
insert into ref.cigars (id, brand_id, commercial_name, slug, status)
values ('ff100000-0000-4000-8000-00000000000f', 'ff200000-0000-4000-8000-00000000000e',
        'Cigare du journal', 'cigare-du-journal-test', 'draft')
on conflict (id) do nothing;

\echo '=== E1  un membre n ecrit pas dans le journal'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','ee100000-0000-4000-8000-000000000002',true);
  begin
    insert into public.articles (slug, title, body_md, category, author_id)
    values ('article-de-marc-test','Essai','Un corps.','guide',
            'ee100000-0000-4000-8000-000000000002');
    raise exception 'FAIL: un membre a ecrit un article';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== E2  un editor ecrit ; le brouillon nait gated et draft, invisible d un anonyme'
do $$
declare v_id uuid; n integer; v_aud text; v_status text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','dd100000-0000-4000-8000-000000000001',true);

  insert into public.articles (slug, title, excerpt, body_md, category, author_id)
  values ('lire-une-bague-test','Lire une bague','Le chapo.',
          E'## Un titre\n\nUn paragraphe.', 'lexique',
          'dd100000-0000-4000-8000-000000000001')
  returning id into v_id;

  select audience::text, status::text into v_aud, v_status
    from public.articles where id = v_id;
  if v_aud <> 'gated' or v_status <> 'draft' then
    raise exception 'FAIL: un article nait % et % au lieu de gated et draft', v_aud, v_status;
  end if;

  reset role;
  set local role anon;
  select count(*) into n from public.articles where id = v_id;
  if n <> 0 then raise exception 'FAIL: un brouillon est lisible d un anonyme'; end if;

  reset role;
  perform set_config('vitola.article', v_id::text, false);
  raise notice 'PASS';
end $$;

\echo '=== E3  publie sans date : refuse ; publie date : lisible de tous'
do $$
declare v_id uuid := current_setting('vitola.article')::uuid; n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','dd100000-0000-4000-8000-000000000001',true);

  begin
    update public.articles set status = 'published' where id = v_id;
    raise exception 'FAIL: publie sans published_at est passe';
  exception when check_violation then null;
  end;

  update public.articles set status = 'published', published_at = now() where id = v_id;
  reset role;

  set local role anon;
  select count(*) into n from public.articles where id = v_id;
  if n <> 1 then raise exception 'FAIL: un article publie n est pas lisible d un anonyme'; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== E4  un membre ne modifie pas un article publie (zero ligne, pas d erreur)'
do $$
declare v_id uuid := current_setting('vitola.article')::uuid; n integer;
begin
  -- La ligne existe (leçon T8).
  select count(*) into n from public.articles where id = v_id;
  if n <> 1 then raise exception 'FAIL: la donnee de test n existe pas'; end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','ee100000-0000-4000-8000-000000000002',true);
  update public.articles set title = 'Vandalise' where id = v_id;
  reset role;

  select count(*) into n from public.articles where id = v_id and title = 'Vandalise';
  if n <> 0 then raise exception 'FAIL: un membre a modifie un article'; end if;
  raise notice 'PASS';
end $$;

\echo '=== E5  un lien sur un article gated passe, et un anonyme le lit si l article est publie'
do $$
declare v_id uuid := current_setting('vitola.article')::uuid; n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','dd100000-0000-4000-8000-000000000001',true);
  insert into public.article_links (article_id, cigar_id)
  values (v_id, 'ff100000-0000-4000-8000-00000000000f');
  reset role;

  set local role anon;
  select count(*) into n from public.article_links where article_id = v_id;
  if n <> 1 then raise exception 'FAIL: le lien d un article publie n est pas lisible'; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== E6  rendre public un article qui pointe une fiche : refuse (ADR 0012, D4)'
do $$
declare v_id uuid := current_setting('vitola.article')::uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','dd100000-0000-4000-8000-000000000001',true);
  begin
    update public.articles set audience = 'public' where id = v_id;
    raise exception 'FAIL: un article public pointe une fiche';
  exception when check_violation then null;
  end;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== E7  l autre sens : pas de lien nouveau sur un article public'
do $$
declare v_id uuid := current_setting('vitola.article')::uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','dd100000-0000-4000-8000-000000000001',true);

  delete from public.article_links where article_id = v_id;
  update public.articles set audience = 'public' where id = v_id;

  begin
    insert into public.article_links (article_id, cigar_id)
    values (v_id, 'ff100000-0000-4000-8000-00000000000f');
    raise exception 'FAIL: un lien s est pose sur un article public';
  exception when check_violation then null;
  end;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== E8  un editor retire un article ; ses liens partent avec lui'
do $$
declare v_id uuid := current_setting('vitola.article')::uuid; n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','dd100000-0000-4000-8000-000000000001',true);
  delete from public.articles where id = v_id;
  reset role;

  select count(*) into n from public.articles where id = v_id;
  if n <> 0 then raise exception 'FAIL: l editor n a pas pu retirer son article'; end if;
  select count(*) into n from public.article_links where article_id = v_id;
  if n <> 0 then raise exception 'FAIL: des liens orphelins survivent'; end if;
  raise notice 'PASS';
end $$;

-- ---------- Nettoyage, en contexte privilégié --------------------------------
delete from public.article_links where article_id in
  (select id from public.articles where slug like '%-test');
delete from public.articles where slug like '%-test';
delete from ref.cigars where slug = 'cigare-du-journal-test';
delete from ref.brands where slug = 'marque-du-journal-test';

\echo 'Journal : 8 assertions, base laissee comme trouvee (les fixtures d auth restent).'
