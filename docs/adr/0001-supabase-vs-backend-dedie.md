# 0001 — Retenir Supabase managé plutôt qu'un backend dédié

- **Statut** : Proposée — attend validation
- **Date** : 2026-08-21
- **Décideur** : @jgueniche
- **Concerne** : toutes les phases · `supabase/` · `lib/supabase/` · la totalité du modèle d'autorisation

## Contexte

Le §3 du brief pose Supabase comme acquis (« cohérent avec mon stack existant »). Cette ADR ne
rouvre pas ce choix : elle en explicite le prix, parce que ce prix est plus élevé qu'il n'y paraît
et qu'il faut l'avoir accepté sciemment avant d'écrire la première migration.

Faits qui contraignent :

1. Le projet couvre huit phases, un référentiel wiki, un réseau social, une boutique et une
   modération. Cinq briques indépendantes seraient nécessaires : Postgres, authentification,
   stockage d'objets, temps réel, exécution serveur.
2. Le §2 qualifie potentiellement les habitudes de consommation de **données de santé au sens de
   l'article 9 RGPD**. L'hébergement dans l'UE n'est pas une préférence, c'est une contrainte.
3. Le §8 exige « RLS sur 100 % des tables » et des tests pgTAP en CI. Cela suppose un PostgreSQL
   accessible en SQL brut, pas une base masquée par un ORM.
4. L'équipe est d'une personne assistée. Le temps d'exploitation est la ressource rare.

## Options

**A — Supabase managé.** Postgres + Auth + Storage + Realtime + Edge Functions, une seule facture,
une seule console.
*Coût :* la frontière de sécurité se déplace du serveur applicatif vers la base. Le client
navigateur parle directement à Postgres avec une clé publiable ; ce qui protège les données, c'est
la RLS, pas un contrôleur. Une policy oubliée est une fuite, pas un bug. Runtime Deno pour les Edge
Functions, distinct de Node côté Next.js : deux environnements à maintenir.

**B — Backend dédié** (Fastify ou NestJS + Prisma) devant un Postgres managé (Scaleway, OVH, Neon).
*Coût :* authentification, e-mails transactionnels, OAuth, rotation de jetons, upload signé,
temps réel — tout est à écrire et à maintenir. Estimation honnête : **8 à 12 sessions de travail
avant la première fonctionnalité produit**, plus une charge d'exploitation permanente. Le §8 devient
plus simple (l'autorisation vit dans un seul langage) mais la roadmap glisse d'une phase entière.

**C — Postgres managé + authentification tierce** (Clerk, Auth.js). Position intermédiaire, qui
cumule l'intégration de deux fournisseurs et perd le stockage et le temps réel.

**D — Supabase auto-hébergé.** Résout la question de souveraineté au prix d'une astreinte
d'exploitation qu'une personne seule ne tiendra pas sur huit phases.

## Décision

**Option A : Supabase managé, projet créé en région UE, et la RLS est traitée comme du code de
sécurité — pas comme de la configuration.**

Ce qui emporte la décision n'est pas la vélocité mais le §8 lui-même. Un projet qui exige la RLS sur
100 % des tables a déjà choisi de placer l'autorisation dans la base. Une fois cela posé, un backend
dédié devient une seconde couche d'autorisation qui duplique la première — deux endroits où se
tromper au lieu d'un.

## Conséquences

**Acceptées, y compris désagréables :**

- **Une policy manquante est une fuite de données.** D'où : `tooling/scripts/audit-rls.ts` bloquant
  en CI, une suite pgTAP par table, un auto-contrôle à la fin de chaque migration (déjà en place,
  §11 de `03-schema-p1.sql`), et une entrée `CODEOWNERS` sur `supabase/`.
- **Deux runtimes.** Next.js en Node 22 sur Vercel `cdg1`, Edge Functions en Deno. Le pipeline de
  scan (P4) vit en Deno ; aucune logique métier n'est partagée entre les deux, seulement des types.
- **Pooling.** Le serverless multiplie les connexions. Supavisor en mode transaction est obligatoire
  côté Next.js ; cela interdit les instructions préparées côté serveur et certains usages de
  `LISTEN/NOTIFY`.
- **`service_role` est une clé de production.** Un seul point d'entrée : `lib/supabase/admin.ts`,
  dont l'import hors `app/api/**` et `supabase/functions/**` est refusé par une règle ESLint maison.
- **Dépendance sur la sécurité d'un tiers.** Une faille dans GoTrue ou PostgREST est une faille
  chez nous, sans recours autre que le correctif de l'éditeur.

**Ce que cela interdit désormais :**

- Aucune modification de schéma via l'interface Supabase (§0.4). Une migration, toujours.
- Aucune fonctionnalité qui exigerait une extension Postgres non disponible sur la plateforme
  managée : à vérifier **avant** de la mettre dans une phase, pas pendant.
- Aucun contournement de la RLS « en attendant », même en développement.

**Réversibilité, entretenue activement.** Le référentiel est du SQL standard. Les seules
dépendances propriétaires sont `auth.uid()`, `auth.users` et le schéma `storage` — soit une centaine
de lignes. Une reprise sur un Postgres nu coûterait une réécriture de ces points d'ancrage et un
backend d'authentification, pas une migration de données. Ce coût est délibérément maintenu bas :
c'est pour cela qu'aucune table ne référence de vue Supabase et qu'aucun `rpc` ne porte de logique
métier.

## Quand rouvrir

- La facture Supabase dépasse le coût mensuel d'un serveur applicatif géré (~150 €/mois), **ou**
- une exigence de souveraineté ou une clause contractuelle impose l'auto-hébergement, **ou**
- la suite pgTAP dépasse la trentaine de minutes en CI, signe que la logique d'autorisation est
  devenue trop lourde pour la base.

## Questions ouvertes

1. **Quelle région, et le DPA est-il signé ?** Le §3 impose l'UE pour l'observabilité ; c'est *a
   fortiori* vrai pour la base. Une région ne se change pas après coup sans migration complète.
   Recommandation vérifiée : **`eu-west-3` (Paris)**, même ville que Vercel `cdg1`. Voir **Q2**.
2. **La production et le développement partagent-ils un projet ?** Recommandation révisée : **un
   seul projet** tant qu'il n'y a ni utilisateur ni donnée réelle — développement en local, et
   branches Supabase facturées à l'heure pour les prévisualisations à l'approche de P1.
3. **Version de Postgres.** Le §3 dit Postgres 15 ; Supabase provisionne aujourd'hui **Postgres 17**.
   La migration P1 n'utilise rien de spécifique à une version et a été validée sur 16 ; elle sera
   revalidée sur 17 à la création du projet.
