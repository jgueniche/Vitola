# Procédure — donner à Claude accès au projet Supabase

> Lisible sur téléphone. Une action, environ 5 minutes.
>
> **L'accès est en place depuis le 22 août 2026, et le schéma comme le référentiel sont
> chargés.** La procédure ci-dessous reste écrite au futur : elle sert à refaire le
> montage, sur un autre poste ou après révocation du jeton. L'état réel du projet est
> plus bas, section « Fait ».

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

## Fait — état au 22 août 2026

L'accès est en place et le projet est chargé. Ce qui suit est constaté, pas prévu.

| | État |
|---|---|
| Droit d'écriture | Vérifié. `postgres` est membre de `supabase_privileged_role` : trigger sur `auth.users` et policies sur `storage.objects` acceptés. |
| Migration `0001` | Appliquée. 13 tables, RLS partout, `FORCE` sauf `public.profiles`. Enregistrée dans `supabase_migrations.schema_migrations`. |
| Migration `0002` | Appliquée. Referme les `EXECUTE` accordés par défaut, voir ci-dessous. |
| Référentiel | 940 fiches, **toutes en brouillon**. 900 prix officiels, 114 marques, 51 vitoles, 30 manufactures, 18 codes de boîte. Rejeu vérifié sans duplication. |
| 25 assertions | **26 PASS** (25 + couverture RLS), rejouées par `supabase/tests/03_remote_verification.sql`. |
| Advisors sécurité | 4 avertissements → 2, tous deux sur `current_app_role()`. |
| Types TypeScript | `lib/supabase/database.types.ts`, schémas `public` **et** `ref`. |
| `.env.example` | Complet : toute variable lue par le code y figure. |

### Les valeurs à déposer chez Vercel

`NEXT_PUBLIC_SUPABASE_URL` vaut `https://upbewqsmgcrogoapubyz.supabase.co` — la
référence de projet n'est pas un secret, et elle est déjà nécessaire au montage MCP
ci-dessus.

**Aucune clé n'est écrite ici, et aucune ne devrait l'être.** La clé publiable
(`sb_publishable_…`) se lit dans le tableau de bord, ou par `get_publishable_keys` sur
le serveur MCP. Elle est publique par nature, mais ce dépôt l'est aussi : une clé
committée survit à sa rotation dans l'historique git.

**`sb_secret_…` ne passe ni par ce dépôt ni par une conversation.** Tableau de bord →
Vercel et secrets GitHub, directement.

### Ce que le premier chargement réel a révélé

Un défaut que la base locale ne pouvait pas voir. PostgreSQL accorde `EXECUTE` à
`PUBLIC` sur toute fonction ; Supabase ajoute par-dessus un `alter default privileges`
qui l'accorde à `anon` et `authenticated` sur tout ce qui est créé dans `public`. Le
§8 de la migration 0001 croyait n'exposer que quatre fonctions : les neuf étaient
appelables par un visiteur anonyme via `/rest/v1/rpc/…`, dont deux en
`SECURITY DEFINER`.

La doublure de CI ne reproduisait que la moitié `on tables` de ce mécanisme. Une
doublure plus fermée que la production ne prouve rien : la ligne `on functions`
manquante est ajoutée, et `supabase/tests/02_function_grants.sql` échoue désormais
si le trou se rouvre — vérifié en contre-épreuve, la CI passe de vert à rouge sans
la migration 0002.

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
