# P0 · Livrable 2 — Schéma SQL de P1 : note de relecture

Le schéma lui-même : **[`03-schema-p1.sql`](./03-schema-p1.sql)** — un fichier, 11 sections,
lisible de haut en bas dans l'ordre des dépendances. Destination à l'implémentation :
`supabase/migrations/0001_p1_referential.sql`, sans modification.

---

## 1. Il a été exécuté, pas seulement écrit

Le fichier a été appliqué sur une PostgreSQL 16 réelle, contre des doublures minimales des objets
gérés par Supabase (`auth.users`, `auth.uid()`, `storage.*`, rôles `anon` / `authenticated` /
`service_role`), puis soumis à 23 assertions de comportement. Harnais + assertions :
**[`03b-verification.sql`](./03b-verification.sql)**, rejouable d'une commande.

**Résultat : 25 assertions, 0 échec, sortie 0.**

| # | Assertion | Résultat |
|---|---|---|
| T1 | L'inscription provisionne `profiles` + `profile_settings` et pose `adult_confirmed_at` | PASS |
| T2 | Une date de naissance de moins de 18 ans est refusée | PASS |
| T3 | Un membre ne peut pas s'attribuer le rôle `admin` | PASS |
| T4 | Un membre ne peut pas gonfler sa `reputation` | PASS |
| T5 | La date de naissance d'autrui est invisible | PASS |
| T6 / T7c | Un visiteur anonyme ne voit aucun brouillon | PASS |
| T7 / T7b | L'auteur voit son brouillon, un tiers ne le voit pas | PASS |
| T8 | L'auteur **ne peut pas** publier sa propre fiche | PASS |
| T9 | Un `editor` publie | PASS |
| T10 | Un membre n'écrit pas directement dans `ref.brands` | PASS |
| T11 | `search_vector` contient la marque, accents repliés | PASS |
| T12 | Renommer une marque rafraîchit les vecteurs dépendants | PASS |
| T13 | Un doublon (casse + accents) est rejeté | PASS |
| T14 | `status = 'merged'` exige une cible de fusion | PASS |
| T15 | Une seule image primaire par cigare | PASS |
| T16 | Le registre de consentement est append-only côté client | PASS |
| T17 | `audit_log` illisible hors admin, non insérable par un client | PASS |
| T18 | Le prix indicatif est **désactivé par défaut** | PASS |
| T19 | Un slug malformé est rejeté | PASS |
| T20 | La recherche facettée passe par les index partiels | PASS |
| T21 | Un anonyme n'atteint pas `profile_settings` | PASS |
| T22 | Un profil non découvrable disparaît de l'annuaire | PASS |
| T23 | La visibilité des images suit celle de la fiche, sans règle dupliquée | PASS |
| — | Couverture RLS : 0 table de `public`/`ref` sans RLS **et** sans policy | PASS |

Deux défauts réels ont été trouvés par cette exécution et corrigés dans le fichier livré :

1. **`public.current_app_role()` était définie avant `public.profiles`.** Une fonction `language sql`
   est validée à la création : la migration échouait à la ligne 198. Les deux helpers de rôle sont
   maintenant définis juste après la table.
2. **`authenticated` n'avait pas `USAGE` sur le schéma `extensions`.** La contrainte
   `CHECK (slug = public.slugify(slug))` appelle `unaccent` en `SECURITY INVOKER` : **tout** `INSERT`
   client dans `ref.*` échouait avec `permission denied for schema extensions`. Sur Supabase ce grant
   existe souvent déjà par défaut — c'est précisément pourquoi il est désormais explicite.

Ces deux bugs n'étaient pas visibles à la relecture. C'est l'argument pour exécuter le SQL de
Phase 0 plutôt que de le livrer sur parole.

> Mise en garde méthodologique, apprise à mes dépens sur ce harnais : `SET LOCAL ROLE` **hors
> transaction est silencieusement ignoré**. Un test RLS qui l'oublie s'exécute en superutilisateur
> et voit tout passer. Les tests pgTAP de P1 devront ouvrir un `BEGIN` explicite — c'est noté dans
> `supabase/CLAUDE.md`.

---

## 2. Périmètre

