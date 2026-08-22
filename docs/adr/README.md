# Journal des décisions d'architecture

Une ADR est écrite quand une décision est **coûteuse à défaire** : elle contraint un schéma, une
frontière de sécurité, un fournisseur, ou une phase entière de la roadmap. Les micro-décisions vont
dans `docs/decisions-log.md`, pas ici.

| # | Titre | Statut | Date |
|---|---|---|---|
| [0001](./0001-supabase-vs-backend-dedie.md) | Supabase managé plutôt qu'un backend dédié | **Proposée** — attend validation | 2026-08-21 |
| [0002](./0002-strategie-de-recherche-hybride.md) | Toute la recherche dans PostgreSQL | **Proposée** — attend validation | 2026-08-21 |
| [0003](./0003-stripe-checkout-vs-payment-element.md) | Stripe Checkout hébergé en v1 | **Proposée** — attend validation | 2026-08-21 |
| [0004](./0004-portee-des-entrees-du-carnet.md) | Une portée par entrée de carnet, appliquée par la RLS seule | **Acceptée** | 2026-08-22 |
| [0005](./0005-cible-des-commentaires.md) | Les commentaires s'accrochent à la fiche cigare | **Acceptée** | 2026-08-22 |

## Statuts

`Proposée` → `Acceptée` → (`Dépréciée` | `Remplacée par NNNN`). Une ADR acceptée n'est jamais
réécrite : on en écrit une nouvelle qui la remplace, et l'ancienne reste lisible avec son contexte
d'époque.

## Modèle

```markdown
# NNNN — Titre à l'impératif

- **Statut** : Proposée
- **Date** : AAAA-MM-JJ
- **Décideur** : @jgueniche
- **Concerne** : phases, modules ou fichiers touchés

## Contexte
Ce qui est vrai aujourd'hui et force une décision. Faits, contraintes, chiffres.

## Options
Chacune avec ce qu'elle coûte, pas seulement ce qu'elle apporte.

## Décision
Une phrase. Puis ce qui l'emporte.

## Conséquences
Ce que l'on accepte, y compris désagréable. Ce que cela interdit désormais.

## Quand rouvrir
Le seuil mesurable qui rendrait cette décision caduque.

## Question ouverte
Ce sur quoi j'ai besoin d'un arbitrage.
```
