# 0006 — Faire de « fumer depuis la cave » un seul geste, et du stock une somme d'événements

- **Statut** : **Acceptée** le 22 août 2026
- **Date** : 2026-08-22
- **Décideur** : @jgueniche
- **Concerne** : P2 (cave, critère de sortie) · P3 (`privacy.show_humidor`) · P11 (statistiques)
  · `public.humidors` · `public.humidor_items` · `public.humidor_events` · `public.humidor_readings`
  · `public.reviews` · ADR 0004

## Contexte

Le §5.5 du brief donne quatre tables et cinq fonctions dérivées. Le §9 donne à P2 un critère de
sortie qui ne parle ni de schéma ni d'écran : « **créer une dégustation et décrémenter la cave de
bout en bout** ». La dégustation existe depuis la PR #7. La cave n'existe pas. Le critère porte
donc entièrement sur la colonne que le §5.5 écrit en une ligne : `humidor_events.review_id`.

Quatre faits cadrent la décision, et aucun n'est négociable.

**1. PostgREST n'offre pas de transaction sur deux tables.** Une Server Action qui écrit l'entrée
de carnet puis l'événement `smoke` fait deux requêtes HTTP, donc deux transactions. Entre les deux,
tout peut échouer. Le dépôt connaît déjà ce demi-résultat : `saveTasting()` écrit la dégustation
puis ses tiers, et l'assume — « une dégustation sans ses tiers est un demi-résultat lisible :
l'entrée existe, porte ses notes, et les tiers se retapent ». Le raisonnement tient parce que la
perte est **visible et réparable par la personne**.

**2. Un stock faux ne se voit pas.** C'est la différence avec les tiers. Une cave qui affiche 8
là où il en reste 7 ne ressemble pas à une erreur : elle ressemble à une cave. Personne ne
re-saisit ce qu'il ne sait pas manquant, et l'écart ne se découvre qu'en comptant les cigares à la
main — c'est-à-dire en faisant ce que la cave promettait d'éviter.

**3. `service_role` est hors de portée d'une Server Action, et c'est une bonne nouvelle.**
`lib/CLAUDE.md` n'ouvre la clé secrète qu'à `app/api/**`, et l'unique exception — le
rafraîchissement de `cigar_stats` — est un module posé *dans* la frontière permise, pas un
élargissement de la règle. Faire écrire la cave par la clé de service reviendrait à sortir la
portée des entrées de la RLS, ce que l'ADR 0004 interdit explicitement.

**4. `reviews` a vingt-quatre colonnes, et va en gagner.** P3 y branchera `followers`, P11 y lira
`smoked_on`. Toute construction qui recopie cette liste de colonnes ailleurs devient un second
schéma, qui dérive au premier `alter table` que personne ne pense à répercuter.

## Options

### Pour l'atomicité (D1)

**A — Deux requêtes, demi-résultat assumé.** La Server Action insère l'entrée, puis l'événement.
*Coût :* le fait 2. Le demi-résultat est invisible, et c'est précisément le stock — la seule chose
que la cave existe pour tenir.

**B — Une fonction `SECURITY DEFINER`, sur le modèle de `file_report()`.** Un appel, une
transaction.
*Coût :* `SECURITY DEFINER` contourne la RLS, donc la fonction doit re-vérifier elle-même à qui
appartiennent l'entrée, l'article et la cave. Trois vérifications que quatre policies font déjà,
réécrites à un endroit où plus rien ne les surveille. `file_report()` a payé ce prix parce que
`mod` n'est **pas accessible autrement** : `service_role` n'y a aucun droit de table. Ici la
contrainte n'existe pas — `public.reviews` et `public.humidor_events` sont l'une et l'autre
parfaitement écrivables par `authenticated`. Payer une frontière de sécurité pour une commodité de
transaction serait le mauvais échange.

**C — Une fonction `SECURITY INVOKER`.** Un appel PostgREST est une transaction ; une fonction
`plpgsql` en droits d'appelant y écrit les deux lignes **sous la RLS de la personne connectée**.
*Coût :* une fonction de plus dans le schéma exposé, et une signature à tenir.

**D — Un trigger sur `reviews`.** Écrire l'entrée déclencherait l'événement.
*Coût :* le trigger ne sait pas de quel article de quelle cave il faudrait décompter, et une entrée
de carnet écrite depuis une fiche cigare ne décompte rien. Il faudrait lui passer l'article par une
colonne de `reviews`, c'est-à-dire salir le carnet d'une notion de cave. L'ADR 0004 a écarté la
référence polymorphe dans ce sens-là ; l'accepter dans l'autre serait la même faute retournée.

### Pour le stock (D3)

**E — `qty` est une somme, calculée à la lecture.** Aucune colonne, un `sum()` sur les événements.
*Coût :* toute lecture d'inventaire devient une agrégation, et la contrainte de capacité du §5.5
(`humidors.capacity`) devient une course : deux ajouts simultanés lisent la même somme.

**F — `qty` est une colonne que le code appelant met à jour.** Le §5.5 l'écrit ainsi.
*Coût :* deux sources de vérité qui divergent au premier chemin de code qui oublie l'une des deux.
C'est ce que le prompt de reprise nomme « pas les deux au choix du code appelant ».

