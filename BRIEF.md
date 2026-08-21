# BRIEF PROJET — « VITOLA »
### Réseau social, référentiel et cave numérique du cigare

---

## 0. Instructions d'exécution (à respecter strictement)

1. **Ne code rien avant d'avoir produit le plan de Phase 0** (§10) et obtenu ma validation.
2. Travaille **phase par phase** (§9). Une phase = une branche `feat/pXX-nom`. Jamais de commit direct sur `main`.
3. Maintiens un `CLAUDE.md` racine + un `CLAUDE.md` par domaine (`/app`, `/supabase`, `/lib`) : conventions, commandes, pièges connus.
4. Chaque migration Supabase est **versionnée** (`supabase/migrations/`), jamais de modif via l'UI.
5. **RLS activée dès la création de chaque table.** Aucune table sans policy explicite. Une table sans RLS = build cassé.
6. TypeScript `strict: true`. Aucun `any`. Types Supabase générés (`supabase gen types`) commités.
7. Après chaque tâche : `pnpm typecheck && pnpm lint && pnpm test` doit passer.
8. Si une décision d'architecture est ambiguë → tu écris une **ADR** courte dans `/docs/adr/NNNN-titre.md` et tu me poses la question. Tu ne devines pas.
9. Tu ne crées **jamais** de fonctionnalité permettant la vente, l'échange, le don ou la mise en relation commerciale autour de produits du tabac (§2).
10. Contenu de l'app en **français** (i18n prête pour EN/ES). Code, commentaires, noms de variables en **anglais**.

---

## 1. Vision produit

**Vitola** est la plateforme de référence francophone de l'amateur de cigares : un **référentiel encyclopédique collaboratif**, une **cave numérique**, un **carnet de dégustation structuré**, un **réseau social** et une **boutique d'accessoires** — le tout dans une esthétique sobre, chaude et éditoriale.

| Pilier | Promesse utilisateur |
|---|---|
| Référentiel | « Tous les cigares, toutes les vitoles, sourcés et vérifiés. » |
| Reconnaissance | « Je photographie la bague, je sais ce que je fume. » |
| Dégustation | « Mes notes structurées, comparables, historisées. » |
| Cave | « Je sais ce que j'ai, depuis quand, ce que ça vaut, ce qui est prêt. » |
| Social | « Je retrouve des amateurs de mon niveau, pas un forum de 2004. » |
| Lieux | « Où fumer, où acheter, où me faire conseiller. » |
| Éditorial | « On m'apprend quelque chose à chaque visite. » |
| Boutique | « Les bons accessoires, sélectionnés, pas un bazar. » |

**Non-objectifs (v1)** : vente de cigares, marketplace C2C, application native, IoT hygrométrie, enchères.

**Nom de code** : `vitola`. Le nom commercial doit être **une constante unique** (`lib/brand.ts`) — jamais codé en dur dans les composants. Alternatives à garder en réserve : *Cepo*, *Anillo*, *Cedro*, *Le Cercle du Cèdre*.

---

## 2. Contraintes légales — BLOQUANT, à lire avant toute décision produit

> Je ne suis pas juriste et ce qui suit n'est pas un avis juridique : ces points doivent être validés par un avocat spécialisé (santé publique / e-commerce) **avant mise en ligne publique**. Mais l'architecture doit être construite en supposant ces contraintes vraies.

