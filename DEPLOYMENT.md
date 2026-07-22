# Deployment Guide — Connect2Recycle

How this project is built, hosted, and continuously deployed.

- **Live app:** http://13.205.147.138/
- **phpMyAdmin:** http://13.205.147.138/phpmyadmin/
- **Repo:** `adarshdabral/connect-recycle` (private)

---

## 1. Architecture

```
                          ┌──────────────────────── EC2 (Ubuntu 26.04) ────────────────────────┐
 Browser ──HTTP :80──▶ Apache 2.4 (reverse proxy)                                               │
                          │   /            ─▶ Next.js frontend  (pm2 "frontend", localhost:3000) │
                          │   /api         ─▶ Express backend   (pm2 "backend",  localhost:4000) │
                          │   /phpmyadmin  ─▶ PHP 8.5 (served locally by Apache)                 │
                          │                                                                       │
                          │   Express ──▶ MySQL 8.4 (localhost:3306, db: recycling_platform)     │
                          └───────────────────────────────────────────────────────────────────┘
```

| Layer        | Tech                                   | Process / Port |
|--------------|----------------------------------------|----------------|
| Web server   | Apache 2.4 (reverse proxy)             | :80            |
| Frontend     | Next.js 16 (React 19) via `next start` | pm2 `frontend` → :3000 |
| Backend      | Node 22 / Express                      | pm2 `backend` → :4000 |
| Database     | MySQL 8.4                              | :3306          |
| DB admin     | phpMyAdmin on PHP 8.5                   | `/phpmyadmin`  |
| Process mgr  | pm2 (auto-starts on boot via systemd)  | —              |

