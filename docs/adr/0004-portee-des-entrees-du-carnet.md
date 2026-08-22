# 0004 — Donner une portée à chaque entrée du carnet, et n'en confier l'application qu'à la RLS

- **Statut** : Proposée — attend validation
- **Date** : 2026-08-22
- **Décideur** : @jgueniche
- **Concerne** : P2 (carnet, dégustation) · P3 (fil social) · P11 (statistiques) · `public.reviews`
  · `public.review_shares` · `cigar_stats`

## Contexte

Le `CLAUDE.md` retient le **carnet du fumeur** : ce qu'on a fumé, quand, la note, un commentaire
libre. Chaque entrée choisit sa portée — **privée**, **partagée à une personne**, **partagée à
plusieurs**, ou **publique**.

Le §5.4 du brief donne à `reviews` une colonne `visibility enum(public|followers|private)`. Un enum
nomme des **classes** d'audience ; il ne nomme pas de **personnes**. « À Marc » et « à Marc et
Julie » ne sont représentables par aucune de ses trois valeurs. La colonne n'est pas insuffisante
par oubli : elle répond à une autre question.

Trois faits cadrent la décision.

1. **Rien n'est encore écrit.** `reviews`, `review_thirds`, `aroma_taxonomy` et `cigar_stats` ont
   zéro occurrence dans le schéma appliqué (`docs/phase-0/03-schema-p1.sql`, migration `0001`).
   Aucune donnée à migrer, aucune compatibilité à tenir : le coût de cette décision est
   intégralement dans ce que nous écrirons ensuite, et nul dans ce qui existe.
2. **La donnée est probablement sensible.** Le §2 pose que les habitudes de consommation de tabac
   peuvent être requalifiées en données de santé (art. 9 RGPD). Une portée par défaut trop large
   n'est pas une maladresse d'ergonomie, c'est un défaut de minimisation (art. 25).
3. **Deux phases en aval lisent cette table.** Le fil de P3 (`posts`, `type = 'review_share'`) et
   les statistiques de P11 y puisent. Si la règle de visibilité existe à trois endroits, elle
   divergera au premier correctif.

Le `CLAUDE.md` pose enfin une question qu'il faut trancher ici, parce qu'elle décide de la forme de
la table : le carnet — le geste quotidien — et la dégustation structurée du §5.4 — l'exercice, trois
tiers, roue des arômes, moyenne bayésienne — partagent-ils la même table ?

## Options

### D1 · Une table ou deux ?

**A — Deux tables** (`smoking_log`, `reviews`). Chacune porte exactement ses obligations : une
dégustation exige sa structure, une entrée de carnet n'exige presque rien.
*Coût :* `humidor_events.review_id` (§5.5) devient une référence polymorphe ; `cigar_stats` doit
moyenner sur une union ; P11 doit interroger deux populations pour répondre à « ce que j'ai fumé ».
Trois endroits où l'oubli d'une des deux tables est silencieux.

**B — Une table, structure facultative, discriminant explicite.** `reviews` porte les deux, avec
`kind enum('log','tasting')`. Une entrée de carnet est une dégustation dégénérée : même auteur,
même cigare, même date, même note, sans les tiers ni les arômes.
*Coût :* des colonnes nulles pour la moitié des lignes, et un `CHECK` conditionnel pour que
`tasting` ne puisse pas être vide de sa structure.

**C — Une table, discriminant dérivé** (une entrée est une dégustation si elle porte des
`review_thirds`).
*Coût :* un brouillon de dégustation encore vide est indiscernable d'une entrée de carnet. L'UI ne
sait pas quel formulaire rouvrir. Le discriminant dérivé ment pendant toute la saisie.

### D2 · Comment exprimer la portée ?

**A — L'enum seul** (§5.4, tel quel). Ne sait pas nommer de destinataire. Écarté : la fonctionnalité
demandée est alors impossible.

**B — La table d'autorisations seule.** Plus d'enum ; `review_shares(review_id, grantee_id)` porte
tout. « Public » devient une ligne sentinelle ou une convention.
*Coût :* le cas le plus fréquent — lire une entrée publique sur une fiche cigare — paie une
jointure. Et « public » n'est une autorisation accordée à personne en particulier : le modéliser
comme telle est une contrevérité qui coûte un index.

**C — L'enum garde la classe d'audience, une table nomme les individus.**

```sql
visibility enum('private', 'shared', 'followers', 'public')   -- défaut : 'private'
review_shares (review_id, grantee_id, granted_by, granted_at) -- une ligne par destinataire
```

