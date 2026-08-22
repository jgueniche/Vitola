# supabase/ — conventions

## Deux règles absolues

1. **Jamais de modification via l'interface Supabase** (§0.4). Toute évolution du schéma est une
   migration versionnée dans `migrations/`, relue et rejouable. Une base dont l'état ne se
   reconstruit pas depuis ce dossier est une base perdue.
2. **RLS activée dès la création de chaque table, avec au moins une policy explicite** (§0.5).
   Chaque migration se termine par l'auto-contrôle qui échoue s'il manque l'une ou l'autre.

## Écrire une migration

```sql
-- au début
begin;
-- ... DDL, index, grants, policies ...
-- à la fin : l'auto-contrôle (copier depuis 0001_p1_referential.sql §11)
commit;
```

Ordre des sections, qui est aussi l'ordre des dépendances : extensions → enums → fonctions
partagées → tables → recherche → index → grants → RLS → storage → auto-contrôle.

## Pièges avérés

- **`SET LOCAL ROLE` hors transaction est ignoré.** Un test RLS qui l'oublie tourne en
  superutilisateur et passe toujours. Ouvrir un `BEGIN` explicite dans chaque test.
- **Une fonction `language sql` est validée à sa création.** Elle ne peut pas référencer une table
  définie plus bas dans le même fichier. Ordonner, ou passer en `plpgsql`.
- **`authenticated` a besoin de `USAGE ON SCHEMA extensions`.** Sans ce grant, toute contrainte
  `CHECK` appelant `slugify()` ou `unaccent()` fait échouer les `INSERT` clients.
- **Ne jamais mettre `FORCE ROW LEVEL SECURITY` sur `public.profiles`.** Le propriétaire de
  `current_app_role()` serait alors soumis aux policies que cette fonction évalue : récursion
  infinie. Toutes les autres tables sont en `FORCE`.
- **`search_path = ''` impose de qualifier les configurations de recherche** :
  `to_tsvector('pg_catalog.french', …)`, jamais `'french'`.
- **Un `CHECK` ne peut pas appeler `current_date`.** La règle des 18 ans vit dans un trigger.

## Colonnes que le client ne doit jamais écrire

`profiles.role`, `profiles.reputation`, `profile_settings.adult_confirmed_at`,
`cigars.search_vector`. Barrées deux fois : absentes de tout `GRANT`, et refusées par un trigger
de garde. Ne pas relâcher l'une en pensant que l'autre suffit.

## Seed

Aucun scraping, jamais (§2, art. L341-1 CPI). Chaque ligne de `seed/*.csv` doit être justifiable
dans `seed/PROVENANCE.md`. C'est une contrainte juridique, pas une préférence.
