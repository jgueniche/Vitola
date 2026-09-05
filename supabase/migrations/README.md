# supabase/migrations/

État appliqué sur le projet `vitola` (ref `upbewqsmgcrogoapubyz`, `eu-west-3`), et
enregistré dans `supabase_migrations.schema_migrations` — **vingt-quatre migrations**, relu
le 5 septembre 2026 par `list_migrations` sur le projet :

| Fichier                                   | Nom                           | Enregistrée sous |
| ----------------------------------------- | ----------------------------- | ---------------- |
| **`../../docs/phase-0/03-schema-p1.sql`** | `p1_referential`              | `0001`           |
| `0002_function_grants.sql`                | `function_grants`             | `0002`           |
| `0003_carnet.sql`                         | `carnet`                      | `0003`           |
| `0004_commentaires_moderation.sql`        | `commentaires_moderation`     | `0004`           |
| `0005_ref_function_grants.sql`            | `ref_function_grants`         | `0005`           |
| `0006_signalement_et_statistiques.sql`    | `signalement_et_statistiques` | `0006`           |
| `0007_ref_service_role_grants.sql`        | `ref_service_role_grants`     | `0007`           |
| `0008_cave.sql`                           | `cave`                        | `20260822222420` |
| `0009_profile_guard.sql`                  | `profile_guard`               | `20260822232400` |
| `0010_social.sql`                         | `social`                      | `0010`           |
| `0011_profile_privacy.sql`                | `profile_privacy`             | `0011`           |
| `0012_unblock_is_reachable.sql`           | `unblock_is_reachable`        | `0012`           |
| `0013_post_card.sql`                      | `post_card`                   | `0013`           |
| `0014_clubs_evenements_messagerie.sql`    | `clubs_evenements_messagerie` | `0014`           |
| `0015_conversation_inbox.sql`             | `0015_conversation_inbox`     | `20260823083729` |
| `0016_lieux.sql`                          | `lieux`                       | `20260823103622` |
| `0017_editorial.sql`                      | `editorial`                   | `20260823115404` |
| `0018_moderation.sql`                     | `moderation`                  | `20260823174500` |
| `0019_ref_lines_status.sql`               | `ref_lines_status`            | `20260823210941` |
| `0020_admin.sql`                          | `admin`                       | `20260825104447` |
| `0021_shop_catalogue.sql`                 | `shop_catalogue`              | `20260825140004` |
| `0022_marketplace_vendors.sql`            | `marketplace_vendors`         | `20260825151134` |
| `0023_ouverture_boutique_qa.sql`          | `0023_ouverture_boutique_qa`  | `20260825164958` |
| `0024_signalement_boutique.sql`           | `signalement_boutique`        | `20260903190015` |

## Pourquoi douze versions ne ressemblent pas à leur fichier

Les migrations appliquées par l'API de gestion (`apply_migration` du serveur MCP) sont
enregistrées sous l'horodatage de leur application, et sous le nom qu'on leur a donné à ce
moment-là — deux d'entre elles portent le préfixe numérique de leur fichier, les autres non.
C'est l'outil d'application qui numérote, pas le fichier : `list_migrations` affiche donc des
versions qui ne ressemblent pas au dépôt, et c'est normal. L'ordre et le contenu sont ceux du
dossier, et la colonne « Enregistrée sous » ci-dessus est ce qui permet de s'en assurer d'un
coup d'œil sans le redécouvrir à chaque session.

## Pourquoi ce dossier commence à 0002

La migration 0001 est le livrable §10.2 de la Phase 0 et vit toujours dans
`docs/phase-0/`. Son propre en-tête annonce pourtant
`Destination : supabase/migrations/0001_p1_referential.sql`, et le
`supabase/CLAUDE.md` veut toute migration ici.

Elle n'a pas été déplacée, pour trois raisons qui tiennent ensemble :

1. La Phase 0 est livrée et validée. Déplacer son livrable est une modification
   de l'artefact livré, pas une correction.
2. `docs/phase-0/README.md` et `.github/workflows/db.yml` la référencent par son
   chemin actuel. Le déplacement est un changement à trois endroits, pas un
   `git mv`.
3. Une copie serait pire : deux fichiers de 58 Ko qui divergent au premier
   correctif.

**Question toujours ouverte.** Le déplacement est la bonne fin de course ; il demande de mettre
à jour les deux références et de décider ce que `docs/phase-0/` conserve — le fichier, ou un
lien vers lui. Vingt-trois migrations plus tard, rien n'en a dépendu : la CI rejoue la chaîne
depuis `docs/phase-0/`, et c'est la seule chose qui compte.

## Rejouer l'état complet sur une base nue

C'est exactement ce que fait `.github/workflows/db.yml` à chaque changement sous `supabase/` :
l'ordre ci-dessous est le sien, et les assertions SQL de `supabase/tests/` s'intercalent après
la migration qu'elles éprouvent.

```bash
psql -f supabase/tests/00_supabase_stubs.sql      # hors Supabase uniquement
psql -f docs/phase-0/03-schema-p1.sql             # 0001
for f in supabase/migrations/00{02..24}_*.sql; do  # 0002 → 0024, dans l'ordre du nom
  psql -v ON_ERROR_STOP=1 -f "$f"
done
cd supabase/seed && psql -f seed.sql && psql -f seed_venues.sql
```

Sur un vrai projet Supabase, sauter la première ligne : `auth.users`, `storage.*`
et les rôles `anon` / `authenticated` / `service_role` y existent déjà.

Ce qu'il faut savoir avant de conclure qu'une migration a échoué :

- **PostGIS doit exister avant la 0016**, dans le schéma `extensions` comme `pg_trgm` et
  `unaccent` depuis 0001. La CI tourne sur l'image `postgis/postgis:17-3.5` et **purge** la
  pré-installation que cette image met dans `public` : sans cela `if not exists` saute la
  création, `extensions.geography` ne résout pas, et `spatial_ref_sys` traîne dans `public`
  où le contrôle de couverture RLS le prend pour une table sans policy.
- **0006 §3 ne fait rien sans `pg_cron`.** L'extension n'existe ni en local ni
  sur l'image de la CI. La section le dit à voix haute par un
  `NOTICE` plutôt que d'échouer, et son auto-contrôle vérifie la planification
  **partout où l'extension est présente** — donc sur Supabase, et seulement là.
- **Le seed écrit dans `public`.** Sa section 6 charge la roue des
  arômes, qui n'existe qu'à partir de 0003 : sur une base nue, appliquer au moins 0003
  avant `seed.sql`, faute de quoi la table est absente. `seed_venues.sql` exige la 0016, et
  se rejoue sans dupliquer — la CI le charge deux fois et compare les comptes.
- **La 0023 ouvre `shop_enabled` et l'écrit dans `audit_log`** — c'est un déploiement, pas
  un geste d'exploitation, donc l'acteur est `null`. Sur une base rejouée, la boutique est
  ouverte dès la fin de la chaîne, comme sur le projet.
- **Aucune migration ne charge le catalogue de la boutique.** Les produits de QA de
  `shop.products` et les visuels du bucket `shop-images` ont été versés par les écrans et par
  `tooling/scripts/shop-demo-images.ts` (voir `supabase/seed/PROVENANCE.md`, §8), jamais par
  une migration : une base rejouée a une boutique ouverte et vide, et c'est l'état attendu.
