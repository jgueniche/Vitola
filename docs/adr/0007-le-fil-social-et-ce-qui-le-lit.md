# 0007 — Faire du fil une seule table, de l'abonnement un geste libre et révocable, et du blocage une policy restrictive

- **Statut** : **Acceptée** le 23 août 2026
- **Date** : 2026-08-23
- **Décideur** : @jgueniche
- **Concerne** : P3 (social) · P8 (modération) · `public.follows` · `public.posts` ·
  `public.post_reactions` · `public.post_comments` · `public.blocks` · `public.notifications` ·
  `public.reviews` (branche `followers`) · `public.humidors` (`privacy.show_humidor`)

## Contexte

Trois dettes datées attendent cette phase, et aucune ne se referme sans elle.

1. **La branche `followers` de la policy `SELECT` de `reviews` n'existe pas.** L'ADR 0004 l'a
   déclarée dans l'enum dès la 0003 — parce qu'une valeur d'enum ajoutée dans une transaction n'y
   est utilisable par rien — mais la policy attend `public.follows`. Une entrée « Mes abonnés » est
   donc aujourd'hui lisible de son seul auteur, et `SCOPE_TRAITS.followers.reachesNobodyYet` le dit
   à l'écran. `tests/unit/reviews-model.test.ts` échoue le jour où la branche apparaît : c'est
   voulu, et l'avertissement doit partir dans le même commit.
2. **`privacy.show_humidor` est réglable et rien ne le lit.** L'ADR 0006, D4, a consigné d'avance le
   piège : `profile_settings` n'est lisible que de son propriétaire, donc une policy qui lirait
   `privacy->>'show_humidor'` chez autrui ne renverrait **jamais rien** — pas une erreur, un
   silence.
3. **`privacy.show_reviews` et `show_country` ont le même statut**, faute d'un écran qui lise le
   profil de quelqu'un d'autre.

Quatre faits cadrent ce que nous écrivons.

**Rien n'est écrit dans le social, et presque rien dans le carnet.** `reviews` est à zéro,
`humidors` et `humidor_items` aussi. Le coût de cette décision est intégralement dans ce qui suit,
et nul dans ce qui existe — le même argument qu'a fait valoir l'ADR 0004, et qui ne se représentera
plus après les premiers membres.

**Le critère de sortie de P3 porte sur le keyset** (§9) : « feed paginé keyset, 0 requête N+1 ».
Le §5.6 l'écrit comme une interdiction — « pas d'infinite scroll sans pagination réelle
(`keyset pagination` sur `(created_at, id)`) ». Un keyset n'est pas une clause `where` qu'on ajoute
à la fin : c'est un ordre total, donc un index, donc une décision de schéma.

**La donnée est probablement sensible.** Le §2 range possiblement les habitudes de consommation de
tabac à l'art. 9 du RGPD. Tout ce qui élargit une audience dans ce document se juge à cette aune, et
non au confort d'usage.

**`mod` existe déjà, la modération non.** `mod.reports` accepte quatre cibles ; le fil en ajoute
deux. Il n'y a toujours aucun back-office (P8) ni destinataire nommé, et le §2 fait de nous
l'éditeur de ce que les membres publient.

---

## Options

### D1 · Un abonnement est-il libre, demandé, ou symétrique ?

Le §5.6 donne `follows(follower_id, followee_id)` et rien d'autre — la forme exacte d'un abonnement
libre. Mais la forme d'une table n'est pas une décision de produit, et celle-ci décide de ce que
« votre audience est vivante » veut dire pour quelqu'un qui a écrit une entrée à l'art. 9.

**A — Libre et asymétrique.** Je m'abonne, c'est fait, `visibility = 'followers'` devient
immédiatement effectif.
*Coût :* l'auteur ne choisit pas qui entre dans son audience. Il a été averti que le nombre
grandirait ; il n'a pas été averti que **n'importe qui** pouvait y entrer. Sur une entrée déjà
écrite, l'audience s'élargit sans qu'aucun geste de l'auteur ne l'ait permis.

**B — Demandé et approuvé.** `follows` gagne un état (`pending`/`accepted`), une file, deux écrans,
des notifications, et une règle de lecture qui doit distinguer les deux états partout.
*Coût :* une phase entière que le §9 ne liste pas, et une asymétrie de plus dans chaque policy
(`accepted` seulement). Surtout : elle déplace le problème sans le résoudre. Un abonné approuvé
hier reste approuvé quand on écrit demain.