**Inclus.** Extensions et helpers immuables · `public.profiles` + `public.profile_settings` ·
socle de conformité (`consents`, `audit_log`, `feature_flags`) · les 7 tables `ref` du §5.1 ·
recherche plein texte + trigramme · index de facettes · grants colonne par colonne · RLS sur
100 % des tables · buckets Storage et leurs policies · auto-contrôle final.

**Exclu, volontairement.** `pgvector` et `postgis` ne sont pas activées : chaque phase active ce
qu'elle consomme, pour qu'un échec d'installation soit imputable à la phase qui l'a causé.
`band_scans` / `band_embeddings` (P4), `reviews` / `humidors` (P2), `mod.*` (P3), `shop.*` (P7).

**Ajout assumé au §10.2.** Le brief cadre le livrable sur « `ref` + `profiles` », mais son §2 exige
`consents` et les endpoints RGPD « dès la Phase 1 », et le flag `show_indicative_prices` conditionne
l'affichage d'une colonne (`msrp_eur`) livrée par cette migration même. Les livrer plus tard aurait
signifié exposer un prix sans interrupteur. Ces trois tables occupent la §4 du fichier, isolée et
signalée : si vous préférez les repousser, elle se retire d'un bloc.

---

## 3. Écarts par rapport au brief — à valider

Aucun n'a été appliqué en silence. Chacun est commenté dans le SQL à l'endroit concerné.

| # | Écart | Pourquoi | Si vous refusez |
|---|---|---|---|
| **E1** | `birth_date`, `preferences`, `privacy` déplacés de `profiles` vers une table `profile_settings` (1-1, propriétaire uniquement) | **C'est le seul écart structurel.** La RLS est ligne à ligne, pas colonne à colonne. Une table unique ne peut pas être à la fois un annuaire public (chacun lit un pseudo et un avatar) et le dépositaire d'une date de naissance. Les `GRANT` colonne ne savent pas dire « seulement le propriétaire ». Sans ce découpage, `birth_date` est lisible par tout membre connecté — inacceptable au regard du §2. | Fusionner les deux tables et rendre `profiles` lisible du seul propriétaire : l'annuaire public, les profils `/u/[handle]` et le fil P3 deviennent impossibles sans vue `SECURITY DEFINER`. |
| **E2** | `cigars.origin_country` ajouté | F2 exige une facette « pays ». Le pays de la marque n'est pas celui du cigare : une marque peut être produite dans plusieurs pays. | Facetter sur `brands.country`, en acceptant des résultats faux pour les marques multi-sites. |
| **E3** | `cigars.merged_into_id` ajouté | Le brief crée `status = 'merged'` sans cible. F3 promet la fusion de doublons : sans cible, une fusion perd la redirection. | Retirer la valeur `merged` de l'enum. |
| **E4** | `vitolas.slug` ajouté | URL canonique `/vitoles/[slug]`, et le format est une entrée de navigation réelle chez les amateurs. | Naviguer par identifiant : mauvais pour le SEO éditorial visé en P6. |
| **E5** | `box_codes.kind` ajouté | Le brief mêle codes usine (`MSU`) et codes de date (`JUN 19`) dans une même table sans discriminant. Un décodeur doit les distinguer. | Deux tables séparées, ou un décodage ambigu. |
| **E6** | `cigar_images` : `license` passe en `NOT NULL` ; ajout de `created_by`, `width`, `height`, `blurhash` | Une image de licence inconnue est un passif. `created_by` est requis par la RLS (qui peut modifier ?). Le LQIP est exigé par le §3 du brief. | `license` nullable = dette juridique à l'échelle du référentiel. |
| **E7** | `profiles.is_discoverable` sorti du jsonb `privacy` | Une policy RLS doit le lire sans jointure. Le reste de `privacy` demeure en jsonb. | Une jointure `profile_settings` dans la policy de `profiles` : lecture croisée et récursion. |
| **E8** | `manufacturers.notes`, `vitolas.notes`, contraintes de longueur partout | Bornes de saisie sur un modèle wiki ouvert à la contribution. | Champs texte non bornés en écriture publique. |
| **E9** | `cigars.msrp_source` et `cigars.msrp_effective_on` ajoutés, liés à `msrp_eur` par contrainte | Les prix français sont homologués par arrêté et révisés tous les mois environ. Un prix sans date est une désinformation en quelques semaines ; sans source, il est invérifiable. Les trois colonnes voyagent ensemble ou aucune n'est renseignée. | Un prix figé, dont personne ne saura s'il date de 2026 ou de 2029. |

