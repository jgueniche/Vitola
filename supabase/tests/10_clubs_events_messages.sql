-- =============================================================================
-- Assertions de comportement sur les clubs, les événements et la messagerie
-- (migration 0014, ADR 0010).
--
-- Exécuté en CI sur une base où 0001 à 0015 sont appliquées.
--
-- Ce fichier **n'accorde rien** et ne corrige rien : l'auto-contrôle d'une
-- migration vérifie ce que cette migration vient d'établir, donc il ne peut pas
-- échouer dessus. La régression future ne se voit que d'ici.
--
-- Trois personnes : `alice` crée, `bob` la suit et la rejoint, `carol` ne suit
-- personne — c'est elle qui prouve que D5 mord.
--
-- Les quatre dernières (I1 à I4) portent sur `conversation_inbox()` (0015), qui
-- n'a aucun prédicat d'audience : ce qu'elles vérifient est que la RLS reste la
-- seule chose qui décide, y compris à travers une fonction.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- ---------- Fixtures, créées comme postgres (contexte privilégié) ------------
-- Les UUID diffèrent sur leurs douze premiers caractères hexadécimaux :
-- `tg_handle_new_user()` en dérive le pseudo, et trois comptes qui partagent ce
-- préfixe se heurtent sur `profiles_handle_key` depuis l'intérieur d'un trigger.

insert into auth.users (id, email, raw_user_meta_data) values
  ('11000000-0000-4000-8000-000000000001','club-alice@x.test','{"birth_date":"1985-02-01"}'),
  ('22000000-0000-4000-8000-000000000002','club-bob@x.test'  ,'{"birth_date":"1986-03-02"}'),
  ('33000000-0000-4000-8000-000000000003','club-carol@x.test','{"birth_date":"1987-04-03"}')
on conflict (id) do nothing;

update public.profiles set handle='club_alice' where id='11000000-0000-4000-8000-000000000001';
update public.profiles set handle='club_bob'   where id='22000000-0000-4000-8000-000000000002';
update public.profiles set handle='club_carol' where id='33000000-0000-4000-8000-000000000003';

-- bob suit alice ; carol ne suit personne. C'est le lien de D5.
insert into public.follows (follower_id, followee_id) values
  ('22000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001')
on conflict do nothing;

\echo '=== L1  creer un club fait de son proprietaire un membre, et le compte suit'
do $$
declare v_club uuid; n integer; v_count integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);

  insert into public.clubs (owner_id, name, slug, description)
  values ('11000000-0000-4000-8000-000000000001','Les amateurs de maduro','maduro-test','Pour essayer')
  returning id into v_club;

  select count(*) into n from public.club_members
   where club_id = v_club and user_id = '11000000-0000-4000-8000-000000000001';
  if n <> 1 then raise exception 'FAIL: le proprietaire n est pas membre de son club'; end if;

  select member_count into v_count from public.clubs where id = v_club;
  if v_count <> 1 then raise exception 'FAIL: member_count vaut % au lieu de 1', v_count; end if;

  perform set_config('vitola.club', v_club::text, false);
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== L2  la colonne denormalisee se repare, elle ne derive pas'
do $$
declare v_club uuid := current_setting('vitola.club')::uuid; v_count integer;
begin
  -- On la casse en contexte privilégié : un trigger qui incrémente garderait le
  -- mensonge, un trigger qui recompte le répare au geste suivant.
  update public.clubs set member_count = 99 where id = v_club;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000002',true);
  insert into public.club_members (club_id, user_id)
  values (v_club, '22000000-0000-4000-8000-000000000002');

  select member_count into v_count from public.clubs where id = v_club;
  if v_count <> 2 then raise exception 'FAIL: member_count vaut % au lieu de 2 — il a derive', v_count; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== L3  aucun client n ecrit un compteur'
do $$
declare v_club uuid := current_setting('vitola.club')::uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
  begin
    update public.clubs set member_count = 999 where id = v_club;
    raise exception 'FAIL: member_count est modifiable par un client';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== L4  ADR 0010 D2 : le proprietaire retire un membre, et le membre part seul'
