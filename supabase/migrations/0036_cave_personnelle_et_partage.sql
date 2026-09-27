-- =============================================================================
-- VITOLA — 0036 : chaque cave à son propriétaire, et le partage par invitation
-- -----------------------------------------------------------------------------
-- L'ADR 0022 tranche, et ce fichier en est la lettre. Deux signalements du
-- 26 septembre 2026 — « la suppression d'une cave ne marche pas » et « sur le
-- compte d'un membre il y a la cave qu'un autre a créée » — sont le même défaut,
-- et il est dans la 0010 :
--
--   `humidors_select_shown` ouvrait la LIGNE `humidors` à tout membre connecté
--   dès que son propriétaire cochait « Montrer ma cave ». `lib/humidor/queries.ts`
--   ne filtre sur personne, par principe, donc la cave de A entrait dans la liste
--   « mes caves » de B — avec son bouton de suppression, qu'une policy refusait
--   en silence (204, zéro ligne).
--
-- Et il y avait pire, mesuré en local sur la chaîne complète : les tables filles
-- disent « ma cave » par `exists (select 1 from humidors …)`, donc par « toute
-- cave que je peux lire ». Les policies restrictives de la 0010 ne fermaient que
-- le SELECT. B pouvait écrire un relevé ou un lot dans la cave de A, et un
-- `delete` sans clause WHERE — qui ne lit aucune colonne, donc n'applique aucune
-- policy SELECT — vidait les lots et les relevés de toutes les caves montrées.
--
-- Ordre de lecture :
--   §1  La cave refermée              (une policy retirée, quatre verrous)
--   §2  Le partage : humidor_shares   (table, index)
--   §3  Grants
--   §4  Row Level Security du partage
--   §5  Les deux portes du destinataire (SECURITY DEFINER)
--   §6  La notification
--   §7  Auto-contrôle
-- =============================================================================

begin;

-- =============================================================================
-- §1 · LA CAVE REFERMÉE
-- -----------------------------------------------------------------------------
-- ADR 0022, D1. L'étagère du profil n'a jamais eu besoin de la policy retirée :
-- `shared_humidor_shelf()` est SECURITY DEFINER et revérifie elle-même la clé
-- `show_humidor` et le blocage. La policy n'ouvrait donc qu'une chose que rien ne
-- demandait — la ligne `humidors` d'autrui, à toutes les requêtes du dépôt qui
-- lisent « mes caves ».
--
-- Puis quatre verrous RESTRICTIFS et `FOR ALL`. Restrictif, parce qu'une policy
-- restrictive est AND-ée avec toutes les autres, présentes et futures : la
-- prochaine permissive ne pourra plus rouvrir une cave par la porte de côté.
-- `FOR ALL`, parce que la 0010 a prouvé qu'un verrou `FOR SELECT` ne ferme pas
-- l'écriture — et qu'un DELETE ou un INSERT qui ne lit aucune colonne n'évalue
-- aucune policy SELECT, restrictive comprise.
--
-- Chacun nomme `auth.uid()` au lieu d'hériter de la visibilité du parent. C'est
-- la leçon entière de ce fichier : « l'EXISTS est soumis à la RLS de `humidors`,
-- donc "ma cave" ne se redit pas ici » (0008 §8) était vrai le jour où c'était
-- écrit, et faux dès que `humidors` a appris à s'ouvrir.
-- =============================================================================

drop policy if exists humidors_select_shown on public.humidors;

create policy humidors_owner_only on public.humidors
  as restrictive for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Mêmes noms que ceux de la 0010, qu'ils remplacent : un verrou se cherche sous
-- son nom, et le changer ferait croire qu'il y en a deux.
drop policy if exists humidor_items_owner_only on public.humidor_items;
create policy humidor_items_owner_only on public.humidor_items
  as restrictive for all to authenticated
  using (exists (select 1 from public.humidors h
                  where h.id = humidor_id and h.user_id = (select auth.uid())))
  with check (exists (select 1 from public.humidors h
                       where h.id = humidor_id and h.user_id = (select auth.uid())));

drop policy if exists humidor_events_owner_only on public.humidor_events;
create policy humidor_events_owner_only on public.humidor_events
  as restrictive for all to authenticated
  using (exists (select 1 from public.humidor_items i
                   join public.humidors h on h.id = i.humidor_id
                  where i.id = item_id and h.user_id = (select auth.uid())))
  with check (exists (select 1 from public.humidor_items i
                        join public.humidors h on h.id = i.humidor_id
                       where i.id = item_id and h.user_id = (select auth.uid())));