---

## 4. Les cinq décisions qui portent le reste

**a. `search_vector` par trigger, pas en colonne générée.** Une colonne générée ne peut lire que sa
propre ligne ; le vecteur doit contenir marque, ligne et vitole. Le trigger se déclenche sur tout
`UPDATE` de `ref.cigars` (pas seulement sur les colonnes sources) : renommer une marque se propage
alors par un simple `UPDATE ref.cigars SET updated_at = now() WHERE brand_id = …`. Coût : trois
`SELECT` par écriture de cigare. À 5 000 lignes, invisible.

**b. Deux configurations de recherche, `simple` + `french`.** Le stemming français mutile les noms
propres : « Behike » et « Behiké » ne doivent pas diverger, et « Montecristo » ne doit pas être
raciné. Les noms propres partent en `simple` (poids A/B), la prose d'origine en `french` (poids D).
Les noms de configuration sont qualifiés `pg_catalog.` parce que les fonctions tournent avec
`search_path = ''`.

**c. Les rôles sont linéaires.** `member < contributor < editor < moderator < admin`, ce qui réduit
tout contrôle à une comparaison d'enum. `moderator` n'est pas conceptuellement au-dessus d'`editor`
— c'est un raccourci assumé. À revoir en P8 si la modération se sépare vraiment de l'édition.

**d. `profiles` est en `ENABLE` mais **pas** en `FORCE ROW LEVEL SECURITY`.** `FORCE` soumettrait le
propriétaire de `public.current_app_role()` aux policies que cette fonction évalue — récursion
infinie sur chaque requête. Toutes les autres tables sont en `FORCE`. C'est le piège classique de la
RLS Supabase ; il est commenté dans le fichier pour qu'il ne soit pas « corrigé » plus tard.

**e. Les privilèges sensibles sont barrés deux fois.** `role`, `reputation`, `search_vector`,
`adult_confirmed_at` n'apparaissent dans aucun `GRANT` (première barrière, testée par T3/T4) et sont
refusés par un trigger de garde (seconde barrière, au cas où une migration future re-grante par
inadvertance). Un admin ne change donc pas un rôle depuis le client : cela passe par un endpoint
`service_role`, qui écrit dans `audit_log`.

---

## 5. Ce que le schéma refuse de rendre possible

Le §2 du brief est traduit en absences, pas en commentaires :

- **Aucune colonne** `affiliate_url`, `vendor`, `stock`, `availability`, `deal` ou `buy_link` sur
  `ref.cigars`. Rien dans ce schéma ne permet de router un lecteur vers un achat de tabac.
- `msrp_eur` existe (donnée factuelle), mais son affichage dépend du flag `show_indicative_prices`,
  **inséré à `false`** par la migration (T18). Le prix ne peut pas apparaître par accident.
- `box_codes` décode des dates. Aucune colonne de cote, de valorisation ou de rareté : ce serait un
  argument de collection, donc promotionnel.
- Aucune table de mise en relation entre membres autour d'un objet physique. La cave (P2) est un
  inventaire personnel : `humidor_events` ne comportera pas de type `sell` ni `trade`.

---

## 6. Points restés ouverts dans ce fichier

Ils sont repris et arbitrés dans [`05-questions-ouvertes.md`](./05-questions-ouvertes.md) :

- **Q8** — `cigar-images` est créé **privé**, conformément au §8 (« jamais de bucket public sauf
  `articles-media` »). Sur les pages les plus consultées du site, cela supprime le cache CDN et
  impose une URL signée par image. C'est le seul endroit où j'estime que le §8 se retourne contre
  le §9 (LCP < 2,0 s sur fiche cigare). À trancher avant P1.
- **Q4** — `brands.logo_path` existe mais reste `NULL` : héberger la marque figurative d'un tiers
  est une décision juridique, pas technique.
- **Q18** — les valeurs d'enum (`leger`, `moyen_corse`) sont en français, alors que le §0.10 impose
  l'anglais dans le code. J'ai gardé le vocabulaire du brief plutôt que de modifier la spécification
  sans accord. Renommer plus tard coûte une migration de type ; le faire maintenant coûte une ligne.
