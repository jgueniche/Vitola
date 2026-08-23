-- =============================================================================
-- VITOLA — 0014 : clubs, événements, messagerie (§5.6, F7)
-- -----------------------------------------------------------------------------
-- Applique l'ADR 0010, acceptée le 23 août 2026 :
--   docs/adr/0010-clubs-evenements-messagerie.md
--
-- Les cinq décisions qu'elle a prises, et où elles vivent dans ce fichier :
--   D1  Un club est un groupe et un calendrier, jamais un second fil   → §2
--   D2  On rejoint librement ; le propriétaire retire                  → §6
--   D3  Un événement appartient facultativement à un club              → §2
--   D4  Une conversation a EXACTEMENT deux personnes, en colonnes      → §2
--   D5  On écrit à qui l'on suit, ou qui nous suit                     → §6
--
-- Et la décision qui n'était dans aucune option parce qu'elle ne se choisit pas :
-- **un message n'est pas chiffré de bout en bout, et la plateforme peut le
-- lire.** Le DSA veut qu'un contenu signalé soit examinable ; `public.messages`
-- entre donc dans la liste des cibles de `mod.reports` (§8), et la politique de
-- confidentialité le dit en toutes lettres.
--
-- Ordre de lecture :
--   §1  Enums
--   §2  Tables
--   §3  Index
--   §4  Triggers
--   §5  conversation_with() — la paire canonique, ouverte ou retrouvée
--   §6  Grants
--   §7  Row Level Security
--   §8  mod.reports — une cible de plus
--   §9  Auto-contrôle
--
-- Ce que ce fichier ne fait PAS, et pourquoi :
--   `posts.club_id` n'existe pas. Un club n'a pas de fil (ADR 0010, D1) : la
--   colonne qui décide d'une audience doit garder un seul sens, et
--   `posts.visibility` en aurait eu deux selon qu'une autre colonne est nulle.
--   `events.venue_id` non plus — P5 apporte les lieux, et une colonne que rien
--   ne remplit et qu'aucune policy ne lit est ce que l'ADR 0007 a déjà refusé.
-- =============================================================================

begin;

-- =============================================================================
-- §1 · ENUMS
-- =============================================================================

-- Le §5.7 donne déjà ce vocabulaire aux lieux ; un événement le reprend pour
-- dire de quoi il s'agit, sans dire où — le où arrive en P5.
create type public.event_kind as enum (
  'degustation',  -- une dégustation, la raison d'être la plus fréquente
  'rencontre',    -- on se retrouve, sans programme
  'visite',       -- une manufacture, une cave, un salon
  'autre'
);

create type public.attendee_status as enum ('going', 'maybe', 'declined');

-- =============================================================================
-- §2 · TABLES
-- =============================================================================

-- --- public.clubs ------------------------------------------------------------
-- ADR 0010, D1. Un nom, une description, un propriétaire — et rien qui
-- ressemble à un fil. Ce qu'un club porte, ce sont ses membres et ses
-- événements, et les deux sont des tables à part.
create table public.clubs (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  slug        text not null,
  description text,

  -- Dénormalisé, recalculé par un count() et jamais par un delta : la règle de
  -- `humidor_items.qty` et de `posts.ember_count`, pour la troisième fois.
  member_count integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint clubs_name_len check (length(btrim(name)) between 2 and 80),
  constraint clubs_desc_len check (description is null or length(description) <= 2000),
  constraint clubs_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint clubs_member_count_nonneg check (member_count >= 0)
);

comment on table public.clubs is
  'A group and a calendar, never a second feed (ADR 0010, D1). Open to join, '
  'membership public, owner may remove a member — the same shape as follows.';

create unique index clubs_slug_key on public.clubs (slug);
create index clubs_owner_idx on public.clubs (owner_id);

create trigger clubs_set_updated_at
  before update on public.clubs
  for each row execute function public.tg_set_updated_at();

-- --- public.club_members -----------------------------------------------------
create table public.club_members (
  club_id   uuid not null references public.clubs(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),

  primary key (club_id, user_id)
);

comment on table public.club_members is
  'Free to join (ADR 0010, D2). Two DELETE policies, as for follows: one leaves, '
  'and the owner removes — the counterweight that stays exercisable.';

