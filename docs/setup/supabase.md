# Procédure — ouvrir Supabase pour Vitola

> Lisible sur téléphone. Trois décisions, puis six actions. Environ **10 minutes**.
> Tout ce que je peux faire seul est marqué « je m'en occupe ».

---

## En une phrase

**L'accès est déjà ouvert.** Je vois votre organisation Supabase et vos projets. Il manque
une seule chose : **un projet dédié à Vitola**, que je ne crée pas moi-même parce qu'il
coûte **10 $/mois** sur votre compte.

---

## 1. Ce que je vois déjà (rien à faire)

| | |
|---|---|
| Organisation | **ShiftX** — plan **Pro** |
| Projets existants | `Alpha Report` (Paris, `eu-west-3`) · `ShiftX` (Stockholm, `eu-north-1`) |
| Projet Vitola | **aucun** |

Le connecteur Supabase est actif et me permet déjà de lister l'organisation et les projets.
Je n'ai touché à aucun de vos deux projets existants et je n'y toucherai pas.

---

## 2. Les trois décisions

### Décision A — le coût. **10 $/mois.**
Votre organisation est en plan Pro. Un troisième projet est facturé **10 $ par mois**, de
façon récurrente, à partir de sa création. C'est la seule dépense engagée par cette procédure.
Rien d'autre dans Vitola n'engage de frais pour l'instant.

> Si vous préférez ne pas payer maintenant : dites-le, je continue tout P0 sans base de
> données. Le développement ne se bloque qu'à **P1**, quand il faut une vraie base pour le
> référentiel. Vous avez donc plusieurs semaines de marge.

### Décision B — la région. **Je recommande `eu-west-3` (Paris).**
Je corrige ici ma recommandation du livrable de Phase 0, où j'avais écrit Francfort. Paris est
meilleur pour deux raisons vérifiées : le brief héberge l'application sur Vercel en région
`cdg1`, qui est **Paris** — même ville signifie la latence la plus basse entre l'application et
la base ; et votre projet `Alpha Report` y est déjà, donc c'est une région que vous utilisez.
Le RGPD est satisfait dans les deux cas.

**Cette décision est irréversible** : changer de région impose de recréer le projet et de
migrer les données.

### Décision C — un projet ou deux ? **Je recommande un seul, pour l'instant.**
L'idéal serait un projet production et un projet développement (20 $/mois). Tant qu'il n'y a
ni utilisateur ni donnée réelle, c'est payer double pour rien. Je développe en local
(`supabase start`, gratuit) et je n'applique les migrations sur le projet distant qu'une fois
testées.

Quand P1 approchera de la mise en ligne, on ajoutera soit un second projet, soit des branches
Supabase — facturées **0,013 $/heure**, soit environ 0,30 $ pour une journée de test, et
détruites après usage. C'est le bon compromis, mais plus tard.

---

## 3. Les six actions

Sur **https://supabase.com/dashboard** :

1. **New project**, dans l'organisation **ShiftX**.
2. **Name** : `vitola`
3. **Database Password** : générez-la avec le bouton, puis **enregistrez-la dans votre
   gestionnaire de mots de passe**. Ne me l'envoyez pas — je n'en ai pas besoin, je passe par
   le connecteur.
4. **Region** : `West EU (Paris)` — `eu-west-3`
5. **Postgres version** : laissez le défaut. Supabase provisionne aujourd'hui **Postgres 17**,
   alors que le brief mentionne Postgres 15. Ce n'est pas un problème : ma migration P1 a été
   testée sur PostgreSQL 16 et n'utilise rien de spécifique à une version. Je la revaliderai
   sur 17.
6. **Create new project**, puis attendez le passage au vert (2 à 3 minutes).

**Puis dites-moi simplement : « le projet vitola est créé ».** C'est tout.

---

## 4. Ce que je fais dès que vous me le dites

Je m'en occupe, sans rien vous demander de plus :

1. Je récupère l'identifiant du projet, son URL et sa **clé publiable** via le connecteur.
2. Je vérifie que j'ai bien le droit d'écrire, avec une migration à vide.
3. J'applique la migration P1 déjà écrite et testée (`docs/phase-0/03-schema-p1.sql`).
4. Je rejoue les 25 assertions de vérification contre le projet réel.
5. Je génère les types TypeScript et je les commite.
6. Je remplis `.env.example` avec les bons noms de variables.

---

## 5. Les secrets : ce qu'il ne faut jamais me coller ici

Supabase distingue aujourd'hui deux familles de clés. Les nouvelles remplacent les anciennes :

| Clé | Ancien nom | Où elle va | Me la donner ? |
|---|---|---|---|
| `sb_publishable_…` | `anon` | Navigateur, publique par nature | **Inutile** — je la récupère seul |
| `sb_secret_…` | `service_role` | **Serveur uniquement**. Contourne la RLS. | **Jamais dans une conversation** |
| Mot de passe base | — | Votre gestionnaire de mots de passe | **Jamais** |

La clé secrète donne un accès total à la base **en ignorant toutes les policies de sécurité**.
Elle ne doit exister qu'à deux endroits : les variables d'environnement Vercel, et les secrets
GitHub Actions. Collée dans une conversation, elle se retrouve dans un historique — il faudrait
alors la révoquer.

**Quand le moment viendra** (P1, pour le déploiement), je vous donnerai la liste exacte des
variables à créer dans Vercel, et vous y collerez les valeurs vous-même. Le développement de
P0 n'a besoin d'aucune de ces clés.

---

## 6. Si quelque chose ne va pas

| Symptôme | Cause probable | Quoi faire |
|---|---|---|
| Je dis ne pas voir le projet | Créé dans une autre organisation que ShiftX | Vérifiez l'organisation en haut à gauche du tableau de bord |
| Je dis ne pas pouvoir écrire | Le connecteur est en lecture seule | Reconnectez Supabase depuis claude.ai → Paramètres → Connecteurs, en autorisant l'écriture |
| Le projet reste en pause | Inactivité | Bouton *Restore* dans le tableau de bord |

---

## 7. Rappel de périmètre

Je ne crée aucun projet, ne modifie aucun réglage de facturation, et ne touche ni à
`Alpha Report` ni à `ShiftX`. Toute action ayant un coût passe par vous.
