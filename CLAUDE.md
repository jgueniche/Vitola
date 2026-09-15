# Vitola — conventions de travail

Le cadrage produit est dans `BRIEF.md`. Ce fichier dit **comment** on travaille.
Un `CLAUDE.md` par domaine complète celui-ci : `app/`, `lib/`, `supabase/`.

## Les quatre règles qui ne se négocient pas

1. **Rien qui vende du tabac.** Aucune route, aucun champ, aucun libellé permettant l'achat,
   l'échange ou le don de produits du tabac. Testé par `tests/compliance/no-tobacco-sale.test.ts`,
   qui échoue si un champ comme `affiliate_url` réapparaît. Voir §2 du brief.
2. **RLS sur 100 % des tables.** Toute migration créant une table sans `ENABLE ROW LEVEL SECURITY`
   et sans au moins une policy explicite casse le build. Voir `supabase/CLAUDE.md`.
3. **`pnpm check` passe avant chaque commit.** `typecheck` + `lint` + `tokens:check` + `test`.
4. **Une ambiguïté d'architecture → une ADR + une question.** On ne devine pas. `docs/adr/`.

## À trancher avant commercialisation

Les quatre règles ci-dessus bloquent un commit. Celles-ci ne bloquent rien aujourd'hui : ce sont
des décisions prises en connaissance de cause, reportées, et qui doivent être rouvertes **avant
l'ouverture commerciale** — pas avant le prochain déploiement. Elles vivent ici pour qu'on ne les
retrouve pas par surprise le jour où le site s'ouvre au public.

Une entrée porte toujours les trois mêmes choses : ce qui est assumé, ce qui la rouvre, et quand.
Un point sans déclencheur n'est pas une décision reportée, c'est une inquiétude — et une liste
d'inquiétudes finit par noyer les vraies.

### Boutique publique et paiement de démonstration

**Assumé.** Depuis le 25 août 2026, sur instruction du porteur (« fais comme si on vendait
déjà, sinon impossible de faire de la QA »), la boutique est **entièrement publique** —
`/boutique` est le second préfixe public après le journal, devant le portail 18+ — et un
**tunnel d'achat de démonstration** va du panier à une confirmation `QA-` : paiement fictif,
bandeau « démonstration » sur chaque écran, aucune donnée de carte conservée, aucune commande
en base (le panier est un cookie). La frontière §2 ne bouge pas : accessoires seulement, l'enum
fermé et le trigger lexical la tiennent, et le référentiel tabac reste derrière le portail.

**Ce qui rouvre.** La parole du porteur — c'est lui qui dira quand la commercialisation
approche — ou l'arrivée des clés Stripe (ADR 0016, D7 : commission ou abonnement, DAC7 avant le
premier euro reversé). Le vrai paiement exigera `shop.orders` sous RLS, et le paiement de
démonstration se retire le même jour.

**Quand.** Avant l'ouverture commerciale. D'ici là on ne s'en inquiète plus : l'état de QA est
l'état voulu.

### Cigare allumé en page publique

**Assumé.** L'accueil montre une illustration de cigare allumé, visible **avant** le portail 18+.
Le §2 du brief et la loi Évin interdisent la publicité, directe ou indirecte, en faveur du tabac.
L'illustration est dessinée pour rester du bon côté : planche annotée, légendes en mesures et non
en adjectifs (« Combustion — env. 90 min », « Colorado maduro — 4ᵉ nuance sur 6 »), aucune marque
nulle part. Ce qui n'a pas été validé, c'est l'emplacement — devant le portail plutôt que derrière.

**Ce qui rouvre.** Un avis de conseil juridique.

**Quand.** Avant l'ouverture commerciale. Pas avant le prochain déploiement : tant que le site
n'est pas commercialisé, on avance sans y revenir.

## Phases

Une phase = une branche. Le brief prévoit `feat/pXX-nom` ; les sessions Claude Code distantes
travaillent sur la branche qui leur est assignée. Jamais de commit direct sur `master`.

`master` est la branche de production, créée le 22 août 2026. Jusque-là la règle ci-dessus
ne protégeait rien : le dépôt n'avait pas de `main`, et sa branche par défaut était une
branche de session. Tout ce qui entre dans `master` y entre par une pull request, CI verte.

Chaque phase se termine sur son critère de sortie (§9 du brief), mesuré et non supposé.

## Le carnet du fumeur — livré

Demandé le 22 août 2026, tranché par l'ADR 0004 le même jour, **à l'écran depuis le 22 août 2026**.

Un **carnet personnel** : ce qu'on a fumé, quand, la note, et un commentaire libre sur le cigare.
Chaque entrée choisit sa portée — **privée**, **partagée à une personne**, **partagée à plusieurs**,
ou **publique**.

Ce que cela change par rapport au brief : le §5.4 donne à `reviews` une visibilité
`enum(public|followers|private)`. Un enum ne sait pas dire « à Marc et à Julie ». Partager à des
personnes nommées demande une table d'autorisations par entrée, et une policy RLS qui la lit — pas
une colonne de plus. C'est une vraie décision d'architecture : elle mérite une ADR avant la première
ligne de SQL, parce qu'elle décide aussi de ce que voit le fil social de P3 et de ce que comptent
les statistiques de P11.

À ne pas confondre avec la dégustation structurée du §5.4 (trois tiers, roue des arômes, moyenne
bayésienne) : le carnet est le geste quotidien, la dégustation est l'exercice. Ils partagent
probablement la même table, et c'est précisément ce qu'il faut vérifier avant de l'écrire.

**L'ADR est écrite et acceptée** : [`docs/adr/0004-portee-des-entrees-du-carnet.md`](docs/adr/0004-portee-des-entrees-du-carnet.md).
Elle tranche les trois points — une seule table `reviews` avec un discriminant
`kind`, l'enum pour la classe d'audience et `review_shares` pour nommer les personnes, une moyenne
publique qui ne compte que le public. Sa question ouverte est tranchée : `followers` est gardée
pleinement, ce qui fait de l'avertissement « votre nombre d'abonnés changera » une obligation
d'interface.

**Ce qui est à l'écran** : le geste quotidien sur la fiche cigare (`kind='log'`), l'exercice à
`/cigares/[slug]/degustation` (`kind='tasting'` — six critères, trois tiers, roue des arômes,
minuteur, à l'aveugle), `/carnet` et `/carnet/[id]` pour relire, filtrer, modifier, nommer des
destinataires et supprimer, la bascule /100 ↔ /20 du §5.4, et `cigar_stats` sur la fiche.

**Trois règles héritées de l'ADR, qui ne se contournent pas** : aucun filtre `visibility` en
TypeScript — la RLS l'applique et rien d'autre ; la portée est **par entrée**, jamais globale ; et
seules les entrées publiques alimentent une moyenne publique. La quatrième est d'interface :
choisir « mes abonnés » doit **dire** que l'audience est vivante. Depuis P3 elle n'est plus vide, et
la phrase a changé plutôt que disparu — l'abonnement étant libre, l'auteur ne choisit pas qui la
rejoint ; ce qu'il garde, c'est le retrait.

**Deux décisions prises en construisant**, consignées dans `docs/decisions-log.md` : les six
sous-notes sont sur 10 et la note globale en est la moyenne — elle ne se saisit pas, faute de quoi
les six critères deviendraient décoratifs ; et le brouillon d'une dégustation vit dans
`localStorage`, parce qu'une dégustation à moitié tapée n'a nulle part où exister dans `reviews`.

L'[ADR 0005](docs/adr/0005-cible-des-commentaires.md) tranche la cible des commentaires : **la fiche
cigare**. Conséquence à ne pas perdre de vue — elle avance les obligations DSA de P3 à P1, et le
défaut de la Q12 ne tient plus.

**Les trois obligations de l'ADR 0005 sont livrées** depuis le 22 août 2026 : le mécanisme
(`POST /api/signalements`, bouton « Signaler » sur chaque fiche et chaque commentaire), la file
(`mod.reports`, écrite par `public.file_report()`) et le délai (72 h, publié dans les mentions
légales, lu depuis `feature_flags`). Il manque **qui modère** — pas de back-office avant P8, et
personne n'est encore désigné pour relever la file.

## La cave — livrée, et c'est elle qui ferme P2

Le §9 donne à P2 un critère de sortie qui ne parle ni de schéma ni d'écran : « créer une dégustation
et **décrémenter la cave** de bout en bout ». Tout tient dans une colonne que le §5.5 écrit en
passant, `humidor_events.review_id`, et dans ce qui garantit que les deux lignes s'écrivent
ensemble. L'[ADR 0006](docs/adr/0006-atomicite-de-la-cave.md) tranche les quatre points.

**Ce qui est à l'écran** : `/cave` (plusieurs caves, ce qu'elles tiennent, ce qui est à faire
tourner), `/cave/[id]` (inventaire, grand livre, hygrométrie, import et export CSV, réglages),
« j'en fume un » sur la fiche cigare **et** sur la cave, un lot facultatif à décompter depuis le
formulaire de dégustation, et `/statistiques` (F11).

**Quatre règles qui ne se contournent pas :**

1. **Un geste qui touche deux tables est une fonction `SECURITY INVOKER`.** Un appel PostgREST est
   une transaction ; les droits d'appelant laissent la RLS décider. On n'achète pas un privilège
   pour obtenir une transaction.