-- --- public.events -----------------------------------------------------------
-- ADR 0010, D3 : `club_id` est nullable. Un club sans événement est une liste,
-- un événement sans club est une invitation, et les deux existent.
create table public.events (
  id       uuid primary key default gen_random_uuid(),
  host_id  uuid not null references auth.users(id) on delete cascade,
  club_id  uuid references public.clubs(id) on delete cascade,

  kind  public.event_kind not null default 'degustation',
  title text not null,
  description text,

  -- Le lieu, en attendant P5. Une chaîne, parce que c'est ce que les gens
  -- taperaient de toute façon et que cela se migrera en une requête.
  location_text text,

  starts_at timestamptz not null,
  ends_at   timestamptz,
  capacity  integer,

  attendee_count integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint events_title_len check (length(btrim(title)) between 2 and 120),
  constraint events_desc_len check (description is null or length(description) <= 4000),
  constraint events_location_len check (location_text is null or length(location_text) <= 200),
  constraint events_capacity check (capacity is null or capacity between 1 and 10000),
  constraint events_ends_after_start check (ends_at is null or ends_at > starts_at),
  constraint events_attendee_count_nonneg check (attendee_count >= 0)
);

comment on table public.events is
  'An event belongs to a club or to nobody (ADR 0010, D3). No venue_id: P5 '
  'brings venues, and a column nothing fills and no policy reads is what ADR '
  '0007 already refused for posts.';

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.tg_set_updated_at();

-- --- public.event_attendees --------------------------------------------------
create table public.event_attendees (
  event_id  uuid not null references public.events(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  status    public.attendee_status not null default 'going',
  answered_at timestamptz not null default now(),

  primary key (event_id, user_id)
);

-- --- public.conversations ----------------------------------------------------
-- ADR 0010, D4 : exactement deux personnes, en colonnes ordonnées.
--
-- `member_a < member_b` fait de la paire une clé canonique : « la conversation
-- entre X et Y » est une lecture et non une recherche, et il ne peut pas y en
-- avoir deux. Une table de jonction aurait rendu impossible d'exprimer
-- « exactement deux » — aucune contrainte ne compte des lignes — et chacune des
-- questions qui en découlent (qui ajoute, que voit un arrivant, que devient une
-- conversation à une personne) est une décision sur de la donnée que le §2
-- range possiblement à l'art. 9.
create table public.conversations (
  id        uuid primary key default gen_random_uuid(),
  member_a  uuid not null references auth.users(id) on delete cascade,
  member_b  uuid not null references auth.users(id) on delete cascade,

  created_at    timestamptz not null default now(),
  last_message_at timestamptz,

  constraint conversations_ordered check (member_a < member_b)
);

comment on table public.conversations is
  'Exactly two people, ordered so the pair is canonical (ADR 0010, D4). No '
  'junction table: no constraint can express "exactly two" over rows, and every '
  'question that follows from N participants is a decision about art. 9 data.';

create unique index conversations_pair_key on public.conversations (member_a, member_b);

-- --- public.messages ---------------------------------------------------------
-- Non chiffrés de bout en bout, et examinables sur signalement. C'est écrit
-- dans l'ADR, dans la politique de confidentialité, et ici.
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references auth.users(id) on delete cascade,
  body            text not null,

  read_at    timestamptz,
  created_at timestamptz not null default now(),

  constraint messages_body_len check (length(btrim(body)) between 1 and 4000)
);

comment on table public.messages is
  'Not end-to-end encrypted: the DSA requires a reported message to be '
  'examinable, and a messaging feature that implies a confidentiality it does '
  'not offer is worse than a frank one. Deleting removes it for both.';

-- =============================================================================
-- §3 · INDEX
-- =============================================================================

create index club_members_user_idx on public.club_members (user_id, joined_at desc);

-- L'agenda. PAS de prédicat partiel sur `starts_at >= current_date` : un index
-- partiel doit être immuable, et `current_date` ne l'est pas. Même piège que le
-- `CHECK` des 18 ans (supabase/CLAUDE.md), rencontré ici par l'autre bout.
create index events_calendar_idx on public.events (starts_at);
create index events_club_idx on public.events (club_id, starts_at) where club_id is not null;
create index events_host_idx on public.events (host_id, starts_at desc);

create index event_attendees_user_idx on public.event_attendees (user_id, answered_at desc);

create index conversations_member_a_idx on public.conversations (member_a, last_message_at desc);
create index conversations_member_b_idx on public.conversations (member_b, last_message_at desc);

-- Keyset sur la conversation, exactement comme le fil : l'ordre est total, donc
-- l'index porte les deux colonnes dans le sens du parcours.
create index messages_keyset_idx on public.messages (conversation_id, created_at desc, id desc);
create index messages_unread_idx on public.messages (conversation_id, sender_id)
  where read_at is null;