**C — Symétrique.** L'abonnement est mutuel ou il n'est pas.
*Coût :* ce n'est pas ce que le §5.6 décrit, ce n'est pas ce qu'un fil de découverte suppose, et
cela rend impossible le cas le plus courant d'un référentiel — suivre quelqu'un qui écrit bien sans
lui demander de vous suivre.

**D — Libre, asymétrique, et révocable des deux côtés.** L'option A, plus une policy `DELETE`
supplémentaire : le **suivi** peut retirer un abonné, exactement comme l'abonné peut se désabonner.
*Coût :* un geste de plus à l'écran et une policy de plus. Rien d'autre — la table reste les deux
colonnes du §5.6.

### D2 · Où vit le fil, et que contient-il ?

**A — `posts` seul.** Le fil est une table, une seule règle d'audience, un seul index keyset.
*Coût :* le carnet devient invisible du fil. Une entrée qu'on vient d'ouvrir à ses abonnés ne leur
apparaît nulle part ; il faut aller la chercher sur la fiche du cigare.

**B — L'union de `posts` et de `reviews`.** Le fil lit les deux et les entrelace par date.
*Coût :* deux sources de vérité pour une même règle d'audience, ce que l'ADR 0004 nomme exactement
comme le risque à éviter. Et un keyset sur une union ne s'indexe pas : il faut trier deux flux et
fusionner, donc lire plus de lignes que la page n'en rend, à chaque page.

**C — `posts` seul, et le carnet y entre par une publication qui le pointe.** C'est le
`type = 'review_share'` du §5.6, et c'est ce que l'ADR 0004 avait déjà anticipé : « Un `post` de
type `review_share` ne peut jamais être plus visible que l'entrée qu'il pointe. À poser en
contrainte lors de P3, pas en convention. »
*Coût :* deux objets pour un geste. Publier une entrée au fil crée une ligne de plus, et cette
ligne doit suivre l'entrée quand sa portée change — donc un trigger, et une cascade quand la portée
descend sous ce qu'un fil peut montrer.

### D3 · Le keyset, comme clause ou comme objet de schéma ?

**A — Une clause dans le client PostgREST.** `.lt('created_at', curseur)` plus un `.or(...)` pour
départager les égalités.
*Coût :* PostgREST ne sait pas exprimer la comparaison de tuples `(created_at, id) < (x, y)`.
La traduction est un `or=(created_at.lt.X, and(created_at.eq.X, id.lt.Y))`, que le planificateur
sert moins bien qu'un parcours d'index ordonné, et que chaque appelant réécrit. Trois appelants,
trois occasions de se tromper d'ordre de tri — et un keyset dont l'ordre n'est pas total saute des
lignes en silence.

**B — Une fonction `SECURITY INVOKER` qui rend une page.** L'ordre total, la comparaison de tuples,
la borne de taille et les compteurs vivent dans le schéma. La RLS reste seule juge, puisque la
fonction tourne en droits d'appelant — c'est la décision D1 de l'ADR 0006, réappliquée.
*Coût :* une signature de plus à maintenir ; un paramètre ajouté est une migration.

### D4 · `blocks` — appliqué où ?

**A — En TypeScript.** Un `not in (...)` dans la requête du fil.
*Coût :* ce n'est pas un blocage. C'est un filtre d'affichage que n'importe quel autre chemin de
lecture — la fiche cigare, le profil, une URL directe — contourne sans le savoir.

**B — Une policy permissive de plus.** Les policies permissives sont **OR-ées** : en ajouter une ne
peut jamais retirer une ligne. Une policy permissive ne sait pas bloquer.

**C — Une policy `RESTRICTIVE`.** Elle est **AND-ée** avec l'ensemble des permissives, ce qui est
exactement la sémantique d'un blocage : quoi qu'une autre policy autorise, celle-ci retire.
*Coût :* un prédicat de plus dans chaque plan de lecture, et un accesseur `SECURITY DEFINER` — car
`blocks` n'est lisible que de ses deux parties, et un blocage doit s'appliquer **dans le sens que
la victime ne voit pas**.

---

## Décision

**D1 : l'abonnement est libre, asymétrique et immédiat — et se retire des deux côtés (option D).**

`follows(follower_id, followee_id, created_at)`, les deux colonnes du §5.6 et l'horodatage qu'un
journal demande. Deux policies `DELETE` plutôt qu'une : `follower_id = auth.uid()` (se désabonner)
et `followee_id = auth.uid()` (**retirer un abonné**).

