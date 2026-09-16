-- =============================================================================
-- 0035 — Une invitation dont le titulaire disparaît retourne en attente
-- =============================================================================
-- La 0033 pose `claimed_by uuid references public.profiles (id) on delete set
-- null` et, juste à côté, un CHECK qui exige que `claimed_at` et `claimed_by`
-- soient tous les deux nuls ou tous les deux remplis. Les deux sont justes
-- séparément et faux ensemble : supprimer le compte qui a consommé une
-- invitation déclenche l'action référentielle, qui met `claimed_by` à null et
-- laisse `claimed_at` rempli — donc le CHECK refuse, et **la suppression
-- échoue**. Mesuré le 16 septembre 2026 en tentant la suppression dans une
-- transaction annulée :
--
--   ERROR: 23514: new row for relation "admin_invitations" violates check
--   constraint "admin_invitations_claim_complete"
--
-- Personne ne l'avait vu parce que personne n'avait encore supprimé un compte
-- invité. Même famille que « une contrainte peut être cohérente et fausse »
-- (CLAUDE.md) : le SQL ne dit jamais ce qu'une paire de colonnes signifie.
--
-- La réparation dit ce que la situation veut dire plutôt que d'assouplir le
-- CHECK, qui a raison : **une invitation dont le titulaire n'existe plus n'a
-- pas été consommée.** Elle repart en attente, avec son rôle, et la personne
-- qui recrée son compte le retrouve par `tg_handle_new_user()`.
--
-- Le trigger est `before delete` et c'est ce qui le fait marcher : les actions
-- référentielles d'une clé étrangère sont des triggers AFTER internes, donc
-- libérer la ligne avant le `delete` laisse l'action ne trouver personne.
-- =============================================================================

begin;

create or replace function public.tg_release_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.admin_invitations
     set claimed_at = null, claimed_by = null
   where claimed_by = old.id;
  return old;
end;
$$;

comment on function public.tg_release_invitation() is
  'Releases any admin invitation claimed by a profile about to be deleted, so '
  'the row returns to pending with its role intact. BEFORE DELETE on purpose: '
  'the foreign key''s ON DELETE SET NULL is an internal AFTER trigger, and it '
  'would otherwise leave claimed_at set with claimed_by null — which the '
  'claim_complete CHECK of 0033 refuses, making the deletion fail outright.';

revoke execute on function public.tg_release_invitation() from public;
revoke execute on function public.tg_release_invitation() from anon, authenticated;

drop trigger if exists release_invitation_on_profile_delete on public.profiles;
create trigger release_invitation_on_profile_delete
  before delete on public.profiles
  for each row
  execute function public.tg_release_invitation();

-- --- Auto-contrôle -----------------------------------------------------------
-- Structurel, et c'est un choix payé par une erreur : la première version
-- insérait un profil de test pour provoquer la libération, en affirmant en
-- commentaire que `profiles.id` n'avait pas de clé étrangère montante. Elle en
-- a une, vers `auth.users`, et la migration a échoué sur `profiles_id_fkey`.
-- Fabriquer la fixture voulait donc dire écrire dans `auth.users` depuis une
-- migration — ce que la règle 6 de la QA du 12 septembre interdit, et pour une
-- bonne raison.
--
-- Le comportement, lui, a été prouvé sur la vraie base le 16 septembre 2026,
-- dans une transaction annulée : la suppression échouait avec 23514 avant ce
-- trigger, aboutissait après, et l'invitation repartait en attente avec son
-- rôle `admin`. Ce qui est vérifié ici est ce qu'une migration peut vérifier
-- seule — que la pièce est en place, et que la contrainte qu'elle protège
-- existe toujours.
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'release_invitation_on_profile_delete'
       and tgrelid = 'public.profiles'::regclass
       and not tgisinternal
       and tgtype & 2 = 2   -- BEFORE : après, l'action référentielle a déjà échoué
       and tgtype & 8 = 8   -- DELETE
       and tgenabled <> 'D'
  ) then
    raise exception
      'VITOLA_MIGRATION_INCOMPLETE: trigger de libération absent, désactivé ou pas BEFORE DELETE';
  end if;

  if position('admin_invitations' in
              pg_get_functiondef('public.tg_release_invitation()'::regprocedure)) = 0 then
    raise exception 'VITOLA_MIGRATION_INCOMPLETE: la fonction ne touche plus admin_invitations';
  end if;

  -- La contrainte que ce trigger existe pour satisfaire. Si elle disparaît, ce
  -- fichier n'a plus de raison d'être et doit être relu plutôt que gardé.
  if not exists (
    select 1 from pg_constraint
     where conname = 'admin_invitations_claim_complete'
       and conrelid = 'public.admin_invitations'::regclass
  ) then
    raise exception 'VITOLA_MIGRATION_INCOMPLETE: le CHECK claim_complete a disparu';
  end if;
end;
$$;

commit;
