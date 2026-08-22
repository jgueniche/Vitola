# Vitola

Référentiel, cave numérique et carnet de dégustation du cigare.
Le cadrage produit complet est dans [`BRIEF.md`](./BRIEF.md) ; les conventions de travail dans
[`CLAUDE.md`](./CLAUDE.md).

> **Site d'information. Aucun produit du tabac n'y est vendu.**
> Les contraintes légales du §2 du brief sont bloquantes et testées en CI.

## Démarrer

```bash
pnpm install
cp .env.example .env.local          # renseigner AGE_GATE_SECRET au minimum
pnpm dev                            # http://localhost:3000
```

`openssl rand -base64 48` fournit une valeur correcte pour `AGE_GATE_SECRET`.

## Commandes

| Commande | Effet |
|---|---|
| `pnpm dev` | Serveur de développement |
| `pnpm check` | `typecheck` + `lint` + `tokens:check` + `test` — à passer avant chaque commit |
| `pnpm test` | Tests unitaires et de conformité (Vitest) |
| `pnpm test:e2e` | Parcours critiques (Playwright) — nécessite `pnpm build` au préalable |
| `pnpm storybook` | Galerie des primitives, http://localhost:6006 |
| `pnpm build` | Build de production |

## Déploiement

Une seule variable est indispensable pour que le site démarre : **`AGE_GATE_SECRET`**, n'importe
quelle chaîne aléatoire d'au moins 32 caractères (visez-en 40).

À renseigner dans **Vercel → Project → Settings → Environment Variables**, cochée sur *Production*,
*Preview* et *Development*.

Sans elle, **le build échoue** avec un message qui le dit. C'est délibéré : l'age gate refuse de
signer sans clé, et un site déployé qui renvoie une 500 sur sa propre porte d'entrée est pire qu'un
déploiement qui refuse de partir.

## Où trouver quoi

| | |
|---|---|
| Plan de Phase 0 | [`docs/phase-0/`](./docs/phase-0/) |
| Décisions d'architecture | [`docs/adr/`](./docs/adr/) |
| Ouvrir Supabase | [`docs/setup/supabase.md`](./docs/setup/supabase.md) |
| Schéma P1 (écrit, testé, pas encore appliqué) | [`docs/phase-0/03-schema-p1.sql`](./docs/phase-0/03-schema-p1.sql) |

## État

**Phase 0 terminée** : design system, age gate, layout, `<Band />`, Storybook, CI, garde-fous de
conformité. **P1 n'a pas commencé** : aucune base de données n'est encore branchée.
