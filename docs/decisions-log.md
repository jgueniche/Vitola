# Journal des micro-décisions

Ce qui ne mérite pas une ADR mais qu'il faut pouvoir retrouver. Ordre antichronologique.

## Clubs, agenda, messagerie — et un `upsert` qui ne pouvait pas marcher

### Ce qui est livré

L'ADR 0010 avant la première ligne de SQL, puis deux migrations — `0014` les cinq
tables, `0015` la boîte de réception en un appel. Dix-neuf assertions SQL, trente
tests unitaires sur les bornes et le slug, six sur l'heure murale, et un parcours
navigateur avec deux comptes qui nettoie derrière lui.

Cinq écrans : `/clubs`, `/clubs/[slug]`, `/evenements`, `/evenements/[id]`,
`/messages` et `/messages/[id]`.

### La décision qui n'était dans aucune option

**Un message n'est pas chiffré de bout en bout, et la plateforme peut le lire.**
Personne ne l'avait demandé, et elle ne se choisit pas : l'article 16 du DSA veut
qu'un contenu signalé soit examinable, donc `public.messages` entre dans les
cibles de `mod.reports`, un modérateur a une policy `SELECT` dessus, et la
politique de confidentialité le dit en toutes lettres. Une messagerie qui
laisserait croire le contraire serait pire qu'une messagerie franche.

### Cinq décisions qui ne méritaient pas d'ADR

**Une conversation a exactement deux personnes, en colonnes ordonnées.** Aucune
contrainte ne sait compter des lignes, donc une table de jonction n'aurait pas pu
exprimer « exactement deux » — et chacune des questions qui découlent de N
participants (qui ajoute, que voit un arrivant, que devient une conversation à
une personne) est une décision sur de la donnée que le §2 range possiblement à
l'article 9. `member_a < member_b` rend la paire canonique : « la conversation
entre X et Y » est une lecture, pas une recherche.

**Un club n'a pas de fil.** `posts` ne gagne pas de `club_id`, parce qu'une
colonne qui décide d'une audience doit garder un seul sens et que `visibility` en
aurait eu deux selon qu'une autre colonne est nulle. Un club est un groupe et un
calendrier ; ce qu'on y écrit se lit dans le fil du site.

**Le lieu d'un événement est une chaîne, pas un `venue_id`.** P5 apporte les
lieux ; une colonne que rien ne remplit et qu'aucune policy ne lit est ce que
l'ADR 0007 a déjà refusé pour `posts`. La migration se fera en une requête.

**Ouvrir une conversation ne la marque pas lue.** `read_at` est visible de
l'expéditeur : un accusé de lecture déclenché par le préchargement d'un lien
mentirait sur quelqu'un. C'est un bouton, et répondre le fait aussi — répondre
est la preuve.

**« Complet » n'empêche rien, et le dit.** Aucun `CHECK` ne peut comparer un
compte à la colonne d'une autre ligne, donc la limite de places est une courtoisie
d'interface. L'écrire sans le dire aurait été une promesse que rien ne tient.

### Deux bugs trouvés dans un navigateur, pas dans un type

**Un `upsert` PostgREST demande l'UPDATE sur toutes les colonnes de sa charge.**
`event_attendees` accorde `insert (event_id, user_id, status)` et `update (status)`
seulement — une réponse ne déménage pas vers un autre événement. Un upsert devient
`… do update set event_id = excluded.event_id, …`, donc `42501`. Et comme une
écriture refusée **rend zéro ligne au lieu de lever**, l'écran se repeignait sur
« 0 personnes viennent », sans message nulle part. Le geste correct sous des droits
de colonne est `update` puis `insert` si rien n'a bougé. Trouvé au deuxième clic.

**Un `datetime-local` rend une heure murale sans fuseau.** PostgREST tourne en
UTC : une dégustation annoncée à 20 h en juillet s'enregistrait à 22 h de Paris,
en silence, sur le seul champ autour duquel les gens organisent une soirée.
`fromBrandZoneWallClock()` mesure le décalage à l'instant lui-même, donc il suit
l'heure d'été. Le parcours saisit 20:00 et exige de relire 20:00.

### Et un piège de parcours, pour la prochaine fois

**Une Server Action qui redirige rend la main avant que le routeur ait navigué.**
`page.url()` lu après 900 ms rendait encore `/messages` : tout le reste du parcours
visitait ensuite la boîte de réception en croyant lire une conversation, et deux
assertions étaient rouges sur un produit qui marchait. On attend l'**adresse**
(`waitForURL`), jamais un délai.

### Ce qui reste ouvert

`public.conversations` n'a **aucun droit DELETE**, pour personne : la rétention
est la question ouverte de l'ADR 0010, et ouvrir la suppression l'aurait tranchée
par accident. Conséquence pratique : une conversation vide survit à un parcours et
se retire depuis un contexte privilégié.

---

## P3 — le fil, et cinq bugs dont quatre étaient verts

### Ce qui est livré

L'ADR 0007 avant la première ligne de SQL, puis quatre migrations — `0010` le
schéma social, `0011` les trois clés de confidentialité, `0012` et `0013` deux
corrections de la 0010 trouvées en parcourant. Trente-deux assertions SQL, vingt
tests unitaires sur le curseur et les bornes, **soixante-six assertions de
parcours** contre la vraie base avec deux comptes, et le nettoyage vérifié à
zéro ligne.

Les trois dettes que la phase attendait sont refermées : la branche `followers`
de `reviews` existe, `show_humidor` ouvre une cave sans ouvrir son grand livre,
`show_reviews` et `show_country` sont lus par un écran de profil.

### Cinq décisions qui ne méritaient pas d'ADR

**Le fil est un lien, jamais un défilement infini.** Le §5.6 l'interdit ; ce qui
n'était pas écrit, c'est pourquoi un lien est mieux qu'un bouton « charger la
suite ». Trois raisons, dans l'ordre où elles comptent : il survit à un
rafraîchissement, il se partage, et **le curseur est lisible dans la barre
d'adresse** — donc une page qui commence au mauvais endroit est un bug qu'on
voit plutôt qu'un bug qu'on instrumente.

**Une publication ne peut être ni privée ni partagée.** Un `CHECK` sur deux
valeurs plutôt que quatre. Publier, c'est s'adresser à quelqu'un ; écrire pour
soi, c'est le carnet, et c'est déjà ce qu'il fait par défaut. Quelqu'un voudra un
brouillon de publication ; il n'y en a pas, et c'est un refus assumé plutôt
qu'une fonctionnalité manquante.

**Trois portes d'entrée pour trois gestes, chacune près de son objet.** Le
composeur de `/fil` écrit une note ou une question ; « je fume ce cigare » part
de la fiche, parce que `posts_session_has_cigar` veut un cigare et qu'un champ
qui le demanderait par identifiant demanderait de taper un uuid ; « publier au
fil » part de l'entrée de carnet, où son audience est déjà à l'écran.

**Deux tables du §5.6 changent de nom.** `reactions` devient `post_reactions`,
`comments` devient `post_comments` — `public.comments` est pris par l'ADR 0005 et
porte les commentaires de fiche, publics par construction. Une table pour les
deux aurait mis deux régimes de visibilité dans une seule policy.

