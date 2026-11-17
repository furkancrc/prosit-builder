# Prosit Builder

Web app pour rédiger les **prosits aller / retour** du CESI et les exporter en **Word (.docx)** et en **PDF** avec la mise en forme du template (titres numérotés I., II., …, rubriques « 1) Mots inconnus : », listes « - / o », pied de page « Page X sur Y »).

- Liste des prosits : créer, dupliquer, renommer, supprimer, importer un .docx existant.
- Onglets **Aller** et **Retour**. Le retour reprend les métadonnées de l'aller, et chacune peut être surchargée.
- Formulaire par rubrique avec des listes : glisser-déposer, sous-éléments, numérotation automatique et raccourcis clavier (Entrée, Tab, Maj+Tab, Alt+↑/↓, Retour arrière sur une ligne vide).
- Sauvegarde automatique avec indicateur « Enregistré », et aperçu du document en direct.
- Téléchargement Word ou PDF, avec un nom de fichier prérempli à partir d'un gabarit et modifiable.
- Réglages : auteur, classe, bloc, gabarit de nom, couleur d'accent, mode clair/sombre, police et couleur des titres du document.
- Accès protégé par un mot de passe unique (`APP_PASSWORD`).

Stack : Next.js 15 (App Router) · TypeScript · Tailwind 4 · `docx` · LibreOffice headless · SQLite (`better-sqlite3`) · zod · Vitest.

## Développement local

```bash
npm install
cp .env.example .env       # puis éditer les valeurs
npm run dev                # http://localhost:3000
npm test                   # tests unitaires (génération/import docx, noms de fichiers, listes)
npm run build
```

- Sans `APP_PASSWORD`, l'app est ouverte en développement et **bloquée en production**.
- L'export PDF a besoin de LibreOffice (`soffice`). Sous Windows, renseigne `SOFFICE_PATH=C:/Program Files/LibreOffice/program/soffice.exe`.

## Lancer avec Docker

```bash
cp .env.example .env       # définir APP_PASSWORD et SESSION_SECRET (openssl rand -hex 32)
docker compose up -d --build
# → http://localhost:3000   (HOST_PORT=8080 docker compose up pour changer le port)
```

Les données (SQLite) sont stockées dans le volume `prosit-data`, monté sur `/data`.

Sauvegarde : `docker compose cp prosit-builder:/data/prosit.db ./prosit-backup.db`

## Variables d'environnement

| Variable | Obligatoire | Rôle |
|---|---|---|
| `APP_PASSWORD` | oui (prod) | Mot de passe unique de connexion |
| `SESSION_SECRET` | oui (prod) | Secret HMAC du cookie de session, 32 caractères aléatoires ou plus. Le changer déconnecte toutes les sessions |
| `DATA_DIR` | non | Dossier de la base SQLite (`/data` dans l'image) |
| `SOFFICE_PATH` | non | Chemin de LibreOffice s'il n'est pas dans le `PATH` |
| `COOKIE_SECURE` | non | `false` pour accepter le cookie en HTTP simple (test sans HTTPS) |

## Déployer sur Coolify

1. **Pousser le dépôt** sur GitHub, GitLab ou Gitea (privé si tu préfères).
   ```bash
   git remote add origin git@github.com:<toi>/prosit-builder.git
   git push -u origin main
   ```
2. Dans Coolify : **Projects → ton projet → + New → Resource**, puis :
   - dépôt public : *Public Repository* et colle l'URL ;
   - dépôt privé : *Private Repository (with GitHub App)* ou *(with Deploy Key)*, en suivant l'assistant Coolify.
3. **Build Pack : `Dockerfile`** (et non Nixpacks). Branche : `main`. Base directory : `/`. Dockerfile location : `/Dockerfile`.
4. **Ports Exposes : `3000`**. Ne remplis pas « Ports Mappings », c'est le proxy Coolify (Traefik/Caddy) qui route le trafic.
5. **Persistent Storage** → *+ Add* → *Volume Mount* :
   - Name : `prosit-data`
   - Destination Path : `/data`

   Sans ce volume, la base est perdue à chaque redéploiement.
6. **Environment Variables** (onglet du service) :
   - `APP_PASSWORD` = ton mot de passe
   - `SESSION_SECRET` = résultat de `openssl rand -hex 32`
   - `DATA_DIR` = `/data`

   Ne coche pas « Build Variable » : ces variables ne servent qu'à l'exécution.
7. **Healthcheck** (onglet *Healthcheck*) : activé, Path `/api/health`, Port `3000`. L'image contient aussi un `HEALTHCHECK` Docker.
8. **Domaine et HTTPS** : dans *Domains*, saisis `https://prosit.ton-domaine.fr`. Crée d'abord chez ton registrar un enregistrement DNS **A** (ou CNAME) vers l'IP du serveur Coolify. Grâce au préfixe `https://`, Coolify obtient automatiquement un certificat Let's Encrypt.
9. **Deploy**. Le premier build prend quelques minutes, à cause de l'installation de LibreOffice. Ouvre ensuite le domaine, connecte-toi et règle tes valeurs par défaut dans **Réglages**.

Pour les mises à jour automatiques, active *Auto Deploy* (webhook) dans Coolify : chaque `git push` sur `main` redéploie.

> Alternative : Build Pack *Docker Compose* avec le `docker-compose.yml` fourni. Dans ce cas, retire la section `ports:` (Coolify n'en a pas besoin) et définis les mêmes variables.

### Checklist de déploiement

- [ ] Dépôt poussé, branche `main`
- [ ] Build Pack = Dockerfile, port exposé 3000
- [ ] Volume persistant monté sur `/data`
- [ ] `APP_PASSWORD`, `SESSION_SECRET` (aléatoire, 32+ caractères), `DATA_DIR=/data`
- [ ] Healthcheck `/api/health` au vert
- [ ] DNS A/CNAME vers le serveur, domaine en `https://…` dans Coolify
- [ ] Connexion OK, un export Word **et** un export PDF testés
- [ ] (Recommandé) sauvegarde planifiée du volume `/data`

## Structure

```
src/app/                 pages (liste, éditeur, réglages, login) et routes API
src/app/api/…            prosits, documents (+ export docx/pdf), import, settings, login, health
src/components/          Editor, ListEditor, Preview, MetaForm, DownloadDialog, SettingsForm…
src/lib/templates.ts     rubriques des prosits aller / retour (source unique pour formulaire, aperçu, docx, import)
src/lib/doc-model.ts     modèle intermédiaire partagé par l'aperçu et l'export
src/lib/docx/            génération .docx (builder.ts) et import (import.ts)
src/lib/pdf.ts           conversion LibreOffice headless
src/lib/db.ts            SQLite (prosits, documents, réglages)
src/lib/filename.ts      gabarit de nom de fichier et nettoyage
tests/                   Vitest
```

### Gabarit de nom de fichier

Par défaut : `Prosit_{type}_{theme}_-_{numero}`, ce qui donne `Prosit_aller_SI_-_1.docx`.
Variables : `{type}` (aller/retour), `{Type}`, `{theme}` (partie avant « : »), `{themeComplet}`, `{numero}`, `{nom}`, `{bloc}`, `{date}`, `{auteur}`, `{groupe}`. Les accents et les caractères interdits sont retirés.

### Prosit retour

Les rubriques du prosit retour ne sont pas encore définies : l'onglet Retour propose un champ libre en attendant. Pour les ajouter, modifie `RETOUR_TEMPLATE` dans `src/lib/templates.ts`. Le formulaire, l'aperçu, l'export et l'import suivent automatiquement.
