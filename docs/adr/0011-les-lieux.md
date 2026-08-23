# 0011 — Seeder les lieux depuis le registre officiel des buralistes, jamais depuis OSM ; structurer l'avis pour que le garde-fou §2 soit une colonne, pas une consigne

- **Statut** : **Acceptée** le 23 août 2026 — commande de session du 23 août, qui ouvre P5 sur ce document
- **Date** : 2026-08-23
- **Décideur** : @jgueniche
- **Concerne** : P5 (lieux, F8) · `public.venues` · `public.venue_reviews` · `public.events.venue_id` ·
  `public.posts.venue_id` · `mod.reports` (cibles) · `supabase/seed/PROVENANCE.md` · Q6

## Contexte

Le §9 donne à P5 un critère de sortie net : « **200 lieux seedés, recherche 25 km < 200 ms** ». La
seconde moitié est de l'ingénierie ordinaire — `postgis`, une colonne `geography(Point,4326)`, un
index GiST, `ST_DWithin`. La première est une question de licence avant d'être une question
technique, et c'est elle qui force cette ADR.

Six faits cadrent ce qui suit.

**1. Le §2 interdit l'extraction d'une base tierce** (art. L341-1 CPI), et `PROVENANCE.md` exige que
chaque ligne versée soit justifiable — c'est le document qui nous défend en cas de contestation. Un
lieu est une ligne comme une autre : il lui faut une provenance.

**2. OpenStreetMap est complet, à jour, et sous ODbL.** La licence est explicitement conçue pour
autoriser la réutilisation — ce n'est pas un problème de droit d'extraction. La clause qui décide
est le **partage à l'identique** : une base dérivée d'OSM doit être republiée sous ODbL. Savoir si
cette obligation s'arrêterait à la table `venues` ou s'étendrait à la base entière (base dérivée ou
base collective, au sens de la licence) est une analyse juridique, pas une lecture de développeur —
exactement la famille de questions que Q1 et Q6 réservent à un avocat. S'engager là-dessus sans
avis, c'est hypothéquer le régime de notre propre référentiel pour gagner des horaires d'ouverture.

**3. Le registre officiel des débits de tabac existe, en Licence ouverte.** « Adresses des
buralistes de France métropolitaine — 2018 », publié par la DGDDI sur `data.economie.gouv.fr`,
**Licence Ouverte v2.0 (Etalab)**, 24 434 établissements, chacun avec enseigne, adresse, code
postal, commune, nature du débit **et géolocalisation**. C'est le régime exact de la source B de
`PROVENANCE.md` — l'arrêté d'homologation des prix : une publication officielle de l'État,
librement réutilisable avec attribution, sans partage à l'identique. Ses limites sont aussi nettes
que son régime : le millésime est **2018** (des établissements ont fermé depuis), il ne couvre que
les civettes (pas les caves, lounges, hôtels, restaurants), et il n'a ni horaires, ni téléphone,
ni site, ni fumoir — la moitié des colonnes du §5.7 resteraient vides.

**4. La contribution seule est honnête et lente.** `status = 'pending'` par défaut et une file de
publication existent déjà comme culture du dépôt (wiki, ADR 0008). Partir de zéro ne tient pas le
critère de sortie avant longtemps.

**5. Contrairement à `ref.lines`, la table du §5.7 a un `status`.** C'est toute la leçon de l'ADR
0009 prise à l'endroit : un lieu proposé n'est **pas** public à l'insertion, il attend une
publication. L'asymétrie est la bonne dès le premier jour, donc la contribution peut ouvrir tout de
suite — ce que la décision de v1 sur `ref.lines` s'interdisait faute de filet.

**6. Q6 est ouverte, et son défaut est écrit.** Un annuaire de lieux de vente de tabac au regard de
la publicité indirecte est la seule question dont le périmètre pourrait être **réduit** après avis
juridique. Le défaut documenté : construire P5 derrière un drapeau, pour qu'une restriction
ultérieure — retirer les revendeurs, ne garder que les lounges et les clubs — soit une modification
de filtre, pas une réécriture.

## Options

### D1 · D'où viennent les 200 lieux ?

**A — OpenStreetMap** (Overpass, `shop=tobacco`, `smoking=*`). Complet, à jour, riche.
*Coût :* l'ODbL engage le partage à l'identique d'une base dérivée, et la portée de cet engagement
sur **notre** base est une question d'avocat (fait 2). C'est le seul des trois chemins qui crée une
obligation nouvelle, et il la crée avant l'avis juridique que Q1 place précisément avant P5.

