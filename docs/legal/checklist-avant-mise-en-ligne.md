# Checklist avant ouverture publique

**Bloquant.** Tant que cette checklist n'est pas soldée, le flag `public_signup_open` reste à
`false` et `app/robots.ts` interdit toute indexation. Le code peut être complet ; la porte reste
fermée.

Ce document n'est pas un avis juridique. Il liste ce qu'un avocat spécialisé (santé publique /
e-commerce) doit confirmer, et ce que nous avons déjà mis en place pour y répondre.

---

## 1. À faire valider par un avocat

| # | Point | Pourquoi c'est incertain | Phase concernée |
|---|---|---|---|
| L1 | Un référentiel encyclopédique du cigare, avec photos et fiches, échappe-t-il à l'interdiction de publicité indirecte ? | C'est la question fondatrice. Une réponse négative remettrait en cause le produit entier. | Toutes |
| L2 | Les notes de dégustation constituent-elles des données de santé (art. 9 RGPD) ? | Elles décrivent une consommation de tabac rattachée à une personne identifiée. | P2 |
| L3 | Un annuaire de buralistes et de caves est-il licite ? | Il oriente vers des points de vente de tabac. | P5 |
| L4 | Peut-on héberger la marque figurative d'un fabricant (`brands.logo_path`) ? | Droit des marques **et** publicité indirecte. Colonne laissée `NULL` en attendant (Q4). | P1 |
| L5 | Une boutique d'accessoires adossée à un site sur le tabac est-elle exposée ? | La proximité éditoriale pourrait être requalifiée. | P7 |
| L6 | Le contenu contributif engage-t-il notre responsabilité éditoriale ? | Statut d'hébergeur ou d'éditeur selon le degré de curation. | P3 |

## 2. Déjà en place (à vérifier, pas à construire)

| | Où | État |
|---|---|---|
| Portail 18+ signé serveur | `middleware.ts`, `lib/compliance/age-gate.ts` | Fait — 6 tests e2e adversariaux |
| Bandeau sanitaire permanent, non masquable | `components/compliance/health-notice.tsx` | Fait — présent sur 100 % des routes, testé |
| Aucune vente de tabac possible | Schéma + `tests/compliance/` | Fait — testé, y compris l'absence de `affiliate_url` |
| Prix indicatifs désactivés par défaut | `feature_flags.show_indicative_prices = false` | Fait |
| Aucune indexation | `app/robots.ts` + `X-Robots-Tag` sur routes protégées | Fait |
| Charte éditoriale | `docs/editorial-guidelines.md` | Fait |
| Registre de consentement | Table `consents`, append-only | Schéma écrit et testé, non appliqué |
| Journal d'audit | Table `audit_log`, admin seul en lecture | Schéma écrit et testé, non appliqué |
| Minimisation : date de naissance isolée | `profile_settings`, propriétaire seul | Schéma écrit et testé |
| Polices auto-hébergées, aucun appel à Google | `next/font/google` (téléchargement au build) | Fait |
| Aucun traceur avant consentement | Aucun outil d'analyse installé à ce stade | Fait par abstention |

## 3. Reste à produire avant ouverture

- [ ] Mentions légales réelles : éditeur, directeur de publication, hébergeur (actuellement des gabarits)
- [ ] Politique de confidentialité réelle, mentionnant explicitement l'art. 9 si L2 est confirmé
- [ ] CGU, avec interdiction expresse de la vente et de l'échange entre membres
- [ ] Registre des traitements (`docs/legal/data-map.md`)
- [ ] **Point de contact DSA (art. 11 et 12) : une adresse à un domaine que nous possédons.**
      C'est le seul élément manquant du dispositif de signalement — le mécanisme de l'art. 16 est
      livré (bouton « Signaler » sur les fiches et les commentaires, file `mod.reports`), et le
      délai de 72 h est publié dans les mentions légales. `DSA_CONTACT_EMAIL` est délibérément à
      `null` dans `lib/compliance/dsa.ts` : publier une adresse à un domaine que personne ne
      possède, c'est s'engager à relever une boîte qui n'existe pas. La page dit alors que le point
      de contact sera publié avant l'ouverture. **Une ligne à écrire, dès que la Q7 aura tranché un
      domaine.**
- [x] Endpoints RGPD export et suppression opérationnels — livrés en P1. L'export couvre désormais
      aussi les trois liens vers `mod` (signalements déposés, décisions rendues, actes de
      modération), par la fonction `public.moderation_records_for_subject()` de la migration 0006.
      **Reste à exercer le chemin authentifié complet contre le projet réel, avec un compte de QA.**
- [ ] DPA signés : Supabase, Vercel, Resend, Sentry, PostHog, Upstash, Stripe
- [ ] Vérification de disponibilité de la marque avant dépôt du nom retenu (Q7)
- [ ] CGV et droit de rétractation de 14 jours, avant toute ouverture de la boutique
- [ ] Statut TVA et configuration OSS confirmés (Q10)

## 4. Décisions déjà prises par abstention

Quand la réponse juridique manque, le défaut est **de ne pas faire** :

- Aucun logo de fabricant hébergé.
- Aucun prix affiché sur une fiche.
- Aucune indexation.
- Aucun outil d'analyse comportementale installé.
- Aucun script de collecte automatisée de données tierces, jamais (art. L341-1 CPI).

Ces choix sont réversibles en une ligne le jour où l'avis arrive. L'inverse ne l'est pas.