La bascule qui rend l'option simple : **« à une personne » et « à plusieurs » ne sont pas deux
modes.** C'est le même mode `shared`, avec un nombre de lignes différent. Ajouter un destinataire
est un `INSERT`, jamais un `UPDATE` de l'entrée — donc pas de course à la mise à jour, et pas de
bruit dans l'historique de l'entrée pour un geste qui ne la modifie pas.

### D3 · Ce que compte une moyenne publique

**A — Tout compter.** `cigar_stats` moyenne toutes les entrées, quelle que soit leur portée.
*Coût :* une voie d'inférence. Sur un cigare peu noté, la moyenne publique bouge de façon
observable quand une entrée privée est ajoutée. Une donnée privée devient déductible depuis une
donnée publique.

**B — Ne compter que le public.** `cigar_stats` lit `where visibility = 'public'`, et ce prédicat
est exactement celui de l'index partiel.

## Décision

**D1 : une seule table `reviews`, avec un discriminant explicite `kind` (option B).**
**D2 : l'enum porte la classe d'audience, `review_shares` nomme les personnes (option C).**
**D3 : seules les entrées publiques alimentent une moyenne publique (option B).**

Et la règle qui les tient ensemble : **la visibilité est appliquée par la RLS, et par rien
d'autre.** Aucune requête de fil, de statistique ou de fiche ne filtre `visibility` en TypeScript.

Ce n'est pas un principe abstrait : la migration `0001` s'en sert déjà, et le commente à la ligne
1230 pour `ref.cigar_images` — « la sous-requête `EXISTS` est elle-même soumise à la RLS de
`ref.cigars`, donc la visibilité d'une image suit celle de la fiche, sans logique dupliquée ». Le
carnet applique le même mécanisme :

```sql
-- reviews, SELECT
using (
      visibility = 'public'
   or user_id = (select auth.uid())
   or (visibility = 'shared'
       and exists (select 1 from public.review_shares s
                    where s.review_id = id and s.grantee_id = (select auth.uid())))
   -- la branche 'followers' arrive avec public.follows, en P3
)
```

La composition est correcte et mérite d'être écrite, parce qu'elle n'est pas évidente : la
sous-requête sur `review_shares` est elle-même soumise à la policy de `review_shares`, qui est
`grantee_id = auth.uid() or granted_by = auth.uid()` — exactement les lignes que le test interroge.
Aucune récursion : la policy de `review_shares` ne lit pas `reviews`. Seule la policy `INSERT` de
`review_shares` lit `reviews`, pour vérifier que celui qui partage est l'auteur ; elle y déclenche
la branche `user_id = auth.uid()`, qui ne repasse pas par `review_shares`.

**Les quatre valeurs de l'enum sont déclarées maintenant**, `followers` comprise, bien que
`public.follows` n'existe qu'en P3. Le motif est mesurable, et vérifié sur PostgreSQL 16.13 plutôt
que supposé. `ALTER TYPE … ADD VALUE` s'exécute bien dans une transaction depuis PostgreSQL 12,
mais la valeur ajoutée n'y est utilisable **par rien** — ni un `INSERT`, ni une policy, ni un index
partiel :

```sql
begin;
alter type t_vis add value 'shared';                                -- ALTER TYPE
create policy p on t_rev for select using (visibility = 'shared');
-- ERROR:  unsafe use of new value "shared" of enum type t_vis
-- HINT:   New enum values must be committed before they can be used.
```

Or toute migration de ce dépôt est un `begin … commit` unique (`supabase/CLAUDE.md`), et une portée
livrée sans sa policy ni son index n'est pas une portée. Ajouter `followers` plus tard coûterait
deux migrations pour un mot.

## Conséquences

**Ce que nous acceptons, y compris désagréable.**

- **La portée par défaut est `private`.** Publier est un geste explicite. C'est la minimisation de
  l'art. 25 rendue exécutable, et cela veut dire qu'un carnet vide de contenu public est le
  comportement normal, pas un échec d'adoption.
- **La moyenne publique portera sur moins d'entrées qu'il n'en existe.** C'est le prix de D3. La
  moyenne **bayésienne** exigée par le §5.4 est précisément ce qui rend un petit `n` tolérable : les
  deux décisions se soutiennent.
- **`shared` est une audience gelée ; `followers` est une audience vivante.** Les personnes nommées
  sont celles que l'auteur a nommées. Un abonné qui arrive demain verra, lui, les entrées
  `followers` d'hier — l'évaluation est faite à la lecture. L'asymétrie est réelle et doit être dite
  dans l'interface, pas seulement ici.
- **Révoquer, c'est fermer l'accès futur, pas défaire la lecture passée.** Supprimer une ligne de
  `review_shares` retire l'accès ; elle ne retire pas ce qui a déjà été lu. La page confidentialité
  doit le formuler ainsi, sans promettre davantage.