**B — Le registre officiel DGDDI**, Licence ouverte, complété par la contribution.
*Coût :* millésime 2018, civettes seulement, colonnes vivantes vides (fait 3). Il faut le dire à
l'écran plutôt que de le maquiller : une fiche seedée porte sa source et sa date, et ce qui manque
reste vide — la règle du seed depuis P0 (« l'incertitude se signale, elle ne se cache pas »).

**C — La contribution seule.** Aucune licence, aucune ligne au départ.
*Coût :* le critère de sortie n'est pas tenu, et un annuaire vide n'invite personne à contribuer —
on ne complète pas une page blanche, on complète une liste où il manque sa civette.

### D2 · Qui crée un lieu, et qui le publie ?

**A — Les relecteurs seulement.** Cohérent avec un référentiel vérifié, et une impasse : il n'existe
aujourd'hui qu'un compte au-dessus de `member`.

**B — Tout membre propose, un relecteur publie.** Le modèle du wiki, permis ici sans table de
révisions parce que le `status` du §5.7 fait office de brouillon (fait 5).

### D3 · Que veut dire `claimed_by` ?

**A — Un drapeau** (« cette fiche est revendiquée »), posé par n'importe qui prétend être le
professionnel.
*Coût :* sans vérification d'identité, c'est une prise de contrôle d'une fiche publique par le
premier venu — et il n'existe en v1 ni point de contact (Q7), ni back-office (P8), ni mécanisme de
vérification d'un SIRET ou d'un justificatif.

**B — Une donnée d'identité, accordée après vérification.** `claimed_by` désigne **le compte du
professionnel qui exploite l'établissement**. La colonne n'est dans aucun grant client : elle est
posée par un contexte privilégié, après une vérification qui est un geste humain hors ligne. Le
revendicateur gagne le droit de tenir les colonnes vivantes de sa fiche — horaires, téléphone,
site, fumoir, ventilation — jamais ses avis, jamais son statut.

### D4 · Qu'autorise `venue_reviews` ?

Le §5.7 borne l'avis à « l'accueil, le confort, le conseil — jamais l'incitation à consommer », et
c'est un garde-fou §2. La question est de savoir où il vit.

**A — Une note libre et un texte, plus une consigne éditoriale.** Le schéma du brief au pied de la
lettre (`rating smallint, body`).
*Coût :* le garde-fou n'est qu'une phrase. Une note globale libre note *l'établissement* — c'est-à-
dire, pour une civette, potentiellement son offre de tabac, ce que le §2 regarde de très près. Rien
n'est vérifiable : un test ne peut pas lire une intention.

**B — Trois critères structurels, la note en moyenne calculée.** L'avis porte **trois sous-notes
nommées** — accueil, confort, conseil — et la note globale en est la moyenne, jamais saisie. Le
garde-fou devient la **forme de la donnée** : il n'existe pas de colonne où noter autre chose que
ce que le §5.7 autorise. C'est le geste exact de la dégustation (six critères, note calculée),
appliqué à la raison d'être de la borne plutôt qu'à la qualité de la saisie. Le texte libre reste,
borné, signalable, et jugé sur l'incitation — le critère de `docs/editorial-guidelines.md`, jamais
un filtre lexical (leçon mesurée de l'ADR 0005).

### D5 · Dans quel schéma ?

**A — `ref`**, comme le référentiel des cigares.
*Coût :* `ref` est le wiki versionné — brouillon, diff, file de révisions, `verified_by`. Un lieu ne
suit pas ce cycle : il a son propre statut, une revendication, des avis. Il faudrait soit lui
greffer le modèle de révisions, soit avoir deux régimes dans un schéma qui n'en promet qu'un. Et
chaque table de `ref` a coûté deux corrections de grants (0005, 0007) parce que l'amorçage Supabase
ignore les schémas créés à la main.

**B — `public`**, comme `aroma_taxonomy`, autre donnée de référence qui n'est pas du wiki.

### D6 · Et la carte ?

Le périmètre du §9 dit « Lieux + carte » ; le critère de sortie, lui, ne mesure que le seed et la
recherche. Le §3 prévoit MapLibre GL avec des tuiles Protomaps ou MapTiler.

**A — Livrer la carte maintenant.** *Coût :* un fournisseur de tuiles est un sous-traitant qui voit
l'adresse IP de chaque visiteur — donc une ligne au registre RGPD et un choix de fournisseur (clé
MapTiler, hébergement d'un fichier Protomaps de plusieurs Go, ou service tiers gratuit type
OpenFreeMap). Aucune clé n'existe dans l'environnement, et ce choix engage — c'est la famille de
Q20 (PostHog), pas une ligne de code.

**B — Livrer la recherche sans la carte.** Liste triée par distance, `ST_DWithin`, géolocalisation
du navigateur (une API du terminal, aucun tiers), recherche par ville. La carte arrive quand le
fournisseur de tuiles est choisi.

## Décision

**D1 : option B. Le seed vient du registre officiel DGDDI, la contribution fait le reste — et OSM
est refusé tant qu'un avis juridique n'a pas borné le partage à l'identique.**

Ce qui l'emporte est le précédent, pas la prudence en soi : ce dépôt a déjà versé 817 fiches et
900 prix depuis une publication officielle de l'État en assumant que les colonnes que la source ne
donne pas **restent vides**. Les lieux suivent exactement ce régime. Concrètement :

- **200 lieux** tirés du registre 2018, sélection déterministe et documentée dans `PROVENANCE.md` :
  les 25 premiers établissements de chacune des huit villes les plus fournies (Paris, Marseille,
  Lyon, Bordeaux, Toulouse, Nice, Nantes, Strasbourg), triés par code postal puis enseigne. Huit
  agglomérations pour que « autour de moi » réponde quelque part, quel que soit l'endroit où la QA
  se tient.
- Chaque ligne seedée porte `source = 'douane-fr-2018'` et `source_date = 2018-01-01` — même règle
  que `msrp_source` : une donnée officielle sans date devient une désinformation en silence. La
  fiche affiche ce millésime.
- Les lieux seedés arrivent **`published`**, contrairement aux fiches cigares seedées en `draft`.
  La différence est la nature de la donnée : une enseigne et une adresse issues du registre
  officiel sont des faits exacts à leur date, comme un prix homologué — il n'y a rien qu'un
  relecteur puisse vérifier de plus que la source. Ce qui a pu changer depuis 2018 (une fermeture)
  se corrige par le signalement `inaccurate` et le statut `closed`, pas par une relecture a priori.
- Leur `type` est `civette` — le registre ne connaît que les débits de tabac. Les caves, lounges,
  hôtels et restaurants n'entrent que par la contribution.

**D2 : option B. Tout membre propose (`pending`), un `editor` publie.** Même seuil que la file
wiki, même conséquence connue : il n'existe qu'un compte au-dessus de `member`, et c'est déjà
signalé comme point d'ouverture. Un membre voit ses propres propositions en attente ; personne
d'autre ne les voit, sauf les relecteurs.

**D3 : option B. `claimed_by` est une donnée d'identité, pas un drapeau.** La colonne existe dès la
migration avec sa sémantique entière — le compte du professionnel, le droit de tenir les colonnes
vivantes — mais **le parcours de revendication n'ouvre pas en v1** : vérifier qu'un compte est bien
le buraliste du 12 rue Machin est un geste humain qui demande un canal de contact, et le point de
contact attend un domaine (Q7). La fiche le dit en toutes lettres plutôt que d'offrir un bouton qui
ne vérifierait rien. D'ici là, poser `claimed_by` est un acte privilégié, comme masquer un
commentaire.

**D4 : option B. Trois critères structurels — accueil, confort, conseil — sur 5, la note globale en
moyenne calculée, jamais saisie.** Un avis par membre et par lieu (contrainte d'unicité) : un avis
de lieu est un jugement révisable, pas un journal. Le texte est borné à 2 000 caractères,
modérable par `hidden_*` hors de tout grant client (le régime des commentaires), et **signalable**
— `public.venues` et `public.venue_reviews` entrent dans les cibles de `mod.reports`, et
`tests/compliance/dsa.test.ts` exige le bouton en face du CHECK. Le caractère vérifiable du
garde-fou tient en trois choses qu'un test peut lire : les trois seules colonnes de notation sont
les trois du §5.7 ; aucune colonne de prix ni de « rapport qualité-prix » n'existe ; et la moyenne
ne se saisit pas.

**D5 : option B. `public.venues` et `public.venue_reviews`, dans `public`.**

**D6 : option B. La recherche sans la carte.** La liste triée par distance ferme le critère de
sortie ; la carte attend le choix d'un fournisseur de tuiles, qui est un arbitrage de sous-traitance
(voir « Question ouverte »).

**Et la conséquence de Q6, appliquée d'office : tout `/lieux` vit derrière le drapeau
`venues_enabled`**, dont la charge utile porte la liste des types offerts. Restreindre l'annuaire
après avis juridique — retirer les civettes, ne garder que les lounges — est un `UPDATE` d'une
ligne de `feature_flags`, pas une réécriture.

## Conséquences

**Ce que nous acceptons, y compris désagréable.**

- **Le seed date de 2018.** Des établissements ont fermé, des enseignes ont changé. Chaque fiche
  seedée porte son millésime, et le chemin de correction (signalement → `closed`) existe dès le
  premier jour. Un annuaire daté qui dit sa date vaut mieux qu'un annuaire frais dont la licence
  engage la base.
- **Les colonnes vivantes des 200 lieux sont vides** — horaires, téléphone, site, fumoir. La fiche
  les affiche comme inconnues, et l'invitation à compléter est le chemin de contribution.
- **Pas de conversation de revendication en v1.** Un professionnel ne peut pas encore prendre sa
  fiche ; la fiche explique pourquoi et ce qui l'ouvrira (Q7).
- **Pas de carte en v1.** Une liste triée par distance, une recherche par ville, la géolocalisation
  du navigateur. La carte est un écran de plus au-dessus de la même requête, le jour où le
  fournisseur de tuiles est choisi.
- **L'annuaire montre des lieux de vente de tabac**, ce que Q6 interroge. Le drapeau et sa charge
  utile sont la réponse technique ; la réponse juridique reste due avant l'ouverture commerciale.

**Ce que cela interdit désormais.**

- **Verser une ligne OSM dans `venues`**, directement ou par recopie manuelle, tant que l'avis
  juridique sur l'ODbL n'existe pas. Une contribution manifestement recopiée d'OSM se refuse comme
  un lot recopié d'une base de fiches (PROVENANCE §6).
- **Écrire `claimed_by` depuis un client.** Aucun grant ne le permet, et l'auto-contrôle de la
  migration le vérifie.
- **Saisir une note globale de lieu.** Elle est calculée, comme la note d'une dégustation.
- **Ajouter un critère de notation** sans rouvrir cette ADR : les trois critères sont la forme du
  garde-fou, pas un choix d'interface.
- **Une fiche lieu qui nomme un prix ou une promotion.** Ni colonne, ni champ libre dédié ; un texte
  d'avis qui le fait relève du signalement, critère de l'incitation.

**Index prévus** :

| Index | Sert |
|---|---|
| `venues (slug)` unique | L'adresse de la fiche |
| `venues using gist (geo)` | `ST_DWithin`, le critère de sortie |
| `venues (status, type)` | La liste filtrée par type, qui ne montre que le publié |
| `venues (created_by)` | « Mes propositions de lieux » |
| `venue_reviews (venue_id, user_id)` unique | Un avis par membre et par lieu |
| `venue_reviews (venue_id, created_at desc)` | Les avis d'une fiche, du plus récent au plus ancien |

## Quand rouvrir

1. **Un avis juridique borne le partage à l'identique de l'ODbL** à la seule table des lieux → D1 se
   rouvre, et OSM devient la source de mise à jour la plus riche.
2. **Q7 tranche un domaine** et le point de contact existe → le parcours de revendication de D3
   s'ouvre, avec sa vérification humaine.
3. **L'avis juridique de Q6 restreint l'annuaire** → la charge utile de `venues_enabled` s'ajuste ;
   si la restriction touche des lignes déjà publiées, elles passent `closed` plutôt que d'être
   effacées.
4. **Un fournisseur de tuiles est choisi** (arbitrage de sous-traitance, famille Q20) → la carte de
   D6 se construit au-dessus de la recherche existante.
5. **Dix lieux `pending` attendent plus d'une semaine** → le seuil de publication de D2 (un seul
   compte `editor`) est devenu le goulot ; la question « qui promeut » de la fin de P1 se repose.

## Question ouverte

**Quel fournisseur de tuiles pour la carte, et sous quel régime RGPD ?** MapTiler (clé, quota,
sous-traitant hors projet), Protomaps auto-hébergé (un fichier de plusieurs Go à héberger quelque
part), ou un service gratuit type OpenFreeMap (sous-traitant sans contrat). Chacun voit l'adresse IP
de chaque visiteur de la carte ; le choix appartient au porteur du produit et s'inscrit au registre
des sous-traitants avec les autres (Q20).