**Server facts:** Ubuntu 26.04, x86_64, 1.9 GB RAM **+ 2 GB swap** (added so the Next.js build doesn't OOM), 28 GB disk. SSH user `ubuntu` (passwordless sudo). App lives at `/var/www/connect-recycle`.

---

## 2. CI/CD pipeline

Defined in [`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml).

**Triggers**
- **Push / PR to `main`** → run CI.
- **Push to `main` only** → run CD **after** CI passes.

**Jobs**
1. **Frontend · build** — `npm ci` + `next build` in `frontend/`. This is the authoritative gate: `next.config.mjs` sets `typescript.ignoreBuildErrors`, so the build (not `tsc`) is what must pass.
2. **Backend · install + syntax** — `npm ci` + `node --check` on every `.js` (no test suite exists).
3. **Deploy to EC2** — `needs: [frontend, backend]`, gated on `push` to `main`. SSHes in (`appleboy/ssh-action`) and runs:
   ```bash
   cd /var/www/connect-recycle
   git fetch --all
   git reset --hard origin/main
   bash scripts/deploy.sh
   ```
   Runs under the `production` GitHub Environment (add an approval rule there to require a manual gate before deploys).

**Flow:** `git push origin main` → CI builds both apps → if green, auto-deploys. PRs run CI only.

Watch a run:
```bash
gh run watch --repo adarshdabral/connect-recycle
# or the repo's "Actions" tab
```

### Required GitHub secrets
Set under **Settings → Secrets and variables → Actions** (already configured via `gh`):

| Secret         | Value                          |
|----------------|--------------------------------|
| `EC2_HOST`     | `13.205.147.138`               |
| `EC2_USER`     | `ubuntu`                       |
| `EC2_SSH_KEY`  | contents of the EC2 `key.pem`  |
| `EC2_PORT`     | *(optional, defaults to 22)*   |

To rotate the SSH secret:
```bash
gh secret set EC2_SSH_KEY --repo adarshdabral/connect-recycle < key.pem
```

### `scripts/deploy.sh`
Idempotent, versioned server-side step run by CD (and usable manually):
backend `npm ci` → pm2 restart; frontend `npm ci` → build (heap-capped at 1536 MB) → pm2 restart; `pm2 save`.
`git reset --hard` only touches tracked files, so the untracked `.env`, `node_modules`, and `.next` are preserved.

---

## 3. First-time server provisioning (reference)

The box was provisioned once with:

```bash
# Base stack
sudo apt-get update
sudo apt-get install -y apache2 mysql-server php libapache2-mod-php \
  php-mysqli php-mbstring php-zip php-gd php-curl php-xml phpmyadmin git unzip curl
# Node 22 + pm2
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs && sudo npm i -g pm2
# 2 GB swap (build headroom)
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

**Read-only git deploy key** (private repo): an SSH key on the server (`~/.ssh/deploy_key`) is registered as a GitHub **Deploy Key** so the box can `git pull` without a password.

**Apache vhost** — `/etc/apache2/sites-available/connect-recycle.conf`:
```apache
<VirtualHost *:80>
    ServerName 13.205.147.138
    ProxyPass /phpmyadmin !
    ProxyPreserveHost On
    ProxyPass        /api http://127.0.0.1:4000/api
    ProxyPassReverse /api http://127.0.0.1:4000/api
    ProxyPass        /    http://127.0.0.1:3000/
    ProxyPassReverse /    http://127.0.0.1:3000/
</VirtualHost>
```
Enabled with `a2enmod proxy proxy_http headers rewrite`, `a2ensite connect-recycle`, `a2dissite 000-default`.

**pm2 boot persistence:**
```bash
pm2 start server.js --name backend          # in backend/
pm2 start npm --name frontend -- start       # in frontend/
sudo env PATH=$PATH pm2 startup systemd -u ubuntu --hp /home/ubuntu
pm2 save
```

---

## 4. Environment variables

### `backend/.env` (on server, `chmod 600` — **not** in git)
```
PORT=4000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=recycle
DB_PASSWORD=********            # see ~/deploy-credentials.txt
DB_NAME=recycling_platform
JWT_SECRET=********
JWT_EXPIRES_IN=7d
EMAIL_HOST=smtp-relay.brevo.com
EMAIL_PORT=587
EMAIL_USER=********
EMAIL_PASS=********
EMAIL_FROM=Recycling Platform <...>
CLIENT_URL=http://13.205.147.138
ADMIN_PASS=********
```

### `frontend/.env.production` (on server — baked into the client bundle at build)
```
NEXT_PUBLIC_API_URL=http://13.205.147.138/api
```

> `NEXT_PUBLIC_*` is inlined at **build time**, so changing the public URL requires a frontend rebuild (the CD job does this automatically).

---

## 5. Database & credentials

- **Database:** `recycling_platform` (schema auto-created on backend boot via `createTables()` in `server.js`).
- **App MySQL user:** `recycle` (scoped to the app DB) — used by the backend.
- **phpMyAdmin admin:** `pma_admin` (full privileges) — log in at `/phpmyadmin`.

Generated passwords are stored privately on the server (never committed):
```bash
ssh -i key.pem ubuntu@13.205.147.138 'cat ~/deploy-credentials.txt'
```

---

## 6. Manual operations

```bash
# SSH in
ssh -i key.pem ubuntu@13.205.147.138

# Deploy latest main by hand (same as CD)
cd /var/www/connect-recycle && git pull --ff-only && bash scripts/deploy.sh

# Process status / logs / restart
pm2 list
pm2 logs backend            # or: pm2 logs frontend
pm2 restart backend frontend

# Services
sudo systemctl status apache2 mysql
sudo systemctl reload apache2

# DB shell
sudo mysql                  # root via auth_socket
```

---

## 7. Known issues / hardening TODO

1. **Email is disabled in prod.** Brevo SMTP rejects the EC2 IP (`525 Unauthorized IP address`). Whitelist `13.205.147.138` in Brevo (Senders & IPs → Authorized IPs) to enable OTP/transactional email.
2. **HTTP only — no TLS.** Add a domain + Let's Encrypt (`certbot --apache`) for HTTPS before any real use.
3. **phpMyAdmin is publicly exposed** over plain HTTP. Restrict it to your IP (Apache `Require ip …`) and/or put it behind TLS.
4. **`EC2_SSH_KEY` is the master `key.pem`.** Prefer a dedicated, revocable deploy key so a leaked secret can't expose the whole instance.
5. **Open the security group** for ports as needed (22 SSH, 80 HTTP, 443 if you add TLS) in the AWS console.
6. Repo history still carries a large (~98 MB) build-cache blob from before `.gitignore` was added — optional cleanup with `git filter-repo`.
