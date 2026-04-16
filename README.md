# Societiz Score — Déploiement VPS

Proxy Express qui sert le frontend `score (1).html` et relaie les appels vers l'API Anthropic.

---

## Prérequis sur le VPS

- Ubuntu 22.04+ (ou Debian équivalent)
- Node.js 20+ installé
- pm2 installé globalement
- nginx installé
- Un domaine pointant sur l'IP du VPS (enregistrement A configuré)

---

## 1. Copier les fichiers sur le VPS

Depuis votre machine locale, transférez uniquement les fichiers nécessaires (sans `node_modules`) :

```bash
scp -r "Scoring offer/proxy.js" "Scoring offer/score (1).html" "Scoring offer/package.json" user@VOTRE_IP:/var/www/score/
```

Ou via git si le projet est versionné :

```bash
git clone <votre-repo> /var/www/score
```

---

## 2. Installer les dépendances

```bash
cd /var/www/score
npm install --omit=dev
```

---

## 3. Configurer la variable d'environnement

Créez le fichier `.env` sur le serveur :

```bash
nano /var/www/score/.env
```

Contenu :

```env
PORT=3001
ANTHROPIC_API_KEY=sk-ant-VOTRE_CLE_ICI
```

> Ne commitez jamais ce fichier. Ajoutez `.env` à votre `.gitignore`.

---

## 4. Lancer l'application avec pm2

```bash
pm2 start proxy.js --name score-proxy --cwd /var/www/score
pm2 save
pm2 startup   # suivre la commande affichée pour activer au démarrage
```

Vérifier que l'app tourne :

```bash
pm2 status
pm2 logs score-proxy
```

---

## 5. Configurer nginx comme reverse proxy

Créez un fichier de configuration nginx :

```bash
nano /etc/nginx/sites-available/score
```

Contenu (remplacez `votre-domaine.com`) :

```nginx
server {
    listen 80;
    server_name votre-domaine.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Activer le site et recharger nginx :

```bash
ln -s /etc/nginx/sites-available/score /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

---

## 6. Activer HTTPS avec Let's Encrypt

```bash
apt install certbot python3-certbot-nginx -y
certbot --nginx -d votre-domaine.com
```

Certbot met à jour la config nginx automatiquement et configure le renouvellement automatique.

---

## Commandes utiles

| Action | Commande |
|---|---|
| Voir les logs en direct | `pm2 logs score-proxy` |
| Redémarrer l'app | `pm2 restart score-proxy` |
| Arrêter l'app | `pm2 stop score-proxy` |
| Recharger nginx | `systemctl reload nginx` |
| Tester la config nginx | `nginx -t` |

---

## Structure des fichiers sur le serveur

```
/var/www/score/
├── proxy.js          # Serveur Express
├── score (1).html    # Frontend servi à /
├── package.json
├── node_modules/
└── .env              # Non versionné — à créer manuellement
```

---

## Routes exposées

| Route | Description |
|---|---|
| `GET /` | Sert le frontend HTML |
| `POST /api/chat` | Relaie vers l'API Anthropic |