Le raisonnement tient en une phrase : **une file d'approbation promet un contrôle a priori que le
temps défait, là où le retrait donne un contrôle qui reste vrai.** Un abonné approuvé en janvier
lit encore ce qu'on écrit en juin ; personne ne redemande. Le retrait, lui, est exerçable le jour où
l'on regarde sa liste. Il coûte une policy et un bouton, et il rend à l'auteur exactement le
pouvoir que l'ADR 0004 lui a promis quand elle a écrit que l'audience de `followers` est vivante.

Ce que cela n'excuse pas : l'avertissement de l'ADR 0004 reste affiché **et change de texte**. Il
disait « l'abonnement n'existe pas encore, personne ne lit » ; il dira désormais que l'audience est
libre d'entrer et se retire à la main.

**D2 : le fil est `posts`, et une entrée de carnet y entre par une publication qui la pointe
(option C).**

- `posts.kind` porte les quatre valeurs du §5.6 : `post`, `session`, `review_share`, `question`.
- `posts.visibility` réutilise `public.review_visibility` — même vocabulaire, donc comparable
  directement à celle de l'entrée pointée — mais **contrainte à `followers` ou `public`**.
  `private` et `shared` sont refusés par un `CHECK`, et le refus est une décision de produit :
  **publier, c'est s'adresser à quelqu'un.** Écrire pour soi seul, c'est le carnet, qui existe déjà
  et dont c'est le défaut. `shared` n'a de toute façon aucun mécanisme côté fil — il n'y a pas de
  `post_shares`, et il n'en faut pas.
- Un `review_share` porte `review_id`, et **sa visibilité est celle de l'entrée**, tenue par un
  trigger dans les deux sens : à la création de la publication, et à chaque changement de portée de
  l'entrée. Faire descendre une entrée sous `followers` **supprime** la publication, parce qu'elle
  n'a plus d'audience licite — et l'écran le dit avant de le faire.
- La contrainte que l'ADR 0004 demandait de poser est donc posée, et elle est un trigger plutôt
  qu'un `CHECK` : un `CHECK` ne peut pas lire une autre table.

**D3 : le keyset est un objet de schéma (option B).**

`public.feed_page(scope, before_created_at, before_id, limit)`, `language sql`, `stable`,
**`SECURITY INVOKER`**. Elle porte l'ordre total `(created_at desc, id desc)`, la comparaison de
tuples, le plafond de taille, et elle rend **en une seule requête** ce qu'une page affiche : la
publication, son auteur, son cigare, le nombre de braises, le nombre de commentaires, et si
l'appelant a braisé. Deux index la servent :

| Index | Sert |
|---|---|
| `posts (created_at desc, id desc) where visibility = 'public'` | l'onglet Découverte |
| `posts (author_id, created_at desc, id desc)` | l'onglet Abonnements, et le profil d'un membre |

`ember_count` et `comment_count` sont **dénormalisées sur `posts` et recalculées par un `count()`**,
jamais par un delta — la règle de `humidor_items.qty` (ADR 0006), pour la même raison : un trigger
qui incrémente se trompe une fois et ment ensuite pour toujours.

**D4 : le blocage est une policy `RESTRICTIVE`, adossée à un accesseur `SECURITY DEFINER`
(option C).**

`public.blocks_between(other uuid)` répond « existe-t-il un blocage entre l'appelant et cette
personne, dans un sens ou dans l'autre ? ». Elle est `SECURITY DEFINER` pour la même raison que
`show_humidor` en a besoin d'une : `blocks` n'est lisible que de ses parties, et un blocage doit
s'appliquer **dans le sens que la personne bloquée ne voit pas**. Elle ne répond que sur son
appelant, donc elle ne divulgue rien de plus que ce que l'appelant peut déjà déduire.

Elle est AND-ée sur `posts`, `post_comments`, `post_reactions`, `follows`, `reviews`, `comments` et
`profiles`, par une policy `as restrictive ... to authenticated` **par table**, laquelle épargne
toujours ses propres lignes (`author_id = auth.uid() or not blocks_between(author_id)`) : bloquer
quelqu'un ne doit pas rendre son propre carnet illisible.

**D5 : `show_humidor` ouvre les caves, jamais le grand livre, et jamais le prix.**

Trois pièces, dont deux sont des policies qu'on **ajoute** :

1. `public.shows_humidor(owner uuid)`, `SECURITY DEFINER` — le troisième accesseur que l'ADR 0006
   avait nommé d'avance. Repli fermé : une clé absente ou illisible vaut `false`.
