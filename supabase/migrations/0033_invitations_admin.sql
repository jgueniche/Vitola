-- =============================================================================
-- VITOLA — 0033 : trois comptes qui naîtront admin
-- -----------------------------------------------------------------------------
-- QA humaine du 12 septembre 2026 : « créer le compte de chacun en tant
-- qu'admin » — theo.ams26@gmail.com, arieh.amsellem@free.fr,
-- luc.amsellem@me.com.
--
-- **Ce qu'on ne fait pas, et pourquoi.** On ne crée pas trois lignes dans
-- `auth.users`. Un compte a un mot de passe ou un lien magique, une adresse
-- confirmée, des métadonnées de session : fabriquer cela à la main en SQL
-- produit un compte qui a l'air d'exister et dont personne ne peut se servir,
-- et §0.4 interdit de toute façon de toucher au schéma par un autre chemin
-- qu'une migration. Ce que la demande veut, c'est que ces trois personnes
-- soient admin **quand elles se connecteront** — pas qu'il existe trois
-- coquilles vides en attendant.
--
-- **Donc une liste d'invitations.** Une adresse y est inscrite avec le rôle
-- qu'elle recevra ; `tg_handle_new_user()`, qui provisionne déjà le profil et
-- les réglages à l'inscription, la lit et pose le rôle dans la même
-- transaction. La première connexion suffit : lien magique à son adresse, et
-- le compte arrive administrateur.
--
-- **Trois propriétés qui comptent.**
--
--   1. **`profiles.role` reste hors de portée du client.** Elle n'est dans
--      aucun GRANT et un trigger la garde (0009) ; le rôle est posé par une
--      fonction SECURITY DEFINER déjà propriétaire du geste, pas par un écran.
--   2. **Une invitation se consomme une fois.** `claimed_at` et `claimed_by`
--      sont écrits au moment où elle sert, donc une adresse réutilisée après
--      une suppression de compte ne repromeut personne en silence. La trace
--      est dans la table, pas dans un journal à part.
--   3. **La table n'est exposée à personne.** Elle nomme des personnes par
--      leur adresse e-mail — donnée personnelle, art. 4 RGPD — et aucun écran
--      n'en a besoin : `/admin/comptes` promeut un compte qui existe,
--      l'invitation sert à un compte qui n'existe pas encore. Aucun GRANT
--      client, RLS forcée, une policy pour les admins et rien d'autre.
--
-- Ce qui ne change pas : `public_signup_open` reste fermé. Il gouverne
-- l'inscription PUBLIQUE ; une invitation nominative est l'inverse d'une
-- inscription publique, et `signInWithOtp` crée le compte à la première
-- demande de lien, ce qui est le chemin que ces trois adresses emprunteront.
-- =============================================================================

begin;

create table if not exists public.admin_invitations (
  -- L'adresse, normalisée en minuscules par le CHECK plutôt que par `citext` :
  -- une extension installée pour une colonne est une dépendance de plus (§3),
  -- et l'appelant qui écrit ici est une migration ou un admin, pas un
  -- formulaire ouvert.
  email       text primary key
                check (email = lower(email) and position('@' in email) > 1
                       and length(email) between 5 and 254),
  role        public.app_role not null,
  note        text check (note is null or length(note) <= 500),
  invited_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  claimed_by  uuid references public.profiles (id) on delete set null,
  -- Les deux vont ensemble ou pas du tout : une invitation consommée sans
  -- savoir par qui est une trace qui ne trace rien.
  constraint admin_invitations_claim_complete
    check ((claimed_at is null) = (claimed_by is null))
);

comment on table public.admin_invitations is
  'Addresses that will receive a role above `member` the first time they sign '
  'in. Read only by public.tg_handle_new_user() (SECURITY DEFINER) and by '
  'admins; no client GRANT at all, because the rows name people by email. An '
  'invitation is consumed once — claimed_at/claimed_by are the trace.';

alter table public.admin_invitations enable row level security;
alter table public.admin_invitations force row level security;

/* Un admin lit et écrit la liste ; personne d'autre ne la voit. `for all`
   parce que les quatre verbes ont la même réponse : le rôle décide. */
create policy admin_invitations_admin on public.admin_invitations
  for all
  to authenticated
  using (public.has_min_role('admin'))
  with check (public.has_min_role('admin'));

