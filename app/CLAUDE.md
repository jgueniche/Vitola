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
| `cigares/[slug]/log-form.tsx` | `useActionState` — vider le champ **uniquement** en cas de succès |
| `cigares/[slug]/degustation/tasting-form.tsx` | total calculé, minuteur, roue, brouillon local |
| `carnet/[id]/entry-editor.tsx` | `useActionState` — le refus se relit sur place |
| `carnet/[id]/share-add-button.tsx` | nommer quelqu'un peut être refusé, et doit le dire |
| `carnet/[id]/delete-entry-form.tsx` | `window.confirm` avant une suppression en cascade |
| `components/reviews/scope-selector.tsx` | l'avertissement « abonnés » s'affiche au choix, pas au submit |
| `components/reviews/aroma-wheel.tsx` | une roue est un contrôle, et un contrôle retient ce qu'on a pris |

Quatre règles apprises en les écrivant :

- **Un formulaire qui doit se refermer tout seul n'utilise pas `useActionState`.** La règle
  `react-hooks/set-state-in-effect` refuse `setState` dans un `useEffect`, et surveiller l'état
  renvoyé pour fermer un éditeur est exactement cela. On appelle alors la Server Action depuis un
  `useTransition` : elle apprend le succès et referme au même endroit. C'est `comment-item.tsx`.
- **Le dialogue de signalement est un composant client parce que le mécanisme est une route API.**
  L'article 16 du DSA veut un mécanisme joignable, y compris par une machine ; une route
  `app/api/` répond à cela, et une route ne peut pas être un `<form action>`.
- **React 19 réinitialise un formulaire après le retour de sa Server Action**, et une
  réinitialisation rend à chaque champ le `defaultChecked` / `defaultValue` qu'il avait **au
  montage** — React le synchronise une fois et jamais ensuite. Un groupe de radios *contrôlé* revient
  donc silencieusement à sa valeur de départ pendant que l'état React, lui, est juste : le DOM ment,
  et c'est le DOM que le submit suivant poste. Vu sur le sélecteur de portée, où l'entrée qu'on
  venait de rendre privée se republiait au deuxième enregistrement. Un groupe de radios dont la
  valeur vient du serveur doit être **keyé sur cette valeur**, en plus de la réconcilier.
- **Un état dérivé d'une prop se réconcilie pendant le rendu**, jamais dans un effet — la règle
  `set-state-in-effect` interdit le second, et React documente le premier. `useState(prop)` ne relit
  rien après le montage.
- **Lire `localStorage` demande `useSyncExternalStore`.** Pendant le rendu, serveur et client
  divergent ; dans un effet, `set-state-in-effect` refuse. Le hook rend l'instantané serveur
  (`null`) pendant l'hydratation puis relit côté client, sans écart. C'est le brouillon de
  dégustation.

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
