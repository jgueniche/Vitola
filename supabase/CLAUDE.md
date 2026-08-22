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
- **Une policy qui interroge une table interroge aussi ses droits.** La branche `shared` de
  `reviews` lit `review_shares`, sur laquelle `anon` n'a aucun `GRANT` : un simple
  `select from reviews` en tant qu'anonyme échouait sur « permission denied for table
  review_shares ». Découpez les policies **par rôle** — `to anon` ne doit contenir que des
  branches qu'un anonyme peut évaluer. Elles sont OR-ées, le résultat est le même, et une branche
  morte n'est jamais planifiée.
- **Deux tables dont les policies se lisent l'une l'autre : récursion, même sans boucle de
  données.** PostgreSQL détecte le cycle sur le **graphe des policies**, pas sur le chemin
  d'exécution. `reviews` ↔ `review_shares` en est un ; le raisonnement « en pratique ça ne
  reboucle pas » est faux et l'erreur est `infinite recursion detected in policy`. On coupe du
  côté **froid** — celui qu'on écrit rarement — par une fonction `SECURITY DEFINER` :
  `public.owns_review()`, comme `current_app_role()` avant elle. Le chemin chaud reste un `EXISTS`
  ordinaire, servi par son index.
- **`alter default privileges` est par schéma.** Celui de 0002 ne couvrait que `public` ; les deux
  fonctions de trigger de `ref` sont restées appelables par un visiteur anonyme depuis le premier
  jour, et le test censé le voir filtrait lui aussi sur `public`. Corrigé par 0005. Leçon générale :
  **un contrôle qui ne regarde qu'un schéma ne protège qu'un schéma.**
- **Une vue matérialisée n'accepte pas de RLS.** `cigar_stats` n'est sûre que par son
  `where visibility = 'public'` : ce prédicat est la frontière de sécurité, pas une optimisation.
  L'auto-contrôle de 0003 relit `pg_get_viewdef()` pour vérifier qu'il y est toujours.

## Colonnes que le client ne doit jamais écrire

`profiles.role`, `profiles.reputation`, `profile_settings.adult_confirmed_at`,
`cigars.search_vector`. Barrées deux fois : absentes de tout `GRANT`, et refusées par un trigger
de garde. Ne pas relâcher l'une en pensant que l'autre suffit.

Depuis 0003 et 0004, cinq de plus, barrées par le seul `GRANT` de colonne — et assertées par
l'auto-contrôle de leur migration : `reviews.user_id` et `reviews.cigar_id` (une entrée ne change
ni d'auteur ni de cigare), `comments.hidden_at`, `comments.hidden_by` et `comments.hidden_reason`
(masquer est un acte de modération, écrit par du code à clé de service — y compris pour un
modérateur connecté).

## Seed

Aucun scraping, jamais (§2, art. L341-1 CPI). Chaque ligne de `seed/*.csv` doit être justifiable
dans `seed/PROVENANCE.md`. C'est une contrainte juridique, pas une préférence : en cas de
contestation, la charge de la preuve nous incombe.

```bash
cd supabase/seed && psql -v ON_ERROR_STOP=1 -f seed.sql   # idempotent, rejouable
```

Sans psql ni connecteur, il existe `seed_standalone.sql` : même logique, données inlinées, aucune
méta-commande, collable dans l'éditeur SQL du tableau de bord. Il est **généré** — après toute
modification d'un CSV, relancer `pnpm tsx tooling/scripts/build-standalone-seed.ts`, faute de quoi
la CI échoue.

Trois règles sur l'amorçage :

1. **Il ne publie rien.** Les fiches arrivent en `draft`. `supabase/tests/01_seed_integrity.sql`
   échoue si une seule est publiée — une donnée non relue ne doit jamais être visible.
2. **L'incertitude se signale, elle ne se cache pas.** Une dimension douteuse porte
   `Dimensions à vérifier` ; une vitole inconnue reste vide plutôt que d'être approximée. Un
   référentiel qui promet d'être vérifié ne peut pas combler ses trous par des suppositions.
3. **Le rejeu ne duplique pas.** La clé de rapprochement est le slug. Vérifié en CI.