do $$
declare v_club uuid := current_setting('vitola.club')::uuid; n integer;
begin
  set local role authenticated;
  -- alice, pas bob : c'est `club_members_delete_owner`.
  perform set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
  delete from public.club_members
   where club_id = v_club and user_id = '22000000-0000-4000-8000-000000000002';

  select count(*) into n from public.club_members
   where club_id = v_club and user_id = '22000000-0000-4000-8000-000000000002';
  if n <> 0 then raise exception 'FAIL: le proprietaire n a pas pu retirer un membre'; end if;

  -- Et bob peut revenir, puis repartir de lui-même.
  perform set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000002',true);
  insert into public.club_members (club_id, user_id)
  values (v_club, '22000000-0000-4000-8000-000000000002');
  delete from public.club_members
   where club_id = v_club and user_id = '22000000-0000-4000-8000-000000000002';
  select count(*) into n from public.club_members where club_id = v_club;
  if n <> 1 then raise exception 'FAIL: % membre(s) au lieu de 1 apres le depart', n; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== E1  un evenement de club demande d en etre membre'
do $$
declare v_club uuid := current_setting('vitola.club')::uuid; v_event uuid;
begin
  set local role authenticated;
  -- carol n'est pas membre : l'EXISTS de la policy porte la RLS de club_members.
  perform set_config('request.jwt.claim.sub','33000000-0000-4000-8000-000000000003',true);
  begin
    insert into public.events (host_id, club_id, title, starts_at)
    values ('33000000-0000-4000-8000-000000000003', v_club, 'Soiree pirate', now() + interval '7 days');
    raise exception 'FAIL: un non-membre a annonce un evenement de club';
  exception when insufficient_privilege then null;
  end;

  -- alice l'est, et un événement sans club est ouvert à tous.
  perform set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
  insert into public.events (host_id, club_id, title, starts_at)
  values ('11000000-0000-4000-8000-000000000001', v_club, 'Degustation du club', now() + interval '7 days')
  returning id into v_event;
  perform set_config('vitola.event', v_event::text, false);

  perform set_config('request.jwt.claim.sub','33000000-0000-4000-8000-000000000003',true);
  insert into public.events (host_id, title, starts_at)
  values ('33000000-0000-4000-8000-000000000003', 'Rencontre ouverte', now() + interval '3 days');
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== E2  seuls les « je viens » comptent, et changer d avis recompte'
do $$
declare v_event uuid := current_setting('vitola.event')::uuid; n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000002',true);
  insert into public.event_attendees (event_id, user_id, status)
  values (v_event, '22000000-0000-4000-8000-000000000002', 'going');

  select attendee_count into n from public.events where id = v_event;
  if n <> 1 then raise exception 'FAIL: attendee_count vaut % au lieu de 1', n; end if;

  update public.event_attendees set status = 'maybe'
   where event_id = v_event and user_id = '22000000-0000-4000-8000-000000000002';

  select attendee_count into n from public.events where id = v_event;
  if n <> 0 then raise exception 'FAIL: « peut-etre » compte comme « je viens » (%)', n; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== M1  ADR 0010 D5 : on ecrit a qui l on suit, jamais a un inconnu'
do $$
declare v_conv uuid;
begin
  set local role authenticated;
  -- carol ne suit personne et personne ne la suit.
  perform set_config('request.jwt.claim.sub','33000000-0000-4000-8000-000000000003',true);
  begin
    v_conv := public.conversation_with('11000000-0000-4000-8000-000000000001');
    raise exception 'FAIL: une conversation s est ouverte sans lien d abonnement';
  exception when insufficient_privilege then null;
  end;

  -- bob suit alice : le lien existe, dans un sens, et cela suffit.
  perform set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000002',true);
  v_conv := public.conversation_with('11000000-0000-4000-8000-000000000001');
  if v_conv is null then raise exception 'FAIL: aucune conversation ouverte'; end if;
  perform set_config('vitola.conv', v_conv::text, false);
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== M2  la paire est canonique : la meme conversation dans les deux sens'
do $$
declare v_mine uuid := current_setting('vitola.conv')::uuid; v_theirs uuid; n integer;
begin
  set local role authenticated;
  -- alice appelle dans l'autre ordre : elle doit retrouver la MÊME ligne.
  perform set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
  v_theirs := public.conversation_with('22000000-0000-4000-8000-000000000002');

  if v_theirs <> v_mine then
    raise exception 'FAIL: deux conversations pour la meme paire (% et %)', v_mine, v_theirs;
  end if;
  reset role;

  select count(*) into n from public.conversations
   where (member_a = '11000000-0000-4000-8000-000000000001'
          and member_b = '22000000-0000-4000-8000-000000000002')
      or (member_a = '22000000-0000-4000-8000-000000000002'
          and member_b = '11000000-0000-4000-8000-000000000001');
  if n <> 1 then raise exception 'FAIL: % ligne(s) pour la paire au lieu de 1', n; end if;
  raise notice 'PASS';
end $$;

