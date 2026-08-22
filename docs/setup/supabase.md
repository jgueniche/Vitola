# Procédure — donner à Claude accès au projet Supabase

> Lisible sur téléphone. Une action, environ 5 minutes.
> État au moment d'écrire : **le projet `vitola` existe**, dans l'organisation `jgueniche`.
> Ce qui manque est l'accès, pas le projet.

---

## Le problème, en trois lignes

L'autorisation OAuth de Supabase est **par organisation**. Le connecteur géré de claude.ai ne
détient qu'un seul jeton : l'autoriser sur `jgueniche` fait perdre `ShiftX`, et inversement. Avec
des projets actifs dans les deux, cela imposerait de basculer à chaque changement de contexte.

Il existe une sortie qui ne coûte ni basculement ni argent.

---

## Les trois options, et pourquoi une seule tient

| | Coût | Verdict |
|---|---|---|
| **A. Basculer le connecteur** à chaque changement de projet | Gratuit, mais deux clics à chaque fois — et on oublie | Pénible |
| **B. Transférer `vitola` dans ShiftX** | **10 $/mois** par projet supplémentaire sur le plan Pro, soit ~120 $/an | Payer pour éviter deux clics |
| **C. Un serveur MCP propre au dépôt, en plus du connecteur** | Gratuit, à configurer une fois | **Recommandé** |

L'option C existe parce que le serveur MCP de Supabase est un point d'entrée HTTP qui accepte un
**jeton d'accès personnel** en en-tête, et qui peut être **restreint à un seul projet**. Déclaré
dans le `.mcp.json` du dépôt, il ne vaut que pour Vitola. Votre connecteur géré reste branché sur
ShiftX, intact, pour vos autres projets. Les deux coexistent.

---

## Option C — ce que vous avez à faire, une fois

Le fichier `.mcp.json` est déjà committé à la racine du dépôt :

```json
{
  "mcpServers": {
    "supabase-vitola": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=${SUPABASE_PROJECT_REF}",
      "headers": { "Authorization": "Bearer ${SUPABASE_ACCESS_TOKEN}" }
    }
  }
}
```

Il ne contient aucun secret : seulement deux références de variables, que Claude Code résout depuis
l'environnement.

### 1. Créer le jeton

Tableau de bord Supabase → votre compte → **Access Tokens** → *Generate new token*.
Nommez-le `claude-code-vitola`. **Copiez-le tout de suite** : il ne s'affiche qu'une fois.

### 2. Le déposer dans l'environnement — jamais dans une conversation

Sur claude.ai/code, réglages de l'environnement → variables d'environnement :

| Variable | Valeur |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | le jeton créé à l'étape 1 |
| `SUPABASE_PROJECT_REF` | la référence du projet `vitola` — la partie `xxxxx` de `https://xxxxx.supabase.co`, dans les réglages du projet. Ce n'est pas un secret. |

### 3. Me le dire

Je vérifie en une commande et j'enchaîne.

---

## Ce que ce montage donne, et ce qu'il coûte

**Il est plus étroit que l'alternative.** Le paramètre `project_ref` **désactive les outils de
compte** : ce serveur ne peut ni lister vos organisations, ni créer un projet, ni approcher la
facturation, ni voir ShiftX. Il ne connaît que `vitola`. C'est moins d'accès que ce que le
connecteur OAuth m'accorde aujourd'hui sur ShiftX.

**Le point de vigilance, dit franchement.** Le jeton lui-même est de portée compte : quiconque le
détient peut agir en dehors de ce cadrage. Il vit donc dans une variable d'environnement, jamais
dans un message, et se révoque en un clic depuis le tableau de bord. Pour le neutraliser
temporairement, ajouter `&read_only=true` à l'URL — je ne pourrai alors plus appliquer de migration.

**Contrôle après coup.** `list_tables` doit répondre pour `vitola`, et `list_organizations` doit
échouer. C'est la preuve que le cadrage projet fonctionne.

---

## Ce que je fais dès que l'accès est en place

1. Je vérifie le droit d'écriture par une migration à vide.
2. J'applique la migration P1 (`docs/phase-0/03-schema-p1.sql`), déjà relue et testée.
3. Je charge les 940 fiches (`supabase/seed/seed.sql`).
4. Je rejoue les 25 assertions de vérification contre le projet réel.
5. Je lance les *security advisors* de Supabase sur la RLS réelle.
6. Je génère les types TypeScript et je les commite.
7. Je remplis `.env.example` avec les bons noms de variables.

---

## Si vous ne voulez rien configurer du tout

Il reste la voie manuelle, sans aucun accès. Dans le tableau de bord Supabase → **SQL Editor**,
deux exécutions dans cet ordre :

1. `docs/phase-0/03-schema-p1.sql` — la migration, déjà du SQL pur (~45 Ko)
2. `supabase/seed/seed_standalone.sql` — les 940 fiches, données inlinées (371 Ko, l'éditeur le
   prend mais sera lent)

Cela met les données en base une fois. Cela ne me permet pas de générer les types, de lancer les
advisors, ni d'appliquer les migrations suivantes : chaque étape de P1 repasserait par vous.

---

## Notes sur le projet

- **Région** : `eu-west-3` (Paris) recommandé — Vercel tourne en `cdg1`, qui est Paris.
- **Postgres 17** est provisionné par Supabase, là où le brief mentionne 15. Sans conséquence : la
  migration P1 n'utilise rien de spécifique à une version et a été validée sur 16.
- **Les clés** : `sb_publishable_…` est publique par nature (la RLS la gouverne) et je la récupère
  seul. `sb_secret_…` contourne toute la RLS : elle ne va que dans Vercel et les secrets GitHub,
  jamais dans une conversation.
- Je ne touche à aucun de vos autres projets, et toute action ayant un coût passe par vous.