2. **`qty` ne s'écrit pas à la main.** Dans le `GRANT INSERT` — l'inventaire d'ouverture — et dans
   aucun `GRANT UPDATE`. Après la naissance du lot, seul le trigger de somme l'écrit.
3. **Ce qui sort de la cave entre au carnet en `private`**, avec le sélecteur de portée du carnet
   et pas une case « publier ». Et seulement si on a quelque chose à dire : exiger une note pour
   décompter un stock produirait des notes inventées ou des cigares que la cave ignore.
4. **Un lot par achat.** Deux boîtes du même cigare n'ont ni le même âge ni le même prix.

**La cave est privée, et le carnet l'est séparément.** `privacy.show_humidor` gouverne qui voit
l'inventaire ; `reviews.visibility` gouverne qui lit l'entrée. Une entrée publique écrite depuis une
cave privée est normale : elle dit qu'on a fumé ce cigare, jamais qu'on en a sept autres.

## Fin de P1 — livrée le 22 août 2026 au soir

`/parametres` (profil, préférences, confidentialité, registre de consentements, RGPD),
`/cigares/comparer` (2 à 4 fiches), `/codes-de-boite` (décodeur), la contribution wiki
(`/cigares/[slug]/proposer`, `/cigares/[slug]/historique`, `/contributions`), le sitemap, la carte
OG et le contrôle de dérive des types.

**Trois refus valent d'être retrouvés, parce qu'ils se rediscuteront :**

1. **Le registre de consentements n'offre aucune case.** Trois des six types ne sont pas fondés sur
   le consentement (contrat, obligation légale — art. 6.1.b et 6.1.c), et l'art. 7.4 dit qu'un
   consentement qu'on ne peut pas refuser n'en est pas un. Les trois autres gouvernent des
   traitements **qui n'ont pas lieu**. Demander la permission de ce qu'on ne fait pas fabrique un
   enregistrement, pas une permission — et un registre plein de consentements à rien est pire qu'un
   registre vide, parce qu'il ressemble à de la conformité.
2. **Le comparateur n'affirme aucune relecture.** `ref.cigars.verified_at` est renseigné sur les
   940 fiches et `verified_by` sur aucune : l'horodatage vient de la publication, pas d'une lecture.
   Aucun écran ne montrait cette colonne ; le comparateur aurait été le premier.
3. **Proposer une fiche entièrement nouvelle n'est pas construit**, et l'écran dit pourquoi :
   `created_by` s'écrit à l'insertion et ne se modifie plus, donc une fiche créée par un relecteur
   porterait son nom et non celui du proposeur. Dans un référentiel dont toute la valeur est la
   provenance, cela demande une migration et une décision.

**Ce qui rouvre `ref.lines` existe désormais** — la file de contribution — mais proposer une _gamme_
n'est pas offert : il faut d'abord que des gammes existent. La décision de v1 ci-dessous tient.

## P3 — le social, livré le 23 août 2026 au matin

`/fil` (deux onglets, pagination keyset par lien, composeur), `/fil/[id]` (braises, réponses),
`/membres` et `/membres/[handle]` (profil public, abonnements, blocage), `/notifications`, plus
« Je fume ce cigare » sur la fiche et « Publier au fil » sur une entrée de carnet. ADR 0007,
migrations `0010` à `0013`, 66 assertions de parcours en navigateur.

**Les trois dettes de P3 sont refermées** : la branche `followers` de `reviews` existe,
`show_humidor` ouvre une cave sans ouvrir son grand livre, `show_reviews` et `show_country` sont
lus par un écran.

**Quatre décisions à ne pas redécider sans ADR** (les détails sont dans 0007) :

1. **Un abonnement est libre, asymétrique, et se retire des deux côtés.** Pas de file
   d'approbation : une approbation donnée en janvier ne se redemande pas en juin, un retrait reste
   exerçable. C'est la question encore ouverte de l'ADR — elle porte sur ce qu'on promet.
2. **Le fil est `posts`, et rien d'autre.** Une entrée de carnet y entre par une publication qui la
   pointe, dont la portée est celle de l'entrée, tenue par un trigger dans les deux sens.
3. **Une publication est `followers` ou `public`.** Jamais privée ni partagée : publier, c'est
   s'adresser à quelqu'un, et écrire pour soi c'est le carnet — qui le fait déjà par défaut.
4. **Un blocage est une policy `RESTRICTIVE`.** Les permissives sont OR-ées ; une de plus ne peut
   jamais retirer une ligne. C'est le seul mécanisme de PostgreSQL qui dise « quoi qu'on autorise
   ailleurs, pas celle-ci ».

**Et une règle de mesure**, qui a changé le code trois fois en une phase : **un prédicat dans une
policy s'évalue une fois par ligne examinée.** Une règle qui se laisse écrire comme un tableau sans
argument s'évalue une fois par requête — en InitPlan, dès qu'on l'enveloppe dans `(select …)`.

## P5 — les lieux, livrés le 23 août 2026

ADR 0011 avant le SQL, migration `0016` (postgis, `venues`, `venue_reviews`,
`events.venue_id`, `posts.venue_id`), 200 lieux seedés depuis le **registre officiel des
buralistes** (DGDDI 2018, Licence Ouverte — voir `supabase/seed/PROVENANCE.md` §7), quatre écrans
sous `/lieux`, 14 assertions SQL, 36 assertions de parcours. Critère de sortie mesuré : 0,6 ms par
recherche 25 km sur la vraie base (47 ms à froid), 8 ms en local sur 50 200 lignes, GiST engagé.

**Cinq règles qui ne se contournent pas, héritées de l'ADR 0011 :**

1. **Aucune ligne d'OSM dans `venues`**, directe ou recopiée, tant qu'un avis juridique n'a pas
   borné le partage à l'identique de l'ODbL — il engagerait le régime de notre propre base.
2. **Un lieu naît `pending` et son auteur ne le publie pas** : le WITH CHECK de sa policy l'exige,
   un `editor` publie. C'est l'asymétrie que `ref.lines` n'avait pas (ADR 0009), à l'endroit.
3. **`claimed_by` est une identité, pas un drapeau.** Hors de tout grant client ; le parcours de
   revendication attend un canal de contact (Q7), et la fiche le dit.
4. **Un avis n'a que trois colonnes où exister** — accueil, confort, conseil — et sa note est
   `GENERATED`. Le garde-fou du §5.7 est la forme de la donnée ; l'auto-contrôle de 0016 compare
   le `GRANT INSERT` à la liste exacte.
5. **Tout `/lieux` vit derrière `venues_enabled`**, dont la charge utile liste les types offerts :
   la restriction que Q6 anticipe est un `UPDATE` d'une ligne, nav comprise.

**Deux absences voulues** : la **carte** (le fournisseur de tuiles est un sous-traitant à choisir —
question ouverte de l'ADR) et la **revendication en un clic** (rien ne se revendique sur simple
déclaration). Le seed date de 2018 et le dit sur chaque fiche ; une fermeture se signale
(`inaccurate`) et se consigne en `closed`, que le rejeu du seed ne rouvre jamais.

## P6 — le journal, livré le 23 août 2026

ADR 0012 avant le SQL, migration `0017` (`articles`, `article_links`), quatre écrans
(`/journal`, `/journal/[slug]`, `/journal/ecrire`, `/journal/flux.xml`), 8 assertions SQL,
24 assertions de parcours sur trois contextes — dont un visiteur **sans** cookie de portail, qui
est celui qui prouve la frontière. Critère de sortie mesuré : **Lighthouse SEO = 100** sur `/`,
`/journal` et un article public, levier d'indexation ouvert.

**Cinq règles qui ne se contournent pas, héritées de l'ADR 0012 :**

1. **Un article est du contenu, jamais du code.** La colonne est `body_md`, le rendu passe par le
   sous-ensemble Markdown de `lib/journal/markdown.ts` — arbre typé, éléments React, jamais
   `dangerouslySetInnerHTML`, jamais de MDX. L'auto-contrôle de 0017 échoue si une colonne `*mdx*`
   apparaît, et les tests du parseur portent les cas d'injection.
2. **Une adresse, deux audiences (Q13).** `/journal` est le seul préfixe public du site ; un
   article `gated` se défend lui-même — cookie du portail exigé par sa page, `noindex`, absent du
   sitemap et du flux RSS. `safeSuite` connaît l'exception du préfixe pour ramener le lecteur
   après le portail.
3. **Pas de fiche liée sur un article public** — le lien EST la mention de produit que Q13
   interdit. Deux triggers tiennent la règle dans les deux sens.
4. **Le journal s'écrit par les `editor`, qui publient eux-mêmes** — écrire est le privilège,
   contrairement au wiki où l'auteur ne publie pas.
5. **Pas de newsletter en v1** : pas de clé Resend, pas de domaine (Q7), et collecter des adresses
   sans pouvoir ni envoyer ni confirmer serait une table de données personnelles au service de
   rien. **Le flux RSS est l'abonnement.**

