# P0 · Livrable 1 — Arborescence du dépôt

**Légende de phase.** `[P0]` … `[P8]` indique la phase qui **crée** le fichier. Un dossier
marqué `[P4]` n'existe pas avant la Phase 4 : cette arborescence est la cible, pas l'état initial.
Seuls les éléments `[P0]` sont créés à la fin de la Phase 0.

**Deux règles structurantes**, qui expliquent la forme de l'arbre :

1. **Les segments d'URL sont en français, les identifiants en anglais.** `app/(app)/cigares/[slug]/page.tsx`
   exporte `CigarPage`. Le français s'arrête à la frontière de l'URL et des fichiers de traduction
   (§0.10 du brief). Les segments FR sont des constantes dans `lib/routes.ts` pour que l'i18n EN/ES
   (P8) réécrive les chemins sans toucher aux composants.
2. **La conformité légale est un dossier, pas un commentaire.** `docs/legal/`, `lib/compliance/`,
   `tests/compliance/` existent dès P0 et sont référencés par la CI. Le §2 du brief est bloquant :
   il doit être testable.

```
vitola/
│
├─ BRIEF.md                                  [P0] Le brief produit, source de vérité. Non modifié sans accord explicite.
├─ CLAUDE.md                                 [P0] Conventions racine : commandes, workflow de phase, interdits (§2), style de commit.
├─ README.md                                 [P0] Démarrage local en 10 lignes. Renvoie vers CLAUDE.md pour le reste.
├─ LICENSE                                   [P0] Propriétaire, tous droits réservés (dépôt privé v1).
├─ .env.example                              [P0] Toutes les variables, valeurs factices, une ligne de commentaire chacune.
├─ .gitignore / .npmrc / .nvmrc              [P0] Node 22 épinglé, pnpm strict, `.env*` ignoré sauf `.example`.
├─ package.json                              [P0] Scripts : dev, build, typecheck, lint, test, test:e2e, db:*, check.
├─ pnpm-lock.yaml                            [P0] Verrou committé. Toute addition de dépendance passe par une ADR (§3).
├─ tsconfig.json                             [P0] `strict: true`, `noUncheckedIndexedAccess`, alias `@/*`.
├─ next.config.ts                            [P0] Domaines d'images, en-têtes de sécurité (CSP, HSTS), `experimental.typedRoutes`.
├─ middleware.ts                             [P0] Age gate serveur + rafraîchissement de session Supabase + `noindex` conditionnel.
├─ eslint.config.mjs                         [P0] Flat config + règles maison (voir `tooling/eslint-rules/`).
├─ prettier.config.mjs                       [P0] Formatage. Plugin de tri des classes Tailwind.
├─ vitest.config.ts                          [P0] Projets `unit` (jsdom) et `node`. Seuils de couverture sur `lib/`.
├─ playwright.config.ts                      [P0] Parcours critiques, projet mobile 360px inclus (§4.5).
├─ components.json                           [P0] Configuration shadcn/ui pointant sur le thème custom.
│
├─ .github/
│  ├─ workflows/
│  │  ├─ ci.yml                              [P0] typecheck → lint → test → build. Bloquant sur PR.
│  │  ├─ db.yml                              [P0] Applique les migrations sur une Postgres éphémère, lance pgTAP, vérifie l'audit RLS.
│  │  ├─ e2e.yml                             [P0] Playwright contre le déploiement de prévisualisation Vercel.
│  │  ├─ types-drift.yml                     [P1] Échoue si `lib/supabase/database.types.ts` diverge des migrations.
│  │  └─ lighthouse.yml                      [P6] Budgets Core Web Vitals (§8) sur 5 URL témoins.
│  ├─ pull_request_template.md               [P0] Checklist : phase, migration, RLS, tests, capture, impact §2.
│  └─ CODEOWNERS                             [P0] `/supabase/` et `/docs/legal/` exigent une relecture explicite.
│
├─ .claude/
│  ├─ settings.json                          [P0] Permissions d'outils, hooks de dépôt.
│  ├─ commands/
│  │  ├─ phase.md                            [P0] Ouvre `feat/pXX-nom`, rappelle le critère de sortie de la phase.
│  │  ├─ migration.md                        [P0] Crée migration + fichier pgTAP jumeau. Refuse une table sans RLS.
│  │  └─ check.md                            [P0] `typecheck && lint && test && db:audit-rls`.
│  └─ skills/
│     └─ rls-review/SKILL.md                 [P0] Grille de relecture des policies : récursion, `search_path`, colonnes sensibles.
│
├─ app/                                      Next.js 15 App Router. Voir `app/CLAUDE.md`.
│  ├─ CLAUDE.md                              [P0] RSC par défaut, `'use client'` justifié en commentaire, `nuqs` pour l'état d'URL.
│  ├─ layout.tsx                             [P0] Shell racine : `<html lang="fr">`, fontes variables, `<HealthNotice />` non masquable.
│  ├─ globals.css                            [P0] `@theme` Tailwind v4 : tous les tokens du §4.2, échelle typographique, reset.
│  ├─ error.tsx / not-found.tsx / loading.tsx [P0] États globaux, ton éditorial (§4.6), jamais de « Oops ».
│  ├─ opengraph-image.tsx                    [P0] Image OG par défaut : bague sur fond oscuro.
│  ├─ sitemap.ts                             [P1] Sitemap dynamique. N'inclut que le contenu publié et indexable.
│  ├─ robots.ts                              [P0] `noindex` global tant que le domaine n'est pas validé juridiquement (§2).
│  │
│  ├─ (public)/                              Routes accessibles SANS franchir l'age gate.
│  │  ├─ page.tsx                            [P0] Accueil. Avant le gate : promesse + entrée. Après : accueil éditorial (wireframe §3).
│  │  ├─ majorite/page.tsx                   [P0] Age gate 18+. Saisie de date de naissance, pose du cookie signé.
│  │  ├─ connexion/page.tsx                  [P1] Magic link + OAuth. Aucun contenu tabac visible.
│  │  ├─ mentions-legales/page.tsx           [P0] Éditeur, hébergeur, directeur de publication.
│  │  ├─ confidentialite/page.tsx            [P0] Politique RGPD. Mention explicite art. 9 (§2).
│  │  ├─ conditions/page.tsx                 [P0] CGU. Interdiction de vente/échange entre membres (§2).
│  │  ├─ cookies/page.tsx                    [P0] Détail des traceurs. Aucun dépôt avant consentement.
│  │  └─ sante/page.tsx                      [P0] Avertissement sanitaire développé + liens Tabac Info Service.
│  │
│  ├─ (app)/                                 Routes protégées par l'age gate (middleware).
│  │  ├─ layout.tsx                          [P0] En-tête, navigation, pied de page, fil d'ariane.
│  │  ├─ cigares/
│  │  │  ├─ page.tsx                         [P1] Recherche facettée. Facettes = `searchParams`, zéro état client.
│  │  │  ├─ [slug]/page.tsx                  [P1] Fiche cigare (wireframe §3).
│  │  │  ├─ [slug]/historique/page.tsx       [P1] Historique wiki : révisions, diffs, auteurs.
│  │  │  ├─ [slug]/proposer/page.tsx         [P1] Proposer une correction → `ref.cigar_revisions`.
│  │  │  ├─ [slug]/opengraph-image.tsx       [P1] OG par cigare : bague + vitole + dimensions.
│  │  │  ├─ comparer/page.tsx                [P1] Comparateur 2 à 4 cigares. Sélection dans l'URL.
│  │  │  └─ nouveau/page.tsx                 [P1] Créer une fiche (statut `draft`).
│  │  ├─ marques/page.tsx, [slug]/page.tsx   [P1] Index des marques et page marque (lignes, cigares, pays).
│  │  ├─ vitoles/page.tsx, [slug]/page.tsx   [P1] Vitolario : le format comme entrée de navigation.
│  │  ├─ codes-de-boite/page.tsx             [P1] Décodeur de code de boîte (`ref.box_codes`).
│  │  ├─ contributions/page.tsx              [P1] File de validation wiki (rôle `contributor`+).
│  │  ├─ degustations/                       [P2] Liste, création (3 tiers), détail, brouillons.
│  │  ├─ cave/                               [P2] Multi-caves, inventaire, vieillissement, relevés, import/export CSV.
│  │  ├─ statistiques/page.tsx               [P2] Tableau de bord personnel (F11).
│  │  ├─ scanner/page.tsx                    [P4] Scan de bague (wireframe §3). Client-only par nature.
│  │  ├─ fil/page.tsx                        [P3] Feed. Pagination keyset, jamais d'infinite scroll nu.
│  │  ├─ u/[handle]/                         [P3] Profil public : cave publique, dégustations, contributions, badges.
│  │  ├─ clubs/ , evenements/                [P3] Clubs et événements.
│  │  ├─ messages/                           [P3] Messagerie.
│  │  ├─ lieux/                              [P5] Carte MapLibre + recherche géo + fiche lieu + revendication.
│  │  ├─ journal/                            [P6] Éditorial MDX : index, catégorie, article, auteur.
│  │  ├─ boutique/                           [P7] Catalogue accessoires, produit, panier, commandes. Aucun tabac (§2).
│  │  └─ parametres/                         [P1] Profil, préférences (/100 vs /20), confidentialité, consentements, RGPD.
│  │
│  ├─ (admin)/retro/                         [P8] Back-office modération. Rôle `moderator`+ vérifié serveur ET en RLS.
│  │
│  └─ api/
│     ├─ health/route.ts                     [P0] Sonde de disponibilité (build, DB, version).
│     ├─ gdpr/export/route.ts                [P1] Export complet des données de l'utilisateur (JSON + médias). Exigé §2.
│     ├─ gdpr/delete/route.ts                [P1] Demande de suppression : vérification, délai de grâce, effacement. Exigé §2.
│     ├─ og/route.tsx                        [P1] Générateur d'images OG partagé.
│     ├─ search/suggest/route.ts             [P1] Typeahead référentiel. Rate-limité (§8).
│     ├─ scan/route.ts                       [P4] Proxy vers l'Edge Function `recognize-band` + quota Upstash.
│     ├─ newsletter/route.ts                 [P6] Inscription double opt-in via Resend.
│     └─ stripe/webhook/route.ts             [P7] Webhook Stripe. Idempotent, signature vérifiée, jamais de logique métier inline.
│
├─ components/
│  ├─ ui/                                    [P0] Primitives shadcn/ui re-thémées. Aucune valeur brute : tokens uniquement.
│  ├─ band/
│  │  ├─ band.tsx                            [P0] `<Band />`, l'élément signature (§4.4). Variantes : header, divider, badge, viewfinder.
│  │  ├─ band.stories.tsx                    [P0] Storybook : les 4 variantes × 3 largeurs.
│  │  └─ band-lockup.tsx                     [P0] Lockup typographique interne (Marcellus petites capitales + vitole).
│  ├─ compliance/
│  │  ├─ health-notice.tsx                   [P0] Bandeau sanitaire permanent, non masquable, hors flux d'interaction.
│  │  ├─ age-gate-form.tsx                   [P0] Formulaire de majorité. Server Action + Zod.
│  │  └─ consent-manager.tsx                 [P0] Gestion granulaire des consentements. Refus aussi simple qu'accepter.
│  ├─ data/
│  │  ├─ wrapper-scale.tsx                   [P0] L'échelle claro→oscuro comme composant de dataviz (§4.1).
│  │  ├─ ring-gauge.tsx                      [P0] Cepo × longueur en JetBrains Mono, avec silhouette à l'échelle.
│  │  ├─ strength-meter.tsx                  [P0] Force en 5 crans. Filets, pas de barre de progression.
│  │  └─ score.tsx                           [P2] Note /100 ou /20 selon `profiles.preferences`. Chiffres tabulaires.
│  ├─ cigar/                                 [P1] CigarCard, CigarHeader, FacetPanel, CigarCompareTable, RevisionDiff.
│  ├─ editorial/                             [P6] Composants MDX : citation, encadré lexique, galerie clair-obscur.
│  ├─ social/                                [P3] PostCard, EmberButton (« braise »), CommentThread, FollowButton.
│  ├─ shop/                                  [P7] ProductCard, VariantPicker, CartDrawer, OrderSummary.
│  └─ layout/                                [P0] Header, Footer, Nav, Breadcrumb, SkipLink, EmptyState.
│
├─ lib/
│  ├─ CLAUDE.md                              [P0] Règles : pur, testable, aucun import React. Zod à la frontière.
│  ├─ brand.ts                               [P0] LA constante de marque (§1). Aucun composant n'écrit le nom en dur.
│  ├─ routes.ts                              [P0] Segments d'URL FR ↔ identifiants EN. Point d'entrée de l'i18n P8.
│  ├─ flags.ts                               [P0] Lecture de `public.feature_flags`. Inclut `show_indicative_prices` (§2).
│  ├─ supabase/
│  │  ├─ client.ts                           [P0] Client navigateur (clé publiable uniquement).
│  │  ├─ server.ts                           [P0] Client RSC/Server Action, session par cookie.
│  │  ├─ admin.ts                            [P0] Client service_role. Import interdit hors `app/api/` et Edge Functions (§8).
│  │  └─ database.types.ts                   [P1] Types générés, committés. Vérifiés par `types-drift.yml`.
│  ├─ compliance/
│  │  ├─ age-gate.ts                         [P0] Cookie signé, TTL, vérification serveur. Testé unitairement.
│  │  ├─ tobacco-terms.ts                    [P0] Lexique interdit côté boutique (§5.8). Source unique DB + app.
│  │  └─ audit.ts                            [P0] Écriture dans `audit_log`. Un seul point d'entrée.
│  ├─ validation/                            [P0] Schémas Zod par domaine. Un schéma = une frontière (§8).
│  ├─ search/                                [P1] Construction des requêtes facettées, parsing des `searchParams`, RRF (§6).
│  ├─ cigar/                                 [P1] Slugs, dimensions, formatage vitole, décodage de code de boîte.
│  ├─ scoring/                               [P2] Moyenne bayésienne (§5.4), conversion /100 ↔ /20.
│  ├─ humidor/                               [P2] Âge de vieillissement, maturité, valorisation.
│  ├─ image/                                 [P4] pHash côté client, redressement, distance de Hamming.
│  ├─ format/                                [P0] Dates, nombres, unités. `Intl` avec locale explicite, jamais implicite.
│  └─ i18n/                                  [P0] Configuration. FR seul actif en v1, EN/ES branchables.
│
├─ messages/
│  ├─ fr.json                                [P0] Toute la copie de l'app. Aucune chaîne visible hors de ce fichier.
│  ├─ en.json / es.json                      [P8] Traductions.
│
├─ supabase/
│  ├─ CLAUDE.md                              [P0] Règles : RLS obligatoire, `search_path = ''`, jamais de modif via l'UI (§0.4).
│  ├─ config.toml                            [P0] Config locale : ports, auth, storage, extensions activées.
│  ├─ migrations/
│  │  ├─ 0001_p1_referential.sql             [P1] Extensions, `profiles`, socle conformité, schéma `ref`, recherche, RLS.
│  │  │                                           = docs/phase-0/03-schema-p1.sql, relu et exécuté en Livrable 2.
│  │  └─ …                                   [P2+] Une migration par lot fonctionnel, jamais rétro-éditée.
│  ├─ seed/
│  │  ├─ 01_manufacturers.csv                [P1] ~40 manufactures. Données factuelles saisies à la main (§5.3).
│  │  ├─ 02_brands.csv                       [P1] ~120 marques majeures.
│  │  ├─ 03_vitolas.csv                      [P1] Vitolario : galera, salida, longueur, cepo, forme.
│  │  ├─ 04_cigars.csv                       [P1] Références de départ.
│  │  ├─ 05_box_codes.csv                    [P1] Codes usine et codes de date.
│  │  ├─ 06_aroma_taxonomy.csv               [P2] Roue des arômes, 11 familles, FR + EN.
│  │  ├─ seed.sql                            [P1] Chargement idempotent des CSV. Rejouable sans doublon.
│  │  └─ PROVENANCE.md                       [P1] Origine de chaque ligne. Preuve de non-scraping (§2, art. L341-1 CPI).
│  ├─ functions/
│  │  ├─ recognize-band/                     [P4] Edge Function du pipeline §6. Deno.
│  │  ├─ promote-embedding/                  [P4] Promotion en référence après 3 confirmations (§5.3).
│  │  └─ refresh-cigar-stats/                [P2] Rafraîchissement de la vue matérialisée `cigar_stats`.
│  └─ tests/
│     ├─ 00_rls_coverage.sql                 [P1] Échoue si UNE table n'a pas RLS + au moins une policy (§0.5).
│     ├─ 01_profiles_rls.sql                 [P1] Un utilisateur ne lit ni ne modifie le profil d'un autre.
│     ├─ 02_ref_rls.sql                      [P1] Anonyme ne voit que `published`. Un membre ne s'auto-promeut pas.
│     ├─ 03_search.sql                       [P1] Pertinence et budget temps de la recherche facettée.
│     └─ 90_shop_no_tobacco.sql              [P7] Insérer un produit tabac doit échouer (§5.8).
│
├─ tests/
│  ├─ unit/                                  [P0] Vitest. Miroir de `lib/`.
│  ├─ e2e/
│  │  ├─ age-gate.spec.ts                    [P0] Contournement impossible : cookie forgé, accès direct, robots.
│  │  ├─ health-notice.spec.ts               [P0] Le bandeau est présent sur 100 % des routes et non masquable.
│  │  ├─ search.spec.ts                      [P1] Recherche facettée, partage d'URL, retour arrière.
│  │  ├─ scan.spec.ts                        [P4] Capture → résultat → confirmation.
│  │  └─ checkout.spec.ts                    [P7] Commande de bout en bout en mode test Stripe.
│  ├─ compliance/
│  │  └─ no-tobacco-sale.spec.ts             [P0] Garde-fou §2 : aucune route, aucun libellé, aucun champ de vente de tabac.
│  └─ fixtures/
│     └─ bands/                              [P4] 200 photos annotées pour le benchmark (§6). Consentement des contributeurs documenté.
│
├─ docs/
│  ├─ adr/
│  │  ├─ README.md                           [P0] Index et modèle d'ADR.
│  │  ├─ 0001-supabase-vs-backend-dedie.md   [P0] Livrable 4a.
│  │  ├─ 0002-strategie-de-recherche-hybride.md [P0] Livrable 4b.
│  │  └─ 0003-stripe-checkout-vs-payment-element.md [P0] Livrable 4c.
│  ├─ phase-0/                               [P0] Le présent livrable (6 documents).
│  ├─ design-system.md                       [P0] Tokens, échelles, règles d'exécution §4.5, do/don't.
│  ├─ editorial-guidelines.md                [P0] Charte éditoriale. Exigée par le §2 (loi Évin).
│  ├─ legal/
│  │  ├─ checklist-avant-mise-en-ligne.md    [P0] Points à faire valider par l'avocat. Bloquant avant ouverture publique.
│  │  ├─ data-map.md                         [P0] Registre de traitement RGPD : donnée, base légale, durée, destinataire.
│  │  └─ dsa-notice-and-action.md            [P3] Procédure de signalement et de recours.
│  ├─ recognition-benchmark.md               [P4] Résultats top-1 / top-3. Critère de sortie de P4 (§6).
│  ├─ runbook.md                             [P0] Incidents : rotation de clés, restauration, dépassement de quota scan.
│  └─ decisions-log.md                       [P0] Journal des micro-décisions ne méritant pas une ADR.
│
├─ emails/                                   [P6] Templates React Email : magic link, confirmation, newsletter, commande.
├─ public/
│  ├─ fonts/                                 [P0] Bodoni Moda, Marcellus, Inter, JetBrains Mono en woff2 auto-hébergés.
│  └─ brand/                                 [P0] Favicon, icônes PWA, logo. Aucun logo de fabricant de tabac (§ questions ouvertes Q3).
├─ .storybook/                               [P0] Storybook des primitives. Critère de sortie de P0 (§9).
└─ tooling/
   ├─ eslint-rules/                          [P0] Règles maison : interdiction des couleurs brutes, des emoji, de `admin.ts` côté client.
   └─ scripts/
      ├─ audit-rls.ts                        [P0] Échoue si une table n'a pas RLS + policy. Appelé par la CI (§0.5).
      ├─ check-tokens.ts                     [P0] Échoue sur tout hex hors `globals.css`.
      └─ seed-check.ts                       [P1] Vérifie l'intégrité et la provenance des CSV de seed.
```

## Ce que l'arborescence encode volontairement

| Décision | Pourquoi |
|---|---|
| `tooling/scripts/audit-rls.ts` appelé par la CI | §0.5 dit « une table sans RLS = build cassé ». Sans script, c'est un vœu. |
| `lib/compliance/tobacco-terms.ts` **et** un trigger DB | Le §5.8 exige les deux. Une seule source de vérité, deux points d'application. |
| `supabase/seed/PROVENANCE.md` | Le §2 interdit le scraping. En cas de contestation, la charge de la preuve d'une saisie manuelle nous incombe. |
| `messages/fr.json` dès P0 | Extraire la copie après coup coûte trois fois plus cher. L'i18n P8 devient un ajout de fichier. |
| `lib/routes.ts` | Des segments FR en dur rendent l'i18n P8 impossible sans réécrire chaque `<Link>`. |
| Pas de `store/`, pas de `context/` | §3 : pas de state manager tant que RSC + `nuqs` suffisent. L'absence de dossier est la contrainte. |
| `app/(public)` vs `app/(app)` | La frontière de l'age gate est une frontière de routage, vérifiable d'un coup d'œil, pas une condition dispersée dans les pages. |
