# P0 · Livrable 5 — Questions ouvertes

Classées par impact décroissant. Chacune comporte une **réponse par défaut** : ce que je ferai si
vous ne tranchez pas. Vous pouvez donc ne répondre qu'aux questions où mon défaut vous déplaît.

Trois niveaux :

- **Bloquant** — le travail s'arrête ou part dans une direction coûteuse à défaire.
- **Structurant** — le travail avance, mais une réponse tardive coûte une reprise.
- **Ajustable** — un réglage, décidable en cours de route.

---

## Bloquant

### Q1 · Quand la validation juridique intervient-elle, et par qui ?
Le §2 se dit lui-même bloquant avant mise en ligne publique. Toute l'architecture est construite en
supposant ces contraintes vraies, mais deux points de ce brief me paraissent devoir être confirmés
par un avocat **avant P5 et P7**, pas avant le lancement : le statut d'un annuaire de civettes au
regard de la publicité indirecte (Q6 ci-dessous) et la qualification exacte des données de
dégustation au titre de l'article 9.
**Défaut :** je développe tout, `public_signup_open` reste à `false` dans `feature_flags`, et rien
n'est ouvert au public. Le code est prêt, la porte est fermée.
**Nécessaire avant :** l'ouverture publique. Idéalement engagé pendant P1.

### Q2 · Quelle région Supabase, et le DPA est-il signé ?
**Irréversible.** Une région ne se change pas après création : il faut recréer le projet et migrer.
Le §3 exige l'UE pour l'observabilité ; c'est *a fortiori* vrai pour une base contenant des données
potentiellement relevant de l'article 9.
**Défaut :** projet en `eu-central-1` (Francfort), DPA Supabase signé, registre des sous-traitants
tenu dans `docs/legal/data-map.md`, deux projets distincts (production / développement).
**Nécessaire avant :** la première migration appliquée sur un projet réel — donc avant P1.

### Q3 · Qui saisit le référentiel d'amorçage ?
**C'est la question la plus sous-estimée du brief.** Le §5.3 demande ~120 marques et le vitolario
Habanos, saisis à la main, scraping formellement interdit. Ce n'est pas du développement : c'est un
travail documentaire que j'évalue à **15 à 25 heures de saisie humaine**, indépendamment du code.
Sans lui, P1 se termine avec une recherche facettée qui ne renvoie rien, et le critère de sortie
(« < 300 ms sur 5 000 cigares ») n'est pas mesurable.
**Défaut :** je livre les schémas CSV, le script d'import idempotent, le contrôle de cohérence et un
échantillon d'amorçage d'environ 150 fiches sur une dizaine de marques emblématiques, saisi
manuellement à partir de connaissances factuelles publiques et documenté dans `PROVENANCE.md`. Le
reste attend une décision : vous, un contributeur rémunéré, ou une ouverture anticipée du wiki.
**Nécessaire avant :** la fin de P1.

### Q4 · Peut-on héberger les logos de marques (`brands.logo_path`) ?
Reproduire une marque figurative dans un contexte encyclopédique se défend, mais c'est un
raisonnement juridique et non technique — et il se combine ici avec l'interdiction de publicité
indirecte du §2 : le logo d'un fabricant de tabac, affiché en grand sur une page de marque,
pourrait s'analyser comme une communication en sa faveur.
**Défaut :** la colonne existe et **reste NULL**. Les pages marque s'appuient sur la typographie —
ce qui, accessoirement, sert la direction artistique du §4. Aucun logo de fabricant n'est stocké.
**Nécessaire avant :** P1 (pages marque).

### Q5 · Où tourne l'inférence d'embeddings, et sur quelles données ?
Le §3 propose Replicate ou Hugging Face. Envoyer une photo prise par un utilisateur à un endpoint
hors UE est un transfert de données personnelles qui doit figurer au registre, être couvert par une
base légale et être annoncé dans la politique de confidentialité. Une photo de bague peut par
ailleurs capter un décor, un visage, un intérieur.
**Défaut :** endpoint d'inférence en UE exigé ; à défaut, la photo est recadrée **côté client** sur
le seul rectangle de la bague avant tout envoi, et l'original ne quitte jamais l'appareil. Le
recadrage client était déjà prévu au §6 pour des raisons de coût ; il devient une mesure de
minimisation.
**Nécessaire avant :** P4.

### Q6 · Un annuaire de civettes et de caves relève-t-il de la publicité indirecte ?
P5 crée un annuaire de lieux de vente de tabac, avec avis et carte. Le §2 se contente de dire que
les avis portent « sur l'accueil, le confort, le conseil ». Je ne sais pas si cela suffit. C'est la
seule phase dont je pense que le périmètre pourrait devoir être réduit après avis juridique.
**Défaut :** je construis P5 comme prévu, mais je regroupe la logique dans
`app/(app)/lieux/` derrière un flag `venues_enabled` afin qu'une restriction ultérieure — retirer
les revendeurs, ne garder que les lounges et les clubs — soit une modification de filtre, pas une
réécriture.
**Nécessaire avant :** le début de P5.