**Le levier d'ouverture existe** : `SITE_INDEXABLE=1` fait passer `robots.txt` et la méta robots
du tout-interdit à exactement la frontière Q13. Il reste fermé tant que Q1 n'est pas tranchée.
Deux **brouillons d'amorçage** signés du compte du porteur attendent sa relecture — les publier
est son geste (question ouverte de l'ADR 0012).

## P8 — modération, a11y, PWA, perf, livré le 23 août 2026

**Hors de l'ordre du §9, et dit** : P7 attend ses clés Stripe et P4 ses clés IA (Gemini) — la
commande de session du 23 août (« avance sur ce que tu peux ») autorise l'enjambement. ADR 0013
avant le SQL, migration `0018` (les quatre portes du modérateur), `/moderation`, l'audit axe-core,
le manifest PWA. Critère de sortie mesuré : **0 violation axe-core, tous impacts confondus**, sur
24 écrans en trois rôles — le §9 ne demandait que zéro critique.

**Cinq règles qui ne se contournent pas, héritées de l'ADR 0013 :**

1. **`mod` reste non exposé, et les portes sont tout le chemin.** Quatre fonctions
   `SECURITY DEFINER` gardées par `has_min_role('moderator')` à l'intérieur ; aucun rôle client
   n'a de droit de table dans le schéma, et l'auto-contrôle de 0018 casse si cela change.
2. **La décision emporte sa trace et son acte dans la même transaction.** Un contenu masqué sans
   trace motivée est l'état que le DSA interdit ; `mod_decide()` rend les trois inséparables.
3. **Un dossier tranché ne se retranche pas : la contestation est un nouveau signalement**, qui
   peut porter `restore`. L'auteur d'un commentaire masqué lit le motif sous la ligne barrée et a
   un bouton « Contester ce retrait » — le parcours a prouvé le trou avant que le bouton n'existe.
4. **Aucune porte ne rend `reporter_id`.** Un signalement se juge sur ce qu'il vise ; les
   décisions, elles, sont signées.
5. **`warn`, `suspend` et `delete` restent dans l'enum et sont refusés avec leur raison.** Un
   verbe sans bras fabrique un enregistrement, pas un acte. `warn` s'armera quand `notifications`
   saura le porter, `suspend` à l'ouverture des inscriptions, `delete` pas tant que le masquage
   motivé suffit.

**Le reste de P8, à sa mesure** : l'audit est rejouable (`tooling/audit/a11y.ts` — six vraies
trouvailles corrigées, dont seize filtres qui n'annonçaient rien avec un `aria-pressed` que les
liens ne connaissent pas) ; le manifest et l'icône sont neutres par construction §2 et exemptés du
portail dans le `matcher` (sans quoi installer échouait en silence) ; **pas de service worker** —
mettre en cache des pages du portail sous une clé qui ignore le cookie serait un bug de vie privée
déguisé en fonctionnalité, et le client crédible du hors-ligne est la file de scan de P4 ; les
Core Web Vitals du §8 sont tenus là où la mesure a du sens (fiche : LCP 0,7 s, CLS 0, TBT 0 ms en
desktop ; 93/100 en mobile émulé 4×, dominé par les ~700 ms de TTFB du conteneur vers eu-west-3) ;
et l'i18n de P8 est une **vérification**, pas un sélecteur : toute copie passe par
`messages/fr.json`, et un sélecteur de langue sans seconde langue serait le registre de
consentements à l'envers.

**Ce qui manque encore, et c'est le même manque qu'avant** : personne n'est désigné pour relever
la file — la question ouverte de l'ADR 0013. L'écran existe, le goulot est humain : `jeremy` est
le seul compte qui passe la garde.

## L'administration — livrée le 25 août 2026

ADR 0014 avant le SQL, migration `0020`, cinq écrans sous `/admin` (tableau de bord, drapeaux,
comptes, fiches, gammes), le lien depuis `/parametres`, 6 assertions SQL, 28 assertions de
parcours. L'administration **regroupe** ce qui existait (modération, file wiki, lieux, journal,
promotion des rôles sur le profil) et n'ajoute que ce qui n'avait pas d'écran.

**Trois règles qui ne se contournent pas, héritées de l'ADR 0014 :**

1. **Un drapeau ne se change que par `admin_set_flag`**, la porte qui écrit sa trace `audit_log`
   dans la même transaction — le renversement conscient de la position de la 0001 (« un drapeau
   est un événement de déploiement »). Elle refuse une clé inconnue : un drapeau naît dans une
   migration, avec le code qui le lit.
2. **Pas de porte quand une policy suffit.** Comptes, fiches et gammes s'écrivent par la session,
   sous `profiles_select_directory`, `cigars_update_editor` et `lines_*` — le rôle lu à l'écran
   décide de ce qui se rend, jamais de ce qui peut se produire.
3. **`warn`, `suspend`, `delete` restent sans bras** (ADR 0013, D4) : une interface n'est pas une
   raison de les armer. `/admin` ne supprime aucun compte, ne suspend personne, et ne réécrit pas
   une fiche — l'admin **relit** (marquer relue, dépublier, republier), le wiki corrige.

**Marquer une fiche relue écrase `verified_at`** : l'horodatage de publication devient un
horodatage de relecture, et `verified_by` porte enfin ce que le comparateur attendait. La
résorption des 862 non relues passe par `/admin/fiches`, et son achèvement est le déclencheur de
l'ADR 0008.

**L'ADR 0003 est acceptée depuis le même jour** (arbitrage du porteur : « boutique propre
d'abord » — Checkout, option A) ; sa note d'arbitrage consigne aussi le **refus** du modèle
« stock des civettes contre abonnement des buralistes » — deux fois ce que la loi Évin interdit,
désigner où acheter un produit du tabac et être payé pour cette mise en avant.

## La marketplace d'accessoires — livrée le 25 août 2026, ouverte au public le même jour

GO du porteur le 25 août (l'option B de la discussion consignée dans « Quand rouvrir » de
l'ADR 0015). [ADR 0016](docs/adr/0016-la-marketplace-d-accessoires.md) avant le SQL, migration
`0022` (`shop.vendors`, `products.vendor_id`, la marque d'accessoire, `submitted_at`,
`review_note`), 10 assertions SQL (`17_marketplace_rls`), l'espace vendeur `/vendeur`, la
relecture dans `/admin/boutique` et `/admin/boutique/vendeurs`, les deux entrées publiques —
`/boutique` (recherche à facettes, le motif de `/cigares`) et `/boutique/vendeurs/[slug]`
(la vitrine) — **60 assertions de parcours, quatre rôles, 0 échec**, 0 violation axe-core sur
41 écrans.

**Six règles qui ne se contournent pas, héritées de l'ADR 0016 :**

1. **L'entrée est humaine.** Aucune inscription vendeur : l'admin crée (`pending`), l'admin
   active. La traçabilité DSA art. 30 a ses colonnes, nullables ; le CHECK dur arrive avec la
   caisse — l'imposer aujourd'hui exigerait un numéro au registre que la boutique propre n'a
   pas (Q10).
2. **Un vendeur n'est pas un rôle.** Le rattachement est `vendors.owner_id` (unique,
   `set null`), jamais une valeur d'`app_role` — un vendeur n'est ni au-dessus ni au-dessous
   d'un membre.
3. **Le vendeur ne publie pas : son WITH CHECK n'aboutit qu'à `draft`.** `submitted_at` est la
   soumission, l'admin publie ou refuse avec `review_note`. Conséquence assumée : **modifier,
   c'est retirer** — corriger une fiche publiée la repasse en relecture.
