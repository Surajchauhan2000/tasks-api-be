# Task App: AWS EC2 Deployment Guide (Manual)

Ye guide dobara deploy karne ke liye hai. Upar se neeche step-by-step commands chalao.

**Stack:** React (Vite) frontend, Node.js + Express backend, Prisma, PostgreSQL, Nginx, PM2, AWS EC2 (Ubuntu)

**Architecture:**

```
Browser -> EC2 (Security Group) -> Nginx (port 80)
                                     |-- /      -> frontend files (/var/www/frontend)
                                     |-- /api/  -> Node app (port 3000, PM2) -> PostgreSQL (port 5432)
```

> **Terminal ka dhyan rakho.** Is guide me do jagah commands chalti hain:
> - **[LAPTOP]**: Windows PowerShell (prompt: `PS C:\...>`)
> - **[SERVER]**: EC2 ke andar, SSH ke baad (prompt: `ubuntu@ip-...$`)

---

## 0. Pehle ye cheezein ready rakho

| Cheez | Value (apne hisaab se badlo) |
|---|---|
| Key file (.pem) | `C:\Users\Suraj\Downloads\aws-mumbai-login.pem` |
| EC2 Public IP | `<PUBLIC-IP>` (Stop-Start ke baad **badal jaata hai**, console se naya dekho) |
| Backend repo | `https://github.com/<username>/<backend-repo>.git` |
| Frontend repo | `https://github.com/<username>/<frontend-repo>.git` |
| Backend entry file | `src/index.js` |
| DB name / user | `taskdb` / `taskuser` |
| Laptop pe chahiye | Git, Node.js, OpenSSH (Windows 10/11 me built-in) |

---

## 1. EC2 instance launch karna (AWS Console)

1. Region **Asia Pacific (Mumbai) ap-south-1** select karo (upar right).
2. **EC2 -> Launch instance** pe click karo.
3. Settings:
    - **Name:** `task-app-server`
    - **AMI:** Ubuntu Server 24.04 LTS
    - **Instance type:** `t3.micro` (free plan me allowed)
    - **Key pair:** purani `.pem` use karo, ya naya banao (RSA, `.pem`)
    - **Network:** Default VPC, **Auto-assign public IP: Enable**
    - **Security group** inbound rules:

      | Type | Port | Source |
           |---|---|---|
      | SSH | 22 | My IP |
      | HTTP | 80 | Anywhere (0.0.0.0/0) |

      (**HTTP port 80 ka rule bhoolna mat**, warna browser me `ERR_CONNECTION_TIMED_OUT` aata hai.)
    - **Storage:** 8 GB (default)
4. **Launch instance** karo, aur **Public IPv4 address** copy kar lo.

---

## 2. EC2 server me login karna (SSH)

**[LAPTOP]** PowerShell me:

```powershell
# EC2 server me login. Key file ka path aur <PUBLIC-IP> apna daalo.
C:\Windows\System32\OpenSSH\ssh.exe -i "$env:USERPROFILE\Downloads\aws-mumbai-login.pem" ubuntu@<PUBLIC-IP>
```

Pehli baar `Are you sure you want to continue connecting?` puche to `yes` likho.
Prompt `ubuntu@ip-...$` dikhe, matlab aap server ke andar ho.

**Agar error aaye:**

```powershell
# "UNPROTECTED PRIVATE KEY FILE / Permissions too open" error aaye to:
icacls "$env:USERPROFILE\Downloads\aws-mumbai-login.pem" /inheritance:r
icacls "$env:USERPROFILE\Downloads\aws-mumbai-login.pem" /grant:r "$($env:USERNAME):(R)"
```

- `Connection timed out`: Security group me SSH rule dekho (Source = My IP, aur IP badla ho to dobara set karo). Public IP bhi check karo.
- `Permission denied (publickey)`: username `ubuntu` hona chahiye aur sahi `.pem` file use karo.

---

## 3. Server setup (Node, Nginx, PostgreSQL)

**[SERVER]**

```bash
# System update (beech me purple screen aaye to Enter dabao)
sudo apt update && sudo apt upgrade -y

# Node.js 20 install
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Git, Nginx, PostgreSQL install
sudo apt install -y git nginx postgresql postgresql-contrib

# Check: sab ka version dikhna chahiye (node v20.x.x)
node -v && npm -v && git --version && nginx -v && psql --version
```

---

## 4. Database banana

**[SERVER]**

```bash
# PostgreSQL ke andar jao
sudo -u postgres psql
```

Prompt `postgres=#` dikhe to ye lines chalao (password apna strong rakho, special characters `@ # /` mat rakho):

