# 0008 — Proposer une fiche entièrement nouvelle : une file à part, et une paternité qui survit à sa validation

- **Statut** : **Acceptée** le 23 août 2026 — par délégation, construction différée ; voir l'arbitrage en fin de document
- **Date** : 2026-08-23
- **Décideur** : @jgueniche
- **Concerne** : P1 (contribution wiki, F3) · `ref.cigars` · `ref.cigar_revisions` · `/contributions`

## Contexte

La file de contribution accepte des **corrections** et rien d'autre. `/cigares/[slug]/proposer` part
des valeurs d'une fiche et n'envoie que le diff ; `/contributions` l'applique champ par champ. Un
membre qui a fumé un cigare absent des 940 fiches n'a **aucun geste** : ni bouton, ni file, ni
message expliquant pourquoi.

Deux faits de schéma expliquent l'absence, et ce sont eux qu'il faut trancher.

**1. `ref.cigar_revisions.cigar_id` est `not null`.** Une proposition est un diff *sur une fiche*,
jamais une fiche. Il n'y a pas de ligne à pointer avant que la fiche existe.

**2. `ref.cigars.created_by` s'écrit à l'insertion et n'apparaît dans aucun `GRANT UPDATE`.** C'est
délibéré : dans un référentiel dont toute la valeur est la provenance, la paternité d'une fiche ne
se réattribue pas. La conséquence est celle que l'écran de P1 a déjà nommée — **une fiche créée par
le relecteur qui valide porterait le nom du relecteur, pas celui du proposeur.** Le travail
disparaîtrait de la personne qui l'a fait, silencieusement, au moment même où on le récompense.

Trois faits de contexte cadrent le reste.

**Le référentiel ne se remplit pas par scraping** (§2, art. L341-1 CPI). Une fiche nouvelle vient
donc d'une personne qui a la boîte sous les yeux, et sa source est une photo, un site de
manufacture, une revue. La provenance est la donnée, pas un attribut de la donnée.

**862 fiches sur 940 n'ont jamais été relues.** Ouvrir la création avant d'avoir résorbé cela
ajoute un flux entrant à un stock qu'on n'a pas traité.

**`ref.lines` est vide par décision de v1**, ce qui borne ce qu'une fiche nouvelle peut déclarer :
marque et vitole, jamais gamme. C'est l'ADR 0009, et les deux se lisent ensemble.

## Options

### A — Rendre `cigar_revisions.cigar_id` nullable

Une proposition sans `cigar_id` est une création ; avec, une correction.

*Coût :* la table perd son invariant le plus simple, et chacune de ses sept policies gagne une
branche « et si c'est une création ». Le diff, qui compare `champ` à `fiche.champ`, n'a plus de
`fiche` : la moitié de l'écran de relecture — « la fiche a changé depuis », champ par champ — n'a
plus de sens et doit apprendre à ne pas s'appliquer. Et `created_by` reste le problème : la
validation insère la fiche, donc c'est le relecteur qui l'insère.

### B — Une fiche en brouillon, créée par le proposeur, publiée par le relecteur

`ref.cigars` a déjà `status enum(draft|published|merged|rejected)` et `created_by`. Une proposition
de fiche **est** une fiche `draft` créée par son proposeur. Valider, c'est passer `status` à
`published` — un `update` d'une colonne, sur une ligne qui existe déjà.

*Coût :* un membre peut alors écrire dans `ref.cigars`, ce qu'aucune policy ne permet aujourd'hui.
Il faut une policy `INSERT` bornée à `status = 'draft'` et `created_by = auth.uid()`, une policy
`UPDATE` qui laisse le proposeur corriger **son** brouillon tant qu'il n'est pas publié, et la
certitude qu'un brouillon reste invisible — ce qui est déjà vrai, `ref.cigars` ne montrant que le
publié. Et il faut se demander ce que devient un brouillon refusé : `status = 'rejected'`, avec un
motif.

*Ce qu'elle règle :* `created_by` porte le proposeur, parce que c'est lui qui a inséré la ligne. La
paternité survit à la validation sans qu'aucune colonne ne soit réécrite.

### C — Une table à part, `ref.cigar_proposals`

Une proposition de fiche vit dans sa table, avec ses colonnes, et la validation recopie dans
`ref.cigars`.

*Coût :* deux schémas pour le même objet, qui divergeront à la première colonne ajoutée à
`ref.cigars` — et `ref.cigars` en a trente. La recopie est du code qui doit connaître les trente,
donc un endroit de plus où en oublier une. Et `created_by` redevient le relecteur, puisque c'est la
recopie qui insère.

### D — Ne rien construire, et le dire

L'écran de P1 le fait déjà : `/cigares/[slug]/proposer` explique que créer une fiche demande une
décision de schéma.

*Coût :* le seul chemin pour signaler un cigare absent reste « signaler une fiche existante comme
inexacte », ce qui est un détournement, ou rien.