**G — `qty` est une colonne dénormalisée qu'un trigger tient, et que personne d'autre n'écrit.**
*Coût :* un trigger de plus, et une colonne qui ment si le trigger est désactivé.

## Décision

**Un geste utilisateur qui touche deux tables est une fonction `SECURITY INVOKER` ; un stock est la
somme de ses événements, tenue par un trigger et retirée de tout `GRANT UPDATE`.**

### D1 — `public.smoke_from_humidor()`, en droits d'appelant

Option **C**. La fonction insère l'entrée de carnet et l'événement `smoke` dans la même
transaction, et **n'a aucun privilège** : ses deux `insert` sont soumis à `reviews_insert_own` et
à `humidor_events_insert_own` exactement comme s'ils venaient du client. La RLS reste seule juge,
donc l'ADR 0004 tient sans exception, et il n'y a rien de neuf à surveiller — la fonction ne peut
littéralement pas écrire ce qu'un membre ne pourrait pas écrire à la main.

Elle prend six paramètres, tous du geste quotidien : l'article, la quantité, la date, la portée,
la note, le mot. **Elle ne prend pas la dégustation.** Le fait 4 l'interdit : une fonction qui
recopierait les vingt-quatre colonnes de `reviews` serait un second schéma. La dégustation garde
donc son chemin actuel — le formulaire du §5.4 —, et le lien vers la cave s'y fait par un second
appel, dans cet ordre :

1. la dégustation est écrite (**c'est l'engagement**) ;
2. l'événement `smoke` la référence.

Si le second échoue, la dégustation existe et la cave n'est pas décomptée. Contrairement au
fait 2, **cet écart-là est visible** : l'entrée porte alors la mention « pas encore décomptée de
votre cave » et le bouton qui le fait, en un appel atomique cette fois. C'est le demi-résultat des
tiers, avec la propriété qui le rendait acceptable — on voit ce qui manque.

L'ordre inverse serait le mauvais : un stock décrémenté sans entrée retire un cigare que rien ne
raconte.

### D2 — Ce qui sort de la cave entre dans le carnet en `private`

La portée par défaut de l'entrée créée par la cave est `private`, celle de `reviews.visibility`,
au titre de l'art. 25 comme l'écrit l'ADR 0004. Le sélecteur de portée est le **même composant**
que celui de la fiche cigare, avec ses quatre options et ses avertissements — pas une case
« publier » posée à côté. Fumer depuis sa cave n'ouvre aucune porte que le carnet ferme, et
n'invente aucune porte que le carnet n'a pas.

Une seconde conséquence s'est révélée en écrivant le premier test, et elle mérite d'être ici plutôt
que dans un commentaire : **fumer depuis la cave n'écrit une entrée que si on a quelque chose à
dire.** `reviews_log_says_something` exige une note ou un mot, et le commentaire de la migration
0003 disait déjà pourquoi — « sans cela, *j'ai fumé ce cigare* est une ligne vide avec une date ».
La cave est exactement ce qui rend cette ligne inutile : l'événement `smoke` porte déjà le cigare,
le jour et le lot.

Exiger une note pour décompter un stock produirait l'une de deux choses, jamais autre chose : des
notes inventées, ou des cigares fumés que la cave ignore. Ni l'une ni l'autre n'est un inventaire.
`smoke_from_humidor()` rend donc `null` quand rien n'a été noté — ce que l'appelant lit comme « il
n'y a pas d'entrée à ouvrir », et non comme un échec. Les deux lignes s'écrivent ensemble ou aucune
ne s'écrit ; c'est le nombre de lignes qui varie, jamais la transaction.

Conséquence non évidente, et c'est elle qui vaut d'être écrite : **la cave est privée, l'entrée ne
l'est pas parce que la cave l'est.** Les deux privautés sont indépendantes. `privacy.show_humidor`
gouverne qui voit *l'inventaire* ; `reviews.visibility` gouverne qui lit *l'entrée*. Une entrée
publique écrite depuis une cave privée est un cas normal, pas une fuite : elle dit qu'on a fumé ce
cigare, jamais qu'on en a sept autres.

### D3 — `humidor_items.qty` : option **G**, avec la nuance qui la rend applicable

Le trigger sur `humidor_events` est le seul écrivain de `qty` après la naissance de l'article.
La colonne est **hors de tout `GRANT UPDATE`**, comme `reviews.user_id` et `comments.hidden_at`
avant elle — barrée par les droits, pas par une convention.

Elle est en revanche **dans le `GRANT INSERT`**, et la distinction est toute la décision :
déclarer ce qu'on vient d'acheter en créant le lot est un *inventaire d'ouverture*, pas une mise à
jour de stock. Un trigger `after insert` sur `humidor_items` en tire l'événement `add`
correspondant, si bien que le grand livre est complet dès la première ligne et que l'ajout reste
**une seule requête** — donc atomique par construction, sans fonction.

