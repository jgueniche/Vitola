# app/ — conventions

## Server Components par défaut

`'use client'` est l'exception et doit être justifié par un commentaire d'une ligne juste au-dessus.
La recherche facettée n'en est pas un : ses facettes sont des liens et son champ un
`<form method="get">`, donc zéro JavaScript. Cinq existent :

| Fichier | Pourquoi |
|---|---|
| `majorite/age-gate-form.tsx` | `useActionState` — réafficher l'erreur renvoyée par l'action |
| `connexion/sign-in-form.tsx` | idem |
| `cigares/[slug]/comment-form.tsx` | idem, plus vider le champ **uniquement** en cas de succès |
| `cigares/[slug]/comment-item.tsx` | un commentaire bascule entre lecture et édition |
| `components/moderation/report-dialog.tsx` | un `POST` vers une route API, avec son état d'envoi |

Deux règles apprises en les écrivant :

- **Un formulaire qui doit se refermer tout seul n'utilise pas `useActionState`.** La règle
  `react-hooks/set-state-in-effect` refuse `setState` dans un `useEffect`, et surveiller l'état
  renvoyé pour fermer un éditeur est exactement cela. On appelle alors la Server Action depuis un
  `useTransition` : elle apprend le succès et referme au même endroit. C'est `comment-item.tsx`.
- **Le dialogue de signalement est un composant client parce que le mécanisme est une route API.**
  L'article 16 du DSA veut un mécanisme joignable, y compris par une machine ; une route
  `app/api/` répond à cela, et une route ne peut pas être un `<form action>`.

## La frontière de l'age gate est une frontière de routage

- `app/(public)/` — accessible **sans** franchir le portail. Aucun **nom de marque**, aucune fiche,
  aucun prix de tabac : c'est vérifié par un test e2e, qui échoue si une marque réelle apparaît.

  La page d'accueil montre en revanche une **illustration de cigare allumé**, décidée par le
  porteur du produit. Elle est dessinée pour rester du bon côté du §2 : planche annotée, légendes
  en mesures et non en adjectifs, aucune marque. Son emplacement devant le portail est assumé et
  non bloquant — il est inscrit sous « À trancher avant commercialisation » dans le `CLAUDE.md` racine,
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
