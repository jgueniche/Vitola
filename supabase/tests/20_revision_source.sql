-- =============================================================================
-- Assertions de comportement sur la source d'une proposition (migration 0026).
--
-- Exécuté en CI sur une base où 0001 à 0026 sont appliquées.
--
-- Ce fichier **n'accorde rien** et ne corrige rien : l'auto-contrôle d'une
-- migration ne peut pas attraper ce qu'elle vient d'établir, la régression
-- future ne se voit que d'ici.
--
-- Deux personnes : `sara` est promue editor, `omar` est membre. Quatre règles :
-- un membre dépose une proposition AVEC sa source et une sans ; la source se
-- relit par l'auteur et par le relecteur ; personne ne la réécrit (ni l'auteur
-- sur sa proposition en attente, ni le relecteur) ; et la contrainte refuse
-- une source vide ou trop longue.
--
-- Chaque assertion ouvre un `begin` EXPLICITE : `SET LOCAL ROLE` hors
-- transaction est ignoré avec un simple WARNING, et l'assertion tourne alors
-- en superutilisateur — verte pour rien. Le workflow relit le journal.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- ---------- Fixtures, créées comme postgres (contexte privilégié) ------------
delete from ref.cigar_revisions where cigar_id = 'cc260000-0000-4000-8000-000000000003';
delete from ref.cigars  where slug = 'cigare-source-test';
delete from ref.brands  where slug = 'marque-source-test';

insert into auth.users (id, email, raw_user_meta_data) values
  ('aa260000-0000-4000-8000-000000000001','source-sara@x.test','{"birth_date":"1982-02-02"}'),
  ('bb260000-0000-4000-8000-000000000002','source-omar@x.test','{"birth_date":"1989-09-09"}')
on conflict (id) do nothing;

update public.profiles set handle='source_sara', role='editor'
 where id='aa260000-0000-4000-8000-000000000001';
update public.profiles set handle='source_omar'
 where id='bb260000-0000-4000-8000-000000000002';

insert into ref.brands (id, name, slug)
values ('cc260000-0000-4000-8000-000000000002', 'Marque de la source', 'marque-source-test')
on conflict (id) do nothing;

insert into ref.cigars (id, brand_id, commercial_name, slug, status)
values ('cc260000-0000-4000-8000-000000000003', 'cc260000-0000-4000-8000-000000000002',
        'Cigare de la source', 'cigare-source-test', 'published');

\echo '=== S1  les fixtures existent (sans quoi rien ne se teste)'
do $$
begin
  if not exists (select 1 from ref.cigars where slug = 'cigare-source-test') then
    raise exception 'FAIL: la fiche de test manque';
  end if;
  if not exists (select 1 from public.profiles where handle = 'source_sara' and role = 'editor') then
    raise exception 'FAIL: le relecteur de test manque';
  end if;
  raise notice 'PASS';
end $$;

\echo '=== S2  un membre depose une proposition avec sa source, et la relit'
begin;
do $$
declare v_source text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','bb260000-0000-4000-8000-000000000002',true);
  insert into ref.cigar_revisions (id, cigar_id, author_id, diff, comment, source)
  values ('dd260000-0000-4000-8000-000000000004', 'cc260000-0000-4000-8000-000000000003',
          'bb260000-0000-4000-8000-000000000002',
          '{"strength": {"from": null, "to": "moyen"}}'::jsonb,
          'Test : la force telle que le fabricant la publie.',
          'https://www.example.test/fabricant/fiche-officielle');
  select source into v_source from ref.cigar_revisions
   where id = 'dd260000-0000-4000-8000-000000000004';
  if v_source <> 'https://www.example.test/fabricant/fiche-officielle' then
    raise exception 'FAIL: la source relue par son auteur vaut %', v_source;
  end if;
  raise notice 'PASS';
  reset role;
end $$;
commit;

\echo '=== S3  une proposition sans source reste possible (la bague dans la main)'
begin;
do $$
declare v_source text; n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','bb260000-0000-4000-8000-000000000002',true);
  insert into ref.cigar_revisions (id, cigar_id, author_id, diff, comment)
  values ('dd260000-0000-4000-8000-000000000005', 'cc260000-0000-4000-8000-000000000003',
          'bb260000-0000-4000-8000-000000000002',
          '{"release_year": {"from": null, "to": 2001}}'::jsonb,
          'Test : sans source.');
  select count(*), max(source) into n, v_source from ref.cigar_revisions
   where id = 'dd260000-0000-4000-8000-000000000005';
  if n <> 1 then raise exception 'FAIL: la proposition sans source n a pas ete inseree'; end if;
  if v_source is not null then raise exception 'FAIL: une source est apparue de nulle part : %', v_source; end if;
  raise notice 'PASS';
  reset role;