C'est exactement le motif que `reviews` utilise déjà pour `user_id` : dans le grant d'insertion,
hors du grant de mise à jour. Ce qu'on déclare en naissant n'est pas ce qu'on modifie ensuite.

Signes, une fois pour toutes : `qty` est un **compte positif de cigares**, et c'est le *type* qui
porte le signe. `add` ajoute, `smoke`, `gift` et `loss` retirent, `adjust` est le seul signé — il
existe pour dire « j'en ai compté deux de moins que le grand livre », ce qu'aucun autre type ne
sait exprimer. `move` ne change aucun compte : il enregistre qu'un lot a changé de cave, ce qu'un
`update` de `humidor_items.humidor_id` fait, et qu'un trigger consigne.

### D4 — Les policies anticipent `show_humidor` en ne le mentionnant pas

`privacy.show_humidor` vaut `false` par défaut. En v1 la cave est donc **strictement
propriétaire** : une seule policy `select` par table, `user_id = auth.uid()`.

P3 ajoutera la lecture par un tiers. Elle l'ajoutera comme une **policy de plus**, jamais comme
une modification de celle-ci — c'est la leçon des quatre policies `select` de `reviews`, dont
`supabase/CLAUDE.md` dit qu'il ne faut pas les recoller.

Un piège est à consigner maintenant, parce qu'il se découvrira au pire moment sinon :
**`profile_settings` est lisible de son seul propriétaire.** Une policy sur `humidors` qui lirait
`privacy->>'show_humidor'` chez *quelqu'un d'autre* ne renverra jamais rien — pas une erreur, un
silence, donc une cave qu'on a choisi de montrer et qui reste invisible. La branche de P3 aura
besoin d'un accesseur `SECURITY DEFINER`, comme `current_app_role()` et `owns_review()` avant
elle. C'est la troisième occurrence du même motif dans ce dépôt ; la nommer d'avance est moins
cher que la débusquer.

### D5 — Les cinq fonctions dérivées du §5.5 sont des lectures, pas des colonnes

Âge de vieillissement, maturité, valorisation, alertes de rotation : chacune se déduit de
`aging_start_date`, `purchase_price_eur` et `qty`. Aucune ne devient une colonne, parce qu'aucune
n'est un fait — ce sont des fonctions du temps qu'il est, et une colonne qui dépend de
`current_date` est fausse dès le lendemain de son écriture. Elles vivent dans une vue
`security_invoker`, qui hérite de la RLS des tables qu'elle lit.

## Conséquences

**Ce que l'on accepte.**

- Une fonction de plus dans le schéma exposé à PostgREST. Elle est en droits d'appelant, donc
  elle n'élargit aucune frontière — mais elle est une signature à maintenir, et un paramètre
  ajouté est une migration.
- Le chemin dégustation → cave reste en deux écritures. On paie cet écart par un état visible dans
  l'interface plutôt que par une garantie du moteur.
- `qty` peut mentir si son trigger est désactivé. L'auto-contrôle de la migration vérifie qu'il
  existe et qu'il est actif ; `supabase/tests/07_cave_rls.sql`, qui n'accorde rien, le revérifie
  depuis l'extérieur — un auto-contrôle ne peut pas attraper ce que sa propre migration vient
  d'établir.

**Ce que cela interdit désormais.**

- Écrire `humidor_items.qty` depuis le code applicatif. Le grant refuse ; il n'y a pas à s'en
  souvenir.
- Ajouter une colonne à `reviews` pour y ranger une notion de cave. Le lien est
  `humidor_events.review_id`, dans ce sens et dans celui-là seul.
- Recopier la liste des colonnes de `reviews` dans une fonction SQL.
- Filtrer une visibilité en TypeScript, ici comme ailleurs (ADR 0004).

## Quand rouvrir

- **Si le demi-résultat du chemin dégustation se produit pour de vrai plus d'une fois par
  centaine de dégustations enregistrées**, l'argument « visible donc acceptable » ne tient plus :
  il faudra une fonction qui prenne la dégustation, et donc accepter le fait 4 avec un test qui
  compare la signature de la fonction aux colonnes de la table.
- **Si `humidors.capacity` doit devenir une contrainte dure** — refuser l'ajout au-delà de la
  capacité — l'option E redevient tentante pour sa cohérence transactionnelle. Elle reste
  mauvaise : la contrainte s'écrit sur le trigger de `qty`, qui voit déjà la somme.
- **Si P3 donne aux caves une lecture par des tiers plus fine que « tout ou rien »** — par
  exemple par liste nommée, comme `review_shares` —, `show_humidor` cesse d'être un booléen et
  cette ADR est remplacée.

## Question ouverte

Le §5.5 prévoit `humidor_readings.source = 'device'`, donc des relevés poussés par un capteur.
Un capteur n'a pas de session Supabase : il lui faudrait une clé, donc une porte que la v1 n'a
pas. **La v1 ne livre que `manual`**, l'enum garde `device` pour ne pas migrer deux fois, et
aucune route n'accepte de relevé automatique. Si l'intention est d'y brancher un hygromètre
connecté avant P8, c'est une ADR à part — celle de l'authentification d'un appareil, qui n'a rien
à voir avec la cave.