| Règle | Impact produit | Traduction technique |
|---|---|---|
| **Vente à distance de tabac interdite en France** (art. 568 ter CGI) ; monopole des buralistes (art. 568 CGI) | Aucune vente de cigares. Boutique = **accessoires uniquement** | Enum `product.category` fermée, sans valeur tabac. Test unitaire qui échoue si un produit tabac est inséré. |
| **Interdiction de la publicité directe ou indirecte en faveur du tabac** (Loi Évin, art. L3512-4 CSP) | Ton **informatif et communautaire**, jamais promotionnel. Pas de partenariat rémunéré avec un fabricant de tabac. Pas de « meilleures affaires », pas de prix mis en avant, pas de CTA d'achat sur une fiche cigare. | Charte éditoriale dans `/docs/editorial-guidelines.md`. Aucun champ `affiliate_url` sur `cigars`. Prix indicatif = champ optionnel, affichage désactivable par feature flag. |
| **Accès mineurs** | Portail 18+ obligatoire, contenu non indexable sans consentement | Age gate serveur (cookie signé + champ `profiles.birth_date`), `noindex` sur les vues de contenu tabac tant que le gate n'est pas franchi. |
| **Avertissement sanitaire** | Bandeau permanent | Composant `<HealthNotice />` en layout racine, non masquable. |
| **RGPD** — les habitudes de consommation de tabac peuvent être requalifiées en **données de santé** (art. 9) | Minimisation, consentement explicite, export/suppression | Table `consents`, endpoints `/api/gdpr/export` et `/api/gdpr/delete` dès la Phase 1. Journalisation dans `audit_log`. |
| **DSA** (plateforme UGC) | Signalement, modération, transparence | Tables `reports`, `moderation_actions`, `blocks`. Back-office modération en Phase 8, mais schéma posé en Phase 3. |
| **Droit sui generis des bases de données** (art. L341-1 CPI) | **Interdiction absolue de scraper** une base concurrente (Halfwheel, Cigar Aficionado, CigarDojo, etc.) pour amorcer le référentiel | Aucun script de scraping dans le repo. Amorçage : §5.3. |

---

## 3. Stack technique

| Couche | Choix | Justification |
|---|---|---|
| Framework | **Next.js 15 (App Router)** + React 19, TypeScript strict | RSC, SEO éditorial, Server Actions |
| Style | **Tailwind CSS v4** + **shadcn/ui** (thème custom, §4) | Vélocité + contrôle total des tokens |
| Backend | **Supabase** (Postgres 15, Auth, Storage, Realtime, Edge Functions) | Cohérent avec mon stack existant |
| Extensions PG | `pgvector`, `pg_trgm`, `postgis`, `unaccent`, `pgcrypto` | Similarité image, fuzzy search, géo |
| Paiement | **Stripe Checkout** (hébergé) v1 → Payment Element v2 | Zéro périmètre PCI en v1 |
| Vision / LLM | **Anthropic API** (Claude, vision) via Edge Function | Extraction structurée de la bague |
| Embeddings image | SigLIP / CLIP via endpoint d'inférence (Replicate ou HF) | Recherche par similarité visuelle |
| Cartographie | **MapLibre GL** + tuiles Protomaps ou MapTiler | Pas de lock-in Mapbox |
| Email | **Resend** + React Email | Transactionnel + newsletter |
| Rate limit / cache | **Upstash Redis** | Quotas scan OCR, anti-abus |
| Observabilité | **Sentry** + **PostHog** (self-host EU ou région EU) | RGPD : hébergement UE obligatoire |
| Hébergement | **Vercel** (région `cdg1`) | Cohérent avec mon stack |
| Tests | **Vitest** (unit) + **Playwright** (e2e) | Parcours critiques : age gate, scan, checkout |
| Images | `next/image` + Supabase Storage + transformations | WebP/AVIF, LQIP |

**Contraintes** : pnpm. Node 22. Aucune dépendance ajoutée sans justification écrite dans l'ADR. Pas de state manager global tant que RSC + `nuqs` (état dans l'URL) suffisent.

---

## 4. Direction artistique

### 4.1 Principe fondateur
La palette est dérivée de la **classification officielle des cape** (wrapper shades) : `Claro → Colorado Claro → Colorado → Colorado Maduro → Maduro → Oscuro`. Ce n'est pas une décoration : c'est une échelle qui existe dans le métier et qui sert **aussi** de composant de data-visualisation.

Le fond n'est **pas noir** : c'est un brun-noir chaud (feuille oscuro), qui distingue immédiatement l'interface d'un dark mode générique.

### 4.2 Tokens couleur