-- =============================================================================
-- §4 · TRIGGERS
-- =============================================================================

-- Les compteurs, recalculés par un count(). Troisième occurrence de la règle, et
-- elle n'a pas changé : un trigger qui incrémente se trompe une fois et ment
-- ensuite pour toujours.
--
-- SECURITY DEFINER : rejoindre un club met à jour une ligne de `clubs` dont on
-- n'est pas le propriétaire, et répondre à un événement met à jour une ligne
-- d'`events` dont on n'est pas l'hôte.
create or replace function public.tg_group_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'club_members' then
    declare target uuid := coalesce(new.club_id, old.club_id);
    begin
      update public.clubs c
         set member_count = (select count(*) from public.club_members m where m.club_id = target)
       where c.id = target;
    end;
  else
    declare target uuid := coalesce(new.event_id, old.event_id);
    begin
      update public.events e
         set attendee_count = (select count(*) from public.event_attendees a
                                where a.event_id = target and a.status = 'going')
       where e.id = target;
    end;
  end if;
  return null;
end;
$$;

revoke execute on function public.tg_group_counts() from public, anon, authenticated;

create trigger club_members_count
  after insert or delete on public.club_members
  for each row execute function public.tg_group_counts();

create trigger event_attendees_count
  after insert or delete on public.event_attendees
  for each row execute function public.tg_group_counts();

-- Changer d'avis change le compte : « peut-être » n'est pas « je viens ».
create trigger event_attendees_count_status
  after update of status on public.event_attendees
  for each row execute function public.tg_group_counts();

-- Le propriétaire d'un club en est membre, toujours. Sans cela, un club créé
-- s'affiche avec zéro membre et son auteur doit le rejoindre, ce qui est un
-- geste que personne ne comprend.
create or replace function public.tg_club_owner_joins()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.club_members (club_id, user_id)
  values (new.id, new.owner_id)
  on conflict do nothing;
  return null;
end;
$$;

revoke execute on function public.tg_club_owner_joins() from public, anon, authenticated;

create trigger clubs_owner_joins
  after insert on public.clubs
  for each row execute function public.tg_club_owner_joins();

-- `last_message_at` sert le tri de la liste des conversations. Elle est tenue
-- ici et hors de tout grant, comme les compteurs : une colonne dénormalisée
-- qu'un client écrit est une colonne qui ment dès qu'il se trompe.
--
-- SECURITY DEFINER parce que l'expéditeur n'a aucun droit d'UPDATE sur
-- `conversations` — et il n'en aura pas : rien dans une conversation ne se
-- modifie, seuls des messages s'y ajoutent.
create or replace function public.tg_conversation_touched()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations c
     set last_message_at = new.created_at
   where c.id = new.conversation_id
     and (c.last_message_at is null or c.last_message_at < new.created_at);
  return null;
end;
$$;

revoke execute on function public.tg_conversation_touched() from public, anon, authenticated;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.tg_conversation_touched();

-- =============================================================================
-- §5 · conversation_with() — LA PAIRE CANONIQUE
-- -----------------------------------------------------------------------------
-- Ouvrir une conversation demande de savoir si elle existe déjà, et l'ordre des
-- deux identifiants n'est pas celui de l'appelant. Faire calculer `least`/
-- `greatest` par le client serait lui faire connaître la convention de la
-- table ; l'oublier une fois créerait un doublon que l'index unique refuserait
-- avec une erreur illisible.
--
-- **SECURITY INVOKER**, comme `smoke_from_humidor()` et pour la même raison : un
-- appel PostgREST est une transaction, pas un privilège. La policy INSERT de
-- `conversations` — qui exige le lien d'abonnement de l'ADR 0010 D5 — s'applique
-- donc pleinement, et cette fonction ne peut rien ouvrir que l'appelant
-- n'aurait pu ouvrir à la main.
-- =============================================================================