\echo '=== M3  un tiers ne lit ni la conversation ni ses messages'
do $$
declare v_conv uuid := current_setting('vitola.conv')::uuid; n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000002',true);
  insert into public.messages (conversation_id, sender_id, body)
  values (v_conv, '22000000-0000-4000-8000-000000000002', 'Bonsoir, un conseil ?');

  -- On prouve d'abord que le message existe, en contexte privilégié.
  reset role;
  select count(*) into n from public.messages where conversation_id = v_conv;
  if n <> 1 then raise exception 'FAIL: la fixture de message n existe pas'; end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','33000000-0000-4000-8000-000000000003',true);
  select count(*) into n from public.conversations where id = v_conv;
  if n <> 0 then raise exception 'FAIL: un tiers lit la conversation'; end if;
  select count(*) into n from public.messages where conversation_id = v_conv;
  if n <> 0 then raise exception 'FAIL: un tiers lit les messages'; end if;

  -- Et le destinataire, lui, les lit.
  perform set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
  select count(*) into n from public.messages where conversation_id = v_conv;
  if n <> 1 then raise exception 'FAIL: le destinataire ne lit pas le message'; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== M4  marquer comme lu est le geste du destinataire, pas de l expediteur'
do $$
declare v_conv uuid := current_setting('vitola.conv')::uuid; n integer;
begin
  set local role authenticated;
  -- L'expéditeur essaie : la policy le refuse, donc zéro ligne touchée. Un
  -- UPDATE qu'une policy refuse n'échoue pas, il ne trouve rien.
  perform set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000002',true);
  update public.messages set read_at = now() where conversation_id = v_conv;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: l expediteur a marque % message(s) comme lus', n; end if;

  perform set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
  update public.messages set read_at = now() where conversation_id = v_conv;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: le destinataire n a marque que % message(s)', n; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== M5  rien dans une conversation ne se modifie ni ne s efface'
do $$
declare v_conv uuid := current_setting('vitola.conv')::uuid;
begin
  -- La rétention est une question ouverte de l'ADR 0010 ; ouvrir un DELETE
  -- avant d'y répondre l'aurait tranchée par accident.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000002',true);
  begin
    delete from public.conversations where id = v_conv;
    raise exception 'FAIL: une conversation est supprimable par un client';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.conversations set last_message_at = now() where id = v_conv;
    raise exception 'FAIL: last_message_at est modifiable par un client';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== M6  supprimer un message le retire POUR LES DEUX'
do $$
declare v_conv uuid := current_setting('vitola.conv')::uuid; n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000002',true);
  delete from public.messages
   where conversation_id = v_conv and sender_id = '22000000-0000-4000-8000-000000000002';

  perform set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
  select count(*) into n from public.messages where conversation_id = v_conv;
  if n <> 0 then raise exception 'FAIL: le destinataire lit encore un message supprime'; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== M7  un blocage referme la messagerie, dans les deux sens'
do $$
declare v_conv uuid := current_setting('vitola.conv')::uuid; n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000002',true);
  insert into public.messages (conversation_id, sender_id, body)
  values (v_conv, '22000000-0000-4000-8000-000000000002', 'Un second message');

  perform set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
  insert into public.blocks (blocker_id, blocked_id)
  values ('11000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000002');

  -- alice a bloqué : elle ne lit plus les messages de bob…
  select count(*) into n from public.messages where conversation_id = v_conv;
  if n <> 0 then raise exception 'FAIL: le bloquant lit encore les messages'; end if;

  -- …et bob, qui ne sait rien du blocage, ne voit plus la conversation.
  perform set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000002',true);
  select count(*) into n from public.conversations where id = v_conv;
  if n <> 0 then raise exception 'FAIL: la personne bloquee voit encore la conversation'; end if;

  perform set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
  delete from public.blocks
   where blocker_id='11000000-0000-4000-8000-000000000001'
     and blocked_id='22000000-0000-4000-8000-000000000002';
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== M8  un moderateur lit un message signale — c est pour cela qu il n est pas chiffre'
do $$
declare v_conv uuid := current_setting('vitola.conv')::uuid; n integer;
begin
  -- La contrepartie de la décision de l'ADR 0010 : la plateforme peut lire, donc
  -- elle DOIT pouvoir lire, sinon le mécanisme de l'art. 16 du DSA est creux.
  update public.profiles set role = 'moderator'
   where id = '33000000-0000-4000-8000-000000000003';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','33000000-0000-4000-8000-000000000003',true);
  select count(*) into n from public.messages where conversation_id = v_conv;
  if n <> 1 then raise exception 'FAIL: un moderateur ne lit pas un message (% lignes)', n; end if;
  reset role;

  update public.profiles set role = 'member'
   where id = '33000000-0000-4000-8000-000000000003';
  raise notice 'PASS';
