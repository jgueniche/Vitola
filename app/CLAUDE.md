# app/ — conventions

## Server Components par défaut

`'use client'` est l'exception et doit être justifié par un commentaire d'une ligne juste au-dessus.
À ce jour, deux composants clients existent, tous deux pour `useActionState` — un formulaire qui doit
réafficher l'erreur que son action a renvoyée : `majorite/age-gate-form.tsx` et
`connexion/sign-in-form.tsx`. La recherche facettée, elle, n'en est pas un : ses facettes sont des
liens et son champ un `<form method="get">`, donc zéro JavaScript.

## La frontière de l'age gate est une frontière de routage

- `app/(public)/` — accessible **sans** franchir le portail. Aucun **nom de marque**, aucune fiche,
  aucun prix de tabac : c'est vérifié par un test e2e, qui échoue si une marque réelle apparaît.

  La page d'accueil montre en revanche une **illustration de cigare allumé**, décidée par le
  porteur du produit. Elle est dessinée pour rester du bon côté du §2 : planche annotée, légendes
  en mesures et non en adjectifs, aucune marque. Son emplacement devant le portail est assumé et
  non bloquant — il est inscrit dans « À trancher avant commercialisation » du `CLAUDE.md` racine,
  pour avis juridique avant l'ouverture commerciale.

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
