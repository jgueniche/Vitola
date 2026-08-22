# Journal des micro-décisions

Ce qui ne mérite pas une ADR mais qu'il faut pouvoir retrouver. Ordre antichronologique.

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