2. `humidors_select_shown`, policy permissive de plus sur `public.humidors`. Aucune policy existante
   n'est modifiée.
3. **Des policies `RESTRICTIVE` propriétaires sur `humidor_items`, `humidor_events` et
   `humidor_readings`.** Sans elles, la décision serait fausse : leurs policies ne redisent pas la
   propriété, elles rejoignent `humidors` par un `EXISTS` soumis à sa RLS — donc **ouvrir `humidors`
   ouvrirait le grand livre**, c'est-à-dire quand on a fumé quoi. Exactement la donnée que le carnet
   protège par un défaut `private`, republiée par une porte de côté.

Reste le prix. `humidor_items.purchase_price_eur` est un **prix de tabac**, et le §2 est précisément
ce qui garde `show_indicative_prices` à `false` sur des prix publics. Une policy est un mécanisme de
**lignes** ; elle ne sait pas cacher une colonne. La projection est donc la raison d'être d'une
quatrième pièce : `public.shared_humidor_shelf(owner uuid)`, `SECURITY DEFINER`, qui rend
`cigar_id, qty, aging_start_date` et rien d'autre, après avoir revérifié elle-même `shows_humidor()`
et l'absence de blocage — comme `file_report()` revérifie. Une porte de la taille du geste.

---

## Conséquences

**Ce que nous acceptons, y compris désagréable.**

- **N'importe qui peut entrer dans une audience `followers` sans être invité.** C'est D1, et c'est
  le point le plus coûteux de ce document. Le contrepoids est le retrait, pas l'approbation, et
  l'écran doit le rendre trouvable — une commande qu'on ne trouve pas n'est pas un contrepoids.
- **Publier une entrée au fil crée un second objet.** Deux lignes, deux durées de vie, un trigger
  entre les deux. Une entrée redescendue en `private` perd sa publication, et c'est une suppression
  visible plutôt qu'un masquage — un fil qui garderait des lignes muettes serait pire.
- **Un `post` ne peut jamais être `private` ni `shared`.** Quelqu'un voudra un brouillon de
  publication ; il n'y en a pas. C'est le carnet.
- **Le blocage est mutuel et silencieux.** La personne bloquée ne l'apprend pas ; elle constate une
  absence. C'est le comportement attendu d'un blocage, et c'est aussi ce qui rend son effet
  difficile à distinguer d'une suppression. L'ADR ne le corrige pas : elle le note.
- **Un modérateur bloqué ne modère plus la personne qui l'a bloqué**, par sa session. La policy
  restrictive ne fait pas d'exception de rôle. Ce n'est pas un trou en v1 — la modération passe par
  `mod.reports` et la clé de service, jamais par la session d'un modérateur — mais c'est une
  contrainte à lever explicitement le jour où P8 livre un back-office.
- **Montrer sa cave ne montre pas ce qu'elle a coûté**, et donc la valorisation du §5.5 reste
  strictement propriétaire. Quelqu'un voudra montrer une boîte rare avec son prix ; il ne pourra
  pas. C'est le §2 qui décide, pas l'ergonomie.
- **Deux tables du §5.6 changent de nom** : `reactions` devient `post_reactions`, et `comments`
  (du §5.6) devient `post_comments`. `public.comments` est déjà pris par l'ADR 0005 et porte les
  commentaires de fiche, dont l'audience est publique par construction — une table qui mélangerait
  les deux aurait deux régimes de visibilité dans une seule policy.

**Ce que cela interdit désormais.**

- **Aucun filtre d'audience en TypeScript**, dans le fil comme ailleurs. `feed_page()` filtre par
  **portée d'onglet** (`following` / `discover`), ce qui dit de quoi la page parle ; elle ne
  redit jamais qui a le droit de lire.
- **Aucune écriture cliente dans `notifications`.** Elles naissent de triggers `SECURITY DEFINER`.
  Le seul droit accordé porte sur `read_at` et sur la suppression de ses propres lignes.
- **Aucun `count()` de braises calculé à la lecture.** La colonne dénormalisée est là pour ça, et
  la recalculer par un delta est interdit.
- **Aucune seconde implémentation du keyset.** Un appelant qui a besoin d'une page du fil appelle
  `feed_page()`. S'il lui manque une colonne, la fonction en gagne une.
- **Aucune lecture d'une cave de tiers hors de `shared_humidor_shelf()`.** Un `select` direct sur
  `humidor_items` renvoie ses propres lots et rien d'autre : la policy restrictive s'en charge.

**Index posés** :

