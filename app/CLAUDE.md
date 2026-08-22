# app/ — conventions

## Server Components par défaut

`'use client'` est l'exception et doit être justifié par un commentaire d'une ligne juste au-dessus.
À ce jour, un seul composant client existe : `majorite/age-gate-form.tsx`, parce qu'il utilise
`useActionState`.

## La frontière de l'age gate est une frontière de routage

- `app/(public)/` — accessible **sans** franchir le portail. Aucun contenu produit : ni nom de
  marque, ni photo, ni fiche. C'est vérifié par un test e2e.
- `app/(app)/` — derrière le portail. Le middleware garantit un cookie signé valide et pose
  `X-Robots-Tag: noindex`.

Le `matcher` du middleware est une négation : une route nouvelle est protégée **par défaut**.
Oublier de l'ajouter échoue en fermant, pas en ouvrant.

## État

Pas de state manager. L'état d'interface vit dans l'URL (`nuqs`), l'état serveur dans les Server
Components. Tant que cela suffit, on n'ajoute rien (§3).

## Validation

Zod sur **toute** Server Action et **toute** route API, sans exception (§8). Le schéma est déclaré
dans le fichier `actions.ts` du domaine ou dans `lib/validation/`.

## Métadonnées

Chaque route exporte un `title`. `robots: { index: false }` reste global tant que Q1 n'est pas
tranchée — `app/robots.ts` interdit tout.