```sql
-- Naya user banao (local wala postgres/postgres server pe use mat karo)
CREATE USER taskuser WITH PASSWORD 'APNA-STRONG-PASSWORD';

-- Database banao, owner taskuser
CREATE DATABASE taskdb OWNER taskuser;

-- Bahar niklo
\q
```

```bash
# Connection test (password puchega). taskdb=> dikhe to sahi hai, \q se bahar aao
psql -h localhost -U taskuser -d taskdb
```

> `Task` table yahan nahi banana. **Prisma** khud banayega (Step 5).

---

## 5. Backend deploy karna

**[SERVER]**

```bash
# Backend code clone karo (backend naam ke folder me)
cd ~
git clone https://github.com/<username>/<backend-repo>.git backend
cd backend
ls        # package.json, prisma/, prisma.config.ts, src/ dikhna chahiye
```

> Repo private ho to password ki jagah GitHub **Personal Access Token** paste karna padega.

### `.env` file banana

`.env` GitHub pe nahi jaati, isliye server pe banani padti hai. Nano ki jagah ye ek command safe hai:

```bash
# APNA-STRONG-PASSWORD ko step 4 wale password se badlo
cat > .env << 'EOF'
DATABASE_URL="postgresql://taskuser:APNA-STRONG-PASSWORD@localhost:5432/taskdb?schema=public"
PORT=3000
EOF

cat .env   # check karo ki sahi likha gaya
```

> Nano use karo to: `Ctrl+O` -> **Enter** -> `Ctrl+X`. (Enter dabana mat bhoolna, warna file kisi aur naam se save ho jaati hai.)

### Dependencies aur Prisma

```bash
npm install

# Prisma client generate karo
npx prisma generate

# Tables banao. Inme se EK command chalao:
npx prisma migrate deploy     # agar prisma/migrations folder repo me hai
# npx prisma db push          # agar migrations folder nahi hai

# Table check: "Task" dikhna chahiye
psql -h localhost -U taskuser -d taskdb -c '\dt'
```

### Quick test (PM2 se pehle)

```bash
node src/index.js
# Dusre terminal me: curl http://localhost:3000/api/tasks   (khali [] aana sahi hai)
# Ctrl+C se band karo
```

---

## 6. PM2 se app hamesha chalana

PM2 app ko background me chalata hai, crash hone pe restart karta hai, aur server reboot ke baad bhi start kar deta hai.

**[SERVER]**

```bash
sudo npm install -g pm2

# App start (backend folder me hona chahiye). Forward slash "/" use karo, "\" nahi
cd ~/backend
pm2 start src/index.js --name task-api

pm2 status              # task-api "online" dikhna chahiye

# Reboot ke baad bhi auto-start ke liye:
pm2 save
pm2 startup
# pm2 startup jo "sudo env PATH=..." wali command print kare, use COPY karke chalao. Fir:
pm2 save

# Test
curl http://localhost:3000/api/tasks
```

**PM2 ki kaam ki commands:**

```bash
pm2 status                  # kaun si apps chal rahi hain
pm2 logs task-api           # live logs (Ctrl+C se bahar)
pm2 restart task-api        # code update ke baad restart
pm2 stop task-api           # band karo
pm2 start task-api          # dobara chalao
```

> Logs me `injected env (2) from .env` error nahi hai, ye dotenv ka info message hai.

---

## 7. Frontend deploy karna

Frontend ko **laptop pe build** karte hain (t3.micro me sirf 1 GB RAM hoti hai), fir files server pe bhejte hain.

### 7.1 Build [LAPTOP]

Frontend code me API URL **relative** hona chahiye: `/api/tasks`. `http://localhost:3000/...` hardcoded nahi hona chahiye.

```powershell
# Frontend repo ke folder me jao
cd C:\Users\Suraj\WebstormProjects\taks-app

# Build karo (dist/ folder banega)
npm install
npm run build

# Check: build me localhost to nahi? (kuch output na aaye to sahi)
Select-String -Path dist\assets\*.js -Pattern "localhost"
# Command Prompt (cmd) me ho to: findstr /m "localhost" dist\assets\*.js
```

### 7.2 Server pe bhejo [LAPTOP]

```powershell
# dist folder ko server ke ~/frontend-build me copy karo.
# Ye command frontend project folder ke andar chalani hai (jahan dist/ hai)
scp -i "$env:USERPROFILE\Downloads\aws-mumbai-login.pem" -r .\dist ubuntu@<PUBLIC-IP>:~/frontend-build
```

### 7.3 Nginx ke folder me rakho [SERVER]

```bash
# Purani files hata kar nayi daalo
sudo mkdir -p /var/www/frontend
sudo rm -rf /var/www/frontend/*
sudo cp -r ~/frontend-build/* /var/www/frontend/

ls /var/www/frontend      # index.html aur assets/ dikhna chahiye
```