end $$;

\echo '=== M9  public.messages est une cible de signalement'
do $$
begin
  -- Sans cela, le bouton « Signaler » d'un message serait refusé par un CHECK
  -- au moment où quelqu'un en a besoin.
  begin
    insert into mod.reports (reporter_id, entity_schema, entity_table, entity_id, reason)
    values ('11000000-0000-4000-8000-000000000001','public','messages',
            gen_random_uuid()::text,'harassment');
  exception when check_violation then
    raise exception 'FAIL: mod.reports refuse public.messages';
  end;
  delete from mod.reports where entity_table = 'messages';
  raise notice 'PASS';
end $$;

\echo '=== I1  la boite de reception repond en un appel, avec le compte non lu'
do $$
declare
  v_conv uuid := current_setting('vitola.conv')::uuid;
  r record;
  n integer;
begin
  -- État à ce point : un message de bob, non lu, dans la conversation.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);

  select count(*) into n from public.conversation_inbox();
  if n <> 1 then raise exception 'FAIL: la boite rend % conversation(s) au lieu de 1', n; end if;

  select * into r from public.conversation_inbox() where conversation_id = v_conv;
  if r.other_id <> '22000000-0000-4000-8000-000000000002' then
    raise exception 'FAIL: l autre de la paire est % au lieu de bob', r.other_id;
  end if;
  if r.other_handle <> 'club_bob' then
    raise exception 'FAIL: le pseudo de l autre est % au lieu de club_bob', r.other_handle;
  end if;
  if r.last_body <> 'Un second message' then
    raise exception 'FAIL: le dernier message est « % »', r.last_body;
  end if;
  if r.unread_count <> 1 then
    raise exception 'FAIL: le compte non lu vaut % au lieu de 1', r.unread_count;
  end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== I2  ses propres messages ne se comptent pas comme non lus'
do $$
declare v_conv uuid := current_setting('vitola.conv')::uuid; r record;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000002',true);

  select * into r from public.conversation_inbox() where conversation_id = v_conv;
  if r is null then raise exception 'FAIL: l expediteur ne voit pas sa propre conversation'; end if;
  if r.other_id <> '11000000-0000-4000-8000-000000000001' then
    raise exception 'FAIL: « l autre » ne depend pas de qui appelle';
  end if;
  if r.unread_count <> 0 then
    raise exception 'FAIL: ses propres messages comptent comme non lus (%)', r.unread_count;
  end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== I3  la fonction n a AUCUN predicat d audience : la RLS decide seule'
do $$
declare n integer;
begin
  -- Si cette assertion tombe, c'est que `conversations_select_own` a bougé — la
  -- fonction, elle, ne filtre rien. C'est exactement ce que la 0013 a écrit
  -- pour `post_card()`, et la raison pour laquelle elle reste INVOKER.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','33000000-0000-4000-8000-000000000003',true);
  select count(*) into n from public.conversation_inbox();
  if n <> 0 then raise exception 'FAIL: un tiers lit % conversation(s) dans la boite', n; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== I4  un blocage vide la boite de reception, comme il vide la conversation'
do $$
declare n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
  insert into public.blocks (blocker_id, blocked_id)
  values ('11000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000002');

  select count(*) into n from public.conversation_inbox();
  if n <> 0 then raise exception 'FAIL: la boite montre % conversation(s) malgre le blocage', n; end if;

  -- Et de l'autre côté, qui ne sait rien du blocage.
  perform set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000002',true);
  select count(*) into n from public.conversation_inbox();
  if n <> 0 then raise exception 'FAIL: la personne bloquee voit encore la conversation'; end if;

  perform set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
  delete from public.blocks
   where blocker_id='11000000-0000-4000-8000-000000000001'
     and blocked_id='22000000-0000-4000-8000-000000000002';
  raise notice 'PASS';
  reset role;
end $$;

-- ---------- Nettoyage : le fichier doit être rejouable -----------------------

delete from public.messages where sender_id in (
  '11000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000002');
delete from public.conversations where member_a in (
  '11000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000002')
   or member_b in ('11000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000002');
delete from public.events where host_id in (
  '11000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000002',
  '33000000-0000-4000-8000-000000000003');
delete from public.clubs where owner_id = '11000000-0000-4000-8000-000000000001';
delete from public.follows where follower_id = '22000000-0000-4000-8000-000000000002';
delete from public.blocks where blocker_id = '11000000-0000-4000-8000-000000000001';
delete from public.notifications where user_id in (
  '11000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000002',
  '33000000-0000-4000-8000-000000000003');

\echo '=== 10_clubs_events_messages : toutes les assertions ont passe'