4. **Suspendre coupe tout en un UPDATE.** La lecture publique d'un produit exige un vendeur
   `active` (l'EXISTS de la policy, soumis à la RLS de `vendors`) : vitrine et produits
   disparaissent ensemble, réversiblement.
5. **La marque d'accessoire ne touche pas `ref.brands`** — c'est une colonne `products.brand`,
   sous le trigger lexical (élargi par la 0022 à `brand` et au nom du vendeur).
6. **Rien de monétaire.** La D7 (commission Connect contre abonnement-vitrine) est la question
   ouverte de l'ADR — intranchable sans clés Stripe ni structure juridique — et **DAC7 est le
   prérequis consigné du premier euro reversé**. Les avis produits restent sans porte
   d'écriture (ADR 0015 D3, inchangée).

**La boutique est signalable depuis le 3 septembre 2026** (migration `0024`, deux surfaces de plus
dans le CHECK de `mod.reports` et rien d'autre) : « Signaler ce produit » sur la fiche, « Signaler
cette boutique » sur la vitrine, `tobacco_promotion` proposé en premier — un accessoire dont la
fiche vante la consommation est exactement le cas §2 —, et `/moderation` rend le dossier avec le
titre, le vendeur, le lien et, pour un admin, le bras de l'acte. **Deux règles, consignées dans
`docs/decisions-log.md`** : le mécanisme reste derrière une session (la décision se communique à
qui signale, le frein et la déduplication sont clés sur lui) et la route reste derrière le
portail — c'est le **bouton** qui fait le détour, 401 vers la connexion et 403 vers le portail,
chacun avec le retour à la fiche. Aucun verbe de masquage sur un produit : l'acte est celui de
l'admin, dépublier ou suspendre, sous les policies de la 0021 et de la 0022.

**Le drapeau `shop_enabled` est né fermé dans la 0022, et la 0023 l'a ouvert le même jour** sur
instruction du porteur : la boutique est publique (devant le portail — voir « Boutique publique
et paiement de démonstration » ci-dessus), le tunnel d'achat de démonstration va du panier à la
confirmation `QA-`, l'accueil la met en module 01 et l'en-tête la nomme pour tout le monde.
Couper le drapeau depuis `/admin/drapeaux` reste le coupe-circuit — tout `/boutique` répond
alors 404, l'entrée de navigation reste. Trois colonnes se gardent par trigger parce qu'un
grant ne sait pas séparer deux rôles applicatifs : `vendors.status`, `vendors.owner_id`,
`products.review_note` (le motif de `profiles`). Le panier est un cookie et le paiement valide
la forme sans rien encaisser — les deux décisions sont motivées dans `docs/decisions-log.md`,
et `lib/shop/cart.ts` est la source unique du tunnel.

## `ref.lines` : décision de v1

**La table reste vide en v1, et ce n'est pas un oubli.** Les gammes (Cohíba > Línea 1492) existent
au schéma depuis 0001. Les remplir demande deux choses distinctes : écrire une liste de gammes, ce
qu'un modèle de langage fait mal, et **rattacher 940 fiches à ces gammes une par une**, ce qu'il
fait plus mal encore. Or `ref.lines` n'a pas de colonne `status` : contrairement aux fiches, une
gamme est publique dès son insertion. Une erreur d'appartenance serait donc une erreur factuelle
visible, sur la promesse même du référentiel.

Ce que cela coûte : rien à l'écran. La fiche cigare affiche déjà `lines.name` quand il existe et
s'en passe sinon ; la page marque n'en dépend pas.

**Ce qui rouvre :** la file de contribution wiki (F3, fin de P1). Une gamme est exactement le genre
de fait qu'un contributeur connaît et qu'un relecteur vérifie — c'est le bon chemin, et il existera
bientôt. Y verser une liste devinée maintenant, c'est se priver du seul contrôle qu'on a.

**Le déclencheur est arrivé, la relecture est écrite, et l'arbitrage est rendu** :
[`docs/adr/0009-rouvrir-ref-lines.md`](docs/adr/0009-rouvrir-ref-lines.md), **acceptée le 23 août
2026 par délégation** (« je te laisse maître à bord »). Elle trouve un fait que la décision
d'origine avait vu sans le suivre jusqu'au bout — `ref.lines` n'avait pas de colonne `status`,
donc une gamme était publique **dès son insertion**, là où corriger la longueur d'un cigare passe
par une file de relecture. L'asymétrie était à l'envers, et c'est elle qui a décidé : **la 0019
donne le `status` à la table avant qu'elle ne gagne des lignes**, et `line_id` est la douzième
colonne proposable du wiki — bornée aux gammes publiées de la marque de la fiche, revérifiée au
dépôt et à l'application. La création de gamme par les membres (pièce 3) attend que le
rattachement ait du trafic ; d'ici là une gamme naît d'un `editor`, en brouillon, et se publie par
lui. Pas de facette « gamme » sous 5 % de rattachement. **La table reste vide** : l'amorcer par un
script reste interdit (PROVENANCE), seul le chemin de contribution la remplit.

La création d'une **fiche** entièrement nouvelle a sa propre ADR,
[`0008`](docs/adr/0008-proposer-une-fiche-nouvelle.md), pour une raison voisine : la colonne qui
bloque est `created_by`, hors de tout `GRANT UPDATE`, et la seule façon qu'elle porte le nom du
proposeur est qu'il insère la ligne lui-même — donc un brouillon de `ref.cigars`, pas une table à
part. **Acceptée le 23 août 2026 par la même délégation, et rien ne se construit** avant la
relecture des 862 fiches : le déclencheur est la résorption du stock, conformément à la
proposition du document.

## Commandes

```bash
pnpm dev            # développement
pnpm check          # typecheck + lint + tokens + tests — le portail avant commit
pnpm test:e2e       # parcours critiques (exige un pnpm build préalable)
pnpm storybook      # galerie des primitives
```

## Pièges connus, appris à nos dépens

- **`SET LOCAL ROLE` hors transaction est ignoré en silence.** Un test RLS qui l'oublie s'exécute
  en superutilisateur et voit tout passer. Toujours ouvrir un `BEGIN` explicite. Ce n'est pas
  théorique : quatre assertions de `03b-verification.sql` (T9, T16, T17, et T8 par ricochet) sont
  restées vertes ainsi jusqu'en août 2026. `ON_ERROR_STOP` ne se déclenche pas sur un WARNING —
  le workflow `db.yml` relit donc le journal et casse le build si le message apparaît.
- **Une assertion dont la donnée de test n'existe pas réussit sans rien tester.** T8 vérifiait
  qu'un auteur ne peut pas publier son brouillon en comptant les lignes modifiées : zéro. Le
  brouillon n'avait jamais été inséré. Une assertion « zéro ligne » doit d'abord prouver que la
  ligne existe.
- **`typescript-eslint` ne supporte pas TypeScript 7.** Le projet est épinglé sur TS 6 : remonter
  casse `pnpm lint`. Revérifier avant de relever la version.
- **`eslint-plugin-react` plante sur ESLint 10** si on le laisse détecter la version de React.
  Elle est épinglée dans `eslint.config.mjs` ; ne pas repasser en `detect`.
- **`next lint` n'existe plus en Next 16.** ESLint tourne seul, et la clé `eslint` de
  `next.config.ts` n'existe plus non plus.
- **Un garde-fou qui ne se déclenche qu'à l'exécution se déclenche chez l'utilisateur.**
  `AGE_GATE_SECRET` manquait chez Vercel : le build passait au vert et le site renvoyait une 500 sur
  `/majorite`, au moment précis où l'on saisit sa date de naissance. La vérification est remontée
  dans `next.config.ts` et casse désormais le build. Vaut pour toute variable sans laquelle
  l'application ne peut pas fonctionner.
- **Une transaction ne demande pas un privilège.** Deux tables à écrire ensemble font tendre la
  main vers `SECURITY DEFINER` ; un appel PostgREST **est** une transaction, donc une fonction
  `SECURITY INVOKER` suffit et laisse la RLS décider. L'atomicité de la cave a été achetée sans
  acheter une frontière de sécurité. Voir `supabase/CLAUDE.md`.
- **Une contrainte peut être cohérente et fausse.** `aging_start_date >= purchase_date` a passé son
  auto-contrôle, ses dix-sept assertions et `pnpm check` avant qu'un navigateur ne montre ce qu'elle
  interdisait : une boîte achetée vieillie se repose **avant** d'être achetée. Le SQL ne dit jamais
  ce qu'une date signifie ; seul l'usage le dit.
- **Un état d'interface dans un composant client se referme à chaque écriture.** Une Server Action
  qui appelle `revalidatePath` provoque un nouveau rendu serveur, et le panneau qu'on venait
  d'ouvrir disparaît sous les doigts. Dans l'URL, il reste, se partage et survit au retour arrière.
- **Un garde-fou en droits d'appelant se referme sur lui-même.** Le trigger qui protège
  `profiles` appelait une fonction que la 0002 avait fermée aux clients : **aucun membre n'a pu
  modifier son profil depuis P1**, et rien ne l'a vu parce qu'aucun écran n'écrivait dans cette
  table. Trouvé en tapant une ville dans un formulaire. Voir `supabase/CLAUDE.md`.
- **Ce qui part vers l'extérieur doit être relu depuis l'extérieur.** `og:image` pointait sur
  `http://localhost:3000` dans un build de production — `metadataBase` n'était pas posé — et la
  carte OG elle-même était derrière le portail, donc ne s'affichait jamais. Les deux se voient en
  lisant le HTML rendu, aucun des deux en lisant le code.
- **Rien de ce qui est derrière le portail ne se nomme dans un fichier qui est devant.** Sitemap,
  robots, carte OG : ils sont lus par des gens qui n'ont pas franchi la porte et ne le peuvent pas.
  Le sitemap se construit donc depuis `PUBLIC_PATHS`, la carte OG est unique et neutre.
- **Les commentaires ne sont pas du code.** Les scans de conformité masquent les commentaires avant
  d'analyser : sans cela, une phrase expliquant pourquoi une chose est absente déclenche
  l'alerte que cette chose est présente.
- **Un droit légal ne se vérifie qu'en l'exerçant.** `/api/gdpr/export` répondait 500 à tout membre
  connecté depuis sa mise en service : `service_role` n'avait aucun droit de table sur `ref`, et
  rien dans le dépôt ne pouvait le dire. Corrigé par la 0007. Tout endpoint qui met en œuvre une
  obligation du §2 doit être **parcouru une fois avec un compte réel**, pas seulement compilé.
- **La clé de service ne passe pas partout.** `service_role` contourne la RLS, donc on le croit
  capable de tout ; il n'a **aucun droit de table dans `mod`**, et ce schéma n'est de toute façon
  pas exposé à PostgREST. Une écriture dans la file DSA passe par `public.file_report()`, une
  fonction `SECURITY DEFINER` accordée à `service_role` seul. Voir `supabase/CLAUDE.md`.
- **Un `GRANT` de colonne refuse aussi les colonnes qu'on ne voulait pas changer.** La bascule
  /100 ↔ /20 n'a rien fait pendant toute sa première journée : l'action écrivait `updated_at`, qui
  n'est pas dans le `GRANT UPDATE` de `profile_settings` — il porte `(birth_date, locale,
preferences, privacy)`, et un trigger horodate le reste. `42501` était levé, le résultat n'était
  pas lu, et le bouton était décoratif. Troisième membre de la même famille, après « une policy qui
  refuse ne lève pas » et « BYPASSRLS ne dit rien des droits de table ». **Lire le résultat d'une
  écriture, toujours** — et ne jamais écrire à la main une colonne qu'un trigger tient.
- **React 19 réinitialise un formulaire après le retour de sa Server Action.** Une réinitialisation
  rend à chaque champ le `defaultChecked` qu'il avait **au montage**, que React ne resynchronise
  jamais : un groupe de radios contrôlé revient donc à sa valeur de départ pendant que l'état React
  reste juste. Le sélecteur de portée republiait ainsi, au deuxième enregistrement, une entrée qu'on
  venait de rendre privée. Voir `app/CLAUDE.md`.
- **Le garde-fou tabac de la boutique ne s'applique pas aux commentaires.** Mesuré : sur six
  commentaires ordinaires, `isShopTextAllowed()` en refuse quatre. Le critère d'un commentaire est
  l'incitation, pas le vocabulaire — voir `docs/editorial-guidelines.md`, § « Contenu versé par des
  tiers ».
- **Un parcours qui lève une exception saute son propre nettoyage.** `marketplace.ts` rejoué le
  5 septembre 2026 : un sélecteur a expiré à l'étape 12 ter, le `catch` global a sauté les
  treize étapes suivantes, le produit de parcours est resté **publié sur la boutique publique**,
  et l'épilogue affirmait que la base était rendue propre. Une étape s'isole (`step()`), le
  nettoyage vit dans un `finally` et se rejoue à l'ouverture, et l'épilogue dit ce que le
  nettoyage a trouvé — jamais ce qu'il aurait dû trouver. La même session a montré qu'une
  assertion « vide » vieillit avec le catalogue : « la catégorie `coupe` est vide » était vraie
  le 25 août et fausse dès que le catalogue de QA a eu des coupe-cigares. Une vacuité se
  construit (un texte introuvable), elle ne se suppose pas.
- **Une API de géolocalisation répond ce qu'on lui demande, y compris une approximation.**
  `getCurrentPosition` sans `enableHighAccuracy` laisse un ordinateur répondre depuis l'adresse IP,
  donc depuis le central de l'opérateur : Marnes-la-Coquette rendait des lieux du 13ᵉ. Le rayon de
  l'erreur était dans la réponse — `coords.accuracy` — et n'était pas lu. Un point sans son
  exactitude n'est pas un point, et un `maximumAge` généreux rend une position d'hier.
- **Un garde-fou de copie ne se déclenche qu'en changeant de langue.** Quinze chaînes visibles
  étaient écrites en dur dans des composants — l'avertissement sanitaire, le pied de page, la 404,
  les cinq crans de force, douze abréviations de mois — et ont survécu à neuf phases, à `pnpm check`
  et à quatre relectures. Aucune ne se voit en français, toutes se voient sous `lang="en"`. Le
  corollaire est plus utile que le constat : un second dictionnaire est un **test**, et il faut le
  faire tourner en build, pas seulement le traduire.
- **Un agrégat qui appelle `jsonb_object_keys` compte une clé par ligne.** L'auto-contrôle de la
  0028 affirmait que la répartition des bagues rendait cinq clés ; il lisait « r1,r1,r1,r1,r2,… »
  parce que la fonction est _set-returning_ et multiplie les lignes avant le `string_agg`. Une
  assertion de forme sur du JSON agrégé passe par un `select distinct`.
- **Un masque ou un filtre SVG a une région, et sa région par défaut est la boîte de ce qu'il
  habille.** `maskUnits` et `filterUnits` valent `objectBoundingBox` : la région est la boîte
  englobante de la géométrie, plus un dixième, et tout ce qu'un flou ou un déplacement étale
  au-delà est tranché net. La fumée de la planche a été deux bandes verticales pendant une
  journée pour cette raison — deux traits de 13 et 7 unités, floutés à 8, sous un masque qui ne
  mesurait que leur boîte. Trouvé sur une capture du porteur, jamais dans le code : la géométrie
  était juste, la région ne l'était pas. Un masque ou un filtre qui étale quelque chose se déclare
  en `userSpaceOnUse`, avec une région plus large que ce qu'il étale.

## Style

- Contenu de l'app en français, code et commentaires en **anglais** (§0.10).
- Aucune chaîne visible en dur : tout passe par `messages/fr.json`.
- Aucune couleur en dur : tout passe par les tokens de `app/globals.css`.
- Le nom commercial vit dans `lib/brand.ts` et nulle part ailleurs.
- Aucune dépendance ajoutée sans justification écrite (§3). Trois ont été retirées ou évitées
  pendant P0 pour cette raison : `jose`, `vite-tsconfig-paths`, `pg`.

## Commits

Sujet à l'impératif, en anglais, préfixé par le domaine : `feat(band):`, `fix(age-gate):`,
`docs(p0):`, `chore(ci):`. Le corps explique **pourquoi**, pas quoi.

## La refonte des pages cigare — livrée le 5 septembre 2026

Demandée le 5 septembre (« on comprend mal les pages des cigares, les dimensions des encarts,
refonte majeure, la charte reste »), auditée d'abord — douze constats lus dans le code et mesurés
en base, le canevas est dans `design/fiche-cigare/` — puis construite le même jour. La charte n'a
pas bougé ; la distribution, si.

**Ce qui est à l'écran** : la fiche en trois zones (ce que le référentiel sait, avec ses lacunes
qui sont la porte du wiki ; un rail collant « vous et ce cigare » avec la cave, un seul geste et
votre carnet ; ce qu'en disent les membres — la note à sa mesure, les arômes les plus cités, les
entrées en lignes, la discussion de la fiche dite pour ce qu'elle est), la recherche dans
l'en-tête et « Cigares » en entrée directe, le carnet groupé par mois, la liste en grille de bagues
avec une facette « à compléter », et le profil aromatique des fiches (migration 0025).

**Cinq règles qui ne se contournent pas :**

1. **Un seul geste sur la fiche.** « J'en fume un » s'ouvre par `?geste=fumer` (l'état dans l'URL)
   et délègue aux trois écritures qui existaient — `smoke_from_humidor()` pour le lot et l'entrée
   (ADR 0006), `saveLogEntry` sans lot, la publication qui pointe l'entrée ou une session avec son
   lieu (ADR 0007). L'action n'invente aucune règle : une entrée refusée est le refus entier, une
   annonce refusée sur une entrée qui a abouti est un `notice`. Ne pas rouvrir un second formulaire
   sur la fiche.
2. **Le plancher du display est un contrôle de build**, pas une règle de CSS : `.font-display`
   posait `max(2rem, 1em)` dans la couche de base et `text-2xl` gagnait — 91 titres rendus sous
   32 px pendant que la feuille disait 32. `tooling/scripts/check-tokens.ts` refuse désormais
   `font-display` à côté de toute taille sous `text-display-sm/md/lg`. Sous un titre de section,
   c'est Marcellus (`.eyebrow`) ou Inter 16 demi-gras ; le mot-marque a sa classe `.wordmark`, seule
   exception admise.
3. **Le profil aromatique d'une fiche est un fait du référentiel, jamais un amorçage de
   mémoire.** `ref.cigars.aroma_tags` se propose par le wiki (treizième colonne de l'allowlist),
   un trigger tient ce qu'une clé étrangère ne sait pas viser dans un tableau, et aucun script ne
   le remplit de mémoire (PROVENANCE §6 et §9). La seule voie d'amorçage est la spécification que
   le fabricant publie lui-même, transcrite en descripteurs de la roue et citée (0026, PROVENANCE
   §10). Les « arômes les plus cités » sont l'autre fait, agrégé par `cigar_stats` sur les seules
   entrées publiques — la même frontière que la note — et la fiche ne les mélange jamais.
4. **Alimenter une fiche, c'est proposer — et le porteur a choisi d'accepter d'un bloc.**
   `08_habanos_propositions.csv` et `seed_propositions.sql` versent des propositions dans
   `/contributions` (77 vitoles de galera standard dont 39 sur le vitolario étendu de 36 galeras,
   129 forces publiées par Habanos pour la marque) ; `apply_propositions.sql` les accepte comme
   « Accepter » le ferait, une par une, avec la trace qui cite l'instruction du 6 septembre 2026
   (« publie tout ce que tu peux, on fera les corrections derrière »). La relecture est déplacée
   après, fiche par fiche. **Exécuté sur la base le 6 septembre 2026** : 87 galeras, 170
   propositions acceptées sur 131 fiches — 155 fiches publiées portent une vitole (78 avant), 252
   une force (123 avant), 686 ni l'une ni l'autre. Aucune cape, aucun arôme, aucune fiche non
   cubaine dans cette vague : ce qui n'a pas de source reste vide. **Le même soir, la seconde
   vague** (`09_fabricants_propositions.csv`, PROVENANCE §10, régime C — six fabricants non
   cubains, chaque ligne avec l'URL de la page officielle) : 106 propositions sourcées versées et
   acceptées d'un bloc, ce qui porte le référentiel à **170 fiches publiées avec une vitole, 325
   avec une force, 48 avec un profil aromatique, 601 ni vitole ni force**, et 106 propositions qui
   citent une source. Toujours aucune cape.
5. **Trois niveaux de conteneur, et pas un de plus.** La page, la carte (surface et filet, réservée
   au rail et aux chiffres), la ligne (un filet sous le texte). Jamais une carte dans une carte ;
   une entrée est une ligne avec sa note dans la marge, la portée en quatre puces sur une ligne.

**Ce qui reste à faire, et qui le fait** : relire fiche par fiche ce que l'amorçage a écrit —
les 36 galeras ajoutées d'abord, une cote fausse contamine toutes les fiches qui la portent ; les
fiches sans vitole restent listées par la facette « À compléter » ; le canevas de
`design/fiche-cigare/` garde les directions B et C si A déçoit à l'usage.

## L'accueil sobre et l'allègement du site — 6 septembre 2026

Demandé le 6 septembre (« le cigare est trop lisse, les bandes trop régulières, la bande fumée
strictement horizontale ; l'accueil est surchargé pour rien ; le site n'est pas assez élégant, les
encarts encore trop gros »), mesuré d'abord — 173 encarts `rounded-[3px] border` écrits à la main
dans 79 fichiers, 31 états vides de 96 px, 280 surtitres en capitales, 49 filets laiton — puis
construit le même jour. La charte n'a pas bougé ; l'accueil, la planche et la densité, si.
L'analyse complète et le prompt de la prochaine session sont dans `docs/audit-2026-09-06.md`.

**Ce qui est à l'écran** : un accueil en trois temps (une phrase, la planche, six lignes sur ce
qu'il y a derrière la porte, la porte), une planche redessinée en SVG, et un site qui préfère la
ligne à la carte — hubs, états vides, publications, lieux, notifications, conversations, file de
relecture, panneau d'un lot, dossier de modération, en-tête des paramètres.

**Cinq règles qui ne se contournent pas :**

1. **Rien de droit sur un objet roulé à la main.** La planche
   (`components/landing/cigar-plate.tsx`) est un SVG : une couture est une hélice vue de côté,
   donc un cosinus, espacée à la main ; le reflet est une région aux bords qui ondulent, floutée,
   jamais une bande ; la cendre, la ligne de feu et le bord carbonisé sont des chemins qui
   tremblent, puis un déplacement de turbulence les émiette ; la fumée est un ruban qui s'élargit
   en montant, déchiré par une turbulence, né sur la ligne de feu et chauffé par la braise à son
   pied, en deux copies qui montent à contretemps. Le pigment reste dans
   `app/globals.css` (`--plate-*`, le contrôle des tokens refuse un hexa ailleurs) et le SVG le
   lit par `var()`. Tout chemin est calculé par des constantes et `Math.sin`, identique côté
   serveur et côté client.
2. **L'accueil dit une chose et montre un objet.** Une phrase, la planche annotée en mesures (le
   §2 ne bouge pas : aucune marque, aucun adjectif), six lignes sur ce qui existe — pas sur ce
   qui attend ses clés (le scan, le Cercle, les partenaires) — et « Entrer » trois fois, en-tête,
   héros et pied, ce que le parcours e2e compte. Les figures des neuf modules, le sommaire, le
   nuancier et la grille tarifaire sont partis avec `components/landing/figures.tsx`.
3. **La ligne avant la carte.** Un état vide est une ligne entre deux filets (`EmptyState`), un
   hub est une liste de lignes, une publication est une ligne comme une entrée de carnet. Une
   carte se mérite : le rail de la fiche, la carte de bague de la liste, la fiche produit. Jamais
   une carte dans une carte — le panneau d'un lot ouvert est un filet à gauche, pas une boîte
   dans la boîte.
4. **`.eyebrow` est un surtitre, `.label` est un libellé.** Marcellus en capitales espacées se lit
   une fois — le surtitre d'une page, la bague. Le libellé d'un champ, d'une `dt`, d'une carte
   est `.label` : Inter, 13 px, sans capitales. `<Label>` de `components/ui/field.tsx` l'a
   basculé pour tous les formulaires du site.
5. **Un chiffre n'est pas un titre.** `FigureRow` et `Figure` (`components/data/figures.tsx`)
   remplacent les deux copies de la bande de tuiles : Inter 24 demi-gras entre deux filets, pas
   le didone à 32. Une confirmation `role="status"` est un filet à gauche (`border-l-2`), pas un
   encart — il y en avait neuf copies.

**Un piège de plus** : `next dev` (Next 16) **réécrit `CLAUDE.md`** en y ajoutant un bloc
`nextjs-agent-rules` à chaque démarrage. `agentRules: false` dans `next.config.ts` le désactive ;
sans quoi le fichier qui dit comment on travaille change sous les doigts.

**Ce qui reste à faire** : `/vendeur` et `/admin/boutique` déplient encore leurs trois panneaux à
la fois ; `/evenements/[id]` garde ses étiquettes-radio bordées ; les 17 en-têtes de section
« titre + lede » attendent un composant ; les parcours de `tooling/parcours` et l'audit a11y sont
à rejouer sur les écrans allégés.

## Les arômes et les cotes sourcés — 6 septembre 2026 au soir

Demandé par l'audit du jour (`docs/audit-2026-09-06.md`, n° 1 : « c'est le contenu ») et construit
le même soir. Trois pièces de schéma, deux écrans, un fichier de données, et une mesure.

**Ce qui est à l'écran** : une proposition porte sa **source** (migration 0026 — un champ
facultatif sur `/cigares/[slug]/proposer`, lue dans `/contributions`, l'historique et la relecture) ;
la **relecture en série** `/admin/fiches/relire` (une fiche à la fois, ses propositions, la source
à un clic, `A` et `R` annoncés, un compteur « 12 / 214 », le filtre « avec source » et la fiche
courante dans l'URL) ; la **provenance sur la fiche** (« selon le fabricant » avec le lien, ou
« selon le référentiel », lue par la porte `sheet_sources()` de la 0027 — jamais mélangée aux
« arômes les plus cités par les membres ») ; la facette « À compléter » en trois — **sans vitole,
sans force, sans arômes** — et la liste qui compte les trois.

**Cinq règles qui ne se contournent pas :**

1. **Une source se dit au dépôt et ne se réécrit pas.** `ref.cigar_revisions.source` est dans le
   GRANT INSERT et hors de tout GRANT UPDATE : un relecteur décide sur ce qu'il a lu, et la trace
   cite ce qui a été jugé. Corriger une source, c'est retirer la proposition et la refaire.
2. **Le bloc n'accepte que ce qui cite une source.** `apply_propositions.sql` filtre
   `source is not null` ; une proposition d'amorçage muette reste en attente et se relit à la
   main. « Publie tout ce que tu peux » veut dire cela dès qu'on sait distinguer une transcription
   d'une supposition.
3. **Transcrire, jamais compléter.** Un cran de l'échelle du §5.1 ou rien (« fuller-bodied »,
   « intense », « Medium Plus » restent vides) ; un descripteur de la roue ou rien (« spice »,
   « wood », « earthy » sont des familles ; plum, nuts, marzipan n'ont pas de descripteur et on
   n'en crée pas — le script s'arrête sur un slug inconnu) ; une cote exacte d'un format
   conventionnel non cubain ou rien (un « 5 × 50 » de Padrón n'est pas un Prado). Les citations de
   revues qu'un fabricant reproduit sont des bases tierces, où qu'on les lise. PROVENANCE §10 tient
   la liste de ce qui a été laissé vide, et pourquoi.
4. **La provenance passe par une porte de la taille du geste.** `ref.cigar_revisions` reste
   privée ; `public.sheet_sources(uuid)` (SECURITY DEFINER, 0027) projette par colonne l'URL et la
   date de la **dernière** proposition acceptée — jamais l'auteur, le diff ni le commentaire, et
   l'auto-contrôle relit ses trois colonnes. Un profil transcrit du fabricant puis corrigé de
   mémoire n'est plus « selon le fabricant ».
5. **La relecture en série ne décide pas autrement que `/contributions`.** Mêmes
   `approveRevision` / `rejectRevision`, même fraîcheur, même trace, mêmes policies ; la seule
   chose ajoutée à l'action est `retour`, passé par `safeSuite()`. La touche `R` ne refuse pas —
   un refus demande un mot — elle mène au champ ; `Ctrl + Entrée` refuse. L'écran est gardé au
   rang de relecteur (`editor`), pas d'admin : le droit de décider est celui de la policy.

**Mesuré, pas supposé** : `tooling/parcours/relecture.ts` — 21 assertions, 0 échec, la fiche
rendue telle qu'elle était ; `tooling/audit/a11y.ts` rejoué sur les 48 écrans, les deux nouveaux
compris — **0 violation, tous impacts confondus**, après une correction : l'indice de lieu du
geste « j'en fume un » passait sous 2,5:1 derrière un `opacity-60`, et un bloc désactivé se dit
désormais par son contrôle et une encre atténuée, jamais par une opacité.

**Ce qui reste à faire, et qui le fait** : relire fiche par fiche les 106 propositions acceptées
d'un bloc, la source à un clic ; les treize Winston Churchill de Davidoff, 145 fiches Arturo
Fuente, les Padrón 1964 et les Rocky Patel sans champ de force attendent une page qui dise un
cran ou une note (PROVENANCE §10 les liste) ; l'échelle d'intensité de Davidoff se rend côté
client et n'a pas été transcrite. La cape reste hors de tout script.

## La première QA humaine — 12 septembre 2026

Vingt-huit demandes en une session (« il y a énormément de chantier, c'est normal c'est notre
1ᵉʳᵉ phase de QA »), plus une correction en cours de route sur l'accueil. Trois ADR avant le
code — [0017](docs/adr/0017-la-boutique-en-revente.md) (la boutique revend),
[0018](docs/adr/0018-l-abonnement-du-cercle.md) (deux formules), et
[0019](docs/adr/0019-deux-langues-un-build.md) (deux langues) —, sept migrations `0028` à `0034`,
et neuf composants nouveaux.

**Ce qui est à l'écran** : la note **en bagues sur 5** partout (`cigar_stats` recalcule sa
répartition en cinq seaux, l'échelle /100 ↔ /20 disparaît avec le réglage qui la portait) ;
« Chez moi » éclaté en **Mon carnet** et **Ma cave**, quatre onglets qui se nomment ; un
**thème clair** en marron très pâle, choisi par un bouton et retenu par le navigateur ; un
**menu** et un **fil d'Ariane sur 28 écrans** ; une **suggestion de cinq bagues** déduite du
carnet (`suggest_cigars`, 23 ms) ; la **géolocalisation recalée** ; **13 482 lieux** au lieu de
200, limités aux civettes et aux fumoirs ; `/cercle` avec ses deux formules et de vraies
lignes ; la **boutique en revente**, la marketplace retirée ; **trois comptes invités
administrateurs** ; l'accueil réduit à une phrase, la planche et la porte ; et le site en
**anglais**, dictionnaire complet et vérifié.

**Six règles qui ne se contournent pas :**

1. **Une bague est un seau, et le seau est en SQL.** `ringBucket()` recopie le
   `greatest(1, ceil(score / 20))` de la 0028 pour que la carte et la vue comptent pareil ;
   `tests/unit/reviews-rings.test.ts` compare les deux. La colonne reste sur 100 — c'est le
   **geste** qui est sur cinq, et la politique de confidentialité le dit maintenant ainsi.
2. **Une position sans son exactitude n'est pas une position.** Le bouton « me localiser »
   demandait au navigateur une réponse rapide : sans `enableHighAccuracy`, un ordinateur répond
   depuis l'adresse IP, donc depuis le central de l'opérateur — Marnes-la-Coquette rendait des
   lieux du 13ᵉ. `coords.accuracy` était dans la réponse et n'était pas lu. `lib/venues/geolocation.ts`
   exige la précision, refuse un délai périmé (`maximumAge: 0`) et **dit** au lecteur quand sa
   position n'est connue qu'à 12 km près, au lieu de chercher autour d'un point faux.
3. **Personne ne vend ici que nous.** L'ADR 0017 remplace la 0016 : `vendors.owner_id` disparaît
   avec l'espace vendeur et les deux policies de `storage.objects` qui le lisaient,
   `products_select_published` ne teste plus que le statut — suspendre un partenaire ne retire
   plus de la vente un stock déjà payé —, et DAC7 quitte le chemin avec le vendeur tiers.
4. **Une porte d'abonnement sera une policy, jamais une page.** `/cercle` annonce deux formules
   et ne retient rien (ADR 0018). Quand la caisse existera, l'abonnement entrera dans le prédicat
   des quatre policies SELECT de `reviews`, découpé **par rôle** — la branche `public` sert aussi
   `anon`. La moyenne publique d'un cigare, elle, ne se ferme pas : c'est ce qui fixe le périmètre
   du payant.
5. **La locale est une décision de compilation.** 120 des 164 fichiers lisent la copie à la portée
   du module et Next 16 n'a pas de contexte de requête synchrone : `NEXT_PUBLIC_LOCALE=en pnpm build`
   est le site anglais (ADR 0019). `Record<Locale, Messages>` casse le build sur une clé
   manquante, `tests/unit/i18n-parity.test.ts` prend l'autre sens — clé orpheline, interpolation
   renommée, message vide —, et une valeur inconnue est un build rouge.
6. **Un compte ne se crée pas par un script.** `admin_invitations` (0033) porte l'adresse et le
   rôle ; `tg_handle_new_user()` le lit à la première connexion. Écrire dans `auth.users` depuis
   une migration fabriquerait un compte sans mot de passe et sans trace.

**Mesuré, pas supposé** : recherche de lieu 45,8 ms → **4,9 ms** (deux index trigrammes, 0031) ;
`venues_nearby()` **48 ms** et le balayage KNN 11 ms sur 13 482 lignes ; `suggest_cigars` **23 ms** ;
`pnpm check` vert (**421 tests**) ; les deux builds compilent et prérendent 61 pages, et **aucune
chaîne française ne subsiste dans une page prérendue du build anglais**.

**Ce que seule une seconde langue trouve** : **quinze chaînes visibles n'avaient pas de clé** et
rendaient du français sous `lang="en"` — l'avertissement sanitaire (dont la clé existait, non
lue), les cinq liens du pied et son nom de repère, quatre titres de pages légales, la 404, la
frontière d'erreur, le titre du portail, les cinq crans de force, deux noms accessibles construits
par gabarit, et un tableau de douze abréviations de mois que `Intl` formate désormais. Neuf phases
et `pnpm check` ne les avaient jamais vues : **un garde-fou de copie ne se déclenche qu'en
changeant de langue.**

**Trois chaînes étaient fausses plutôt que non traduites**, corrigées des deux côtés : la
politique de confidentialité décrivait encore une note sur 100 que la 0028 a remplacée ; deux
libellés d'administration affirmaient qu'un produit publié n'était pas encore visible, faux depuis
l'ouverture de la boutique ; et le portail demandait « Quel est votre date de naissance ».

**Une collision à ne pas « corriger »** : l'anglais de _vitole_ **est** le nom commercial —
`vitola`. Le contrôle de `check-tokens` l'a trouvé sur sept libellés et il avait raison deux fois :
un `<dt>` qui dit « Vitola » sur un site qui s'appelle Vitola est ambigu pour le lecteur. Le
libellé nu dit **Format**, les termes d'art espagnols prennent la forme du vitolario (« Salida
name », « Galera name »), et le mot reste en minuscule dans le fil du texte. **Le garde-fou n'a pas
été assoupli** : `messages/` est le fichier où un nom de marque a le plus de chances d'être tapé à
la main.

**Ce qui n'a pas été fait, et pourquoi** :

- **Les photos de cigares.** Il n'existe pas de corpus sous licence ouverte, et PROVENANCE
  interdit les deux contournements (recopier une base tierce, produire une image de mémoire).
  Une photographie est protégée par l'art. L112-2 du CPI : le seul chemin est une licence écrite
  par marque. Aucune colonne, aucun bucket, aucun écran d'attente n'a été construit — un
  emplacement vide promet une image qui n'arrive pas.
- **« Les marques apparaissent si elles payent »** : reporté par le porteur lui-même
  (« donc à voir un peu plus tard »).
- **Le parcours navigateur du tunnel d'achat**, perdu avec `tooling/parcours/marketplace.ts`
  (ADR 0017, avec son déclencheur).
- **Les écrans qui exigent une session** — carnet, cave, fil, paramètres, statistiques — n'ont pas
  été relus en anglais dans un navigateur : ils redirigent vers la connexion. Leur copie vient des
  mêmes sections que le reste et la parité est prouvée clé par clé, mais ce n'est pas la même
  chose que de les avoir lus.
- **Les 109 encarts `rounded-[3px] border` écrits à la main** qui restent (173 au 6 septembre) :
  l'allègement continue là où l'audit du 6 l'a laissé.

## L'audit du 14 septembre 2026 — ce qu'une page fait d'un échec de son fournisseur

Le site a rendu « Quelque chose n'a pas abouti » au porteur. La cause n'était pas notre code :
l'API de Supabase mettait **0,44 à 18,2 s** pour lire cinq lignes et échouait **3 fois sur 20**,
pendant que la base derrière répondait en **38 ms**. Elle s'est rétablie seule, sans redémarrage —
et c'est le fait qui décide : **ce qui se rétablit seul peut redégrader seul**, donc le correctif
est une règle de comportement, pas une intervention. Tout est mesuré dans
[`docs/audit-2026-09-14.md`](docs/audit-2026-09-14.md).

**La règle, [ADR 0020](docs/adr/0020-echouer-franchement-ou-se-rendre-vide.md)** : _ce qui est le
sujet de la page échoue franchement ; ce qui l'accompagne se rend vide en le disant._ Le test qui
tranche : **si ce bloc disparaissait, la page répondrait-elle encore à la question avec laquelle le
lecteur est venu ?**

**Cinq règles qui ne se contournent pas :**

1. **La valeur de repli n'est jamais la valeur vide du type.** Jamais `[]`, jamais `null`, jamais
   `0`. `accessory()` rend `{ ok: false }`, sans valeur à prendre pour de la donnée — parce que
   `reviews`, `posts`, `venues` et `products` rendent **légitimement** zéro ligne, et qu'un
   `catch { return [] }` est le doublage de policy que `lib/CLAUDE.md` interdit. **Un échec doit se
   distinguer d'un refus.**
2. **La décision vit au site d'appel, jamais dans `lib/**/queries.ts`.** Mesuré, pas supposé :
   `listAromaWheel()` est le **sujet** de `/aromes` et une **facette** de `/cigares`. Une requête ne
   sait pas qui l'appelle. Les 79 lectures continuent donc de jeter, et aucun `catch` ne s'ajoute
   là-bas — `tests/unit/degrade.test.ts` échoue si un cinquième repli argumenté apparaît.
3. **Trois choses ne sont jamais un accompagnement** : ce qui alimente un `notFound()` ou un
   `redirect()` ; ce qui alimente une décision de droit (rôle, drapeau, confidentialité — repli
   **fermé**, jamais ouvert) ; et une écriture.
4. **Pas de cache posé pour masquer une panne.** Un cache posé pour cacher une panne cache aussi la
   prochaine. La fraîcheur est une promesse au lecteur ; elle se décidera pour ses propres raisons,
   jamais pendant une panne.
5. **`currentUser()` jette quand il n'a pas pu savoir.** Il rendait `null` sur n'importe quelle
   erreur : pendant la panne, un membre connecté était **renvoyé à la page de connexion** sur
   `/carnet`, `/cave` et `/fil`. Le partage se fait sur la forme de l'erreur, vérifiée contre l'API
   réelle — 400/403 veut dire « pas de session », tout le reste jette.

**Deux chantiers voisins, mesurés le même soir :**

- **Les allers-retours par page**, comptés en instrumentant le client (`--import` devant
  `next start`, rien en production) et non en lisant le code. Les promesses de `lib/CLAUDE.md`
  tiennent — `feed_page()` en un appel, `conversation_inbox()` en un, le carnet en quatre. Le fait
  que la lecture du code ne donnait pas : **l'en-tête coûte trois allers-retours sur chaque page
  connectée**, le poste unique le plus lourd du site. Les fonctions SQL qui les remplaceraient sont
  **nommées et pas construites** : la base répond en 38 ms, donc réécrire une requête ne gagne rien
  tant que l'API met huit secondes à la transmettre.
- **La région est déclarée** (`vercel.json`, `cdg1`). La donnée n'avait jamais quitté Paris —
  Supabase est en `eu-west-3`, et c'est la seule moitié de la phrase qui engage le RGPD ; ce qui
  tournait à Washington, ce sont les fonctions, qui ne stockent rien. **Le document public n'est
  exact qu'à partir du prochain déploiement** : à vérifier sur `x-vercel-id` avant de clore.

**Et la couverture de l'audit a11y dit enfin ce qu'elle couvre.** L'audit **lit seulement** : il ne
fabrique pas de fixtures, donc il ne peut pas auditer les deux états d'un écran. Il dit désormais
**lequel** il a vu — 45 écrans, 30 peuplés, 6 vides, 9 mixtes — et **nomme les six écrans vus
seulement vides**, dont l'état peuplé n'a pas été regardé. « 0 violation sur 45 écrans » veut dire
« 0 violation dans l'état où le compte de test les a trouvés », et le bilan l'écrit. C'est l'angle
mort où un `<dl>` invalide a vécu trois semaines.

## La QA du 14 septembre 2026 — l'en-tête, et sept coupes

Demandée en cours de session. L'en-tête portait **« Notifications · Mon compte · Se déconnecter »**
en clair, quatre contrôles du même poids que les quatre sections à côté — « cette partie là dans le
header n'a rien à faire là » — et il était « extrêmement plat ».

- **Le compte tient derrière une marque.** `AccountMenu` : les initiales dans un cercle de 32 px, un
  chevron, et un panneau qui porte l'adresse, les notifications avec leur compte, le profil public,
  le compte, l'administration si le rôle l'ouvre, et **se déconnecter**. Une divulgation, pas une
  modale : ni piège de focus, ni verrou de défilement, ni portail — mais elle **recouvre** au lieu
  de pousser, donc elle se ferme sur Échap et sur un pointeur au-dehors. Les initiales se calculent
  (`initials()`, `lib/format`), jamais ne se chargent : il n'existe pas d'envoi d'avatar, et une
  image d'attente promettrait ce qui n'arrive pas.
- **L'en-tête est une bande de marron foncé dans les deux thèmes**, ce qui lui donne un fond propre
  au lieu d'emprunter celui de la page. Il porte donc ses propres encres (`--color-header-*`) :
  celles de la page sont brou sur pâle en thème clair et seraient invisibles. **Contrastes mesurés
  avant d'être écrits** — parchemin 13,40:1, fumée 5,56:1, laiton 6,88:1 sur brou — tous AA.
- **Une ligne, à toutes les largeurs.** La première version en faisait deux : les capitales
  espacées ont élargi la nav de 641 à 687 px et le sélecteur de thème est passé à la ligne.
  Mesuré à 1024, 1280 et 1440 — 65 px de haut partout. Et la mesure elle-même a dû être
  corrigée : compter les `top` distincts comptait les **hauteurs**, pas les lignes, parce que
  `items-center` aligne par le centre.

**Sept coupes, toutes demandées** : le lede des quatre compteurs de `/cigares` (qui emportait
quatre allers-retours avec lui), la note de portée du rail, les deux phrases de la discussion de
fiche, le sous-compte des entrées, et « Aucune note publique » réduit à cela seul. La discussion
resserre aussi ses interlignes.

**Un bug, et son arithmétique** : les bagues d'une entrée débordaient sur le nom de l'auteur.
Cinq bagues `md` font 5 × 1 rem de glyphe + 4 × 0,25 rem d'espace = **6 rem exactement**, dans une
colonne de **4,5 rem** — la largeur que la marge avait quand une note était deux chiffres sur cent,
avant que la 0028 ne la passe en bagues. Débordement de 24 px, mesuré au navigateur avant et après.
Toute retouche du glyphe `md` de `RingRating` doit repasser par `entry-row.tsx`.

## Le 15 septembre 2026 — la question tranchée, et deux défauts que la vérification a trouvés

Arbitrage du porteur sur la question ouverte de l'ADR 0020 (« fais selon tes reco ») : **l'écran
d'erreur reste nu et gagne deux liens écrits en dur**, l'accueil et le journal. Garder l'en-tête du
site y a été écarté **par une mesure** — il lit la base trois fois par page connectée, donc l'écran
d'erreur aurait pu échouer pour la raison même qui le fait afficher. Les deux destinations sont
choisies pareil : l'accueil fait **zéro** aller-retour, le journal **un**. Rien sur cet écran
n'attend quoi que ce soit, et c'est la propriété à préserver si on le retouche.

**Trois règles de plus, chacune payée par un défaut :**

1. **Une lecture faite sur TOUTES les pages n'est jamais un sujet.** `SiteHeader` appelait
   `currentUser()` nu ; comme cette fonction jette désormais, une panne de l'API d'auth
   transformait **tout le groupe `(app)`** — y compris les pages sans session — en écran d'erreur.
   L'en-tête dégrade donc, mais pas en mensonge : il a **trois** états, et le troisième n'affiche
   ni le menu du compte ni « Se connecter », il dit qu'il n'a pas pu lire.
2. **Un `catch` qui ne regarde pas ce qu'il attrape attrape aussi le framework.** `accessory()`
   avalait `DynamicServerError` — la façon dont Next dit « cette route est dynamique » — et
   l'aurait fait de `redirect()` et `notFound()`. Trouvé en lisant un **journal de build**, jamais
   dans le code. Rien n'est passé en statique, et seulement par chance : chaque page avait encore
   une lecture nue pour relancer le signal. Voir `lib/CLAUDE.md`.
3. **Une règle de comportement se prouve en la provoquant.** `tooling/audit/fault-inject.mjs` rend
   un 502 — la réponse exacte de Kong — sur une lecture nommée, et
   `tooling/audit/degradation.ts` lit ce que la page en fait : `sain` → 200 sans encart,
   `accessoire` → **200 avec l'encart**, `sujet` → **500 et l'écran d'erreur**, qui porte bien ses
   deux liens. **13 assertions, 0 échec.** Le témoin `sain` n'est pas décoratif : sans lui, ne rien
   trouver pourrait être un succès ou une lacune. Le scénario dégradé passe aussi **axe-core**,
   parce que c'est le seul endroit d'où cet état est visible.

**Et la quatrième leçon de mesure de la semaine** : le premier jet de ce contrôle ne se connectait
pas, donc il cherchait un encart de facettes sur l'aperçu visiteur de `/cigares`, qui n'en a pas —
et rendait « non » avec l'assurance d'un verdict. **La présence de la cible se vérifie avant toute
assertion à son sujet**, et son absence est une lacune, pas un échec.

**La règle est appliquée partout**, les 53 pages classées une par une : **33 converties**, les
autres sans accompagnement à dégrader. **Cinq lectures restent nues alors qu'elles y
ressemblent** — les lots d'une cave (« 0 cigare » serait un inventaire qu'on croirait), les
partages d'une entrée (« personne » inviterait à repartager), le contenu visé d'un dossier de
modération (décider à l'aveugle), la roue d'une dégustation (le formulaire enregistrerait moins
qu'il n'annonce). Et **la nuance que l'exception 2 n'énonçait pas** : un repli fermé protège une
porte, il ne justifie pas d'énoncer un refus. `adminView()` échoue donc plutôt que d'annoncer
« vous n'avez pas accès » à un admin dont le droit n'a pas pu être lu.