create or replace function public.conversation_with(other uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  me    uuid := (select auth.uid());
  lo    uuid;
  hi    uuid;
  found uuid;
begin
  if me is null or other is null or me = other then
    raise exception 'VITOLA_BAD_PAIR: a conversation needs two distinct people'
      using errcode = '22023';
  end if;

  lo := least(me, other);
  hi := greatest(me, other);

  select c.id into found
    from public.conversations c
   where c.member_a = lo and c.member_b = hi;

  if found is not null then return found; end if;

  insert into public.conversations (member_a, member_b)
  values (lo, hi)
  returning id into found;

  return found;
end;
$$;

comment on function public.conversation_with(uuid) is
  'The conversation between the caller and `other`, opened if needed. SECURITY '
  'INVOKER: the INSERT policy still decides, so this cannot open a conversation '
  'the caller could not have opened by hand.';

revoke execute on function public.conversation_with(uuid) from public;
grant execute on function public.conversation_with(uuid) to authenticated;

-- =============================================================================
-- §6 · GRANTS
-- =============================================================================

revoke all on public.clubs from anon, authenticated;
grant select on public.clubs to anon, authenticated;
grant insert (owner_id, name, slug, description) on public.clubs to authenticated;
grant update (name, description) on public.clubs to authenticated;
grant delete on public.clubs to authenticated;
-- `member_count` et `updated_at` sont tenues par un trigger : hors de tout grant.
-- `slug` non plus en UPDATE — une adresse qui change casse les liens partagés.

revoke all on public.club_members from anon, authenticated;
grant select on public.club_members to anon, authenticated;
grant insert, delete on public.club_members to authenticated;

revoke all on public.events from anon, authenticated;
grant select on public.events to anon, authenticated;
grant insert (host_id, club_id, kind, title, description, location_text, starts_at, ends_at, capacity)
  on public.events to authenticated;
grant update (kind, title, description, location_text, starts_at, ends_at, capacity)
  on public.events to authenticated;
grant delete on public.events to authenticated;

revoke all on public.event_attendees from anon, authenticated;
grant select on public.event_attendees to anon, authenticated;
grant insert (event_id, user_id, status) on public.event_attendees to authenticated;
grant update (status) on public.event_attendees to authenticated;
grant delete on public.event_attendees to authenticated;

revoke all on public.conversations from anon, authenticated;
grant select on public.conversations to authenticated;
grant insert (member_a, member_b) on public.conversations to authenticated;
-- Aucun UPDATE : rien dans une conversation ne se modifie. Aucun DELETE non
-- plus — la question de la rétention est ouverte dans l'ADR 0010, et ouvrir un
-- DELETE avant d'y répondre serait décider par accident.

revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant insert (conversation_id, sender_id, body) on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;
grant delete on public.messages to authenticated;

-- =============================================================================
-- §7 · ROW LEVEL SECURITY
-- =============================================================================

-- --- public.clubs ------------------------------------------------------------
alter table public.clubs enable row level security;
alter table public.clubs force row level security;

create policy clubs_select_all on public.clubs
  for select to anon, authenticated
  using (true);

create policy clubs_insert_own on public.clubs
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy clubs_update_owner on public.clubs
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy clubs_delete_owner on public.clubs
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- --- public.club_members -----------------------------------------------------
alter table public.club_members enable row level security;
alter table public.club_members force row level security;

create policy club_members_select_all on public.club_members
  for select to anon, authenticated
  using (true);

-- Libre (ADR 0010, D2), et pas chez quelqu'un qu'on a bloqué : le propriétaire
-- d'un club en est membre, donc rejoindre son club, c'est entrer dans sa liste.
create policy club_members_insert_own on public.club_members
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.clubs c
       where c.id = club_id and not public.blocks_between(c.owner_id)
    )
  );

create policy club_members_delete_own on public.club_members
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Le contrepoids, comme `follows_delete_followee` : le propriétaire retire.
create policy club_members_delete_owner on public.club_members
  for delete to authenticated
  using (exists (select 1 from public.clubs c
                  where c.id = club_id and c.owner_id = (select auth.uid())));

-- --- public.events -----------------------------------------------------------
alter table public.events enable row level security;
alter table public.events force row level security;

create policy events_select_all on public.events
  for select to anon, authenticated
  using (true);

-- Un événement de club est annoncé par un membre du club, jamais par un
-- passant. L'EXISTS porte la RLS de `club_members`, donc « membre » se déduit.
create policy events_insert_own on public.events
  for insert to authenticated
  with check (
    host_id = (select auth.uid())
    and (club_id is null
         or exists (select 1 from public.club_members m
                     where m.club_id = club_id and m.user_id = (select auth.uid())))
  );

create policy events_update_host on public.events
  for update to authenticated
  using (host_id = (select auth.uid()))
  with check (host_id = (select auth.uid()));

create policy events_delete_host on public.events
  for delete to authenticated
  using (host_id = (select auth.uid()));

-- --- public.event_attendees --------------------------------------------------
alter table public.event_attendees enable row level security;
alter table public.event_attendees force row level security;