drop policy if exists humidor_readings_owner_only on public.humidor_readings;
create policy humidor_readings_owner_only on public.humidor_readings
  as restrictive for all to authenticated
  using (exists (select 1 from public.humidors h
                  where h.id = humidor_id and h.user_id = (select auth.uid())))
  with check (exists (select 1 from public.humidors h
                       where h.id = humidor_id and h.user_id = (select auth.uid())));

comment on table public.humidors is
  'A member''s humidor. Owner-only by any route through RLS: humidors_owner_only is '
  'RESTRICTIVE and FOR ALL, so no permissive policy can open it (ADR 0022, D1). '
  'Third parties read through SECURITY DEFINER projections only: '
  'shared_humidor_shelf() (profile, show_humidor) and shared_humidor_lots() (a share).';

-- =============================================================================
-- §2 · LE PARTAGE : public.humidor_shares
-- -----------------------------------------------------------------------------
-- ADR 0022, D2. Une ligne dit « le propriétaire de cette cave l'a proposée à
-- cette personne », et deux colonnes disent ce qu'elle en a fait :
--
--   · `accepted_at` nul : une invitation. La cave n'apparaît nulle part chez le
--     destinataire, et aucune porte ne rend son contenu ;
--   · `hidden_at` : le choix d'affichage du destinataire, et le sien seul. Le
--     propriétaire ne le lit pas — voir §3.
--
-- Refuser une invitation ou quitter un partage, c'est supprimer la ligne ; le
-- propriétaire retire un partage de la même façon. Il n'y a pas d'état « refusé »
-- à retenir : une invitation refusée qui resterait en base serait une trace de
-- ce que quelqu'un a décliné, au service de rien.
--
-- `recipient_id` pointe `auth.users` et non `profiles`, comme `review_shares` :
-- c'est le lien que l'inventaire RGPD relit (tests/compliance).
create table public.humidor_shares (
  humidor_id   uuid not null references public.humidors(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,

  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  hidden_at    timestamptz,

  primary key (humidor_id, recipient_id),

  -- On ne masque que ce qu'on a accepté : une invitation se refuse, elle ne se
  -- range pas dans un tiroir où elle attendrait sans fin.
  constraint humidor_shares_hidden_once_accepted
    check (hidden_at is null or accepted_at is not null)
);

comment on table public.humidor_shares is
  'A humidor offered by its owner to one named member (ADR 0022). accepted_at null '
  'is an invitation and opens nothing; hidden_at is the recipient''s own display '
  'choice, unreadable by the owner (column grant). Declining, leaving and revoking '
  'are all a DELETE. Read-only for the recipient in v1.';

-- Ce que le destinataire lit à chaque ouverture de `/cave`. La clé primaire sert
-- l'autre sens — les partages d'une cave, lus par son propriétaire.
create index humidor_shares_recipient_idx
  on public.humidor_shares (recipient_id, created_at desc);

-- =============================================================================
-- §3 · GRANTS
-- -----------------------------------------------------------------------------
-- Colonne par colonne, et chaque absence est une décision :
--
--   · SELECT sans `hidden_at` : masquer est le geste du destinataire, pas un
--     message au propriétaire. Le destinataire relit l'état par sa porte (§5) ;
--   · INSERT de deux colonnes : une invitation naît en attente, et personne ne
--     l'écrit acceptée à la place de celui qui doit l'accepter ;
--   · UPDATE de deux colonnes, et la policy de §4 n'y admet que le destinataire.
-- =============================================================================

revoke all on public.humidor_shares from anon, authenticated;
grant select (humidor_id, recipient_id, created_at, accepted_at)
  on public.humidor_shares to authenticated;
grant insert (humidor_id, recipient_id) on public.humidor_shares to authenticated;
grant update (accepted_at, hidden_at) on public.humidor_shares to authenticated;
grant delete on public.humidor_shares to authenticated;

-- L'export RGPD (0007) : la clé de service lit tout `public`.
grant select on public.humidor_shares to service_role;

-- =============================================================================
-- §4 · ROW LEVEL SECURITY DU PARTAGE
-- -----------------------------------------------------------------------------
-- Aucune de ces policies n'est lue par une policy de `humidors`, donc pas de
-- cycle — l'erreur `infinite recursion` de `reviews ↔ review_shares` ne peut pas
-- naître ici. Et chacune dit « propriétaire » par `h.user_id = auth.uid()`, pas
-- par la visibilité de `humidors` : la leçon de §1 vaut aussi pour la table neuve.
-- =============================================================================

alter table public.humidor_shares enable row level security;
alter table public.humidor_shares force  row level security;

-- Les deux parties, et personne d'autre.
create policy humidor_shares_select_involved on public.humidor_shares
  for select to authenticated
  using (
    recipient_id = (select auth.uid())
    or exists (select 1 from public.humidors h
                where h.id = humidor_id and h.user_id = (select auth.uid()))
  );

-- Seul le propriétaire invite ; jamais lui-même, ce qui ferait apparaître sa
-- cave deux fois chez lui ; et jamais par-dessus un blocage, dans un sens ou
-- dans l'autre. Le tableau plutôt que le prédicat, en InitPlan (0010 §3).
create policy humidor_shares_insert_owner on public.humidor_shares
  for insert to authenticated
  with check (
    exists (select 1 from public.humidors h
             where h.id = humidor_id and h.user_id = (select auth.uid()))
    and recipient_id <> (select auth.uid())
    and not (recipient_id = any ((select public.blocked_user_ids())::uuid[]))
  );

-- Seul le destinataire répond : accepter, masquer, réafficher. Le propriétaire
-- n'a pas de policy UPDATE — il retire, il ne modifie pas une réponse.
create policy humidor_shares_update_recipient on public.humidor_shares
  for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

-- Chacun peut y mettre fin : le propriétaire retire, le destinataire refuse ou
-- quitte.
create policy humidor_shares_delete_involved on public.humidor_shares
  for delete to authenticated
  using (
    recipient_id = (select auth.uid())
    or exists (select 1 from public.humidors h
                where h.id = humidor_id and h.user_id = (select auth.uid()))
  );

-- =============================================================================
-- §5 · LES DEUX PORTES DU DESTINATAIRE
-- -----------------------------------------------------------------------------
-- ADR 0022, D3 — le geste de `shared_humidor_shelf()` (ADR 0007, D5) appliqué à
-- une personne nommée. Une policy filtre des lignes et ne sait pas cacher une
-- colonne ; or une cave porte le prix payé, le vendeur — un lieu d'achat de
-- tabac, ce que le §2 regarde —, les notes, les codes de boîte et le grand livre,
-- c'est-à-dire quand on a fumé quoi. La projection est donc la raison d'être de
-- ces deux fonctions : leur type de retour est la frontière, et l'auto-contrôle
-- de §7 le relit.
--
-- SECURITY DEFINER, donc elles revérifient elles-mêmes ce qu'une policy aurait
-- vérifié : le destinataire, l'acceptation, le blocage. Elles ne répondent que
-- sur leur appelant et ne prennent aucun identifiant de personne en argument.
-- =============================================================================

-- Ce qu'on m'a proposé. Le nom de la cave et qui la propose, dès l'invitation —
-- sans quoi on ne saurait pas ce qu'on accepte ; la capacité et le nombre de
-- cigares seulement une fois accepté, parce qu'une invitation n'ouvre rien.
create or replace function public.humidor_shares_received()
returns table (
  humidor_id         uuid,
  humidor_name       text,
  owner_handle       text,
  owner_display_name text,
  shared_at          timestamptz,
  accepted_at        timestamptz,
  hidden_at          timestamptz,
  capacity           integer,
  cigar_count        integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select h.id,
         h.name,
         p.handle,
         p.display_name,
         s.created_at,
         s.accepted_at,
         s.hidden_at,
         case when s.accepted_at is not null then h.capacity end,
         case when s.accepted_at is not null then
           coalesce((select sum(i.qty)::integer
                       from public.humidor_items i
                      where i.humidor_id = h.id and i.qty > 0), 0)
         end
    from public.humidor_shares s
    join public.humidors h on h.id = s.humidor_id
    left join public.profiles p on p.id = h.user_id
   where s.recipient_id = (select auth.uid())
     and not (h.user_id = any ((select public.blocked_user_ids())::uuid[]))
   order by s.accepted_at nulls first, s.created_at desc
$$;

comment on function public.humidor_shares_received() is
  'The humidors offered to the caller, with who offers them and the caller''s '
  'answer. Capacity and count only once accepted. SECURITY DEFINER because '
  'humidors is owner-only; answers on the caller alone (ADR 0022, D3).';

-- Ce que contient une cave acceptée : quel cigare, combien, depuis combien de
-- jours. L'âge est le chiffre que le §5.5 veut afficher, calculé comme la vue
-- `humidor_inventory` ; il est rendu en jours et jamais en date.
create or replace function public.shared_humidor_lots(p_humidor uuid)
returns table (
  cigar_id   uuid,
  qty        integer,
  aging_days integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.cigar_id,
         i.qty,
         case
           when coalesce(i.aging_start_date, i.purchase_date) is null then null
           else (current_date - coalesce(i.aging_start_date, i.purchase_date))
         end
    from public.humidor_items i
    join public.humidors h on h.id = i.humidor_id
   where i.humidor_id = p_humidor
     and i.qty > 0
     and exists (select 1 from public.humidor_shares s
                  where s.humidor_id = p_humidor
                    and s.recipient_id = (select auth.uid())
                    and s.accepted_at is not null)
     and not (h.user_id = any ((select public.blocked_user_ids())::uuid[]))
   order by i.qty desc, 3 desc nulls last
$$;

comment on function public.shared_humidor_lots(uuid) is
  'What an accepted shared humidor holds: cigar, count, age in days. Never the '
  'price, the vendor, the box code, the position, the notes, the ledger or the '
  'readings — the return type is the boundary (ADR 0022, D3). Empty for anyone '
  'who has not accepted, and across a block.';

revoke execute on function public.humidor_shares_received() from public, anon;
revoke execute on function public.shared_humidor_lots(uuid) from public, anon;
grant execute on function public.humidor_shares_received() to authenticated;
grant execute on function public.shared_humidor_lots(uuid) to authenticated;

-- =============================================================================
-- §6 · LA NOTIFICATION
-- -----------------------------------------------------------------------------
-- ADR 0022, D6. Une invitation qu'on ne sait pas recevoir n'est acceptée que par
-- hasard. `tg_notify()` écrit déjà les quatre autres, avec le garde-fou du
-- blocage ; elle gagne une branche et rien d'autre ne change dans son corps.
--
-- `add value` est transactionnel depuis PostgreSQL 12, mais la valeur nouvelle
-- n'est utilisable qu'après le COMMIT : rien dans ce fichier ne l'emploie, et le
-- corps plpgsql ci-dessous ne la résout qu'à l'exécution.
-- =============================================================================

alter type public.notification_kind add value if not exists 'humidor_share';

create or replace function public.tg_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
  actor     uuid;
  kind      public.notification_kind;
  post      uuid;
  review    uuid;
begin
  if tg_table_name = 'follows' then
    recipient := new.followee_id; actor := new.follower_id; kind := 'follow';

  elsif tg_table_name = 'post_reactions' then
    select p.author_id into recipient from public.posts p where p.id = new.post_id;
    actor := new.user_id; kind := 'ember'; post := new.post_id;

  elsif tg_table_name = 'post_comments' then
    select p.author_id into recipient from public.posts p where p.id = new.post_id;
    actor := new.author_id; kind := 'post_comment'; post := new.post_id;

  elsif tg_table_name = 'humidor_shares' then
    select h.user_id into actor from public.humidors h where h.id = new.humidor_id;
    recipient := new.recipient_id; kind := 'humidor_share';

  else -- review_shares
    recipient := new.grantee_id; actor := new.granted_by; kind := 'review_share';
    review := new.review_id;
  end if;

  if recipient is null or recipient = actor then return null; end if;

  if exists (select 1 from public.blocks b
              where (b.blocker_id = recipient and b.blocked_id = actor)
                 or (b.blocker_id = actor and b.blocked_id = recipient))
  then
    return null;
  end if;

  insert into public.notifications (user_id, kind, actor_id, post_id, review_id)
  values (recipient, kind, actor, post, review);

  return null;
end;
$$;

revoke execute on function public.tg_notify() from public, anon, authenticated;

create trigger humidor_shares_notify
  after insert on public.humidor_shares
  for each row execute function public.tg_notify();

-- =============================================================================
-- §7 · AUTO-CONTRÔLE
-- -----------------------------------------------------------------------------
-- Il ne peut pas attraper ce que ce fichier vient d'établir — c'est le rôle de
-- `supabase/tests/23_cave_partage.sql`, qui n'accorde rien. Il attrape une
-- migration future qui défait une décision de l'ADR 0022 sans le remarquer.
-- =============================================================================

do $$
declare
  offender text;
  t        text;
begin
  -- 1. §0.5 du brief : aucune table sans RLS et sans policy.
  select string_agg(format('%I.%I', n.nspname, c.relname), ', ' order by 1)
    into offender
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r'
     and n.nspname in ('public', 'ref', 'shop')
     and (c.relrowsecurity = false
          or not exists (select 1 from pg_policy p where p.polrelid = c.oid));
  if offender is not null then
    raise exception 'VITOLA_RLS_GAP: table(s) sans RLS ou sans policy : %', offender;
  end if;

  -- 2. ADR 0022, D1 : les quatre verrous, restrictifs ET `FOR ALL`. Un verrou
  --    `FOR SELECT` est exactement celui qui a laissé passer les écritures.
  foreach t in array array['humidors', 'humidor_items', 'humidor_events', 'humidor_readings'] loop
    if not exists (
      select 1 from pg_policy p
       where p.polrelid = ('public.' || t)::regclass
         and p.polname = t || '_owner_only'
         and p.polpermissive = false
         and p.polcmd = '*'
    ) then
      raise exception
        'VITOLA_SCOPE_GAP: %_owner_only doit être restrictive et FOR ALL (ADR 0022, D1)', t;
    end if;
  end loop;

  --    Et la policy qui a ouvert la cave ne revient pas sous son nom.
  if exists (select 1 from pg_policy
              where polrelid = 'public.humidors'::regclass
                and polname = 'humidors_select_shown') then
    raise exception 'VITOLA_SCOPE_GAP: humidors_select_shown est revenue (ADR 0022, D1)';
  end if;

  -- 3. ADR 0022, D5 : le propriétaire ne lit pas `hidden_at`, et personne
  --    n'écrit une invitation acceptée ou masquée à la place du destinataire.
  select string_agg(grantee || ':' || column_name, ', ' order by 1) into offender
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'humidor_shares'
     and grantee in ('anon', 'authenticated')
     and ((privilege_type = 'SELECT' and column_name = 'hidden_at')
       or (privilege_type = 'INSERT' and column_name in ('accepted_at', 'hidden_at', 'created_at'))
       or (privilege_type = 'UPDATE' and column_name not in ('accepted_at', 'hidden_at')));
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: humidor_shares accorde trop : %', offender;
  end if;

  if exists (select 1 from information_schema.table_privileges
              where table_schema = 'public' and table_name = 'humidor_shares'
                and grantee = 'anon') then
    raise exception 'VITOLA_GRANT_GAP: anon a des droits sur humidor_shares';
  end if;

  -- 4. ADR 0022, D3 : les deux portes. SECURITY DEFINER avec un search_path
  --    fixé, et un type de retour qui ne nomme ni prix, ni achat, ni vendeur,
  --    ni code de boîte, ni emplacement, ni note, ni grand livre, ni relevé.
  select string_agg(p.proname, ', ' order by p.proname) into offender
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('humidor_shares_received', 'shared_humidor_lots')
     and (not p.prosecdef
          or not coalesce(array_to_string(p.proconfig, ',') like '%search_path=%', false));
  if offender is not null then
    raise exception
      'VITOLA_SCOPE_GAP: % doit rester SECURITY DEFINER avec un search_path fixé', offender;
  end if;

  select string_agg(p.proname || ' → ' || pg_get_function_result(p.oid), '; ') into offender
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('humidor_shares_received', 'shared_humidor_lots')
     and pg_get_function_result(p.oid) ~* '(price|purchase|vendor|box_code|position|notes|event|reading|user_id|recipient)';
  if offender is not null then
    raise exception 'VITOLA_SCOPE_GAP: une porte du partage expose trop : %', offender;
  end if;

  if (select count(*) from pg_proc
       where pronamespace = 'public'::regnamespace
         and proname in ('humidor_shares_received', 'shared_humidor_lots')) <> 2 then
    raise exception 'VITOLA_SCOPE_GAP: les deux portes du partage n''existent pas';
  end if;

  -- 5. Aucune fonction de `public` appelable au titre de PUBLIC, et les deux
  --    portes fermées à anon.
  select string_agg(proname, ', ' order by proname) into offender
    from pg_proc
   where pronamespace = 'public'::regnamespace
     and array_to_string(coalesce(proacl, '{}')::text[], ' ') ~ '(^| )=X/';
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: EXECUTE accordé à PUBLIC sur : %', offender;
  end if;

  if has_function_privilege('anon', 'public.humidor_shares_received()', 'EXECUTE')
     or has_function_privilege('anon', 'public.shared_humidor_lots(uuid)', 'EXECUTE') then
    raise exception 'VITOLA_GRANT_GAP: anon peut appeler une porte du partage';
  end if;

  -- 6. ADR 0022, D6 : l'invitation se dit.
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.humidor_shares'::regclass
                    and tgname = 'humidor_shares_notify'
                    and tgenabled <> 'D') then
    raise exception 'VITOLA_SCOPE_GAP: humidor_shares_notify manque ou est désactivé';
  end if;

  raise notice '0036 cave : quatre verrous FOR ALL, partage par invitation, deux portes en projection.';
end;
$$;

commit;
