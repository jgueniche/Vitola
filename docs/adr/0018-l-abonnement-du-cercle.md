# 0018 — Deux formules : le carnet reste libre, la parole des autres est le Cercle

- **Statut** : **Acceptée** le 12 septembre 2026 pour ce qui s'annonce, **non armée** pour ce qui
  se facture — première session de QA humaine (« concernant le Club : abonnement, formule gratuite
  avec carnet, les avis en consultation sont en mode payant »)
- **Date** : 2026-09-12
- **Décideur** : @jgueniche
- **Concerne** : `/cercle` · les quatre policies SELECT de `public.reviews` (ADR 0004) ·
  `public.cigar_stats` · ADR 0003 (Stripe Checkout) · ADR 0016 puis
  [0017](./0017-la-boutique-en-revente.md) · Q10 (structure juridique)

## Contexte

La QA du 12 septembre demande un abonnement en une ligne : **gratuit avec le carnet, payant pour
consulter les avis**. La page `/cercle` était par ailleurs jugée « un peu fade » — un hub de cinq
liens vers cinq listes — et a été refaite dans la même session pour montrer de vraies lignes.

Cette ADR existe parce que la moitié « payant » touche la frontière la plus chère du dépôt.

**La visibilité d'une entrée de carnet est décidée par quatre policies SELECT et par rien
d'autre.** C'est la règle centrale de l'ADR 0004, et `lib/reviews/queries.ts` ne contient pas un
seul `.eq('visibility', …)` pour cette raison : une requête qui doublerait une policy survivrait au
jour où la policy change. Une porte d'abonnement posée dans une page serait exactement cette
requête-là — un filtre d'audience en TypeScript, contournable par n'importe quel autre appelant, y
compris un futur endpoint que personne n'aura relu.

Et il y a un second effet, moins visible : `cigar_stats` agrège les entrées **publiques**. Si
l'abonnement gouverne la LECTURE d'un avis, la moyenne publique d'un cigare devient une donnée
dérivée d'avis que le lecteur n'a pas le droit de lire. Soit la moyenne se ferme avec eux — et la
fiche cigare perd ce qu'elle promet à un visiteur — soit elle reste ouverte, et l'abonnement
protège le détail d'une chose dont le résumé est public.

## Décision

### D1 — Les deux formules s'annoncent, et rien ne se facture ni ne se retient

`/cercle` présente **Libre** (gratuit : le carnet, la cave, le référentiel, la boutique) et **Le
Cercle** (à l'ouverture : les avis des membres, le fil, les clubs, l'agenda, les messages). La
page dit en une ligne que le Cercle n'est pas ouvert, que la caisse attend ses clés, et que d'ici
là tout est lisible par tout membre.

**Pourquoi annoncer sans armer.** Le dépôt a une règle : un verbe sans bras fabrique un
enregistrement, pas un acte (ADR 0013, D4 — `warn`, `suspend`, `delete` refusés avec leur raison).
Une grille tarifaire n'est pas un verbe : c'est une **offre**, et une offre peut être datée
« à l'ouverture » sans mentir. Ce qui serait un verbe sans bras, c'est un bouton « s'abonner » qui
n'encaisse rien — il n'y en a pas.

### D2 — Quand elle s'armera, la porte sera une policy, jamais une condition dans une page

L'abonnement se lira dans une colonne (ou une table) et entrera dans le prédicat des policies
SELECT de `reviews` — au même titre que `visibility`. Aucun écran ne portera de test
d'abonnement, pour la raison de l'ADR 0004 : la RLS l'applique et rien d'autre.

Corollaire à ne pas perdre : la branche `public` de ces policies sert aussi `anon`, et une branche
doit rester évaluable par le rôle à qui elle s'adresse (la leçon de `review_shares` —
`supabase/CLAUDE.md`). Un prédicat d'abonnement devra donc être découpé **par rôle**, pas ajouté à
la branche commune.

### D3 — La moyenne publique reste publique, et c'est ce qui fixe le périmètre du payant

`cigar_stats` ne se ferme pas. La note pondérée d'un cigare, son nombre d'avis publics et sa
répartition en bagues restent lisibles de tout visiteur majeur : c'est la promesse du référentiel,
et la fermer viderait la fiche cigare de ce qui la rend utile sans compte.

Ce que le Cercle ouvre est donc **le détail** : le texte d'une entrée, les six sous-notes d'une
dégustation, les arômes relevés, qui l'a écrite. Le résumé chiffré reste le bien commun.

Cela rend aussi D2 tenable : les policies gouvernent des **lignes** de `reviews`, et la vue
matérialisée qui les agrège n'a pas de RLS — son `where visibility = 'public'` est sa seule
frontière (ADR 0004, D3). Fermer la moyenne demanderait de fermer la vue, donc de la remplacer par
une fonction gardée. C'est un autre chantier, et il n'a pas de raison d'être ouvert.

### D4 — Le carnet ne se ferme jamais, dans aucune formule

Écrire son carnet, le relire, l'exporter (RGPD art. 20) et le partager nommément reste gratuit et
le restera. Un carnet payant serait une donnée personnelle prise en otage, et le droit d'accès de
l'art. 15 n'attend pas un abonnement.

## Conséquences

- `/cercle` montre les deux formules et de vraies lignes — le fil, les clubs, l'agenda, les
  membres suivis, la messagerie, le journal — au lieu de cinq liens.
- Aucune migration. Aucune colonne d'abonnement n'est créée : une table qui décrirait un
  abonnement que rien ne vend est le registre de consentements à l'envers (fin de P1, refus n° 1).
- `shop_enabled` et le paiement de démonstration ne sont pas touchés : le Cercle est un
  abonnement, la boutique une revente (ADR 0017), et les deux attendent la même caisse.

## Ce qui rouvre, et quand

**Les clés Stripe et la structure juridique (Q10).** Le même déclencheur que l'ADR 0003 et que la
boutique : tant qu'aucun euro ne peut être encaissé, une porte d'abonnement n'a rien à garder.

**Ce qu'il faudra trancher ce jour-là, et qui n'est pas tranché ici** : le prix, la périodicité,
l'essai éventuel, et surtout ce qu'un abonnement interrompu fait des avis qu'on avait lus — une
audience qui se referme sur ce qu'on a déjà consulté est un cas que le droit de la consommation
regarde, et que cette ADR ne prétend pas régler.