create policy event_attendees_select_all on public.event_attendees
  for select to anon, authenticated
  using (true);

create policy event_attendees_insert_own on public.event_attendees
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.events e
                 where e.id = event_id and not public.blocks_between(e.host_id))
  );

create policy event_attendees_update_own on public.event_attendees
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy event_attendees_delete_own on public.event_attendees
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- --- public.conversations ----------------------------------------------------
alter table public.conversations enable row level security;
alter table public.conversations force row level security;

create policy conversations_select_own on public.conversations
  for select to authenticated
  using (member_a = (select auth.uid()) or member_b = (select auth.uid()));

-- ADR 0010, D5. On écrit à quelqu'un qu'on suit ou qui nous suit, et jamais à
-- quelqu'un avec qui un blocage existe. Le graphe d'abonnement est le signal de
-- consentement : il existe déjà, il se défait, et il laisse une trace.
create policy conversations_insert_linked on public.conversations
  for insert to authenticated
  with check (
    (member_a = (select auth.uid()) or member_b = (select auth.uid()))
    and not public.blocks_between(
      case when member_a = (select auth.uid()) then member_b else member_a end)
    and exists (
      select 1 from public.follows f
       where (f.follower_id = member_a and f.followee_id = member_b)
          or (f.follower_id = member_b and f.followee_id = member_a)
    )
  );

-- --- public.messages ---------------------------------------------------------
alter table public.messages enable row level security;
alter table public.messages force row level security;

-- L'EXISTS porte la RLS de `conversations` : « la conversation est la mienne »
-- se déduit et ne se redit pas. Même mécanisme que `review_thirds` sur
-- `reviews`, et que les tables filles de la cave.
create policy messages_select_own on public.messages
  for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id));

create policy messages_insert_own on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (select 1 from public.conversations c where c.id = conversation_id)
  );

-- Marquer comme lu est le geste du DESTINATAIRE, donc de celui qui n'a pas
-- écrit. Le grant borne la colonne, cette policy borne la ligne.
create policy messages_update_recipient on public.messages
  for update to authenticated
  using (
    sender_id <> (select auth.uid())
    and exists (select 1 from public.conversations c where c.id = conversation_id)
  )
  with check (sender_id <> (select auth.uid()));

-- Supprimer un message le retire pour les deux (ADR 0010). Une suppression « de
-- son côté » serait un bouton qui ment.
create policy messages_delete_own on public.messages
  for delete to authenticated
  using (sender_id = (select auth.uid()));

create policy messages_select_moderator on public.messages
  for select to authenticated
  using ((select public.has_min_role('moderator')));

-- --- LE BLOCAGE, EN RESTRICTIF ------------------------------------------------
-- Deux de plus, sur les deux tables qui portent du texte écrit par une personne.
-- `clubs`, `events` et les deux tables d'appartenance n'en reçoivent pas : leur
-- contenu est un nom et une date, et les masquer casserait un compteur public
-- sans rien protéger. Le blocage y agit à l'écriture — on ne rejoint pas le club
-- de quelqu'un qu'on a bloqué, on ne s'inscrit pas à son événement.
create policy messages_block_restrictive on public.messages
  as restrictive for select to authenticated
  using (
    sender_id = (select auth.uid())
    or not (sender_id = any ((select public.blocked_user_ids())::uuid[]))
  );

create policy conversations_block_restrictive on public.conversations
  as restrictive for select to authenticated
  using (
    not (member_a = any ((select public.blocked_user_ids())::uuid[]))
    and not (member_b = any ((select public.blocked_user_ids())::uuid[]))
  );

-- =============================================================================
-- §8 · mod.reports — UNE CIBLE DE PLUS
-- -----------------------------------------------------------------------------
-- Un message signalé doit pouvoir être examiné. C'est ce qui fait qu'une
-- messagerie n'est pas chiffrée de bout en bout ici, et le dire est la seule
-- position tenable — la politique de confidentialité le dit aussi.
-- =============================================================================

alter table mod.reports drop constraint reports_entity_known;
alter table mod.reports add constraint reports_entity_known check (
  entity_schema || '.' || entity_table in
    ('public.comments', 'public.reviews', 'ref.cigars', 'public.profiles',
     'public.posts', 'public.post_comments', 'public.messages')
);

-- =============================================================================
-- §9 · AUTO-CONTRÔLE
-- =============================================================================

do $$
declare
  offender text;
  n        integer;