- **Des colonnes nulles pour les entrées de carnet.** Assumé : c'est le coût de D1-B, et il est
  inférieur au coût d'une référence polymorphe dans `humidor_events`.

**Ce que cela interdit désormais.**

- **Aucun filtre de visibilité en TypeScript.** Une requête qui écrit `.eq('visibility','public')`
  pour se protéger duplique une règle de sécurité ; elle est un bug même quand elle est juste, parce
  qu'elle survivra à la policy qu'elle double.
- **Un `post` de type `review_share` ne peut jamais être plus visible que l'entrée qu'il pointe.**
  À poser en contrainte lors de P3, pas en convention.
- **Le partage est par entrée, jamais global.** « Partager tout mon carnet avec Marc » n'est pas ce
  modèle. C'est une autre fonctionnalité — un lien de suivi, ou un club de P3 — et elle demandera sa
  propre ADR.
- **Un destinataire ne peut pas repartager.** `granted_by` existe pour que la question soit
  vérifiable ; la policy `INSERT` n'autorise que l'auteur de l'entrée.

**Index prévus** (le §8 impose le composite `(cigar_id, created_at)`) :

| Index | Sert |
|---|---|
| `reviews (cigar_id, created_at desc) where visibility = 'public'` | La fiche cigare, et `cigar_stats` |
| `reviews (user_id, created_at desc)` | Le carnet de son auteur, toutes portées |
| `review_shares (grantee_id, review_id)` | « Ce qu'on a partagé avec moi » |
| `review_shares (review_id, grantee_id)` unique | Un destinataire nommé une seule fois |

## Quand rouvrir

Seuils mesurables, dans cet ordre :

1. **La branche `shared` apparaît dans le plan de la fiche cigare.** Elle ne doit jamais y être : un
   lecteur anonyme sort par `visibility = 'public'` avant toute jointure. Si elle apparaît, la
   policy a été réordonnée et la fiche paie une jointure qu'elle ne devrait pas payer.
2. **La médiane des destinataires par entrée `shared` dépasse 8.** Au-delà, les membres se servent
   du partage nommé comme d'un groupe. Le bon modèle devient alors le club de P3, et cette ADR doit
   être remplacée plutôt que rapiécée.
3. **p95 de la lecture du fil > 200 ms** avec la pagination keyset du §5.6 en place → dénormaliser
   la portée dans la table de fil, jamais retirer la RLS.

## Question ouverte

**`followers` doit-elle exister en v1 ?**

C'est la seule des quatre valeurs dont l'audience s'élargit **après** que l'auteur a choisi.
Il écrit pour ses 12 abonnés du jour ; ils sont 300 six mois plus tard, et rien ne le lui a
redemandé. Sur une donnée que le §2 range possiblement à l'art. 9, c'est la portée que je sais le
moins bien défendre.

Deux réponses tiennent :

- **La garder** (ce que propose cette ADR) : c'est le §5.4, l'enum la déclare de toute façon, et
  l'interface avertit que l'audience est vivante.
- **Ne garder que `private` / `shared` / `public`** en v1, et ne rendre `followers` opérante qu'en
  P3, avec le fil, où l'utilisateur voit enfin qui sont ses abonnés. La valeur reste déclarée dans
  l'enum ; seule la branche de policy attend.

Je penche pour la seconde, et c'est ce que le calendrier fait de toute façon — `public.follows`
n'existe pas avant P3. Mais le choix est le vôtre, parce qu'il porte sur ce que nous promettons,
pas sur ce que nous savons construire. Il rejoint **Q1** : c'est un des points à soumettre à
l'avocat avec la qualification des données de dégustation.

### Arbitrage rendu — 22 août 2026

**`followers` est gardée pleinement**, conformément au §5.4. Ma réserve est enregistrée ci-dessus et
n'a pas été retenue ; elle n'a pas à l'être deux fois. Ce que la décision engage :

- La branche `followers` de la policy `SELECT` arrive avec `public.follows`, en P3 — non par
  prudence mais par dépendance : la table n'existe pas avant, et une policy ne peut pas lire une
  table absente. Jusque-là la valeur est déclarée et inutilisable, ce qui est sans conséquence
  puisque la portée par défaut est `private`.
- L'audience vivante devient une **obligation d'interface**, pas une note d'ADR : au moment de
  choisir cette portée, l'auteur doit lire que le nombre d'abonnés change et que ce qu'il publie
  aujourd'hui pour douze personnes sera lisible demain par trois cents. Sans cet avertissement, la
  portée est un piège.
- Le point reste versé au dossier de la **Q1**. Il ne bloque rien, mais c'est celui sur lequel un
  avis contraire de l'avocat coûterait le plus cher à défaire — d'où la trace ici.