-- Aucun droit de table pour les clients : le trigger passe par DEFINER, et un
-- admin passe par la policy ci-dessus, qui a besoin du grant. Les deux lignes
-- sont donc: rien pour anon, la table pour authenticated sous policy.
revoke all on public.admin_invitations from anon, authenticated;
grant select, insert, update, delete on public.admin_invitations to authenticated;

-- --- Le rôle se pose à l'inscription ----------------------------------------
create or replace function public.tg_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate text;
  invited   public.app_role;
begin
  candidate := 'membre_' || substr(replace(new.id::text, '-', ''), 1, 12);

  /* L'invitation, s'il y en a une. Lue avant l'insertion du profil pour que
     le rôle soit posé du premier coup : un UPDATE après coup passerait par le
     trigger de garde de `profiles` (0009), qui refuse une écriture de `role`
     hors contexte privilégié — et il a raison de la refuser. */
  select i.role into invited
    from public.admin_invitations i
   where i.email = lower(new.email)
     and i.claimed_at is null;

  insert into public.profiles (id, handle, display_name, role)
  values (
    new.id,
    candidate,
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    coalesce(invited, 'member')
  )
  on conflict (id) do nothing;

  insert into public.profile_settings (id, birth_date)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'birth_date', '')::date
  )
  on conflict (id) do nothing;

  if invited is not null then
    update public.admin_invitations
       set claimed_at = now(), claimed_by = new.id
     where email = lower(new.email) and claimed_at is null;
  end if;

  return new;
end;
$$;

comment on function public.tg_handle_new_user() is
  'Provisions the profile and the settings on signup, and applies a pending '
  'row of public.admin_invitations if the address has one — in the same '
  'transaction, and at INSERT time rather than by a later UPDATE, because the '
  'guard trigger of 0009 refuses a write to profiles.role outside a '
  'privileged context. Consumes the invitation it used.';

revoke execute on function public.tg_handle_new_user() from public;
revoke execute on function public.tg_handle_new_user() from anon, authenticated;

-- --- Les trois adresses de la QA du 12 septembre 2026 ------------------------
insert into public.admin_invitations (email, role, note)
values
  ('theo.ams26@gmail.com',     'admin', 'QA du 12 septembre 2026 — « créer le compte de chacun en tant qu''admin »'),
  ('arieh.amsellem@free.fr',   'admin', 'QA du 12 septembre 2026 — « créer le compte de chacun en tant qu''admin »'),
  ('luc.amsellem@me.com',      'admin', 'QA du 12 septembre 2026 — « créer le compte de chacun en tant qu''admin »')
on conflict (email) do nothing;

-- --- Auto-contrôle -----------------------------------------------------------
do $$
declare
  n integer;
begin
  if not exists (
    select 1 from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relname = 'admin_invitations'
       and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'VITOLA_RLS_GAP: admin_invitations sans RLS forcée';
  end if;

  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'admin_invitations';
  if n = 0 then
    raise exception 'VITOLA_RLS_GAP: admin_invitations sans policy explicite';
  end if;

  -- Une table qui nomme des gens par leur adresse n'est pas lisible par un
  -- visiteur, policy ou pas : un GRANT à `anon` serait la porte ouverte.
  if has_table_privilege('anon', 'public.admin_invitations', 'SELECT') then
    raise exception 'VITOLA_GRANT_GAP: anon peut lire admin_invitations';
  end if;

  -- Le trigger doit toujours être branché, sinon la liste ne sert à rien et
  -- rien à l'écran ne le dirait.
  if not exists (
    select 1 from pg_trigger t
     where t.tgname = 'on_auth_user_created' and not t.tgisinternal
  ) then
    raise exception 'VITOLA_TRIGGER_GAP: on_auth_user_created a disparu';
  end if;

  -- Et la fonction lit bien la liste : un corps qui ne la mentionne plus est
  -- une invitation qui ne sera jamais honorée. plpgsql ne déclare aucune
  -- dépendance, donc on relit le corps — la leçon de la 0009.
  if position('admin_invitations' in
      (select prosrc from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname = 'public' and p.proname = 'tg_handle_new_user')) = 0 then
    raise exception
      'VITOLA_MIGRATION_INCOMPLETE: tg_handle_new_user() ne lit plus admin_invitations';
  end if;

  select count(*) into n from public.admin_invitations where claimed_at is null;
  raise notice 'VITOLA 0033 OK — % invitation(s) en attente ; le rôle se pose à la première connexion.', n;
end $$;

commit;