**Le blocage est asymétrique sur `profiles` et symétrique partout ailleurs.**
Ce n'est pas une nuance : voir la 0012 plus bas.

### Trois mesures qui ont changé le code

Chacune a été prise sur 50 000 publications synthétiques, en local, avant de
croire quoi que ce soit.

1. **`feed_page()` écrite en une requête paramétrée : 258 ms.** Le planificateur
   ne peut prouver aucune branche d'un `or` dont la portée est un paramètre, donc
   il abandonne `posts_public_keyset_idx` — dont le prédicat partiel est
   justement `visibility = 'public'` — et trie la table entière pour rendre vingt
   lignes. Deux requêtes statiques derrière un `if` plpgsql : **2,5 ms**.
2. **Le fil des abonnements : 600 ms.** Un `exists` sur `follows` avec un
   `order by` global n'a aucun index à suivre, `posts_author_keyset_idx`
   commençant par l'auteur. Un `LATERAL` par personne suivie fait dépendre le
   coût du nombre d'abonnements et non du nombre de publications du site :
   **4 ms**.
3. **`blocks_between(author_id)` dans une policy : 2 420 appels pour vingt
   lignes.** Un prédicat s'évalue par ligne examinée. La même règle rendue sous
   forme de **tableau**, enveloppée dans un `(select …)`, s'évalue une fois par
   requête en InitPlan — le geste exact de `(select auth.uid())` de la 0003.
   **27 ms de moins par page.**

Et la mesure qui compte pour le §9 : après avoir parcouru 10 000 lignes, la page
suivante coûte **1,4 ms**. Un keyset est plat en profondeur ; c'est toute sa
raison d'être, et c'est ce qu'un `offset` ne sait pas faire.

### Les bugs, et ce qu'ils ont en commun

Cinq, dont **aucun** n'était visible d'un compilateur, de 270 tests unitaires ou
de 32 assertions SQL. Quatre ont été trouvés en ouvrant une page ; le cinquième
a été trouvé en **nettoyant** derrière une page.

**1. Une publication publique sur une entrée réservée était acceptée.** La
policy comparait `r.visibility = visibility` : `reviews` a une colonne de ce nom,
donc PostgreSQL résout d'abord dans la portée la plus interne, et la condition
comparait la colonne à elle-même. Toujours vraie. Attrapée par l'assertion P3, et
par relecture jamais — l'expression est correcte à l'œil.

**2. Un blocage était définitif.** `profiles_block_restrictive` cachait le profil
dans les deux sens ; le seul écran portant « Débloquer » est ce profil. Trouvé en
bloquant quelqu'un et en cherchant comment revenir en arrière. La 0012 rend le
prédicat directionnel **sur `profiles` seulement** : celui qui bloque voit
toujours sa cible, jamais son contenu. Cacher à quelqu'un l'objet de sa propre
décision ne protège personne.

**3. Une publication réservée aux abonnés répondait 404 à son adresse.**
`getPost()` demandait au fil une page d'une ligne avec la portée `discover`, en
raisonnant que c'était la plus large et que la RLS déciderait. Faux :
`discover` filtre `visibility = 'public'` **dans le corps de la fonction**, et ce
filtre dit de quel onglet on parle, pas qui a le droit de lire. Personne ne
pouvait ouvrir la page, donc personne ne pouvait supprimer la publication — et
c'est ainsi qu'il est apparu : **trois d'entre elles survivaient à chaque
exécution du parcours**, visibles seulement en comptant les lignes en base. La
0013 ajoute `post_card()`, qui n'a aucun prédicat d'audience.

**4. Le bouton braise s'annonçait « Aucune braise ».** Un `aria-label`
**remplace** le nom accessible : le contrôle nommait un compte là où un bouton
doit dire ce qu'il fait. Seule une assertion cherchant le contrôle par son rôle
pouvait le voir ; à l'œil, la page était parfaite.

**5. Ouvrir une cave à un tiers ouvrait son grand livre.** Les trois tables
filles ne redisent pas la propriété — elles rejoignent `humidors` par un `EXISTS`
soumis à sa RLS —, donc la policy de `show_humidor` cascadait jusqu'à « quand
cette personne a fumé quoi ». Trouvé en lisant la 0008 avant d'écrire la 0010,
et c'est le seul des cinq qui ait été attrapé avant d'exister.

Ce qu'ils ont en commun : **quatre sur cinq sont verts**. Le code compile, les
tests passent, la page s'affiche. Trois demandent d'ouvrir un écran avec un vrai
compte ; le troisième demande en plus de **ranger derrière soi** — le parcours
comptait 49 assertions vertes au moment où il laissait trois lignes en base.

### Le harnais a menti trois fois, et il est réparé

Il fallait le noter, parce qu'un parcours qui se trompe est pire qu'un parcours
absent : il rassure.

- **Une exception n'était pas un échec.** Un `finally` sortait avec zéro échec
  parce que rien n'avait été *coché* en échec : un parcours interrompu à l'étape
  8 rendait « 29 assertions, 0 échec ».
- **Une boucle d'écriture faisait confiance à un délai.** 700 ms entre deux
  publications en a perdu six sur vingt-et-une, et quinze publications
  ressemblent à une page pleine. On attend maintenant que le champ se vide —
  React 19 réinitialise le formulaire **au retour** de la Server Action, donc un
  champ vide est le signal exact que l'écriture a eu lieu.
- **Un clic sur un `<Link>` navigue côté client.** Lire `page.url()` après une
  attente fixe interroge la page qu'on vient de quitter. On lit le `href` et on
  y va.

---

## La fin de P1, et un garde-fou qui se gardait lui-même

22 août 2026 au soir. `/parametres`, le comparateur, le décodeur, la contribution wiki, le sitemap,
la carte OG, le contrôle de dérive des types. Ce qui vaut d'être retrouvé tient en six points, et
quatre d'entre eux sont des refus.

**Aucun membre n'a jamais pu modifier son profil.** Le trigger `tg_protect_profile_privileges()`
tourne en droits d'appelant — c'est ce qui lui permet de savoir qui écrit — et il commençait par
appeler `is_privileged_context()`, que la 0002 avait fermée aux clients délibérément. Un trigger en
droits d'appelant ne peut appeler que ce que l'appelant peut appeler : le garde-fou fermait la
porte qu'il surveillait. Six mois, `pnpm check` vert, 165 tests unitaires, 56 e2e. Il a fallu taper
une ville dans un formulaire. La 0009 descend le prédicat dans le trigger et retire l'auxiliaire ;
la garde générale (`tests/02_function_grants.sql`) lit désormais les **corps** des triggers, parce
que plpgsql ne déclare aucune dépendance — c'est ce qui a rendu ce bug invisible aux outils. Elle a
été vérifiée en échouant sur la base d'avant.

**Le registre de consentements n'offre aucune case, et c'est la décision.** Trois des six types ne
relèvent pas du consentement (art. 6.1.b et 6.1.c) ; l'art. 7.4 dit qu'un consentement qu'on ne
peut pas refuser n'en est pas un. Les trois autres gouvernent des traitements qui n'ont pas lieu :
demander la permission de ce qu'on ne fait pas fabrique un enregistrement, pas une permission. Un
registre plein de consentements à rien est pire qu'un registre vide, parce qu'il ressemble à de la
conformité. Ce qui est offert à la place est le retrait réel et immédiat : l'effacement.

