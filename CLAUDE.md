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

**Ce qui rouvre `ref.lines` existe désormais** — la file de contribution — mais proposer une *gamme*
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
