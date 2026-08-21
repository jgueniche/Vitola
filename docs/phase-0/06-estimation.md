# P0 · Livrable 6 — Estimation par phase

## Ce que « session » veut dire ici

Une **session** = un bloc de travail continu d'environ 3 heures, incluant l'écriture, les tests, la
relecture et la correction — pas seulement la production de code. Une session se termine sur
`pnpm typecheck && pnpm lint && pnpm test` au vert, et sur un commit.

Les fourchettes sont **basse / haute**. La borne basse suppose que les questions bloquantes du
livrable 5 sont tranchées à temps ; la borne haute suppose une réponse tardive ou un aller-retour.

---

## Tableau

| Phase | Périmètre | Sessions | Ce qui domine le coût |
|---|---|---:|---|
| **P0** | Setup, CI, design system, age gate, layout, `<Band />`, Storybook | **4 – 6** | Le design system, pas l'outillage. Traduire le §4 en tokens Tailwind v4 et re-thémer shadcn/ui sans laisser passer une valeur brute prend plus de temps qu'on ne le croit. Le `<Band />` en quatre variantes est un composant à part entière. |
| **P1** | Référentiel, recherche facettée, fiches, wiki (F3), seed | **9 – 13** | Trois chantiers empilés. La recherche facettée avec compteurs et état d'URL vaut 3 sessions à elle seule ; le wiki (proposition, diff, file de validation, réputation) 3 de plus ; les fiches et les pages marque/vitole le reste. **Le schéma est déjà écrit et testé** — c'est la seule avance réelle de cette phase. |
| **P2** | Dégustation, roue des arômes, cave, statistiques (F11) | **8 – 11** | La roue des arômes interactive est le composant le plus coûteux du projet après le scan : taxonomie hiérarchique, sélection multiple, accessible au clavier, utilisable à 360 px. Le formulaire en trois tiers avec brouillon automatique et minuteur est un second gros morceau. |
| **P3** | Profils, follows, feed, publications, braises, commentaires | **6 – 9** | Le feed est le piège : « 0 requête N+1 » et pagination keyset ne s'obtiennent pas par accident avec la RLS active. Prévoir une session entière pour le plan de requête et sa vérification. |
| **P4** | Scan de bague | **8 – 12** | **La phase la plus incertaine.** Le pipeline se code en 3 à 4 sessions ; c'est la *calibration* qui n'est pas bornée. Atteindre top-3 ≥ 85 % peut demander une itération ou six sur le prompt du VLM, les seuils de fusion et le corpus de référence. La fourchette haute suppose deux cycles de calibration. |
| **P5** | Lieux, carte, recherche géo | **4 – 6** | Techniquement la phase la plus simple : PostGIS et MapLibre sont des chemins connus. Le coût réel est la donnée — 200 lieux à saisir — et le risque est réglementaire (Q6), pas technique. |
| **P6** | Éditorial, SEO, newsletter, RSS, sitemap | **5 – 7** | MDX avec composants sur mesure, images OG par route, double opt-in, et la mise au point d'un Lighthouse ≥ 95, qui se joue sur les derniers points. |
| **P7** | Boutique, Stripe | **7 – 10** | Le paiement n'est pas le plus cher — Checkout limite le travail. Ce sont les variantes, le stock, le panier persistant, les factures PDF, les retours, et la fiabilité du webhook (idempotence, rejeu, rattrapage) qui prennent le temps. |
| **P8** | Modération, RGPD, i18n, PWA, performance, accessibilité | **7 – 10** | Cinq chantiers sous une seule étiquette. Le back-office de modération vaut 3 sessions ; l'accessibilité à zéro violation critique 2 ; la performance 2. L'i18n n'entre que si Q21 est tranchée en sa faveur, auquel cas ajouter 3 sessions. |
| | **Total** | **58 – 84** | |

---

## Lecture de ces chiffres

**À raison de deux sessions par semaine :** 29 à 42 semaines, soit **7 à 10 mois**.
**À quatre sessions par semaine :** 15 à 21 semaines, soit **4 à 5 mois**.

Le premier jalon utilisable — un référentiel consultable, cherchable et contribuable — se situe à
**13 à 19 sessions** (P0 + P1). C'est le seul chiffre qui compte vraiment au démarrage : le reste
est de la planification à un horizon où les hypothèses auront changé.

---

## Ce qui n'est pas dans ces chiffres

**La saisie du référentiel (Q3).** 15 à 25 heures de travail documentaire humain, indépendantes du
développement, et sur le chemin critique de P1 : sans données, le critère de sortie n'est pas
mesurable. C'est le poste de coût le plus souvent oublié dans ce type de projet.

**Les 200 photos annotées de P4 (Q17).** Collecte, cadrage et annotation manuelle : 8 à 12 heures,
également non-développement. Sans elles, P4 ne peut pas se clore, puisque son critère de sortie est
un chiffre mesuré.

**La saisie des 200 lieux de P5.** 4 à 6 heures.

**Le conseil juridique (Q1).** Coût et délai externes.

**La production éditoriale.** P6 livre le système de publication ; il ne livre pas d'articles.

---

## Les trois choses qui feraient exploser cette estimation

1. **Un refus de la contrainte de non-scraping devenu impraticable.** Si la saisie manuelle
   s'enlise, la tentation sera de « juste importer une liste ». Le §2 l'interdit et la question ne
   se rouvre pas. La seule sortie légitime est d'ouvrir le wiki plus tôt et de repousser le seuil de
   5 000 fiches — c'est-à-dire de renoncer au critère de sortie de P1, pas à la règle.
2. **Une reprise de la RLS après P3.** Les policies écrites en P1 supposent un modèle de visibilité
   binaire (publié / brouillon). P3 introduit `public | followers | private`, et P2 des données
   personnelles dans la cave. Si le modèle de visibilité change de nature à ce moment-là, c'est
   toute la suite pgTAP qu'il faut reprendre. J'ai posé `profiles.is_discoverable` et un helper de
   rôle linéaire pour absorber cela — mais c'est un pari, pas une garantie.
3. **La calibration de P4 qui ne converge pas.** Si le top-3 plafonne à 70 %, le choix sera :
   accepter un taux plus bas en assumant le repli vers la recherche manuelle, ou investir dans un
   corpus de référence beaucoup plus large. Cette seconde branche vaut 5 à 8 sessions de plus. Le
   §6 a raison d'en faire un critère de sortie bloquant : c'est la seule manière de ne pas
   s'apercevoir trop tard que la fonctionnalité phare ne fonctionne pas.

---

## Recommandation de séquencement

Le brief ordonne P0 → P8 et je n'y touche pas. Une seule remarque : **commencer la saisie du
référentiel (Q3) pendant P0**, en parallèle du développement. C'est le seul poste qui ne dépend
d'aucun code, qui est sur le chemin critique de P1, et dont le retard ne peut pas être rattrapé par
du développement. Les schémas CSV sont livrables dès la validation de cette Phase 0.