### Q7 · Quel nom commercial, et quel domaine ?
`lib/brand.ts` est une constante unique précisément pour rendre ce choix tardif — mais il ne peut
pas rester ouvert jusqu'à P6 : les images OG, le sitemap, les e-mails transactionnels et la
personnalisation Stripe le figent progressivement.
**Défaut :** `Vitola` comme nom d'usage, aucun achat de domaine, et vérification de disponibilité de
marque **avant** toute dépense de design. Réserves du §1 conservées : *Cepo*, *Anillo*, *Cedro*,
*Le Cercle du Cèdre*.
**Nécessaire avant :** P6.

### Q8 · Le bucket `cigar-images` doit-il rester privé ?
**C'est le seul endroit où le brief se contredit.** Le §8 impose « jamais de bucket public sauf
`articles-media` ». Le §8 impose aussi LCP < 2,0 s sur la fiche cigare, et le §9 en fait un critère
de sortie. Or une image servie par URL signée n'est pas mise en cache par le CDN : chaque visiteur
refait le trajet complet, sur la page la plus consultée du site.
**Mon analyse :** les images du référentiel sont, par construction, du contenu public — elles
illustrent des fiches lisibles par un visiteur anonyme. Les garder privées protège une donnée qui
n'est pas sensible et coûte le critère de performance. Les scans d'utilisateurs (`band-scans`, P4),
eux, sont personnels et doivent absolument rester privés.
**Défaut :** j'ai livré la migration **conforme au brief** — bucket privé — parce que je ne modifie
pas une règle de sécurité sans accord. Ma recommandation est de passer `cigar-images` en public et
de conserver `band-scans` et `avatars` en privé. Un mot de vous et c'est une ligne.
**Nécessaire avant :** P1.

---

## Structurant

### Q9 · L'abonnement « Cercle » n'a pas de phase
Le §7 annonce une monétisation par abonnement — cave illimitée, statistiques avancées, export,
dégustation à l'aveugle, sans publicité — mais **aucune phase de la roadmap ne le livre**. Ce n'est
pas un détail : « cave illimitée » implique un plafond sur la cave gratuite, donc une contrainte à
inscrire dans le schéma de P2, pas à ajouter après.
**Défaut :** P2 pose une table `subscriptions` et un plafond configurable par flag, sans facturation.
L'abonnement effectif devient une phase P9, après P8.
**Nécessaire avant :** P2.

### Q10 · Quelle structure juridique encaisse, et est-elle immatriculée à la TVA ?
Conditionne Stripe Tax, les mentions de facture, le seuil OSS, et l'existence même de P7.
**Défaut :** P7 est développée en mode test Stripe uniquement, livraison France seule, et n'est pas
mise en production sans cette réponse.
**Nécessaire avant :** la fin de P7.

### Q11 · Les quatre tokens de contraste ajoutés sont-ils acceptés ?
Le livrable 3 a mesuré la palette du §4.2 : `#9B3D32` (erreur) plafonne à **2,51:1** sur Maduro et
`#8C4F2E` (colorado) à **2,65:1**, sous le seuil de 3:1 requis pour un simple élément d'interface.
Un message d'erreur de formulaire dans cette couleur est illisible pour une partie des utilisateurs,
et l'audit axe-core de P8 le relèvera. Je propose quatre variantes éclaircies, de même teinte et
même saturation : `--erreur-lisible #CA675B`, `--colorado-lisible #C16E41`,
`--succes-lisible #6D8D5F`, `--cedre-lisible #A47C5A`.
**Défaut :** je les ajoute, les hex du §4.2 restant intacts pour les aplats.
**Nécessaire avant :** la fin de P0.

### Q12 · Qui modère, et sous quel délai ?
Le DSA impose un point de contact, un mécanisme de signalement et des délais de traitement. Le
back-office arrive en P8, mais l'obligation naît dès qu'un contenu utilisateur est public — donc dès
P3.
**Défaut :** P3 livre le signalement et une file de traitement par e-mail vers une adresse unique.
Le back-office reste en P8. Le point de contact DSA est publié dans les mentions légales dès P0.
**Nécessaire avant :** P3.

### Q13 · L'age gate et le SEO sont-ils réellement conciliables ?
Le §2 exige `noindex` sur le contenu tabac tant que le portail n'est pas franchi. Le §9 fixe comme
critère de sortie de P6 un score Lighthouse SEO ≥ 95. Un contenu non indexable ne se référence pas :
les deux objectifs ne portent pas sur les mêmes pages.
**Défaut :** deux familles de routes, ce que reflète déjà l'arborescence. `app/(public)/` — accueil,
pages légales, journal éditorial sans mention de produit — est indexable et porte le score
Lighthouse. `app/(app)/` — fiches cigares, cave, scan — est en `noindex` derrière le portail. Le
score de P6 se mesure sur les routes publiques.
**Nécessaire avant :** P6.

