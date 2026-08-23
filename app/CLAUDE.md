# app/ — conventions

## Server Components par défaut

`'use client'` est l'exception et doit être justifié par un commentaire d'une ligne juste au-dessus.
La recherche facettée n'en est pas un : ses facettes sont des liens et son champ un
`<form method="get">`, donc zéro JavaScript. La recherche de la cave non plus, pour la même
raison — ni celle des lieux, dont le seul code client est le bouton de géolocalisation.
Trente-quatre existent :

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
| `cave/humidor-form.tsx` | `useActionState` — créer et régler une cave partagent leurs champs |
| `cave/[id]/lot-forms.tsx` | fumer, offrir, perdre, ajuster, déplacer, supprimer un lot |
| `cave/[id]/cave-forms.tsx` | ranger un cigare, relever l'hygrométrie, importer un CSV |
| `carnet/[id]/attach-smoke-form.tsx` | décompter après coup une dégustation de sa cave |
| `parametres/forms.tsx` | profil, préférences, confidentialité, et l'effacement du compte |
| `cigares/[slug]/proposer/propose-form.tsx` | une proposition part des valeurs de la fiche |
| `contributions/decide-forms.tsx` | accepter ou refuser, et retirer sa proposition |
| `fil/composer.tsx` | `useActionState` — un refus se relit sur place, sans perdre le texte |
| `fil/ember-button.tsx` | `useTransition` — une braise n'a rien à rendre, la page revalidée dit tout |
| `fil/[id]/comment-form.tsx` | idem `comment-form.tsx` : vider le champ **seulement** en cas de succès |
| `fil/[id]/delete-forms.tsx` | `window.confirm` avant une suppression en cascade |
| `cigares/[slug]/session-form.tsx` | publier au fil depuis la fiche, avec sa portée |
| `carnet/[id]/feed-share-panel.tsx` | annoncer une entrée au fil, ou dire pourquoi c'est impossible |
| `membres/[handle]/relation-forms.tsx` | s'abonner, se désabonner, retirer un abonné, bloquer |
| `membres/[handle]/unblock-button.tsx` | débloquer depuis la liste des paramètres |
| `clubs/club-form.tsx` | l'adresse du club s'affiche **pendant** la frappe, avant qu'il existe |
| `evenements/event-form.tsx` | `useActionState` — une date refusée se relit sans perdre le reste |
| `messages/[id]/composer.tsx` | `useActionState` — envoyer ne retire pas la boîte, donc l'état se lit |
| `lieux/locate-button.tsx` | la géolocalisation est une API du navigateur, et la position part dans l'URL |
| `lieux/proposer/propose-form.tsx` | `useActionState`, plus « Utiliser ma position » qui remplit deux champs visibles |
| `lieux/[slug]/review-form.tsx` | `useActionState` — un critère manquant se relit sans perdre le texte |
| `lieux/[slug]/controls.tsx` | `window.confirm` avant de retirer une proposition ou un avis |

Les règles apprises en les écrivant :

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
- **Une action qui fait disparaître son propre formulaire ne peut pas rendre de confirmation.**
  Accepter une proposition la retire de la file : le composant qui tenait l'état de retour est
  démonté dans le même rendu, et le relecteur ne voit rien — mesuré, pas supposé. Une décision
  **navigue** alors, et la confirmation est sur la page d'arrivée, portée par l'URL.
- **Une confirmation porte `role="status"`.** C'est une région live polie, donc un lecteur d'écran
  annonce « Enregistré » — la seule façon dont l'information atteint quelqu'un qui ne voit pas la
  phrase apparaître. Effet de bord utile : les parcours ont enfin quelque chose d'univoque à
  attendre. Ils attendaient le mot « enregistré » dans le texte de la page, et le trouvaient dans
  sa prose : trois écritures refusées ont été lues comme des succès.
- **Un `aria-label` REMPLACE le nom accessible, il ne s'y ajoute pas.** Le bouton braise portait
  `aria-label={count === 0 ? 'Aucune braise' : undefined}`, avec l'idée d'annoncer le compte. Le
  contrôle s'annonçait donc « Aucune braise » — un compte, là où un bouton doit dire ce qu'il fait.
  Le compte est déjà le `<span>` voisin, lu dans l'ordre du document. Seule une assertion cherchant
  le contrôle **par son rôle** pouvait le voir : à l'œil, la page était parfaite.
- **Une action qui remplace le sous-arbre où elle a été cliquée navigue.** C'est la règle de
  `/contributions`, rencontrée deux fois de plus en P3 : bloquer quelqu'un remplace tout le bloc de
  relations par le panneau de déblocage, et débloquer depuis les paramètres retire sa propre ligne.
  Le composant qui tenait l'état de retour est démonté dans le même rendu. La confirmation voyage
  donc dans l'URL (`?fait=…`) et la page d'arrivée la rend, avec `role="status"`. Le **refus**, lui,
  reste un état de retour : il laisse tout en place, donc il a un endroit où s'afficher.
- **Un chemin de retour qui vient d'un champ caché est contrôlé par l'attaquant.** Les cinq gestes de
  relation prennent un `retour`, et il passe par `safeSuite()` — le garde-fou d'open-redirect que
  l'age gate applique déjà à son `suite`. Sans lui, chacun de ces boutons est une redirection
  ouverte.
- **Un module `'use server'` ne peut exporter que des fonctions asynchrones.** Un objet de
  constantes exporté depuis `actions.ts` casse le build à la collecte des données de page, avec une
  erreur qui désigne la dernière ligne du fichier plutôt que l'export fautif. Les constantes vont
  dans `lib/`, et les deux côtés les importent.
- **L'état d'interface d'une page qui écrit doit vivre dans l'URL, pas dans un composant client.**
  `/cave/[id]` en a trois — le terme cherché, le cigare qu'on ajoute, le lot qu'on ouvre — et les
  trois sont des liens. Ce n'est pas de la pureté : **chaque écriture provoque un nouveau rendu
  serveur**, et un panneau ouvert par `useState` se referme à ce moment-là, sous les doigts de la
  personne qui vient de fumer un cigare. Dans l'URL, il reste ouvert, se partage et survit au
  retour arrière. Les formulaires à l'intérieur sont le seul code client de la page.
- **Une page ne doit pas écrire pendant qu'elle rend, et un accusé de lecture le rappelle.**
  Ouvrir une conversation ne marque rien comme lu : `read_at` est visible de l'expéditeur, donc un
  accusé déclenché par le préchargement d'un lien mentirait **sur quelqu'un**. C'est un bouton, et
  répondre le fait aussi — répondre est la preuve.
- **Trois écrans de plus qui naviguent plutôt que de rendre un état** : quitter un club, retirer un
  membre, annuler un événement. Même cause que `/contributions`. Le seul qui garde un état de
  retour est le composeur de message, parce que la boîte reste à l'écran.
- **Un `<input type="datetime-local">` rend une heure murale sans fuseau.** PostgREST tourne en
  UTC : une dégustation annoncée à 20 h en juillet s'enregistrait à 22 h de Paris, en silence, sur
  le seul champ autour duquel les gens organisent une soirée. `fromBrandZoneWallClock()` mesure le
  décalage à l'instant lui-même, donc il suit l'heure d'été, et il est épinglé des deux côtés de
  l'année.
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