begin
  -- 1. §0.5 du brief.
  select string_agg(format('%I.%I', ns.nspname, c.relname), ', ' order by 1)
    into offender
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
   where c.relkind = 'r'
     and ns.nspname in ('public', 'ref', 'mod')
     and (c.relrowsecurity = false
          or not exists (select 1 from pg_policy p where p.polrelid = c.oid));
  if offender is not null then
    raise exception 'VITOLA_RLS_GAP: table(s) sans RLS ou sans policy : %', offender;
  end if;

  -- 2. ADR 0010, D4. La paire est canonique, et deux choses la garantissent :
  --    l'ordre et l'unicité. Perdre l'une des deux permet deux conversations
  --    entre les mêmes personnes, ce que rien d'autre ne rattrape.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.conversations'::regclass
                    and conname = 'conversations_ordered')
  then
    raise exception 'VITOLA_SHAPE_GAP: conversations a perdu son ordre canonique';
  end if;
  if not exists (select 1 from pg_index i
                  where i.indrelid = 'public.conversations'::regclass
                    and i.indisunique
                    and i.indnatts = 2)
  then
    raise exception 'VITOLA_SHAPE_GAP: la paire de conversations n est plus unique';
  end if;

  -- 3. ADR 0010, D5. Sans le lien d'abonnement, n'importe qui écrit à
  --    n'importe qui — et rien ne casse, ce qui est le problème.
  -- `pg_get_expr` rend les noms tels que le `search_path` courant les rend, donc
  -- « follows » et non « public.follows ». Chercher la forme qualifiée échouait
  -- sur une policy parfaitement correcte — un auto-contrôle qui se trompe est
  -- plus cher qu'un auto-contrôle absent.
  if pg_get_expr(
       (select polwithcheck from pg_policy where polname = 'conversations_insert_linked'),
       'public.conversations'::regclass) !~ '\mfollows\M'
  then
    raise exception 'VITOLA_SCOPE_GAP: conversations_insert_linked ne lit plus follows (D5)';
  end if;

  -- 4. `conversation_with()` doit rester en droits d'appelant : en DEFINER,
  --    elle ouvrirait une conversation que la policy vient de refuser.
  if exists (select 1 from pg_proc
              where oid = 'public.conversation_with(uuid)'::regprocedure and prosecdef)
  then
    raise exception 'VITOLA_SCOPE_GAP: conversation_with() est passée en SECURITY DEFINER';
  end if;

  -- 5. Les compteurs et les colonnes tenues par un trigger, hors de tout grant.
  select string_agg(table_name || '.' || column_name, ', ' order by 1) into offender
    from information_schema.column_privileges
   where table_schema = 'public'
     and privilege_type in ('INSERT', 'UPDATE')
     and grantee in ('anon', 'authenticated')
     and ((table_name = 'clubs' and column_name in ('member_count', 'updated_at'))
       or (table_name = 'events' and column_name in ('attendee_count', 'updated_at'))
       or (table_name = 'conversations' and column_name = 'last_message_at'));
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: colonne(s) tenue(s) par un trigger et écrivable(s) : %', offender;
  end if;

  -- 6. Rien dans une conversation ne se modifie ni ne s'efface : la rétention
  --    est une question ouverte de l'ADR 0010, et un grant l'aurait tranchée.
  if exists (select 1 from information_schema.table_privileges
              where table_schema = 'public' and table_name = 'conversations'
                and privilege_type in ('UPDATE', 'DELETE')
                and grantee in ('anon', 'authenticated'))
  then
    raise exception 'VITOLA_GRANT_GAP: conversations est modifiable ou supprimable par un client';
  end if;

  -- 7. Aucune fonction nouvelle appelable au titre de PUBLIC.
  select string_agg(proname, ', ' order by proname) into offender
    from pg_proc
   where pronamespace = 'public'::regnamespace
     and array_to_string(coalesce(proacl, '{}')::text[], ' ') ~ '(^| )=X/';
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: EXECUTE accordé à PUBLIC sur : %', offender;
  end if;

  -- 8. Les policies de blocage restent restrictives, et il y en a deux de plus.
  select count(*) into n
    from pg_policy where polname like '%\_block\_restrictive' and polpermissive = false;
  if n <> 7 then
    raise exception 'VITOLA_SCOPE_GAP: % policies de blocage restrictives, 7 attendues', n;
  end if;

  raise notice
    '0014 : un club sans fil, un événement sans lieu, une conversation à deux et lisible sur signalement.';
end;
$$;

commit;