### Q14 · Quels seuils de réputation débloquent quels droits ?
`profiles.reputation` conditionne l'accès à la validation wiki (§5.3), mais aucun seuil n'est donné.
**Défaut :** `contributor` à 50 points, `editor` promu manuellement uniquement — un droit de
publication ne s'obtient pas automatiquement sur un référentiel qui se veut vérifié. Barème :
+10 par révision approuvée, +2 par dégustation publiée, −20 par révision rejetée pour inexactitude.
**Nécessaire avant :** la fin de P1.

### Q15 · Sous quelle licence les utilisateurs cèdent-ils leurs photos ?
`cigar_images.license` est `NOT NULL` avec `cc-by-sa-4.0` par défaut. Cela doit correspondre à ce
que les CGU font accepter, sinon le référentiel se construit sur des images qu'on n'a pas le droit
de rediffuser.
**Défaut :** CC BY-SA 4.0 pour les images versées au référentiel, mention obligatoire du
contributeur ; les photos de dégustation personnelles restent la propriété de leur auteur avec une
simple licence d'affichage.
**Nécessaire avant :** P1.

### Q16 · Quel plafond de coût mensuel pour le scan ?
Le §6 fixe 30 scans par jour et par utilisateur et trace le coût dans `band_scans.cost_cents`, mais
ne pose aucun plafond global. Mille utilisateurs actifs saturant leur quota, c'est 30 000 appels
VLM par jour.
**Défaut :** plafond global configurable, par défaut 150 €/mois, avec dégradation gracieuse vers la
recherche manuelle une fois atteint — mécanisme déjà prévu au §6 pour le délai de 12 s.
**Nécessaire avant :** P4.

### Q17 · Qui constitue le corpus de 200 photos annotées de P4 ?
Le §6 fait du benchmark un critère de sortie bloquant : « ne pas passer à la phase suivante sans ce
chiffre mesuré ». Ce corpus est du travail humain — collecte, cadrage, annotation — que j'évalue à
**8 à 12 heures**, et sans lui P4 ne peut littéralement pas se clore. Se pose en outre la question
du consentement des contributeurs si les photos viennent de la communauté.
**Défaut :** je livre la structure de `tests/fixtures/bands/`, le format d'annotation et le script
de mesure ; le corpus lui-même est constitué au fil de P1 à P3, en collectant les scans confirmés
par leurs auteurs, avec consentement explicite tracé dans `consents`.
**Nécessaire avant :** la clôture de P4.

---

## Ajustable

### Q18 · Les valeurs d'enum doivent-elles être en anglais ?
Le §0.10 impose l'anglais dans le code ; le §5.1 définit `leger`, `leger_moyen`, `moyen`,
`moyen_corse`, `corse`. J'ai gardé les valeurs du brief plutôt que de modifier la spécification sans
accord. Les termes hispanophones (`piramide`, `edicion_limitada`) sont du vocabulaire de métier et
doivent rester tels quels dans tous les cas.
**Défaut :** inchangé. Le renommer maintenant coûte une ligne ; après P2, une migration de type avec
réécriture de données.

### Q19 · Les prix indicatifs seront-ils un jour affichés ?
`msrp_eur` existe, le flag `show_indicative_prices` est à `false`. La question est de savoir si ce
flag est destiné à passer à `true` un jour, ou s'il ne s'agit que d'une donnée d'analyse interne
(valorisation de cave en P2, qui n'exige aucun affichage sur la fiche).
**Défaut :** jamais affiché sur une fiche cigare. Employé uniquement pour valoriser une cave
personnelle, où l'information est patrimoniale et non promotionnelle.

### Q20 · PostHog : nuage UE ou auto-hébergé ?
**Défaut :** nuage UE. L'auto-hébergement ajoute une astreinte pour une exigence que le nuage UE
satisfait déjà.

### Q21 · L'anglais et l'espagnol sont-ils dans le périmètre v1 ?
**Défaut :** non. L'infrastructure est prête dès P0 (`messages/fr.json`, `lib/routes.ts`,
`lib/i18n/`) ; la traduction effective attend P8, et n'y entre que si le contenu éditorial suit.

### Q22 · Note sur 100 ou sur 20 par défaut ?
**Défaut :** 100, conformément au §5.4, avec bascule en préférence utilisateur — déjà présente dans
`profile_settings.preferences.score_scale`.

---

## Ce que je ne vous demande pas

Pour être clair sur le périmètre de ces questions : je ne rouvre ni la stack (§3), ni la direction
artistique (§4), ni l'ordre des phases (§9), ni aucune des interdictions du §2. Les questions
ci-dessus portent uniquement sur ce que le brief ne tranche pas, ou sur les deux endroits où il se
contredit (Q8, Q13).