> Agar `scp` dobara chalao aur `~/frontend-build` pehle se hai, to `frontend-build/dist` ban sakta hai. Pehle `rm -rf ~/frontend-build` kar lo.

---

## 8. Nginx lagana

Nginx frontend files serve karta hai, aur `/api/` wali requests ko Node app (port 3000) ko bhej deta hai.

**[SERVER]**

```bash
# Config file banao
sudo tee /etc/nginx/sites-available/task-app > /dev/null << 'EOF'
server {
    listen 80;
    server_name _;

    # Frontend files yahan se serve hongi
    root /var/www/frontend;
    index index.html;

    # React routing ke liye: file na mile to index.html do
    location / {
        try_files $uri /index.html;
    }

    # /api/ wali requests backend (port 3000) ko bhejo
    # Dhyan: end me slash NAHI, kyunki backend routes /api/tasks hi hain
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF

# Config enable karo, default site hatao
sudo ln -s /etc/nginx/sites-available/task-app /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default

# Config check karo: "syntax is ok" aur "test is successful" aana chahiye
sudo nginx -t

# Nginx reload
sudo systemctl reload nginx
```

---

## 9. Test karna

- Browser: `http://<PUBLIC-IP>/` -> frontend dikhna chahiye (`http://` hi likho, `https` nahi)
- Ek task add karke dekho
- Browser: `http://<PUBLIC-IP>/api/tasks` -> task ka JSON dikhna chahiye

---

## 10. Code update karna (baad me)

**Backend badla (code GitHub pe push karne ke baad) [SERVER]:**

```bash
cd ~/backend
git pull
npm install
npx prisma generate
npx prisma migrate deploy     # sirf tab, jab schema badla ho
pm2 restart task-api
```

**Frontend badla:**

```powershell
# [LAPTOP]
cd C:\Users\Suraj\WebstormProjects\taks-app
git pull
npm run build
scp -i "$env:USERPROFILE\Downloads\aws-mumbai-login.pem" -r .\dist ubuntu@<PUBLIC-IP>:~/frontend-build
```

```bash
# [SERVER]
sudo rm -rf /var/www/frontend/*
sudo cp -r ~/frontend-build/* /var/www/frontend/
```

---

## 11. Troubleshooting

| Problem | Kya karein |
|---|---|
| `ERR_CONNECTION_TIMED_OUT` | Security group me HTTP (80) rule add karo. Public IP badla ho to naya IP use karo. |
| `502 Bad Gateway` | Backend band hai. `pm2 status`, `pm2 logs task-api` dekho. |
| `404` on `/api/...` | Nginx `proxy_pass` ka slash check karo (routes `/api/tasks` hain to end me slash nahi). |
| `403` / `500` page | `sudo tail -n 20 /var/log/nginx/error.log` dekho. |
| "Welcome to nginx" page | `sudo rm /etc/nginx/sites-enabled/default` aur `sudo systemctl reload nginx`. |
| Frontend khulta hai par task add nahi hota | Browser `F12 -> Network` me dekho. Request `localhost:3000` pe ja rahi ho to API URL hardcoded hai. Relative `/api/...` karke rebuild karo. |
| `Cannot resolve environment variable: DATABASE_URL` | `.env` backend folder me hai? `ls -a` aur `cat .env` se check karo. |
| `EADDRINUSE` (port busy) | Purani process chal rahi hai: `pkill node`, fir `pm2 restart task-api`. |
| `Script not found` (PM2) | Pehle `cd ~/backend` karo, aur path `src/index.js` likho (forward slash). |
| `Cannot GET /tasks` | Route `/tasks` nahi, `/api/tasks` hai. Backend chal raha hai. |

**Kaam ke logs:**

```bash
pm2 logs task-api                          # backend logs
sudo tail -f /var/log/nginx/error.log      # nginx errors
sudo systemctl status nginx                # nginx chal raha hai ya nahi
```

---

## 12. Credits bachane ke liye (Free Plan)

- Kaam na ho to EC2 **Stop** karo (Console -> Instance state -> Stop). Dhyan rahe ki **Start karne pe public IP badal jaata hai**.
- Project poora hone pe instance **Terminate** karo, aur Load Balancer, NAT Gateway, Elastic IP, unattached Volumes aur RDS bhi delete karo.
- **Billing -> Credits** aur **Bills** me kharcha dekhte raho.
- Free plan me **Paid plan pe upgrade mat karo**, warna paisa lagna shuru ho jaata hai.

---

## Aage ke steps

1. `/health` route add karna (`{"status":"ok"}`)
2. Custom VPC (public + private subnet), ALB, RDS (**ek hi din me karke delete karo**)
3. Docker aur ECR
4. Jenkins CI/CD pipeline (har repo ke liye alag pipeline)