end $$;
commit;

\echo '=== S4  le relecteur lit la source de la proposition (il decide sur ce qu il lit)'
begin;
do $$
declare v_source text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa260000-0000-4000-8000-000000000001',true);
  select source into v_source from ref.cigar_revisions
   where id = 'dd260000-0000-4000-8000-000000000004';
  if v_source is null then
    raise exception 'FAIL: le relecteur ne lit pas la source — il ne peut pas verifier ce qu il ne voit pas';
  end if;
  raise notice 'PASS';
  reset role;
end $$;
commit;

\echo '=== S5  l auteur ne reecrit pas la source de sa proposition en attente (42501)'
begin;
do $$
begin
  -- La ligne existe : une assertion « refusé » doit d'abord prouver qu'il y avait
  -- quelque chose à refuser.
  if not exists (select 1 from ref.cigar_revisions
                  where id = 'dd260000-0000-4000-8000-000000000004' and status = 'pending') then
    raise exception 'FAIL: la proposition fixture a disparu';
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','bb260000-0000-4000-8000-000000000002',true);
  begin
    update ref.cigar_revisions set source = 'https://www.example.test/autre-page'
     where id = 'dd260000-0000-4000-8000-000000000004';
    raise exception 'FAIL: l auteur a reecrit la source de sa proposition';
  exception when insufficient_privilege then
    raise notice 'PASS';
  end;
  reset role;
end $$;
commit;

\echo '=== S6  le relecteur non plus : le grant de colonne ne la nomme pas (42501)'
begin;
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa260000-0000-4000-8000-000000000001',true);
  begin
    update ref.cigar_revisions set source = 'https://www.example.test/autre-page'
     where id = 'dd260000-0000-4000-8000-000000000004';
    raise exception 'FAIL: le relecteur a reecrit la source d une proposition';
  exception when insufficient_privilege then
    raise notice 'PASS';
  end;
  reset role;
end $$;
commit;

\echo '=== S7  le relecteur decide toujours (status, reviewed_*) sans toucher la source'
begin;
do $$
declare n integer; v_source text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa260000-0000-4000-8000-000000000001',true);
  update ref.cigar_revisions
     set status = 'approved', reviewed_by = 'aa260000-0000-4000-8000-000000000001',
         reviewed_at = now(), review_comment = 'Test : source lue, acceptée.'
   where id = 'dd260000-0000-4000-8000-000000000004';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: le relecteur n a decide % ligne(s)', n; end if;
  reset role;
  select source into v_source from ref.cigar_revisions
   where id = 'dd260000-0000-4000-8000-000000000004';
  if v_source <> 'https://www.example.test/fabricant/fiche-officielle' then
    raise exception 'FAIL: la decision a change la source : %', v_source;
  end if;
  raise notice 'PASS';
end $$;
commit;

\echo '=== S8  une source vide ou de 501 caracteres est refusee par la contrainte'
begin;
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','bb260000-0000-4000-8000-000000000002',true);
  begin
    insert into ref.cigar_revisions (cigar_id, author_id, diff, source)
    values ('cc260000-0000-4000-8000-000000000003', 'bb260000-0000-4000-8000-000000000002',
            '{"release_year": {"from": null, "to": 2002}}'::jsonb, '');
    raise exception 'FAIL: une source vide a ete acceptee (le formulaire envoie null, jamais "")';
  exception when check_violation then null;
  end;
  begin
    insert into ref.cigar_revisions (cigar_id, author_id, diff, source)
    values ('cc260000-0000-4000-8000-000000000003', 'bb260000-0000-4000-8000-000000000002',
            '{"release_year": {"from": null, "to": 2003}}'::jsonb, repeat('x', 501));
    raise exception 'FAIL: une source de 501 caracteres a ete acceptee';
  exception when check_violation then null;
  end;
  raise notice 'PASS';
  reset role;
end $$;
commit;

-- ---------- Nettoyage, en contexte privilégié --------------------------------
delete from ref.cigar_revisions where cigar_id = 'cc260000-0000-4000-8000-000000000003';
delete from ref.cigars  where slug = 'cigare-source-test';
delete from ref.brands  where slug = 'marque-source-test';

\echo 'Source d une proposition : 8 assertions, base laissee comme trouvee (les fixtures d auth restent).'