**Le comparateur n'affiche pas « relue le ».** `verified_at` est renseigné sur les 940 fiches,
`verified_by` sur aucune : l'horodatage vient de la publication. 862 de ces fiches n'ont jamais été
lues. Aucun écran ne montrait cette colonne ; celui-ci aurait été le premier à affirmer une
relecture qui n'a pas eu lieu. La colonne est laissée telle quelle — dépublier est une décision du
propriétaire — mais elle n'est pas répétée.

**Le décodeur ne devine pas une usine.** Trois lettres inconnues sont dites inconnues. Les sigles
cubains ont été modifiés à dessein plusieurs fois et `PROVENANCE.md` les donne en confiance faible ;
habiller une supposition de la même typographie qu'un fait est ce qui fait cesser un référentiel
d'en être un.

**`og:image` pointait sur `http://localhost:3000`**, dans un build de production, sur toutes les
pages : `metadataBase` n'était pas posé. Et la carte elle-même était derrière le portail, donc ne
s'affichait jamais — un 307 vers `/majorite`. Les deux se voient en lisant le HTML rendu ; aucun des
deux ne se voit en lisant le code. La carte est unique, posée à la racine, et ne nomme jamais un
cigare : une carte par fiche aurait publié une marque à tous ceux qui n'ont pas franchi le portail.

**Une action qui fait disparaître son formulaire ne peut pas rendre de confirmation.** Accepter une
proposition la retire de la file, donc le composant qui tenait l'état de retour est démonté dans le
même rendu : l'écriture aboutissait et le relecteur ne voyait rien. Une décision navigue désormais,
et la confirmation vit dans l'URL. Corollaire adopté partout : une confirmation porte
`role="status"` — ce qu'elle doit être de toute façon pour un lecteur d'écran, et ce qui donne enfin
aux parcours quelque chose d'univoque à attendre. Ils attendaient le mot « enregistré » dans le
texte de la page et le trouvaient dans sa prose ; trois écritures refusées ont été lues comme des
succès.

## La cave, et le geste qui ferme P2

22 août 2026, seconde moitié de P2. La dégustation existait depuis la PR #7 ; le critère de sortie
du §9 — « créer une dégustation et **décrémenter la cave** de bout en bout » — non. Huit décisions
valent d'être retrouvées, et trois d'entre elles ont été prises par un navigateur.