## Décision

**Option B : une fiche nouvelle est un brouillon de `ref.cigars`, créé par son proposeur et publié
par un relecteur.**

Le raisonnement tient en une phrase : **la colonne qui pose problème est `created_by`, et la seule
façon qu'elle porte le bon nom est que le proposeur insère la ligne lui-même.** Toutes les autres
options font insérer le relecteur, donc réécrivent la paternité ou la perdent.

Ce que cela demande, et rien de plus :

| Pièce | Ce qu'elle fait |
|---|---|
| `ref.cigars_insert_proposer` | `INSERT` pour `authenticated`, avec `status = 'draft'` et `created_by = auth.uid()` |
| `ref.cigars_update_own_draft` | `UPDATE` du proposeur sur **son** brouillon, tant que `status = 'draft'` |
| `ref.cigars_select_own_draft` | Le proposeur voit son brouillon ; personne d'autre, sauf un relecteur |
| Une colonne `rejected_reason` | Un refus qui ne dit pas pourquoi est un refus qu'on repropose |
| `/cigares/proposer` | L'écran, sans slug : marque, vitole, dimensions, origine, source |
| `/contributions` | La file gagne une seconde section — les brouillons — à côté des diffs |

Et une contrainte de séquence, qui n'est pas technique : **cette fonctionnalité s'ouvre après la
relecture des 862 fiches**, pas avant. Ajouter un flux entrant à un stock non traité, c'est
transformer une dette en file d'attente.

## Conséquences

**Ce que nous acceptons.**

- **Un membre écrit dans `ref.cigars`.** C'était jusqu'ici une table en lecture seule pour tout
  client, et ce ne l'est plus. La borne est `status = 'draft'`, et elle doit être assertée dans les
  deux sens : un client ne peut pas insérer `published`, ni faire passer son brouillon à `published`.
- **Un brouillon abandonné reste.** Quelqu'un commencera une fiche et n'y reviendra pas. C'est une
  ligne invisible, sans coût, et la purger demanderait une politique de rétention que personne n'a
  demandée.
- **La paternité d'une fiche refusée reste au proposeur.** `created_by` ne se réécrit pas, même sur
  un `rejected`. C'est cohérent, et cela veut dire qu'un refus laisse une trace nominative.
- **Le doublon devient possible.** Deux personnes proposeront le même cigare. `ref.cigars` a déjà
  `merged_into_id` et `status = 'merged'` pour cela ; l'écran de fusion, lui, n'existe pas et n'est
  pas dans cette ADR.

**Ce que cela interdit désormais.**

- **Recopier une proposition dans une autre table.** C'est l'option C, et elle est écartée : la
  fiche est la proposition.
- **Réécrire `created_by`.** La colonne reste hors de tout `GRANT UPDATE`, y compris pour un
  relecteur. Si elle devait s'ouvrir, ce serait une autre ADR et une autre décision.
- **Publier un brouillon sans relecture.** La policy `UPDATE` du proposeur exclut `status` ; seul un
  `editor` publie.

## Quand rouvrir

1. **Plus de brouillons en attente que de fiches publiées dans le mois.** La file de relecture
   devient alors le goulot, et le seuil de confiance qui permet à un `contributor` de publier
   directement redevient la question.
2. **Le taux de doublons dépasse un sur dix.** L'écran de fusion cesse d'être optionnel.
3. **`ref.lines` rouvre** (ADR 0009). Une fiche nouvelle pourrait alors déclarer une gamme, ce que
   cette ADR ne prévoit pas.

## Question ouverte

**Faut-il l'ouvrir maintenant, ou après la relecture des 862 fiches ?**

Je propose **après**, et c'est la seule partie de cette ADR dont je ne suis pas certain. L'argument
pour attendre est celui du stock : 862 fiches publiées sans relecture sont déjà une dette, et un
flux entrant l'aggrave. L'argument pour ouvrir tout de suite est qu'un référentiel collaboratif dont
on ne peut rien créer n'est pas collaboratif, et que les premières fiches proposées par des membres
seront probablement mieux sourcées que les 862.

Les deux tiennent. Ce qui les départage n'est pas technique : c'est de savoir si le site s'ouvre à
des contributeurs avant ou après la relecture, et cela vous appartient.

### Arbitrage rendu — 23 août 2026

**Acceptée par délégation, et l'ouverture attend.** Même délégation que la 0009 (« fais comme tu le
sens pour cette session, je te laisse maître à bord ») ; la session suit la proposition du
document : la décision — option B, une fiche nouvelle est un brouillon de `ref.cigars` inséré par
son proposeur et publié par un relecteur — est actée, et **rien ne se construit avant la relecture
des 862 fiches**, parce qu'ajouter un flux entrant à un stock non traité transforme une dette en
file d'attente. Le déclencheur de construction est la résorption du stock, pas cette note ; et
comme pour la 0009, la délégation se rouvre d'un mot du porteur.
