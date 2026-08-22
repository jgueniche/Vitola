# Vitola — conventions de travail

Le cadrage produit est dans `BRIEF.md`. Ce fichier dit **comment** on travaille.
Un `CLAUDE.md` par domaine complète celui-ci : `app/`, `lib/`, `supabase/`.

## Les quatre règles qui ne se négocient pas

1. **Rien qui vende du tabac.** Aucune route, aucun champ, aucun libellé permettant l'achat,
   l'échange ou le don de produits du tabac. Testé par `tests/compliance/no-tobacco-sale.test.ts`,
   qui échoue si un champ comme `affiliate_url` réapparaît. Voir §2 du brief.
2. **RLS sur 100 % des tables.** Toute migration créant une table sans `ENABLE ROW LEVEL SECURITY`
   et sans au moins une policy explicite casse le build. Voir `supabase/CLAUDE.md`.
3. **`pnpm check` passe avant chaque commit.** `typecheck` + `lint` + `tokens:check` + `test`.
4. **Une ambiguïté d'architecture → une ADR + une question.** On ne devine pas. `docs/adr/`.

## Phases

Une phase = une branche. Le brief prévoit `feat/pXX-nom` ; les sessions Claude Code distantes
travaillent sur la branche qui leur est assignée. Jamais de commit direct sur `main`.

Chaque phase se termine sur son critère de sortie (§9 du brief), mesuré et non supposé.

## Commandes

```bash
pnpm dev            # développement
pnpm check          # typecheck + lint + tokens + tests — le portail avant commit
pnpm test:e2e       # parcours critiques (exige un pnpm build préalable)
pnpm storybook      # galerie des primitives
```

## Pièges connus, appris à nos dépens

- **`SET LOCAL ROLE` hors transaction est ignoré en silence.** Un test RLS qui l'oublie s'exécute
  en superutilisateur et voit tout passer. Toujours ouvrir un `BEGIN` explicite.
- **`typescript-eslint` ne supporte pas TypeScript 7.** Le projet est épinglé sur TS 6 : remonter
  casse `pnpm lint`. Revérifier avant de relever la version.
- **`eslint-plugin-react` plante sur ESLint 10** si on le laisse détecter la version de React.
  Elle est épinglée dans `eslint.config.mjs` ; ne pas repasser en `detect`.
- **`next lint` n'existe plus en Next 16.** ESLint tourne seul, et la clé `eslint` de
  `next.config.ts` n'existe plus non plus.
- **Les commentaires ne sont pas du code.** Les scans de conformité masquent les commentaires avant
  d'analyser : sans cela, une phrase expliquant pourquoi une chose est absente déclenche
  l'alerte que cette chose est présente.

## Style

- Contenu de l'app en français, code et commentaires en **anglais** (§0.10).
- Aucune chaîne visible en dur : tout passe par `messages/fr.json`.
- Aucune couleur en dur : tout passe par les tokens de `app/globals.css`.
- Le nom commercial vit dans `lib/brand.ts` et nulle part ailleurs.
- Aucune dépendance ajoutée sans justification écrite (§3). Trois ont été retirées ou évitées
  pendant P0 pour cette raison : `jose`, `vite-tsconfig-paths`, `pg`.

## Commits

Sujet à l'impératif, en anglais, préfixé par le domaine : `feat(band):`, `fix(age-gate):`,
`docs(p0):`, `chore(ci):`. Le corps explique **pourquoi**, pas quoi.