**L'atomicité n'a coûté aucun privilège.** L'ADR 0006 tranche pour une fonction `SECURITY
INVOKER` : un appel PostgREST est une transaction, et les droits d'appelant laissent la RLS
décider des deux `insert`. La tentation était `SECURITY DEFINER`, sur le modèle de
`file_report()` — mais celle-là a payé une frontière de sécurité parce que `mod` est injoignable
autrement, ce qui n'est pas le cas ici. Acheter une transaction ne demande pas d'acheter un
privilège, et confondre les deux est le raccourci qu'on regrette deux migrations plus tard.

**Fumer sans rien noter n'écrit pas d'entrée**, et ce n'est pas une simplification : c'est le
premier test SQL qui l'a imposé. `reviews_log_says_something` refuse une entrée sans note ni mot,
et le commentaire de la migration 0003 disait déjà pourquoi — « *j'ai fumé ce cigare* est une ligne vide avec
une date ». La cave est exactement ce qui rend cette ligne inutile. Exiger une note pour
décompter un stock aurait produit des notes inventées ou des cigares que la cave ignore ; ni l'un
ni l'autre n'est un inventaire.

**`qty` est dans le `GRANT INSERT` et dans aucun `GRANT UPDATE`.** Déclarer ce qu'on vient
d'acheter est un inventaire d'ouverture, pas une mise à jour de stock — et c'est ce qui permet à
l'ajout de rester **une seule requête** : un trigger `after insert` en tire l'événement `add`.
Même motif que `reviews.user_id` avant lui. Le trigger de stock recalcule ensuite par la **somme**
des événements et non par un delta : un compteur incrémental se trompe une fois et ment ensuite
pour toujours, là où une somme se répare toute seule au mouvement suivant. Asserté par V16.

**Un lot par achat, jamais un lot par cigare.** Cinq Robusto achetés aujourd'hui font une seconde
ligne à côté des trois de l'an dernier. Fusionner ferait une moyenne d'âge que personne n'a
vieillie, et le §5.5 demande l'âge de vieillissement.

**La contrainte de vieillissement était à l'envers, et seul un navigateur pouvait le dire.**
`aging_start_date >= purchase_date` a été écrite, appliquée, testée verte — puis retirée le jour
même en rangeant une boîte achetée vieillie. Un module de 2019 acheté aujourd'hui *se repose
depuis 2019* ; la contrainte obligeait à le rajeunir de six ans, c'est-à-dire à falsifier le seul
chiffre que la fonctionnalité existe pour montrer. Aucun test unitaire ne l'aurait vue : la
contrainte était cohérente, elle était simplement fausse. Ce qui reste refusé — une date future —
ne peut pas être un `CHECK` (`current_date` y est interdit, leçon de la 0001) et vit dans Zod.

**`page.request` ne porte pas les cookies du contexte.** Mesuré : il prend un 307 vers le portail
même sur `/cave`. Un export CSV testé par là échoue pour une raison qui n'existe pas dans un
navigateur. Ce qu'une personne fait, c'est **cliquer**, et ce qui arrive, c'est un téléchargement :
`page.waitForEvent('download')`, puis lire le fichier sur le disque.

**Une assertion qui lit la page une fois court après le serveur.** Une Server Action renvoie
*avant* que le rendu de `revalidatePath` n'arrive. Deux assertions ont échoué sur un produit qui
marchait, et une troisième a réussi pour rien — `contains(texte, '5')` trouvait « 0 / 50 ». Les
parcours attendent maintenant le texte au lieu de le lire.

**Le refus qui compte est celui d'une demande périmée.** Le navigateur borne la quantité à ce qui
reste, donc le message du serveur n'apparaît jamais par le chemin normal. Il apparaît quand un
panneau reste ouvert pendant qu'un autre onglet vide le lot — et c'est le seul cas que ni le
compilateur, ni les 193 tests unitaires, ni les 56 e2e ne peuvent atteindre. Le parcours le met
en scène avec deux onglets.

## Le carnet à l'écran, et trois bugs qu'aucun build ne pouvait voir

P2 commencée le 22 août 2026. L'ADR 0004 était acceptée depuis le matin et rien ne l'appliquait :
`reviews`, `review_shares`, `review_thirds`, `aroma_taxonomy` et `cigar_stats` existaient, avec
leurs policies et leurs index, et zéro ligne — parce qu'aucun écran ne permettait d'en écrire une.

### Ce qui est livré

Le geste quotidien sur la fiche cigare (`kind='log'` : une note **ou** un mot), l'exercice à
`/cigares/[slug]/degustation` (`kind='tasting'` : six critères, trois tiers, roue des arômes,
minuteur, à l'aveugle), `/carnet` et `/carnet/[id]` pour relire, filtrer, modifier, repartager et
supprimer, la bascule /100 ↔ /20 du §5.4, et `cigar_stats` sur la fiche.

### Trois décisions qui ne méritaient pas d'ADR

**Les six sous-notes sont sur 10, et la note globale en est la moyenne — elle ne se saisit pas.**
Le §5.4 donne les deux colonnes sans dire comment elles s'articulent. Une note globale surchargeable
ferait des six critères une décoration ; c'est exactement la différence que l'ADR 0004 trace entre le
carnet et la dégustation, rendue visible. Sur 10 plutôt que sur 100 parce que six champs demandant
chacun un nombre entre 0 et 100, ce sont six occasions d'inventer une précision qu'on n'a pas : un
tirage n'est pas un 84/100, c'est un 7 ou un 8.

**L'URL est `/carnet`, pas `degustations/`.** L'arborescence de P0 nommait la section avant que
l'ADR 0004 ne fusionne le geste et l'exercice dans une seule table. `carnet` est le mot du produit ;
`degustation` reste le segment de l'exercice sur un cigare, et `degustations` le pluriel dont le
profil public de P3 aura besoin. Les trois vivent dans `lib/routes.ts`.

**Le brouillon d'une dégustation vit dans `localStorage`, pas dans une ligne.** `reviews` n'a pas de
colonne `status` et `reviews_tasting_has_structure` refuse un `scores` vide : une dégustation à
moitié tapée n'a nulle part où exister en base. Lui ajouter un statut mettrait du texte inachevé sur
la consommation de tabac de quelqu'un dans une table que l'export RGPD parcourt et que la file de
modération peut viser — pour rien, puisque personne d'autre que l'auteur ne lirait ce brouillon.
L'interface le dit en toutes lettres : « elle ne quitte pas votre navigateur ». C'est une promesse
honnête et bon marché à tenir, et sa limite — un brouillon ne suit pas d'un téléphone à un portable —
est écrite plutôt que cachée.

Deux conséquences techniques valent d'être notées, parce qu'elles se représenteront. Le brouillon
est restauré par `useSyncExternalStore` : lire `localStorage` pendant le rendu fait diverger le
serveur et le client, et le lire dans un effet est ce que `react-hooks/set-state-in-effect` interdit
— le hook est fait pour exactement cette forme. Et le formulaire est **keyé sur l'instant
d'ouverture** du brouillon, pas sur sa dernière sauvegarde, faute de quoi chaque frappe remonterait
le formulaire en emportant le curseur.

**Le rafraîchissement de `cigar_stats` à l'écriture vit sous `app/api/`, sans y répondre à rien.**
`refresh_cigar_stats()` n'est accordée qu'à `service_role`, donc l'appeler veut dire importer la clé
de service, et ESLint ne l'autorise que depuis `app/api/**`. Cette règle a précisément été élargie à
`app/**/*.ts` pour empêcher une Server Action d'aller chercher cette clé : la façon honnête de
satisfaire les deux est de mettre l'appel là où la clé est déjà permise, dans un dossier privé Next
(`app/api/_stats/`) que le routage ignore, plutôt que de percer un trou de plus dans le garde-fou.
L'alternative — accorder la fonction à `authenticated` — évitait le détour et valait bien pire :
`REFRESH MATERIALIZED VIEW` travaille sur la vue entière, et un membre qui peut l'appeler à volonté
peut occuper la base à volonté.

`reviews` rejoint enfin la carte des surfaces signalables. Le commentaire de `lib/compliance/dsa.ts`
disait déjà pourquoi elle en était absente — « an entry in this map without a Signaler button is a
promise nobody can keep » — et la condition a changé : une entrée publique est un texte de membre sur
le tabac, lisible de tout visiteur passé le portail, ce que l'ADR 0005 range exactement dans ce qui
nous oblige.

### Les trois bugs, et ce qu'ils ont en commun

`pnpm check` était vert, 165 tests unitaires passaient, `pnpm build` compilait, 56 e2e passaient.
Les trois bugs ci-dessous étaient tous présents dans ce vert. Ils ont été trouvés en ouvrant le site
avec deux vrais comptes contre la vraie base — 112 assertions de parcours, dont ces trois-là.

**1. Le sélecteur de portée revenait en arrière après enregistrement, et l'enregistrement suivant
republiait l'entrée.** Passez une entrée publique à « moi seul », enregistrez, corrigez une faute,
enregistrez de nouveau : elle est publique. Rien à l'écran ne le disait. Deux causes empilées, et
c'est la seconde qui a demandé un navigateur :

- `ScopeSelector` copiait une prop dans un `useState` sans jamais la réconcilier. `useState` ne lit
  sa valeur initiale qu'au montage — le bug classique de l'état dérivé.
- **React 19 réinitialise un formulaire après le retour de sa Server Action**, et une
  réinitialisation rend à chaque champ le `defaultChecked` qu'il avait **au montage**. React
  synchronise cette valeur une fois et jamais ensuite. L'état React disait donc `private`, le badge
  deux blocs plus haut disait `private`, et seul le bouton radio du DOM mentait — or c'est lui que
  le submit suivant poste.

Instrumenté avant d'être cru : `{"prop":"private","selected":"private"}` au-dessus d'un DOM qui
lisait `public`. Corrigé en réconciliant pendant le rendu **et** en re-keyant le groupe sur la portée
enregistrée, ce qui rétablit `defaultChecked`. Sur une donnée que le §2 range possiblement à l'art.
9, une portée qui se rouvre toute seule est le pire bug que cette fonctionnalité pouvait avoir.

**2. Tout signalement d'une entrée de carnet répondait 404.** `review` avait été ajoutée à
`REPORTABLE` sans sa branche dans `isVisibleToCaller`, et la chaîne de `if` retombait sur
`ref.cigars` — qui cherchait l'identifiant d'une entrée parmi les cigares et ne trouvait rien. Un
lecteur regardant une entrée publique s'entendait dire qu'elle n'existe pas. La chaîne est devenue un
`switch` exhaustif sur l'union, avec un `never` en défaut : la prochaine surface ajoutée à la carte
ne compilera pas au lieu d'échouer en silence.

**3. La bascule /100 ↔ /20 ne faisait rien du tout.** `setScoreScale` écrivait `updated_at`, qui
n'est pas dans le `GRANT UPDATE` de `profile_settings` — il porte `(birth_date, locale, preferences,
privacy)`, et un trigger horodate le reste. L'écriture levait `42501`, le résultat n'était pas lu, et
le bouton était décoratif. C'est la famille de pièges que `supabase/CLAUDE.md` documente déjà, prise
par un troisième bout : après « une policy qui refuse ne lève pas » et « BYPASSRLS ne dit rien des
droits de table », voici **« un grant de colonne refuse une colonne qu'on n'avait pas l'intention de
changer »**.

La correction va plus loin que la colonne : l'action **lève** désormais au lieu de renvoyer une
erreur. Un refus d'écriture sur une entrée est quelque chose qu'un membre a fait — trop long, hors
bornes, pas à vous — et mérite une phrase en français. Un refus d'écriture sur une préférence est
quelque chose que **nous** avons fait, et il n'y a pas de phrase à écrire : le membre a demandé /20,
on lui doit /20.

**Ce qu'ils ont en commun** : aucun n'était visible d'un compilateur, d'un test unitaire ou d'un
parcours e2e sans base. Deux d'entre eux ne se voient même pas d'un code review attentif — le
comportement de réinitialisation de React 19 et le grant de colonne sont des faits d'exécution. C'est
la démonstration de la règle héritée de la 0007, élargie : **un écran qui écrit se parcourt une fois
avec un vrai compte avant d'être déclaré livré**, et pas seulement les endpoints qui mettent en œuvre
une obligation du §2.

### Ce qui n'a pas pu être vérifié ici

**Le rafraîchissement de `cigar_stats` à l'écriture n'a pas été exercé de bout en bout.**
`api.supabase.com` est refusé par la politique de sortie de cette session, donc aucune clé de service
n'a pu être récupérée et `createSupabaseAdminClient()` lève. Ce qui **a** été mesuré, et qui est la
moitié qui pouvait se tromper : le journal du serveur porte exactement une tentative d'appel par
écriture susceptible de bouger une moyenne publique, et aucune pour les autres — écriture privée,
partagée, abonnés : zéro ; écriture publique : une ; retour au privé : une ; suppression d'une entrée
publique : une ; modification privée → privée : zéro. `affectsPublicAverage()` est donc juste des
deux côtés, dépublier comptant autant que publier. Le rendu a été vérifié séparément, en déclenchant
`refresh_cigar_stats()` directement sur le projet : moyenne 80,8, bayésienne 80,8 — les deux se
rejoignent tant qu'il n'y a qu'une note, l'a priori étant calculé sur l'ensemble publié —, une note
publique, répartition `b80_89: 1`.

**À faire au premier déploiement** : ouvrir une fiche notée, publier une entrée et vérifier que la
moyenne bouge sans attendre les cinq minutes de `pg_cron`. C'est le seul chemin de cette livraison
qui n'a pas été parcouru en entier.

## L'export RGPD répondait 500, et personne ne pouvait le savoir

Migration 0007, appliquée le 22 août 2026, trouvée en exerçant le chemin authentifié complet contre
le projet réel — ce que la reprise de session demandait de faire une fois avec un compte de QA, et
que ce fichier notait comme jamais fait.

```
[gdpr/export] collection failed
Error: ref.cigars.created_by: permission denied for table cigars
```

**La clé de service n'avait aucun droit sur `ref`.** Pas un droit trop faible : aucun. C'est la
leçon de la 0005 prise par l'autre bout — **`alter default privileges` est par schéma, et
l'amorçage de Supabase aussi.** Supabase accorde tout à `anon`, `authenticated` et `service_role`
sur les nouvelles tables de `public` ; il ne connaît pas `ref`, créé par la migration 0001. Chaque
table de `ref` a donc reçu ses grants explicites pour les deux rôles clients, et rien pour
`service_role`, à qui personne n'avait pensé — moi compris, en écrivant l'export.

Ce qui rendait le trou invisible de partout : la lecture publique passe par `anon`, la contribution
par `authenticated`, et `service_role` contourne la RLS, donc on le suppose capable de tout.
**BYPASSRLS ne dit rien des droits de table** ; il ne les remplace pas. La CI n'a pas d'endpoint, les
tests SQL n'avaient jamais joué `service_role` sur `ref`, et le §9 ne mesure pas un export.

Deux droits n'étaient donc pas tenus, art. 15 et 17 en main :

1. `/api/gdpr/export` — 500 pour tout membre connecté. Le droit d'accès, refusé.
2. `/api/gdpr/delete` — l'effacement aboutissait, mais le décompte des révisions détruites échouait
   **sans que l'erreur soit lue** et retombait sur `0` par `?? 0`. La trace d'audit annonçait donc
   « aucune perte » là où il pouvait y en avoir. Un chiffre faux dans un journal d'audit est pire
   qu'un chiffre absent : il se lit comme un fait. Une valeur inconnue s'écrit désormais `null`.

**L'auto-contrôle d'une migration ne peut pas attraper ce qu'elle vient de corriger.** Elle accorde
puis vérifie ; son contrôle passe donc toujours. La régression future ne se voit que depuis un
fichier qui n'accorde rien : `supabase/tests/06_service_role_reads.sql`, joué en CI après toutes les
migrations. Ses deux gardes ont été vérifiées en cassant volontairement les deux cas.

**L'énoncé vérifié est plus large que le bug** : « toute table de `public` et de `ref` est lisible
par la clé de service », et non « les quatorze sources de l'inventaire le sont ». Une assertion
taillée sur l'inventaire d'aujourd'hui laisse passer la quinzième source de demain — c'est exactement
comment `02_function_grants.sql` avait manqué les deux fonctions de `ref` en filtrant sur `public`.

**SELECT seulement, et `mod` reste dehors.** L'export lit ; aucune écriture de `service_role` dans
`ref` n'est nécessaire, et une assertion échoue si un `grant all` est écrit par commodité. La porte
sur `mod` reste la fonction de la 0006, et une troisième assertion échoue si la clé de service
gagne un jour un accès direct à ces tables.

**Le contrôle porte aussi sur `public`, où il ne corrige rien.** Sur le projet réel, Supabase avait
déjà tout accordé — mais cet amorçage ne vit dans aucun fichier du dépôt, comme les trois réglages de
`docs/setup/supabase.md`. Une base reconstruite depuis `supabase/migrations/` seule échouait de la
même façon, à un schéma près. La 0007 l'écrit, et l'invariant devient vrai sur la base nue de la CI —
le seul endroit où il sera vérifié avant qu'un membre ne le découvre.

**Vérifié en HTTP réel après coup**, avec le compte `test_un` sur le projet : 200, `no-store,
private`, 22 sources dont les trois liens vers `mod`. C'est la première fois que le droit d'accès
est effectivement servi.

## Signalement DSA, commentaires à l'écran, roue des arômes

Migration 0006 et seed section 6, appliqués sur le projet réel le 22 août 2026. Ce qui manquait
pour que l'ADR 0005 soit tenue : la file existait, le délai était déclaré, **le moyen d'écrire dans
la file n'existait pas**.

**La clé de service ne suffisait pas, et c'est le point le plus contre-intuitif de la session.**
`service_role` contourne la RLS — il porte `BYPASSRLS` — donc on le croit capable de tout. Vérifié
sur le projet plutôt que supposé : il n'a **aucun droit de table dans `mod`**, seul `postgres` en a,
et `mod` n'est de toute façon pas exposé à PostgREST. Un `insert` depuis `app/api/**` n'aurait
jamais abouti, quel que soit le code écrit au-dessus. Le passage est celui que
`lib/compliance/gdpr.ts` annonçait déjà en toutes lettres — « Closing this needs a SECURITY DEFINER
RPC in public, and it ships with the reporting endpoint » : `public.file_report()`, propriété de
`postgres`, accordée à `service_role` et à personne d'autre. Le schéma reste fermé ; ce qui traverse
est une porte de la taille d'un geste.

**L'export RGPD se referme dans la même migration que celle qui ouvre le trou.** Trois liens vers
`mod` étaient déclarés `unreachable` avec, pour motif, « aucun signalement n'existe aujourd'hui ».
Cet argument meurt à la ligne où le premier signalement devient possible.
`public.moderation_records_for_subject()` les rend à leur sujet, et `PERSONAL_DATA_SOURCES` gagne
une troisième forme :
`RpcSource`. La forme `UnreachableSource` reste déclarée bien qu'elle n'ait plus d'occurrence —
c'est là que la prochaine omission devra s'argumenter.

**Le seuil de la déduplication porte sur un dossier ouvert, pas sur une cible.** Deux signalements
du même membre sur le même contenu tant que rien n'est tranché : un doublon, renvoyé tel quel. Après
décision : un nouveau dossier. L'inverse — dédupliquer sur la cible seule — fermerait la porte pour
toujours, y compris quand le contenu change après coup. Assertion S8.

**Le frein horaire vit dans la fonction SQL, faute de mieux.** Le §8 prévoit Upstash pour le rate
limiting ; il arrive en P4. En attendant, compter les lignes est le garde-fou disponible, et il ne
peut pas vivre dans la route, qui ne sait pas lire `mod`. Vingt par heure et par signalant : le
seuil vise le script, pas la personne qui signale plusieurs commentaires d'un même fil.

**`/mentions-legales` est devenue dynamique, et c'est le bon compromis.** Elle lit
`feature_flags.dsa_report_sla_hours` à chaque rendu. La page pourrait rester statique avec un client
sans cookies et une revalidation ; ce serait un délai publié potentiellement périmé, sur un engagement.
Toujours frais vaut mieux que toujours caché. La page d'accueil, elle, reste statique — c'est elle
qui porte le Lighthouse de la Q13, pas celle-ci. Le repli, lui, ne tombe jamais : `reportSlaHours()`
avale l'erreur et rend la constante épinglée, parce qu'une page juridique qui refuse de s'afficher
est une page qui a cessé en silence de prendre son engagement. Un test e2e le prouve **sans base de
données** — c'est exactement la classe de panne d'`AGE_GATE_SECRET` chez Vercel.

**Aucun filtre lexical sur les commentaires, et c'est écrit dans la charte.** L'ADR 0005 l'avait
mesuré ; `docs/editorial-guidelines.md` gagne la section « Contenu versé par des tiers » qui en tire
la règle : le critère est **l'incitation, pas le vocabulaire**. Le tableau des quatre commentaires
ordinaires refusés par `isShopTextAllowed()` y figure, avec le détail qui fait mal — le seul des six
à passer le filtre est celui qui ne dit rien de vérifiable.

**Le rafraîchissement de `cigar_stats` est planifié, pas déclenché.** `refresh_cigar_stats()`
existait depuis 0003 et rien ne l'appelait : la moyenne d'une fiche serait restée vide pour
toujours. Une tâche `pg_cron` toutes les cinq minutes est le filet — elle ne dépend d'aucun code
futur qui se souviendrait d'appeler, et elle rattrape la fenêtre de 90 jours de `review_count_90d`,
qui se périme **sans qu'aucune écriture n'ait lieu**. Le rafraîchissement à l'écriture, lui, arrive
avec le carnet : c'est le chemin qui sert la personne, et il n'a rien à servir tant que rien
n'écrit. `pg_cron` n'existe ni en local ni sur l'image de la CI ; la section se déclare absente par
un `NOTICE` et son auto-contrôle exige la planification partout où l'extension est là.

**La roue des arômes est un seed, pas une migration.** C'est du contenu éditorial : il se relit, se
corrige et se rejoue comme les CSV voisins. Conséquence non évidente — `seed.sql` écrit désormais
dans `public` et plus seulement dans `ref`, donc la base de seed de la CI doit appliquer 0003 avant
de charger. Une famille `Défaut` aussi fournie que les autres, et aucun descripteur ne nomme le
tabac : une nomenclature qui ne saurait nommer que l'agréable serait un outil promotionnel au sens
du §2.

**`/aromes` existe parce qu'un schéma sans écran ne compte pas.** Une nomenclature que personne ne
peut lire est une table, pas un vocabulaire — et les oublis d'une roue ne se voient qu'à plat,
jamais dans un CSV. Dessinée en listes et non en cercle : la forme circulaire du §5.4 appartient au
**contrôle de saisie** de la dégustation, où la géométrie travaille. Ici il n'y a rien à
sélectionner, et un cercle serait de la décoration.

**Une règle ESLint avait un trou de la taille exacte de ce qu'on écrivait.** L'interdiction
d'importer le client `service_role` couvrait `app/**/*.tsx` — pas `app/**/*.ts`. Le premier
`actions.ts` hors de `app/api` tombait précisément dedans. Jamais exploité ; un garde-fou ne se juge
pas là-dessus.

## Schéma du carnet, des commentaires et de la modération

Migrations 0003 à 0005, appliquées sur le projet réel le 22 août 2026. Elles exécutent les ADR 0004
et 0005, acceptées le même jour. Le carnet relève de P2, les commentaires de P1 — c'est l'ADR 0005
qui avance leur échéance ; les deux arrivent ensemble parce que `cigar_stats` et `comments` lisent
la même fiche.

**Une policy qui interroge une table interroge aussi ses droits.** La branche `shared` de `reviews`
lit `review_shares`, sur laquelle `anon` n'a aucun `GRANT`. Écrite en une seule policy
`to anon, authenticated`, elle faisait échouer un simple `select from reviews` en tant qu'anonyme :
« permission denied for table review_shares ». C'est-à-dire la lecture publique cassée, exactement
comme `current_app_role()` l'avait cassée en 0002 — et par le même mécanisme, un an de leçons plus
tard. Les policies sont donc découpées **par rôle** : `to anon` ne contient que la branche
`visibility = 'public'`. Elles sont OR-ées, le résultat est identique, et une branche qu'un
anonyme ne peut pas évaluer n'est jamais planifiée pour lui. Trouvé par l'assertion C4, pas en
relisant.

**Deux policies qui se lisent l'une l'autre, c'est une récursion — même sans boucle de données.**
L'ADR 0004 affirmait le contraire, en raisonnant sur le chemin d'exécution : `review_shares` lit
`reviews` pour l'auteur, `reviews` lit `review_shares` pour les destinataires, mais aucun aller-
retour réel ne semblait possible. PostgreSQL ne raisonne pas ainsi : il détecte le cycle sur le
**graphe des policies**, et refuse avec `infinite recursion detected in policy for relation
"review_shares"`. Le cycle est coupé du côté froid — partager est rare, lire est constant — par
`public.owns_review()`, en `SECURITY DEFINER`, qui ne répond que sur son appelant. Le chemin chaud
reste un `EXISTS` ordinaire servi par `review_shares_grantee_idx`. La correction est consignée dans
l'ADR, qui n'est pas réécrite pour autant : la décision tenait, c'est son mécanisme qui manquait
d'une pièce.

**`cigar_stats` est une vue matérialisée : elle n'accepte aucune RLS.** Son
`where visibility = 'public'` n'est donc pas une optimisation, c'est la frontière de sécurité
entière — même forme que le filtre par sujet de l'export RGPD. L'auto-contrôle de 0003 relit
`pg_get_viewdef()` et casse la migration si le prédicat disparaît. L'assertion C10 le vérifie par le
comportement, avec des notes choisies pour que les deux cas soient impossibles à confondre : quatre
entrées à 91, 50, 60 et 70, dont une seule publique. Tout compter donnerait 67,75 sur quatre ; on
mesure 70,0 sur une.

**Le seuil de prise de parole vit dans un drapeau, pas dans une policy.** L'ADR 0005 laissait la
question ouverte et je recommandais `contributor`. Appliqué tel quel, cela livrait une
fonctionnalité que personne ne peut utiliser : `contributor` vaut 50 points de réputation, soit
cinq révisions approuvées, et la réputation démarre à zéro. Le défaut retenu est donc `member`, dans
`feature_flags.comments_min_role`, lu par `public.comment_min_role()`. Le risque couvert — le spam —
est par ailleurs nul tant que `public_signup_open` est à `false` et qu'il existe trois comptes.
Resserrer est un `UPDATE` d'une ligne ; desserrer après que des gens se sont exprimés ne l'est pas.
**À rouvrir le jour où l'inscription s'ouvre.** L'assertion M14 vérifie que le drapeau agit dans les
deux sens, pas seulement qu'il refuse.

**Le schéma `mod` n'est pas exposé à PostgREST, et l'export RGPD le déclare.** Qui a signalé qui, et
ce qu'un modérateur en a fait, est la donnée la plus sensible du produit : la RLS est la première
barrière, l'injoignabilité la seconde. Conséquence assumée : la clé de service passe par PostgREST
comme tout le monde, donc l'export ne peut pas lire ces trois liens. Ils sont **déclarés** dans
`PERSONAL_DATA_SOURCES` avec le motif de leur absence, que le type rend obligatoire et qu'un test
vérifie non vide. Une omission d'une demande d'accès se motive, elle ne se découvre pas. À refermer
par un RPC `SECURITY DEFINER` le jour où l'endpoint de signalement existe — il n'y a aujourd'hui
aucun signalement.

**Un contrôle qui ne regarde qu'un schéma ne protège qu'un schéma.** Les advisors Supabase, relancés
après 0004, ont relevé neuf avertissements dont quatre inattendus :
`ref.tg_cigars_search_vector()` et `ref.tg_touch_dependent_cigars()`, toutes deux `SECURITY
DEFINER`, appelables par `anon` et `authenticated` via `/rest/v1/rpc/…` **depuis le premier jour**.
Ce n'est pas une régression de 0003 ni 0004 : la migration 0002 avait fermé ce trou, mais son
auto-contrôle et `supabase/tests/02_function_grants.sql` filtraient tous deux sur
`pronamespace = 'public'`. Le fichier qui existait pour voir ce trou ne pouvait pas le voir. La
0005 ferme les deux fonctions **et** élargit le contrôle à `ref` et `mod` — l'élargissement compte
plus que la correction, sans lui elle se reperdrait à la prochaine fonction. Neuf avertissements
tombent à cinq ; lecture publique vérifiée intacte après coup, en HTTP anonyme réel : 940 fiches,
114 marques, écriture refusée en 42501.

## Phase 1 — conformité RGPD

**Les endpoints RGPD lisent avec la clé de service, et c'est la RLS qui l'impose.** Contre-intuitif
sur un dépôt où tout passe par la RLS : `audit_log` n'a **aucune** policy `SELECT` pour un membre,
seulement `audit_log_select_admin`. Un export bâti sur la session du demandeur serait donc
silencieusement incomplet — il rendrait un fichier d'apparence entière, amputé de la seule table qui
trace ce qu'on a fait de ses données. La clé de service est le seul moyen d'être complet, et le
filtre `.eq(colonne, id)` devient alors toute la frontière de sécurité : il est écrit à **un seul
endroit**, `collectPersonalData`, et un test vérifie que les 14 sources y passent.

**L'inventaire des données personnelles est vérifié par le compilateur, puis par le schéma.** Deux
garde-fous superposés, parce qu'aucun des deux ne suffit. Le type mappé de `lib/compliance/gdpr.ts`
refuse une table ou une colonne qui n'existe pas dans `database.types.ts` — vérifié en cassant
volontairement les deux cas. Et `tests/compliance/gdpr-inventory.test.ts` relit le SQL : les
13 colonnes qui référencent `auth.users` doivent toutes être déclarées, **et** la portée annoncée
(`erased` / `anonymised`) doit correspondre au `ON DELETE` réel. Une source documentée « anonymisée »
qui casserait en cascade est pire qu'une source non documentée : c'est une promesse que la base ne
tient pas. Confronté à la base déployée, pas seulement au fichier : les 13 correspondent.

**Effacer un contributeur détruit ses propositions de révision.** `ref.cigar_revisions.author_id`
est `NOT NULL` : la clé étrangère ne peut que cascader, là où tous les autres liens vers un membre
sont `on delete set null`. Un partant emporte donc ses révisions, y compris celles qu'un tiers a
relues. C'est un trou réel dans l'historique du wiki. Il n'est pas corrigé ici — cela demande une
migration et une décision sur ce qu'est une révision sans son auteur — mais l'effacement en
enregistre le **nombre** dans `audit_log`, pour que la perte soit mesurée et non découverte.

**La trace précède l'effacement, et son échec l'annule.** `audit_log.actor_id` sera mis à NULL par la
cascade quelques millisecondes plus tard : c'est `entity_id`, simple texte sans clé étrangère, qui
survit. Il ne contient que l'identifiant — ni pseudo, ni adresse. Une fois `auth.users` parti,
il ne désigne plus personne, et c'est précisément l'intention.

**`ip_hash` n'est jamais écrit.** La colonne existe pour le jour où un haché poivré servira à
quelque chose. En écrire un aujourd'hui ajouterait une donnée personnelle **et** un secret
obligatoire de plus — pour rien. Le §2 demande de tracer qui a fait quoi, pas d'où.

**L'effacement se confirme en retapant son pseudo.** Pas une case à cocher : le geste est immédiat
et irréversible. Accessoirement, une valeur que seul le titulaire connaît est une valeur qu'une
requête d'une autre origine ne peut pas porter.

**`/api/health` sert désormais le commit déployé.** La branche par défaut du dépôt et `master` sont
deux réglages distincts, et Vercel déploie la première : une fusion dans `master` seule ne change
rien en production, et rien sur le site ne le dit. Le commit rend l'écart visible d'une requête HTTP.
La phase, elle, a répondu `P0` pendant tout P1 — un littéral enfoui dans un handler dérive parce que
rien ne le relit. Elle vit maintenant dans `lib/release.ts`, épinglée par un test.

## Phase 1 — identité

**`@supabase/ssr`, la deuxième et dernière dépendance de P1.** Annoncée quand la consultation
anonyme a été livrée : elle ne sert qu'à porter une session à travers les cookies, ce dont une
lecture anonyme n'avait pas besoin. Elle est devenue nécessaire le jour où il a fallu un auteur.

**Lien magique, pas de mot de passe.** Un mot de passe sur un site qui traite du tabac est un
identifiant qui vaut d'être volé pour ce qu'il dit de son porteur, et en stocker un n'achète rien
ici. Le lien est à usage unique et valable une heure. **Attention QA** : le SMTP intégré de Supabase
est limité à quelques envois par heure — une connexion suffit, la session dure.

**Le rafraîchissement de session vit dans le middleware, avec l'age gate.** Non par commodité :
seul le middleware peut réécrire un cookie, un Server Component ne le peut pas. Sans cela un membre
connecté est déconnecté en silence à l'expiration de son jeton — exactement la classe de bug du
portail qui redemandait la date de naissance, évitée au même endroit.

**`getUser()`, jamais `getSession()`.** `getSession()` fait confiance au cookie tel qu'il se
présente, et un cookie se forge. `getUser()` interroge le serveur d'authentification. C'est toute la
différence entre une session et une affirmation.

**Le callback accepte `code` ET `token_hash`.** `code` vient d'un flux PKCE, ce que produit
`signInWithOtp` côté serveur — le chemin normal. `token_hash` est ce qu'émettent les gabarits de
courriel récents de Supabase et l'API d'administration. N'en gérer qu'un casse le flux le jour où
quelqu'un modifie le gabarit, sans que rien dans le code ne suggère pourquoi.

**`/auth/callback` est public, et c'est asserté.** `tests/unit/routes.test.ts` énumère
exhaustivement `PUBLIC_PATHS` : ajouter une route publique est un acte délibéré, pas un oubli. Le
callback doit être joignable avant le portail, sinon la session n'est jamais établie — il ne rend
rien, il pose des cookies et redirige.

**L'en-tête ne lit la session que derrière le portail.** `SiteHeader` n'est rendu que dans
`app/(app)/`, dont les routes sont déjà dynamiques. La page d'accueil reste statique et cacheable,
ce dont dépend le Lighthouse SEO ≥ 95 de Q13.

## Phase 1 — référentiel consultable

**`@supabase/supabase-js`, et elle seule.** Le §3 demande une justification par dépendance.
Celle-ci porte tout l'accès aux données ; l'écrire à la main voudrait dire réimplémenter PostgREST,
ses filtres et son encodage des jointures. `@supabase/ssr` n'est **pas** installée : elle ne sert
qu'à porter une session d'authentification à travers les cookies, et la consultation du référentiel
est anonyme. Elle viendra avec `connexion/`, avec sa propre justification. `nuqs` était déjà là mais
n'est pas utilisée : les facettes sont des liens lus côté serveur, sans état client.

**Le schéma `ref` a dû être exposé à PostgREST.** Un projet Supabase n'expose que `public` et
`graphql_public` ; `ref` en était absent, donc aucune requête client n'aurait résolu, quel que soit
le code. Changement de configuration du projet, pas du schéma. La RLS gouverne exactement comme
avant — vérifié par requête HTTP anonyme réelle : 114 marques lisibles, 0 fiche sur 940 (toutes en
brouillon), écriture refusée en 42501.

**Les facettes sont des liens, pas des cases à cocher.** Aucun JavaScript client sur la recherche :
chaque option est un `<a>` vers l'URL que la page aurait avec la facette basculée. La recherche est
donc partageable, fonctionne avant hydratation, et l'état vit dans l'URL comme le veut
`app/CLAUDE.md`. Le champ texte est un `<form method="get">` pour la même raison.

**Le repliement des accents est dupliqué en TypeScript, à contrecœur.** `search_vector` est bâti sur
`immutable_unaccent()`, donc une requête non repliée ne remonte rien — en silence. L'alternative
propre (un RPC qui replie côté serveur) mettait un aller-retour devant chaque recherche. La
duplication est donc assumée et bornée par un test : les 15 caractères non-ASCII du référentiel ont
été relevés dans la vraie base. Onze se replient à l'identique ; quatre divergent (`« » “ ”`, que
`unaccent()` transforme en `<< >> " "`) sans conséquence, la tokenisation les écartant de toute
façon — vérifié, pas supposé.

**Deux états vides, pas un.** « Aucune fiche ne correspond » et « le référentiel n'est pas encore
ouvert » ne disent pas la même chose. Confondre les deux ferait passer une règle de publication
délibérée pour une recherche ratée.

**Le garde-fou du nom commercial heurte le vocabulaire du métier.** `check-tokens` interdit le
littéral `Vitola` hors de `lib/brand.ts` ; c'est aussi le terme de métier pour un format. Seule la
sensibilité à la casse du motif rend les deux compatibles : le format reste en minuscule, la marque
garde sa majuscule. Les messages d'erreur de `lib/referential/` sont formulés en conséquence.

## Phase 0 — réalisation

**Next 16 plutôt que Next 15.** Le §3 du brief dit « Next.js 15 », écrit avant la sortie de la 16.
Même App Router, même React 19. Démarrer un projet neuf sur une majeure déjà dépassée coûterait
une migration dans les mois qui viennent. Réversible sans douleur tant qu'il n'y a pas de code
métier. Conséquences constatées : `next lint` n'existe plus (ESLint tourne seul), et la clé
`eslint` de `next.config.ts` a disparu.

**TypeScript 6, pas 7.** TS 7 est la version courante, mais `typescript-eslint` la refuse
explicitement au démarrage. Comme `pnpm lint` doit passer (§0.7), le projet est épinglé sur TS 6.
À revérifier quand typescript-eslint annonce le support.

**Version de React épinglée dans la config ESLint.** `eslint-plugin-react` appelle
`context.getFilename()`, retirée d'ESLint 10, dans sa détection automatique. Déclarer la version
court-circuite ce chemin de code.

**`postcss` en dépendance explicite.** Avec le `node_modules` strict de pnpm, Next ne résolvait pas
`postcss` et sautait **silencieusement** tout le traitement — build vert, aucune feuille de style
émise. Le symptôme n'apparaissait qu'après un build propre, le cache masquant la panne.

**Le sombre est inconditionnel.** Voir Q23.

**Palier de contraste ajouté à la palette.** La couleur d'erreur du §4.2 plafonne à 2,51:1 sur les
cartes. Quatre variantes éclaircies, même teinte, même saturation. Voir Q11.

**L'échelle de cape est éclaircie par rapport à la feuille réelle.** Un maduro fidèle (`#4a261a`)
est indiscernable de la surface maduro sur laquelle il repose : les deux derniers crans de
l'échelle disparaissaient. C'est une échelle symbolique, réglée pour être perçue, jamais seul
porteur de sens — le libellé est toujours affiché.

**Trois dépendances évitées.** `jose` (l'age gate signe via Web Crypto, présent partout),
`vite-tsconfig-paths` (Vite résout les alias nativement), `pg` (le contrôle de couverture RLS
tourne en `psql` dans la CI). Le §3 demande une justification par dépendance ; l'absence en est
la meilleure.

**Une page `/cigares` d'attente en P0.** L'age gate renvoie par défaut vers le référentiel, qui
n'existe qu'en P1 : sans cette page, un adulte franchissant le portail atterrissait sur un 404.
Découvert en capturant les écrans, pas en relisant le code.

**Les scans de conformité masquent les commentaires.** Sans cela, une phrase expliquant pourquoi
une chose est absente déclenche l'alerte que cette chose est présente. Constaté deux fois : sur
`health-notice.tsx` et sur `band.tsx`.

**Captures d'écran : attendre `load`, pas `domcontentloaded`.** `domcontentloaded` n'attend pas les
feuilles de style : les captures sortaient non stylées de façon intermittente. Vaut pour tout
futur test de régression visuelle.
