# supabase/migrations/

État appliqué sur le projet `vitola` (ref `upbewqsmgcrogoapubyz`, `eu-west-3`), et
enregistré dans `supabase_migrations.schema_migrations` :

| Version | Nom | Fichier |
|---|---|---|
| `0001` | `p1_referential` | **`../../docs/phase-0/03-schema-p1.sql`** |
| `0002` | `function_grants` | `0002_function_grants.sql` |
| `0003` | `carnet` | `0003_carnet.sql` |
| `0004` | `commentaires_moderation` | `0004_commentaires_moderation.sql` |
| `0005` | `ref_function_grants` | `0005_ref_function_grants.sql` |

## Pourquoi ce dossier commence à 0002

La migration 0001 est le livrable §10.2 de la Phase 0 et vit toujours dans
`docs/phase-0/`. Son propre en-tête annonce pourtant
`Destination : supabase/migrations/0001_p1_referential.sql`, et le
`supabase/CLAUDE.md` veut toute migration ici.

Elle n'a pas été déplacée dans cette session, pour trois raisons qui tiennent
ensemble :

1. La Phase 0 est livrée et validée. Déplacer son livrable est une modification
   de l'artefact livré, pas une correction.
2. `docs/phase-0/README.md` et `.github/workflows/db.yml` la référencent par son
   chemin actuel. Le déplacement est un changement à trois endroits, pas un
   `git mv`.
3. Une copie serait pire : deux fichiers de 58 Ko qui divergent au premier
   correctif.

**Question ouverte, à trancher au démarrage de P1.** Le déplacement est la bonne
fin de course ; il demande de mettre à jour les deux références et de décider ce
que `docs/phase-0/` conserve — le fichier, ou un lien vers lui.

## Rejouer l'état complet sur une base nue

```bash
psql -f supabase/tests/00_supabase_stubs.sql      # hors Supabase uniquement
psql -f docs/phase-0/03-schema-p1.sql             # 0001
psql -f supabase/migrations/0002_function_grants.sql
psql -f supabase/migrations/0003_carnet.sql
psql -f supabase/migrations/0004_commentaires_moderation.sql
psql -f supabase/migrations/0005_ref_function_grants.sql
cd supabase/seed && psql -f seed.sql
```

Sur un vrai projet Supabase, sauter la première ligne : `auth.users`, `storage.*`
et les rôles `anon` / `authenticated` / `service_role` y existent déjà.
