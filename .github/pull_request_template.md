## Ce que fait cette PR

<!-- Une phrase. Le pourquoi, pas le quoi : le diff dit déjà le quoi. -->

**Phase** : P_
**Critère de sortie concerné** (§9 du brief) :

## Vérifications

- [ ] `pnpm check` passe
- [ ] `pnpm build` passe
- [ ] Tests e2e passent si un parcours critique est touché

## Conformité (§2 du brief)

- [ ] Aucune fonctionnalité de vente, échange ou don de tabac introduite
- [ ] Aucun champ de type `affiliate_url`, `vendor`, `stock` sur une entité tabac
- [ ] Le bandeau sanitaire reste présent et non masquable
- [ ] Aucune donnée personnelle nouvelle sans base légale documentée

## Base de données

- [ ] Sans objet
- [ ] Migration versionnée dans `supabase/migrations/`
- [ ] RLS activée + policy explicite sur toute table créée
- [ ] Tests RLS ajoutés, avec `BEGIN` explicite

## Décisions

<!-- Une ADR est-elle nécessaire ? Une question ouverte est-elle tranchée ou créée ? -->
