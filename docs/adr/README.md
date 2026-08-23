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
| [0006](./0006-atomicite-de-la-cave.md) | Fumer depuis la cave est un seul geste ; le stock est une somme d'événements | **Acceptée** | 2026-08-22 |
| [0007](./0007-le-fil-social-et-ce-qui-le-lit.md) | Un fil en une table, un abonnement libre et révocable, un blocage restrictif | **Acceptée** | 2026-08-23 |
| [0008](./0008-proposer-une-fiche-nouvelle.md) | Une fiche nouvelle est un brouillon de `ref.cigars`, créé par son proposeur | **Acceptée** (délégation) — construction différée après la relecture des 862 fiches | 2026-08-23 |
| [0009](./0009-rouvrir-ref-lines.md) | Rouvrir `ref.lines` par la contribution, avec le `status` qui lui manque | **Acceptée** (délégation) — pièces 1 et 2 appliquées, la création de gamme attend | 2026-08-23 |
| [0010](./0010-clubs-evenements-messagerie.md) | Un club est un groupe et un calendrier ; une conversation a exactement deux personnes | **Acceptée** | 2026-08-23 |
| [0011](./0011-les-lieux.md) | Les lieux : seed depuis le registre officiel des buralistes, avis à trois critères structurels | **Acceptée** | 2026-08-23 |
| [0012](./0012-le-journal.md) | Un article est du contenu, jamais du code ; la frontière passe entre deux audiences | **Acceptée** | 2026-08-23 |
| [0013](./0013-le-back-office-de-moderation.md) | Le modérateur entre dans `mod` par des portes de la taille du geste ; la décision emporte son acte | **Acceptée** | 2026-08-23 |

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