| Token | Hex | Usage |
|---|---|---|
| `--oscuro` | `#161210` | Fond racine |
| `--maduro` | `#221B17` | Surfaces, cartes |
| `--maduro-raised` | `#2C231D` | Surfaces élevées, hover |
| `--cedre` | `#7A5C43` | Bordures, texte tertiaire |
| `--colorado` | `#8C4F2E` | Accent secondaire, états chauds |
| `--claro` | `#C9A227` → `#D9BC72` | **Accent principal** (laiton / feuille d'or de bague) |
| `--parchemin` | `#EDE6D8` | Texte principal |
| `--fumee` | `#9C948A` | Texte secondaire |
| `--papier` | `#F3EEE4` | Fond light mode |
| `--encre` | `#181513` | Texte light mode |

Sémantique : succès `#5E7A52` (feuille verte), alerte `#B8863B`, erreur `#9B3D32` (bordeaux mat, jamais rouge vif).

### 4.3 Typographie

| Rôle | Fonte | Notes |
|---|---|---|
| Display | **Bodoni Moda** (variable) | Didone à fort contraste = grammaire visuelle exacte de la bague de cigare. Titres uniquement, ≥ 32px, tracking serré. |
| Eyebrow / labels | **Marcellus** en petites capitales, `letter-spacing: 0.14em` | Registre gravé, romain |
| UI / corps | **Inter** (variable) | Neutre, lisible, chiffres tabulaires activés |
| Données | **JetBrains Mono** | Codes de boîte, cepo × longueur, SKU, dates de production |

Interdits : Playfair Display, emoji dans l'UI, titres en gras sans-serif.

### 4.4 Élément signature — « la bague »
Un composant `<Band />` : filet horizontal fin en dégradé laiton, avec lockup typographique centré (marque en Marcellus petites capitales + vitole). Il sert de :
- en-tête des cartes cigare,
- séparateur de sections éditoriales,
- badge de profil (niveau de contribution),
- élément de la page de scan (le cadre de visée **est** une bague).

Un seul élément mémorable. Tout le reste reste silencieux.

### 4.5 Règles d'exécution
- `border-radius` : `3px` (jamais 0 — effet broadsheet générique ; jamais ≥ 12px — effet SaaS).
- Ombres : quasi inexistantes. Séparation par filets `1px rgba(237,230,216,0.07)`.
- Iconographie : Lucide, `stroke-width: 1.5`.
- Photographie : clair-obscur, fond sombre, une source de lumière. Jamais de stock souriant.
- Motion : 160–240 ms, `ease-out`. Une seule séquence orchestrée : la révélation du résultat de scan. Respect de `prefers-reduced-motion`.
- Grille : 12 colonnes, gouttière 24px, largeur de lecture éditoriale max `68ch`.
- Plancher qualité non négociable : responsive dès 360px, focus clavier visible, contraste AA, `<title>`/OG par route.

### 4.6 Copie
Voix : experte, sobre, jamais prescriptive, jamais commerciale. Verbes actifs. « Ajouter à la cave », pas « Soumettre ». Un état vide est une invitation : *« Votre cave est vide. Scannez une bague ou cherchez une vitole pour commencer. »*

---

## 5. Modèle de données

Schémas : `public` (app), `ref` (référentiel), `shop` (e-commerce), `mod` (modération).

### 5.1 Référentiel — `ref` (modèle wiki, versionné)

```
manufacturers   id, name, country, group_name, slug
brands          id, manufacturer_id, name, slug, country, founded_year,
                is_cuban bool, description, logo_path
lines           id, brand_id, name, slug, description            -- ex. Cohiba > Línea 1492
vitolas         id, name_galera, name_salida, length_mm, ring_gauge,
                shape enum(parejo|torpedo|piramide|perfecto|belicoso|
                           culebra|diadema|petit_corona|figurado_autre)
cigars          id, brand_id, line_id, vitola_id, commercial_name, slug,
                wrapper_origin, binder_origin, filler_origins text[],
                wrapper_shade enum(claro|colorado_claro|colorado|
                                   colorado_maduro|maduro|oscuro),
                strength enum(leger|leger_moyen|moyen|moyen_corse|corse),
                release_type enum(regular|edicion_limitada|regional|
                                  reserva|gran_reserva|aniversario|custom_roll),
                release_year, discontinued_year, packaging jsonb,
                msrp_eur numeric, status enum(draft|published|merged|rejected),
                created_by, verified_at, verified_by, search_vector tsvector
cigar_revisions id, cigar_id, author_id, diff jsonb, comment,
                status enum(pending|approved|rejected), reviewed_by, reviewed_at
cigar_images    id, cigar_id, path, kind enum(band|full|box|foot|ash),
                is_primary, credit, license
box_codes       id, code, factory_code, month, year, notes   -- décodeur codes cubains
```

### 5.2 Reconnaissance de bague

```
band_scans      id, user_id, image_path, phash, status enum(pending|resolved|
                unmatched|rejected), resolved_cigar_id, confidence numeric,
                vlm_payload jsonb, candidates jsonb, cost_cents, created_at
band_embeddings id, cigar_id, image_path, embedding vector(1152),
                source enum(reference|user_confirmed), created_at
```

### 5.3 Amorçage du référentiel (aucun scraping)
1. **Seed manuel curé** : ~120 marques majeures + le vitolario Habanos (noms de galera/salida, dimensions — données factuelles saisies à la main), en CSV dans `supabase/seed/`.
2. **Contribution communautaire wiki** : tout utilisateur propose, un contributeur de confiance valide (`cigar_revisions`).
3. **Enrichissement par les scans** : un scan confirmé par 3 utilisateurs distincts promeut automatiquement l'image en référence.
4. Réputation : `profiles.reputation` débloque les droits de validation à partir d'un seuil.

### 5.4 Dégustation

```
reviews         id, user_id, cigar_id, score_total numeric(4,1),   -- /100
                scores jsonb {construction, draw, burn, aroma, evolution, finish},
                aroma_tags int[] -> aroma_taxonomy,
                strength_perceived, smoke_duration_min, pairing_text,
                pairing_tags text[], box_code, production_year, purchase_year,
                humidity_pct, is_blind bool, visibility enum(public|followers|private),
                body text, created_at
review_thirds   review_id, third smallint(1..3), notes text
review_media    review_id, path, kind
aroma_taxonomy  id, parent_id, family enum(boise|torrefie|epice|terreux|
                                           animal|fruite|floral|sucre|
                                           vegetal|mineral|defaut),
                label_fr, label_en
cigar_stats     MATERIALIZED VIEW  -- moyenne bayésienne, n, distribution, tendance 90j
```
Note globale sur **100** (standard du secteur), avec bascule d'affichage `/20` en préférence utilisateur. Moyenne **bayésienne** (pas arithmétique) pour éviter qu'un cigare noté une fois à 98 ne domine les classements.

### 5.5 Cave

```
humidors        id, user_id, name, capacity, target_rh, target_temp, is_default
humidor_items   id, humidor_id, cigar_id, qty, purchase_date, purchase_price_eur,
                currency, vendor_name, box_code, position, aging_start_date, notes
humidor_events  id, item_id, type enum(add|smoke|gift|loss|move|adjust),
                qty, occurred_at, review_id
humidor_readings id, humidor_id, rh, temp_c, recorded_at, source enum(manual|device)
```
Fonctions dérivées : âge de vieillissement, indicateur de maturité (courbe paramétrable par famille), valorisation du stock, alertes de rotation, import/export CSV.

### 5.6 Social

```
profiles        id -> auth.users, handle unique, display_name, avatar_path, bio,
                country, city, birth_date, preferences jsonb, privacy jsonb,
                reputation int, role enum(member|contributor|editor|moderator|admin)
follows         follower_id, followee_id
posts           id, author_id, body, media jsonb, cigar_id, venue_id,
                type enum(post|session|review_share|question),
                visibility, created_at
comments / reactions / clubs / club_members / events / event_attendees
conversations / messages / notifications / blocks
```
Réaction principale nommée **« braise »** plutôt que « like ». Pas d'infinite scroll sans pagination réelle (`keyset pagination` sur `(created_at, id)`).

### 5.7 Lieux

```
venues          id, type enum(civette|cave|lounge|hotel|restaurant|club|evenement),
                name, slug, address, city, postal_code, country,
                geo geography(Point,4326), phone, website, hours jsonb,
                has_smoking_room bool, is_ventilated bool, claimed_by,
                status enum(pending|published|closed)
venue_reviews   id, venue_id, user_id, rating smallint, body, created_at
```
Cadre : **annuaire informatif**. Les avis portent sur l'accueil, le confort, le conseil — jamais sur l'incitation à consommer.

### 5.8 Éditorial & Boutique

```
articles        id, slug, title, excerpt, body_mdx, cover_path, author_id,
                category enum(guide|interview|reportage|lexique|actualite|accord),
                tags text[], status, published_at, reading_time, seo jsonb
article_links   article_id, cigar_id | venue_id | product_id

shop.products         id, slug, title, description_mdx, brand, images jsonb,
                      category enum(coupe|briquet|cendrier|cave|hygrometre|
                                    etui|humidification|livre|entretien),
                      status
shop.product_variants id, product_id, sku, options jsonb, price_cents,
                      compare_at_cents, stock, weight_g, vat_rate
shop.carts / cart_items / orders / order_items / shipments / refunds / discounts
```
Contrainte DB : `CHECK` sur `shop.products.category` + trigger de refus si `title`/`description` matche une liste de termes tabac. Test e2e dédié.

### 5.9 Système
`audit_log`, `consents`, `feature_flags`, `mod.reports`, `mod.moderation_actions`, `rate_limits`.

---

## 6. Pipeline de reconnaissance de bague

L'OCR seul **ne suffit pas** : bagues courbes, dorures sur dorures, embossage, logos figuratifs sans texte lisible. Architecture hybride obligatoire.

```
1. CAPTURE      Guide de visée en forme de bague. Conseils lumière.
                Contrainte : cigare horizontal, bague centrée.
2. CLIENT       Crop, redressement, resize ≤ 1600px, WebP q80.
                Calcul du pHash côté client.
3. CACHE        pHash déjà résolu (distance de Hamming ≤ 6) ?
                → réponse immédiate, 0 appel LLM, 0 coût.
4. UPLOAD       Supabase Storage, bucket privé `band-scans`, RLS par user_id.
5. EDGE FN      `recognize-band` :
                a) VLM (Claude vision) → JSON STRICT, schéma imposé :
                   { brand, line, vitola_name, country_hint,
                     text_tokens[], dominant_colors[], has_figurative_mark,
                     confidence }
                b) Embedding image (SigLIP) → vector(1152)
                c) Recherche hybride sur `ref.cigars` :
                   - vectorielle : cosine sur band_embeddings, top-20
                   - lexicale : trigram + unaccent sur text_tokens vs
                     brand/line/commercial_name
                   - fusion Reciprocal Rank Fusion (k=60)
                d) Retour top-3 + score de confiance calibré
6. UI           Révélation animée du candidat n°1 + 2 alternatives.
                Actions : « C'est celui-ci » / « Autre » / « Introuvable ».
7. BOUCLE       Confirmation → band_embeddings(source='user_confirmed')
                3 confirmations indépendantes → promotion en référence
                « Introuvable » → file de contribution wiki pré-remplie
8. GARDE-FOUS   Quota : 30 scans/jour/utilisateur (Upstash).
                Coût tracé par scan dans band_scans.cost_cents.
                Timeout 12s, dégradation gracieuse vers recherche manuelle.
```

**Calibration obligatoire** : constituer un jeu de test de 200 photos annotées à la main (`/tests/fixtures/bands/`) et publier top-1 / top-3 accuracy dans `/docs/recognition-benchmark.md`. Objectif v1 : **top-3 ≥ 85 %** sur les 200 références les plus courantes. Ne pas passer à la phase suivante sans ce chiffre mesuré.

---

## 7. Modules fonctionnels

| # | Module | Contenu clé |
|---|---|---|
| F1 | Auth & profil | Magic link + OAuth Google/Apple, age gate 18+, handle unique, préférences, confidentialité granulaire |
| F2 | Référentiel | Recherche facettée (marque, pays, cepo, longueur, force, cape, type de sortie), fiche cigare, comparateur 2–4 cigares, décodeur de code de boîte |
| F3 | Contribution wiki | Proposition, diff, file de validation, réputation, historique, fusion de doublons |
| F4 | Scan de bague | §6 |
| F5 | Dégustation | Formulaire progressif (3 tiers), roue des arômes interactive, mode dégustation à l'aveugle, minuteur, brouillon auto |
| F6 | Cave | Multi-caves, inventaire, vieillissement, valorisation, alertes, relevés hygro, import/export CSV |
| F7 | Social | Feed (abonnements / découverte), publications, sessions « je fume », braises, commentaires, clubs, événements, messagerie, notifications |
| F8 | Lieux | Carte, recherche géo (`ST_DWithin`), fiche, revendication par le professionnel, avis |
| F9 | Éditorial | MDX, catégories, auteurs, liens vers fiches cigares, newsletter, RSS, sitemap |
| F10 | Boutique | Catalogue, variantes, panier persistant, Stripe Checkout, suivi de commande, retours, factures PDF |
| F11 | Statistiques | Tableau de bord personnel : palmarès, cartographie des pays goûtés, évolution des notes, distribution des arômes, valeur de cave |
| F12 | Modération & conformité | Signalements, actions, bannissements, export/suppression RGPD, journal d'audit |

**Gamification sobre** (pas de confettis) : badges discrets affichés en bague — *Habanophile*, *Nicaraguayen*, *Archiviste* (contributions), *Cave centenaire*, *Tour du monde* (10 pays).

**Monétisation** : abonnement *Cercle* (cave illimitée, statistiques avancées, export, dégustation à l'aveugle, sans publicité) + marge boutique. **Aucun revenu publicitaire lié au tabac.**

---

## 8. Sécurité & performance

- RLS sur 100 % des tables. Policies testées par un jeu de tests SQL (`supabase/tests/`) exécuté en CI avec `pgTAP`.
- Aucune clé service_role côté client. Edge Functions uniquement.
- Storage : buckets privés + URL signées à durée courte. Jamais de bucket public sauf `articles-media`.
- Rate limiting sur : scan, inscription, publication, avis, recherche.
- Validation d'entrée : **Zod** sur toute Server Action et toute route API.
- Objectifs Core Web Vitals : LCP < 2,0 s sur fiche cigare, INP < 200 ms, CLS < 0,05.
- Indices obligatoires : GIN sur `search_vector` et `aroma_tags`, HNSW sur `embedding`, GiST sur `venues.geo`, index composite sur `(cigar_id, created_at)` pour `reviews`.

---

## 9. Roadmap

| Phase | Périmètre | Critère de sortie |
|---|---|---|
| **P0** | Setup, CLAUDE.md, CI, design system, age gate, layout, `<Band />` | Storybook des primitives + build vert |
| **P1** | Référentiel + recherche + fiches + seed (120 marques) | Recherche facettée < 300 ms sur 5 000 cigares |
| **P2** | Dégustation + roue des arômes + cave | Créer une dégustation et décrémenter la cave de bout en bout |
| **P3** | Social : profils, follows, feed, publications, braises, commentaires | Feed paginé keyset, 0 requête N+1 |
| **P4** | Scan de bague | Benchmark top-3 ≥ 85 % publié |
| **P5** | Lieux + carte | 200 lieux seedés, recherche 25 km < 200 ms |
| **P6** | Éditorial + SEO + newsletter | Lighthouse SEO ≥ 95 |
| **P7** | Boutique + Stripe | Commande test bout en bout + webhook idempotent |
| **P8** | Modération, RGPD, i18n, PWA, perf, accessibilité | Audit axe-core 0 violation critique |

Contribution wiki (F3) et statistiques (F11) sont livrées en fin de P1 et P2 respectivement.

---

## 10. Livrable Phase 0 — à produire MAINTENANT, sans coder

1. **Arborescence complète** du repo (fichiers et dossiers, avec une ligne de description chacun).
2. **Schéma SQL complet de P1** (`ref` + `profiles`) : DDL, enums, index, policies RLS, en un seul fichier de migration relu.
3. **Plan de design** au format demandé : 5 hex nommés, 4 rôles typographiques, wireframes ASCII de 3 écrans (accueil, fiche cigare, scan), et une phrase justifiant l'élément signature.
4. **3 ADR initiales** : (a) Supabase vs backend dédié, (b) stratégie de recherche hybride, (c) Stripe Checkout vs Payment Element.
5. **Liste des questions ouvertes** que ce brief ne tranche pas, classées par impact.
6. **Estimation** en nombre de sessions de travail par phase.

Puis tu t'arrêtes et tu attends ma validation.

---

### Rappel permanent
> Sobre. Chaud. Éditorial. Rien de promotionnel. Rien qui vende du tabac.
> Si un choix te semble « joli mais générique », c'est qu'il est mauvais : reviens au §4.1.
