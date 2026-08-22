-- =============================================================================
-- VITOLA — 03b-verification.sql, transposed for a REAL Supabase project.
-- -----------------------------------------------------------------------------
-- Differences from docs/phase-0/03b-verification.sql, and why:
--   * No Supabase stand-ins. auth.users, auth.uid(), storage.* and the
--     anon/authenticated/service_role roles already exist here; recreating them
--     would fail, and shadowing them would test the stand-in, not the project.
--   * No \i of the migration: it is already applied (ledger version 0001).
--   * No psql meta-commands (\echo, \set, \pset). The transport is the
--     Management API, which speaks SQL only. Verdicts are collected in a table
--     and returned as the last result set.
--   * Every assertion is wrapped so that an unexpected error is recorded rather
--     than aborting the run: one transaction carries all 25, and a bare raise
--     would roll back every verdict with it.
--   * Every role-switching assertion now ASSERTS that the switch took effect.
--     `SET LOCAL ROLE` outside a transaction is ignored with a warning, and the
--     assertion then runs as a superuser and passes for the wrong reason. That
--     is the defect repaired in commit 1548b91; here the guard is explicit
--     rather than relying on the caller opening a transaction.
--
-- MISE EN GARDE — duplication assumée, à résorber.
--   Ce fichier rejoue les mêmes 25 assertions que 03b-verification.sql, avec un
--   transport différent. Deux copies dérivent : celle-ci est la variante « base
--   distante », l'autre la variante « psql local ». La résolution prévue est la
--   transposition en pgTAP annoncée par docs/phase-0/README.md, qui doit
--   remplacer les DEUX, pas s'y ajouter.
--
-- Exécution (le jeton n'est jamais dans ce dépôt) :
--   curl -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
--        -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
--        -H 'Content-Type: application/json' \
--        --data "$(python3 -c 'import json,sys;print(json.dumps({"query":sys.stdin.read()}))' \
--                  < supabase/tests/03_remote_verification.sql)"
--
--   Les fixtures sont supprimées en fin de fichier : le projet est laissé tel
--   qu'il a été trouvé. Les slugs sont préfixés `zz-verif-` pour ne jamais
--   entrer en collision avec une vraie fiche du référentiel.
-- =============================================================================

drop table if exists _verif;
create temp table _verif (ord int, id text, verdict text);

-- ---------- Fixtures (privileged) ----------
-- Les noms sont préfixés autant que les slugs. `manufacturers_name_key` et
-- `vitolas_identity_key` portent sur le NOM déplié, pas sur le slug : une
-- fixture nommée « Empresa Cubana del Tabaco » ou « Lancero 192x38 parejo »
-- entre en collision avec le référentiel chargé. La CI contourne le problème
-- avec une base séparée ; ici il n'y en a qu'une, il faut donc que les fixtures
-- soient distinctes par nom.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111','member@x.test','{"birth_date":"1985-04-02"}'),
  ('22222222-2222-2222-2222-222222222222','editor@x.test','{"birth_date":"1979-11-20"}'),
  ('33333333-3333-3333-3333-333333333333','other@x.test' ,'{"birth_date":"1990-01-01"}');
update public.profiles set role='editor', handle='editrice' where id='22222222-2222-2222-2222-222222222222';
update public.profiles set handle='amateur' where id='11111111-1111-1111-1111-111111111111';
update public.profiles set handle='autre'   where id='33333333-3333-3333-3333-333333333333';

insert into ref.manufacturers (id,name,slug,country,group_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001','ZZ Verif Manufacture','zz-verif-manufacture','CU','Habanos S.A.');
insert into ref.brands (id,manufacturer_id,name,slug,country,is_cuban) values
  ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Cohíba Vérif','zz-verif-marque','CU',true);
insert into ref.lines (id,brand_id,name,slug) values
  ('cccccccc-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','Línea 1492','zz-verif-ligne');
insert into ref.vitolas (id,name_galera,name_salida,slug,length_mm,ring_gauge,shape) values
  ('dddddddd-0000-0000-0000-000000000001','ZZ Verif Galera','ZZ Verif Lancero','zz-verif-vitole',192,38,'parejo');
insert into ref.cigars (id,brand_id,line_id,vitola_id,commercial_name,slug,origin_country,wrapper_shade,strength,status)
 values ('eeeeeeee-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001',
         'cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001',
         'Siglo VI','zz-verif-publie','CU','colorado','moyen_corse','published');

-- The draft T8 and T9 act on. Authored by the member, so T8 exercises "an author
-- cannot publish their own entry" and T9 "an editor can". Without this row both
-- assertions match zero rows and report success without testing anything.
insert into ref.cigars (id,brand_id,vitola_id,commercial_name,slug,created_by,status)
 values ('eeeeeeee-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000001',
         'dddddddd-0000-0000-0000-000000000001','Brouillon Test','zz-verif-brouillon',
         '11111111-1111-1111-1111-111111111111','draft');

-- ---------- Assertions ----------
-- Execution order is that of the original file: later assertions rely on state
-- left by earlier ones (T9 publishes the draft that T6 and T7 then look for).

-- T1
do $t$ declare v text; n int; begin
  begin
    select count(*) into n from public.profiles p join public.profile_settings s using (id)
     where s.adult_confirmed_at is not null;
    v := case when n=3 then 'PASS' else 'FAIL: '||n||' profil(s) provisionne(s), attendu 3' end;
  exception when others then v := 'ERROR '||sqlstate||': '||sqlerrm; end;
  reset role; insert into _verif values (1,'T1  signup provisionne profiles + profile_settings + adult_confirmed_at',v);
end $t$;

-- T2
do $t$ declare v text; begin
  begin
    update public.profile_settings set birth_date = current_date - interval '17 years'
     where id='11111111-1111-1111-1111-111111111111';
    v := 'FAIL: date de naissance mineure acceptee';
  exception when check_violation then v := 'PASS';
            when others then v := 'ERROR '||sqlstate||': '||sqlerrm; end;
  reset role; insert into _verif values (2,'T2  une date de naissance mineure est refusee',v);
end $t$;

-- T3
do $t$ declare v text; begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
    if current_user <> 'authenticated' then
      v := 'FAIL: SET LOCAL ROLE ignore — l''assertion tournerait en privilegie';
    else
      begin
        update public.profiles set role='admin' where id='11111111-1111-1111-1111-111111111111';
        v := 'FAIL: escalade de role autorisee';
      exception when insufficient_privilege then v := 'PASS'; end;
    end if;
  exception when others then v := 'ERROR '||sqlstate||': '||sqlerrm; end;
  reset role; insert into _verif values (3,'T3  un membre ne peut pas s''attribuer un role',v);
end $t$;

-- T4
do $t$ declare v text; begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
    if current_user <> 'authenticated' then v := 'FAIL: SET LOCAL ROLE ignore';
    else
      begin
        update public.profiles set reputation = 9999 where id='11111111-1111-1111-1111-111111111111';
        v := 'FAIL: reputation inscriptible';
      exception when insufficient_privilege then v := 'PASS'; end;
    end if;
  exception when others then v := 'ERROR '||sqlstate||': '||sqlerrm; end;
  reset role; insert into _verif values (4,'T4  un membre ne peut pas gonfler sa reputation',v);
end $t$;

-- T8
do $t$ declare v text; begin
  begin
    if not exists (select 1 from ref.cigars where slug='zz-verif-brouillon' and status='draft') then
      v := 'FAIL: fixture absente — l''assertion serait vide';
    else
      set local role authenticated;
      perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
      if current_user <> 'authenticated' then v := 'FAIL: SET LOCAL ROLE ignore';
      else
        begin
          update ref.cigars set status='published' where slug='zz-verif-brouillon';
          if found then v := 'FAIL: auto-publication autorisee';
          else v := 'PASS (0 ligne retenue par la policy)'; end if;
        exception when insufficient_privilege then v := 'PASS (refuse)'; end;
      end if;
    end if;
  exception when others then v := 'ERROR '||sqlstate||': '||sqlerrm; end;
  reset role; insert into _verif values (5,'T8  un auteur ne peut pas publier son propre brouillon',v);
end $t$;

-- T9
do $t$ declare v text; n int; st text; vb text; begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',true);
    if current_user <> 'authenticated' then v := 'FAIL: SET LOCAL ROLE ignore';
    else
      update ref.cigars set status='published', verified_at=now(),
             verified_by='22222222-2222-2222-2222-222222222222' where slug='zz-verif-brouillon';
      select count(*), max(status::text), max(verified_by::text) into n, st, vb
        from ref.cigars where slug='zz-verif-brouillon';
      v := case
             when n=0 then 'FAIL: aucune ligne — fixture absente ou invisible a l''editrice'
             when st='published' and vb='22222222-2222-2222-2222-222222222222' then 'PASS'
             else 'FAIL: statut '||coalesce(st,'?') end;
    end if;
  exception when others then v := 'ERROR '||sqlstate||': '||sqlerrm; end;
  reset role; insert into _verif values (6,'T9  une editrice peut publier',v);
end $t$;

-- T10
do $t$ declare v text; begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
    if current_user <> 'authenticated' then v := 'FAIL: SET LOCAL ROLE ignore';
    else
      begin
        insert into ref.brands (name,slug) values ('Fausse Marque','zz-verif-fausse-marque');
        v := 'FAIL: un membre a ecrit une marque';
      exception when insufficient_privilege then v := 'PASS'; end;
    end if;
  exception when others then v := 'ERROR '||sqlstate||': '||sqlerrm; end;
  reset role; insert into _verif values (7,'T10 un membre n''ecrit pas directement dans ref.brands',v);
end $t$;

-- T11
do $t$ declare v text; ok boolean; begin
  begin
    select search_vector @@ to_tsquery('simple','cohiba') into ok
      from ref.cigars where slug='zz-verif-publie';
    v := case when ok then 'PASS' else 'FAIL: la marque n''est pas dans le vecteur' end;
  exception when others then v := 'ERROR '||sqlstate||': '||sqlerrm; end;
  reset role; insert into _verif values (8,'T11 search_vector contient la marque, accents replies',v);
end $t$;

-- T12
do $t$ declare v text; ok boolean; begin
  begin
    update ref.brands set name='Cohíba Atmosphere' where slug='zz-verif-marque';
    select search_vector @@ to_tsquery('simple','atmosphere') into ok
      from ref.cigars where slug='zz-verif-publie';
    v := case when ok then 'PASS' else 'FAIL: vecteur non rafraichi' end;
    update ref.brands set name='Cohíba Vérif' where slug='zz-verif-marque';
  exception when others then v := 'ERROR '||sqlstate||': '||sqlerrm; end;
  reset role; insert into _verif values (9,'T12 renommer une marque rafraichit les vecteurs dependants',v);
end $t$;

-- T13
do $t$ declare v text; begin
  begin
    insert into ref.cigars (brand_id,line_id,vitola_id,commercial_name,slug,status)
    values ('bbbbbbbb-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',
            'dddddddd-0000-0000-0000-000000000001','siglo vi','zz-verif-doublon','draft');
    v := 'FAIL: doublon accepte';
  exception when unique_violation then v := 'PASS';
            when others then v := 'ERROR '||sqlstate||': '||sqlerrm; end;
  reset role; insert into _verif values (10,'T13 un doublon est refuse (insensible casse/accents)',v);
end $t$;

-- T14
do $t$ declare v text; begin
  begin
    update ref.cigars set status='merged' where slug='zz-verif-publie';
    v := 'FAIL: merged sans cible';
  exception when check_violation then v := 'PASS';
            when others then v := 'ERROR '||sqlstate||': '||sqlerrm; end;
  reset role; insert into _verif values (11,'T14 status=merged exige une cible de fusion',v);
end $t$;

-- T15
do $t$ declare v text; begin
  begin
    insert into ref.cigar_images (cigar_id,path,kind,is_primary)
     values ('eeeeeeee-0000-0000-0000-000000000001','zz-verif-a.webp','band',true);
    begin
      insert into ref.cigar_images (cigar_id,path,kind,is_primary)
       values ('eeeeeeee-0000-0000-0000-000000000001','zz-verif-b.webp','full',true);
      v := 'FAIL: deux images principales';
    exception when unique_violation then v := 'PASS'; end;
  exception when others then v := 'ERROR '||sqlstate||': '||sqlerrm; end;
  reset role; insert into _verif values (12,'T15 une seule image principale par cigare',v);
end $t$;

-- T16
do $t$ declare v text; begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
    if current_user <> 'authenticated' then v := 'FAIL: SET LOCAL ROLE ignore';
    else
      insert into public.consents (user_id,kind,granted,version)
       values ('11111111-1111-1111-1111-111111111111','health_related_processing',true,'2026-08-01');
      begin
        update public.consents set granted=false;
        v := 'FAIL: consentement modifiable';
      exception when insufficient_privilege then v := 'PASS (insertion ok, modification refusee)'; end;
    end if;
  exception when others then v := 'ERROR '||sqlstate||': '||sqlerrm; end;
  reset role; insert into _verif values (13,'T16 le registre de consentement est append-only',v);
end $t$;

-- T17
do $t$ declare v text; n int; a text; b text; begin
  begin
    insert into public.audit_log (actor_id, action, entity_table, entity_id)
     values ('22222222-2222-2222-2222-222222222222','cigar.publish','ref.cigars','zz-verif-brouillon');
    set local role authenticated;
    perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
    if current_user <> 'authenticated' then v := 'FAIL: SET LOCAL ROLE ignore';
    else
      select count(*) into n from public.audit_log;
      a := case when n=0 then 'lecture refusee' else 'FAIL: '||n||' ligne(s) visibles' end;
      begin
        insert into public.audit_log (action) values ('forged');
        b := 'FAIL: audit_log inscriptible';
      exception when insufficient_privilege then b := 'insertion refusee'; end;
      v := case when a like 'FAIL%' or b like 'FAIL%' then 'FAIL: '||a||' / '||b
                else 'PASS ('||a||', '||b||')' end;
    end if;
  exception when others then v := 'ERROR '||sqlstate||': '||sqlerrm; end;
  reset role; insert into _verif values (14,'T17 audit_log illisible et non inscriptible par un non-admin',v);
end $t$;

-- T18
do $t$ declare v text; e boolean; begin
  begin
    select enabled into e from public.feature_flags where key='show_indicative_prices';
    v := case when e is null then 'FAIL: drapeau absent'
              when e=false then 'PASS' else 'FAIL: actif par defaut' end;
  exception when others then v := 'ERROR '||sqlstate||': '||sqlerrm; end;
  reset role; insert into _verif values (15,'T18 les prix indicatifs sont OFF par defaut (loi Evin)',v);
end $t$;

-- T19
do $t$ declare v text; begin
  begin
    insert into ref.brands (name,slug) values ('Bad','Not A Slug!');
    v := 'FAIL: slug invalide accepte';
  exception when check_violation then v := 'PASS';
            when others then v := 'ERROR '||sqlstate||': '||sqlerrm; end;
  reset role; insert into _verif values (16,'T19 le format de slug est contraint',v);
end $t$;

-- T5
do $t$ declare v text; n int; begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
    if current_user <> 'authenticated' then v := 'FAIL: SET LOCAL ROLE ignore';
    else
      select count(*) into n from public.profile_settings;
      v := case when n=1 then 'PASS (1 ligne : la sienne)' else 'FAIL: '||n||' ligne(s) visibles' end;
    end if;
  exception when others then v := 'ERROR '||sqlstate||': '||sqlerrm; end;
  reset role; insert into _verif values (17,'T5  la date de naissance d''autrui est invisible',v);
end $t$;

-- T6
do $t$ declare v text; n int; d int; begin
  begin
    -- Vacuity guard: count privileged FIRST. "anon sees 0 drafts" proves nothing
    -- when no draft exists at all — which is the case here, T9 having just
    -- published the only one. Reported as VACUOUS, neither PASS nor FAIL.
    select count(*) filter (where status='draft') into d from ref.cigars;
    perform set_config('request.jwt.claim.sub','',true);  -- claims leak across assertions: see header
    set local role anon;
    if current_user <> 'anon' then v := 'FAIL: SET LOCAL ROLE ignore';
    else
      select count(*) filter (where status='draft') into n from ref.cigars;
      v := case when d=0 then 'VACUOUS: aucun brouillon en base a cet instant — rien n''est teste'
                when n=0 then 'PASS ('||d||' brouillon(s) en base, 0 visible)'
                else 'FAIL: '||n||' brouillon(s) visibles' end;
    end if;
  exception when others then v := 'ERROR '||sqlstate||': '||sqlerrm; end;
  reset role; insert into _verif values (18,'T6  anon ne voit que le publie, jamais un brouillon',v);
end $t$;

-- T7
do $t$ declare v text; n int; d int; begin
  begin
    select count(*) filter (where status='draft') into d from ref.cigars;
    set local role authenticated;
    perform set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',true);
    if current_user <> 'authenticated' then v := 'FAIL: SET LOCAL ROLE ignore';
    else
      select count(*) filter (where status='draft') into n from ref.cigars;
      v := case when d=0 then 'VACUOUS: aucun brouillon en base a cet instant — rien n''est teste'
                when n=0 then 'PASS ('||d||' brouillon(s) en base, 0 visible par un tiers)'
                else 'FAIL: '||n||' visible(s)' end;
    end if;
  exception when others then v := 'ERROR '||sqlstate||': '||sqlerrm; end;
  reset role; insert into _verif values (19,'T7  un tiers ne voit pas le brouillon d''un autre',v);
end $t$;

-- T7b
do $t$ declare v text; n int; begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
    if current_user <> 'authenticated' then v := 'FAIL: SET LOCAL ROLE ignore';
    else
      insert into ref.cigars (brand_id,vitola_id,commercial_name,slug,created_by,status)
       values ('bbbbbbbb-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001',
               'Second Brouillon','zz-verif-brouillon-2','11111111-1111-1111-1111-111111111111','draft');
      select count(*) filter (where status='draft') into n from ref.cigars;
      v := case when n=1 then 'PASS (l''auteur voit son brouillon)' else 'FAIL: n='||n||', attendu 1' end;
    end if;
  exception when others then v := 'ERROR '||sqlstate||': '||sqlerrm; end;
  reset role; insert into _verif values (20,'T7b l''auteur voit bien son propre brouillon',v);
end $t$;

-- T7c
do $t$ declare v text; n int; d int; begin
  begin
    select count(*) filter (where status='draft') into d from ref.cigars;
    perform set_config('request.jwt.claim.sub','',true);  -- claims leak across assertions: see header
    set local role anon;
    if current_user <> 'anon' then v := 'FAIL: SET LOCAL ROLE ignore';
    else
      select count(*) filter (where status='draft') into n from ref.cigars;
      v := case when d=0 then 'VACUOUS: aucun brouillon en base a cet instant'
                when n=0 then 'PASS ('||d||' brouillon(s) en base, 0 visible)'
                else 'FAIL: '||n||' brouillon(s) visibles' end;
    end if;
  exception when others then v := 'ERROR '||sqlstate||': '||sqlerrm; end;
  reset role; insert into _verif values (21,'T7c anon reste aveugle a ce brouillon',v);
end $t$;

-- T21
do $t$ declare v text; begin
  begin
    perform set_config('request.jwt.claim.sub','',true);  -- claims leak across assertions: see header
    set local role anon;
    if current_user <> 'anon' then v := 'FAIL: SET LOCAL ROLE ignore';
    else
      begin
        perform 1 from public.profile_settings;
        v := 'FAIL: anon a lu profile_settings';
      exception when insufficient_privilege then v := 'PASS'; end;
    end if;
  exception when others then v := 'ERROR '||sqlstate||': '||sqlerrm; end;
  reset role; insert into _verif values (22,'T21 anon ne peut pas lire profile_settings (aucun grant)',v);
end $t$;

-- T22
do $t$ declare v text; n int; begin
  begin
    update public.profiles set is_discoverable=false where handle='autre';
    perform set_config('request.jwt.claim.sub','',true);  -- claims leak across assertions: see header
    set local role anon;
    if current_user <> 'anon' then v := 'FAIL: SET LOCAL ROLE ignore';
    else
      select count(*) into n from public.profiles;
      v := case when n=2 then 'PASS (2 sur 3 listes)' else 'FAIL: n='||n||', attendu 2' end;
    end if;
    reset role;
    update public.profiles set is_discoverable=true where handle='autre';
  exception when others then v := 'ERROR '||sqlstate||': '||sqlerrm; end;
  reset role; insert into _verif values (23,'T22 un profil non decouvrable disparait de l''annuaire',v);
end $t$;

-- T23
do $t$ declare v text; n int; begin
  begin
    insert into ref.cigar_images (cigar_id,path,kind,created_by)
     select id,'zz-verif-draft-band.webp','band','11111111-1111-1111-1111-111111111111'
       from ref.cigars where slug='zz-verif-brouillon-2';
    perform set_config('request.jwt.claim.sub','',true);  -- claims leak across assertions: see header
    set local role anon;
    if current_user <> 'anon' then v := 'FAIL: SET LOCAL ROLE ignore';
    else
      select count(*) into n from ref.cigar_images;
      v := case when n=1 then 'PASS (seule l''image du cigare publie)' else 'FAIL: n='||n||', attendu 1' end;
    end if;
  exception when others then v := 'ERROR '||sqlstate||': '||sqlerrm; end;
  reset role; insert into _verif values (24,'T23 les images suivent la visibilite de la fiche',v);
end $t$;

-- T20 — the query plan, asserted rather than printed.
do $t$ declare v text; rec record; plan text := ''; pub int; pub_ref int; begin
  begin
    select count(*) into pub from ref.cigars where status = 'published';
    -- Le référentiel réel, fixtures exclues : c'est LUI que le critère vise.
    select count(*) into pub_ref from ref.cigars
     where status = 'published' and slug not like 'zz-verif-%';
    for rec in execute
      'explain (costs off) '
      'select c.id from ref.cigars c join ref.vitolas v on v.id = c.vitola_id '
      ' where c.status = ''published'' and c.strength = ''moyen_corse'' '
      '   and v.ring_gauge between 30 and 45'
    loop plan := plan || rec."QUERY PLAN" || E'\n'; end loop;
    -- Le plan d'une requête qui ne peut retourner aucune ligne ne prouve rien.
    -- Tous les index de facettes sont partiels — `where status = 'published'` —
    -- et tant que rien n'est publié la branche externe est vide : le planificateur
    -- n'atteint jamais la table des vitoles. C'est la mesure qui commande l'ordre
    -- de P1, pas un défaut du schéma. Mesuré sur des lignes publiées synthétiques :
    -- 1 000 → 0,4 ms ; 10 000 → 2,9 ms ; 50 000 → 27,5 ms, index de facette engagé.
    if pub = 0 then
      v := 'VACUOUS: 0 fiche publiee — les index de facettes sont partiels, '
        || 'le plan est degenere et rien n''est mesure';
    else
      v := case
             when plan like '%cigars_facet_%'
               then 'PASS ('||pub||' fiche(s) publiee(s), index de facette partiel engage)'
             else 'FAIL: aucun index de facette partiel dans le plan ('||pub||' publiee(s))'
           end;
      -- `vitolas_dimensions_idx` n'est volontairement plus exigé : à 51 vitoles,
      -- un Seq Scan est le bon plan et le restera. L'exiger revenait à asserter
      -- une décision de planificateur qui dépend du volume, pas du schéma.
      v := v || case when plan like '%vitolas_dimensions_idx%'
                     then ' + index dimensions' else ' (vitolas en Seq Scan)' end;
      -- La forme du plan est prouvée par les fixtures. Le CRITÈRE de sortie, lui,
      -- porte sur le référentiel : tant que celui-ci est entièrement en brouillon,
      -- « recherche facettée sous 300 ms » n'a rien à mesurer. Voir PROVENANCE.md §5.
      if pub_ref = 0 then
        v := v || ' | ATTENTION : 0 fiche du référentiel publiée — '
               || 'le critère des 300 ms reste non mesurable sur des données réelles';
      else
        v := v || ' | '||pub_ref||' fiche(s) du référentiel publiée(s)';
      end if;
    end if;
    v := v || ' | plan: ' || replace(trim(plan), E'\n', ' ; ');
  exception when others then v := 'ERROR '||sqlstate||': '||sqlerrm; end;
  reset role; insert into _verif values (25,'T20 la recherche facettee passe par les index partiels',v);
end $t$;

-- Couverture RLS
do $t$ declare v text; o text; begin
  begin
    select string_agg(format('%I.%I', n.nspname, c.relname), ', ' order by n.nspname, c.relname)
      into o
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r' and n.nspname in ('public','ref')
       and (c.relrowsecurity = false or not exists (select 1 from pg_policy p where p.polrelid = c.oid));
    v := case when o is null then 'PASS (0 table non couverte)' else 'FAIL: '||o end;
  exception when others then v := 'ERROR '||sqlstate||': '||sqlerrm; end;
  reset role; insert into _verif values (26,'RLS couverture : toute table public/ref a RLS + une policy',v);
end $t$;

-- ---------- Cleanup: leave the project exactly as found ----------
reset role;
delete from ref.cigar_images where cigar_id in
  (select id from ref.cigars where slug like 'zz-verif-%');
delete from ref.cigars       where slug like 'zz-verif-%';
delete from ref.lines        where slug like 'zz-verif-%';
delete from ref.vitolas      where slug like 'zz-verif-%';
delete from ref.brands       where slug like 'zz-verif-%';
delete from ref.manufacturers where slug like 'zz-verif-%';
delete from public.audit_log where entity_id = 'zz-verif-brouillon';
delete from public.consents  where user_id in
  ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333');
delete from auth.users where id in
  ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333');

-- ---------- Verdicts ----------
select id, verdict from _verif order by ord;