| Index | Sert |
|---|---|
| `posts (created_at desc, id desc) where visibility = 'public'` | Découverte, keyset |
| `posts (author_id, created_at desc, id desc)` | Abonnements, profil, keyset |
| `posts (review_id) where review_id is not null` | La cascade de portée d'une entrée |
| `follows (followee_id, follower_id)` | « Qui me suit », et la branche `followers` de `reviews` |
| `post_comments (post_id, created_at)` | Le fil d'une publication |
| `post_reactions (user_id)` | « Ce que j'ai braisé » |
| `notifications (user_id, created_at desc) where read_at is null` | Le compteur de la navigation |
| `blocks (blocked_id)` | Le sens que `blocks_between()` lit rarement |

---

## Quand rouvrir

1. **Plus d'un retrait d'abonné pour dix abonnements**, mesuré sur trente jours. Le retrait serait
   alors utilisé comme une file d'approbation qu'on exerce après coup, et D1 devrait devenir
   l'option B — avec la file, les écrans et les notifications qu'elle demande.
2. **p95 de `feed_page()` > 200 ms** avec les index ci-dessus en place et un `EXPLAIN` qui montre un
   parcours d'index ordonné. Le repli est la dénormalisation d'une table de fil par destinataire
   (fan-out à l'écriture), **jamais** le retrait de la RLS — c'est déjà le seuil 3 de l'ADR 0004.
3. **`shared` demandé sur une publication.** Ce serait le signe que le besoin est un club (§5.6) et
   non une portée de plus : cette ADR est alors complétée, pas rapiécée.
4. **`show_humidor` demandé plus fin que « tout ou tien »** — par liste nommée, comme
   `review_shares`. L'ADR 0006 avait déjà posé ce seuil ; il se déplace ici sans changer.
5. **Le back-office de P8 a besoin qu'un modérateur voie ce qu'on lui cache.** La policy restrictive
   de blocage gagne alors une exception de rôle, et elle se teste au même endroit que le reste.

---

## Question ouverte

**L'abonnement doit-il rester libre, ou passer par une demande ?**

C'est D1, et c'est la seule décision de ce document qui porte sur ce que nous **promettons** plutôt
que sur ce que nous savons construire. Je la tranche en « libre + révocable » parce que c'est le
§5.6 littéral, parce que le §9 ne liste pas de file d'approbation dans P3, et parce que le retrait
donne un contrôle qui reste vrai quand une approbation vieillit.

Ma réserve, que j'enregistre ici plutôt qu'à l'écran : sur une donnée que le §2 range possiblement à
l'art. 9, **libre veut dire qu'un inconnu peut entrer dans l'audience d'une entrée déjà écrite.**
L'auteur a été averti que le nombre grandirait ; il n'a pas été averti que le choix des personnes ne
lui appartenait pas. Le retrait répare cela **après**, et seulement pour qui pense à regarder.

Trois réponses tiennent, et la troisième est celle que je proposerais si la première vous gêne :

- **Libre** (ce que cette ADR décide) : le §5.6 tel quel, plus le retrait.
- **Demandé** : une file, deux écrans, un état de plus dans chaque policy. C'est P3 rallongée
  d'une demi-phase.
- **Libre, mais `followers` retirée des portées offertes au carnet** — les entrées gardent
  `private`, `shared` et `public`, le fil garde `followers` pour les publications, qu'on écrit en
  sachant qu'elles sont publiques d'intention. La donnée art. 9 reste alors dans un carnet dont
  l'audience est **toujours nommée**, et l'audience vivante ne s'applique qu'à ce qu'on a écrit pour
  être lu. C'est l'option que l'ADR 0004 disait préférer avant l'arbitrage du 22 août ; elle
  redevient disponible maintenant que `followers` a un autre endroit où servir.

Rien dans P3 ne se bloque sur cette réponse : les trois variantes s'écrivent au-dessus du même
schéma, et la troisième ne coûte qu'un `CHECK` et un choix de moins à l'écran.

**Second point, plus petit et déjà appliqué par défaut** : clubs, événements et messagerie (§5.6,
F7) ne sont **pas** dans cette livraison. Le §9 borne P3 à « profils, follows, feed, publications,
braises, commentaires », et son critère de sortie ne parle que du fil. Les trois sont des tables et
des écrans à part entière ; les livrer ici retarderait P4 sans rien fermer. À me dire si l'un des
trois est attendu en v1 — chacun vaut sa propre ADR, la messagerie plus que les deux autres, parce
qu'un message privé sur une donnée art. 9 n'a pas le même régime qu'une publication.
