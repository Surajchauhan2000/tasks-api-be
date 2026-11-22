# Task App: Docker + ECR + EC2 Deployment Guide

Ye guide **README.md (manual deployment)** ke baad ki hai. Isme backend ko **Docker image** banakar **ECR** me push karte hain, aur **EC2** pe pull karke container chalate hain.

**Flow:**

```
Laptop: Dockerfile -> docker build -> image -> docker push -> ECR (sirf storage)
                                                                  |
EC2 server:  docker pull <-----------------------------------------+
             docker run -> container (Node app) <- Nginx (port 80) <- Browser
```

> **Terminal labels:**
> - **[LAPTOP]**: Windows PowerShell (`PS C:\...>`)
> - **[SERVER]**: EC2 ke andar, SSH ke baad (`ubuntu@ip-...$`)
> - **[CONSOLE]**: AWS web console

## 0. Pehle ye jaan lo

| Cheez | Matlab |
|---|---|
| **Dockerfile** | Ek app ki image banane ki recipe (Node version, npm install, code copy, start command) |
| **Image** | App ka ready-made package (code + dependencies). Ek baar bani, kahin bhi chal sakti hai |
| **Container** | Image ka chalta hua roop |
| **docker-compose.yml** | Kai containers (app + DB) ko local pe ek saath chalane ki recipe. **Sirf local ke liye** |
| **ECR** | AWS ka image godown. Sirf store karta hai, chalata nahi |
| **IAM Role** | EC2 ko AWS ki permission dene ka tareeka (server pe keys rakhne ki jagah) |

**Kab kya chalta hai:**

| Command | Kab / kahan |
|---|---|
| `npm install` | **Build ke time** (image banate time, laptop/Jenkins pe). Server pe nahi |
| `git pull` | Server pe nahi chalta. Code build ke time image me aa jaata hai |
| `CMD ["node", "src/index.js"]` | **Container start hone par** server pe |
| `pm2 restart` | Zaroorat nahi, Docker ka `--restart` flag ye kaam karta hai |

**Image ka naam samjho:** `task-api:v1` ka matlab `<naam>:<tag>`. Tag version hota hai. Naye version pe `v2` rakho, to kharab hone par `v1` wapas chala sakte ho.

---

## 1. Laptop pe Docker check karna [LAPTOP]

```powershell
# Docker Desktop kholo (chalu hona chahiye), fir:
docker --version
docker run hello-world      # "Hello from Docker!" aana chahiye

# Purane containers band karo (port ka jhanjhat na ho)
docker ps
docker stop <container-id>
```

---

## 2. Backend repo me 3 files banana [LAPTOP]

Ye files backend repo ke **root folder** me rakho (jahan `package.json` hai).

### File 1: `Dockerfile` (koi extension nahi)

```dockerfile
# Base image: Node 20 (version yahin fixed hota hai)
FROM node:20-slim
WORKDIR /app

# 1) Pehle sirf dependency files copy karo.
#    Isse "npm install" ki layer cache ho jaati hai. Code badalne par dobara install nahi hota
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm install

# 2) Prisma client generate karo.
#    Prisma 7 build ke time DATABASE_URL maangta hai, isliye sirf build ke liye dummy URL
#    (asli DB se connect nahi hota, bas generate hota hai)
RUN DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate

# 3) Ab code copy karo (ye layer sabse zyada badalti hai, isliye sabse last me)
COPY src ./src

EXPOSE 3000
CMD ["node", "src/index.js"]
```

### File 2: `.dockerignore` (jo files image me nahi jaani chahiye)

```
node_modules
.env
.git
dist
*.md
```

> `.env` image me **kabhi** nahi jaani chahiye, usme passwords hote hain. Env variables container chalate time bahar se dete hain.

### File 3: `docker-compose.yml` (local me app + DB ek saath)

```yaml
services:
  # Container 1: Database (ready-made Postgres image, Docker Hub se)
  db:
    image: postgres:16
    environment:                       # pehli baar start hone par ye user/db ban jaate hain
      POSTGRES_USER: taskuser
      POSTGRES_PASSWORD: localpass
      POSTGRES_DB: taskdb
    volumes:
      - pgdata:/var/lib/postgresql/data   # DB ka data container ke bahar save hota hai
    healthcheck:                       # DB sach me ready hai ya nahi, ye check karta hai
      test: ["CMD-SHELL", "pg_isready -U taskuser -d taskdb"]
      interval: 5s
      retries: 10

  # Container 2: Aapki backend app
  api:
    build: .                           # image Dockerfile se banao
    ports:
      - "3000:3000"                    # laptop-port:container-port
    environment:
      # Host "db" = upar wale container ka naam (container ke andar localhost = wo container khud)
      DATABASE_URL: postgresql://taskuser:localpass@db:5432/taskdb?schema=public
      PORT: 3000
    depends_on:
      db:
        condition: service_healthy     # pehle DB ready ho, tab api start ho
    # Pehle tables banao, fir app chalao
    # (prisma/migrations folder nahi hai to "migrate deploy" ki jagah "db push" likho)
    command: sh -c "npx prisma migrate deploy && node src/index.js"

volumes:
  pgdata:                              # data save karne ki jagah
```

---

## 3. Image build karna aur local pe chalana [LAPTOP]

> **Dhyan:** `docker build` ya `docker compose` hamesha **backend repo ke folder me** chalana, jahan `Dockerfile` hai. Warna `failed to read dockerfile` error aata hai.

```powershell
cd C:\Users\Suraj\<backend-repo-folder>

# Image banao. -t = tag (naam:version), "." = Dockerfile current folder me hai
docker build -t task-api:v1 .

# Banayi hui images dekho
docker images

# App + DB local pe chalao
# up = containers start karo, --build = pehle image dobara banao (naya code lene ke liye)
docker compose up --build

# Dusre PowerShell me test (curl.exe likhna, curl nahi)
curl.exe http://localhost:3000/api/tasks      # [] aana chahiye

# Band karna
docker compose down          # containers hatao (DB data bacha rehta hai)
docker compose down -v       # DB ka data bhi hatao
```

**Kaam ki Docker commands:**

```powershell
docker ps                        # chalte containers
docker ps -a                     # band wale bhi
docker logs <container>          # logs
docker compose logs -f api       # app ke live logs
docker exec -it <container> sh   # container ke andar jao
docker images                    # saari images
docker rmi <image>               # image delete
```

---

## 4. AWS CLI ko account se jodna [CONSOLE + LAPTOP]

Laptop se ECR me push karne ke liye CLI ko permission chahiye.

**[CONSOLE]** IAM user banao (root ki keys kabhi mat banana):

1. **IAM -> Users -> Create user** (naam `cli-user`, console access nahi)
2. **Attach policies directly** -> `AmazonEC2ContainerRegistryFullAccess`
3. User kholo -> **Security credentials -> Create access key -> CLI**
4. **Access key ID** aur **Secret access key** copy karo (secret dobara nahi dikhti)

> Ye keys GitHub, README ya kisi ko mat dena.

**[LAPTOP]**

```powershell
aws configure
# Access Key ID:      <apni key>
# Secret Access Key:  <apni secret key>
# Region:             ap-south-1
# Output format:      json

# Check: 12 digit Account ID dikhna chahiye (note kar lo)
aws sts get-caller-identity
```

---

## 5. ECR me image push karna [LAPTOP]

`<ACCOUNT_ID>` ki jagah apna 12 digit Account ID likho (bina `< >` ke).

```powershell
# 1) ECR me repository banao (images ka folder). Pehle se hai to "AlreadyExists" error aayega, theek hai
aws ecr create-repository --repository-name task-api --region ap-south-1

# 2) Docker ko ECR me login karao (login ~12 ghante chalta hai)
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com
# "Login Succeeded" aana chahiye

# 3) Image ko ECR ke naam se tag karo (nayi copy nahi banti, sirf ek aur naam jud jaata hai)
docker tag task-api:v1 <ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com/task-api:v1

# 4) Push karo (jo layers pehle se ECR me hain wo skip ho jaati hain)
docker push <ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com/task-api:v1

# 5) Verify: imageTags me "v1" dikhna chahiye
aws ecr describe-images --repository-name task-api --region ap-south-1
```

---

## 6. EC2 ko ECR se pull karne ki permission (IAM Role) [CONSOLE]

Server pe access keys nahi rakhte, **IAM Role** lagate hain.

> Role banane ke liye **IAM ki permission** chahiye. Sirf `AmazonEC2FullAccess` wala user ye nahi kar paayega. Root ya Admin user se karo.

1. **IAM -> Roles -> Create role**
2. Trusted entity: **AWS service**, use case **EC2** (page upar scroll karo, "Web identity" nahi chahiye)
3. Permission: `AmazonEC2ContainerRegistryReadOnly`
4. Role ka naam: `ec2-ecr-pull-role` -> **Create role**
5. **EC2 -> Instances** -> instance select -> **Actions -> Security -> Modify IAM role** -> `ec2-ecr-pull-role` -> **Update IAM role**

---

## 7. EC2 pe Docker setup [SERVER]

Instance **Start** karo, Console se **naya Public IP** dekho, aur SSH karo:

```powershell
# [LAPTOP]
ssh -i "$env:USERPROFILE\Downloads\aws-mumbai-login.pem" ubuntu@<PUBLIC-IP>
```

```bash
# [SERVER]
# Docker install
sudo apt update
sudo apt install -y docker.io
sudo systemctl enable --now docker      # boot pe bhi Docker chalu

# ubuntu user ko docker chalane ki permission (har baar sudo na lagana pade)
sudo usermod -aG docker ubuntu

# AWS CLI install (Ubuntu 24.04 me apt se nahi milta, snap se milta hai)
sudo snap install aws-cli --classic
```

**Ab logout karke dobara SSH karo** (`exit`, phir ssh), tab docker group ki permission lagegi.

```bash
# Check
docker --version
aws --version
docker ps                       # bina error ke khali list aani chahiye

# Role sahi lagi? Output me "ec2-ecr-pull-role" dikhna chahiye
aws sts get-caller-identity
```

> Server pe `aws configure` **nahi** karna. Role se credentials apne aap milte hain.

---

## 8. Image pull karke container chalana [SERVER]

```bash
# ECR login (server pe)
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com

# Image download
docker pull <ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com/task-api:v1
docker images

# Purani PM2 wali app hatao (port 3000 free karna hai)
pm2 delete task-api
pm2 save                         # reboot pe PM2 purani app wapas na chalaye
```

### Env file banao

Docker ki `--env-file` **quotes nahi hatati**, isliye `.env` jaisi quotes wali file yahan kaam nahi karegi.

```bash
# ASLI-PASSWORD ko apne DB ke asli password se badlo (README.md ke Step 4 wala)
cat > ~/task.env << 'EOF'
DATABASE_URL=postgresql://taskuser:ASLI-PASSWORD@localhost:5432/taskdb?schema=public
PORT=3000
EOF

cat ~/task.env       # check: placeholder nahi, asli password hona chahiye
```

> **Ye galti ho chuki hai:** password ki jagah `APNA-STRONG-PASSWORD` likha reh gaya, to API `{"error":"Tasks fetch nahi hue"}` deti hai. Password bhool gaye ho to:
> ```bash
> sudo -u postgres psql
> ALTER USER taskuser WITH PASSWORD 'naya-password123';
> \q
> ```
> Letters aur numbers hi rakho (`@ # /` mat).

### Container chalao

```bash
docker run -d \
  --name task-api \
  --restart unless-stopped \
  --network host \
  --env-file ~/task.env \
  <ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com/task-api:v1
```

| Flag | Matlab |
|---|---|
| `-d` | Background me chalao |
| `--name task-api` | Container ka naam |
| `--restart unless-stopped` | Crash ya reboot pe Docker khud dobara chalayega (PM2 + `pm2 startup` ki jagah) |
| `--network host` | Container server ka network use kare, taaki `localhost:5432` pe server ka PostgreSQL mile. RDS pe jaoge to ye nahi lagega |
| `--env-file` | Env variables bahar se do (image me password nahi hota) |

### Test

```bash
docker ps                                 # task-api "Up" dikhna chahiye
docker logs task-api                      # "Server running on port 3000"
docker logs --tail 30 task-api            # asli error yahin dikhta hai
docker exec task-api printenv DATABASE_URL   # container ko sahi URL mila? (password share mat karna)
curl http://localhost:3000/api/tasks      # [] ya tasks
```

Browser me `http://<PUBLIC-IP>/` kholo. Nginx wahi hai, aur `localhost:3000` pe wahi bhejta hai, ab peeche Docker container hai.

---

## 9. Naya version deploy karna (v2)

**[LAPTOP]** code badlo, phir:

```powershell
cd C:\Users\Suraj\<backend-repo-folder>

# Naya tag (v2). Sirf badli layer dobara banti aur push hoti hai
docker build -t task-api:v2 .
docker tag task-api:v2 <ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com/task-api:v2
docker push <ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com/task-api:v2
```

**[SERVER]**

```bash
# ECR login expire ho gaya ho to dobara (Step 8 wali login command)
docker pull <ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com/task-api:v2

# "restart" se kaam nahi chalega (wo purani image hi chalayega). Purana hatao, naya chalao
docker stop task-api
docker rm task-api
docker run -d --name task-api --restart unless-stopped --network host --env-file ~/task.env \
  <ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com/task-api:v2
```

**Rollback:** bug nikla to wahi flow `:v1` ke saath chalao.

> **Jenkins ye saare steps automatic karega.** Ab aap manually samajh chuke ho ki andar kya hota hai.

---

## 10. Troubleshooting

| Problem | Kya karein |
|---|---|
| `failed to read dockerfile` | Backend repo ke folder me `cd` karo, jahan `Dockerfile` hai |
| `port is already allocated` / `EADDRINUSE` | Port pe kuch aur chal raha hai. `docker ps`, `pm2 status` dekho |
| Build me `Cannot resolve DATABASE_URL` | Dockerfile ki dummy `DATABASE_URL` wali line check karo |
| `Can't reach database server at localhost` (compose me) | `DATABASE_URL` me host `db` hona chahiye, `localhost` nahi |
| `Unable to locate credentials` (server pe) | IAM role instance se attach nahi hui (Step 6) |
| `no basic auth credentials` | ECR login dobara karo |
| `permission denied` (docker, server pe) | Logout karke dobara SSH karo |
| Container turant band (`docker ps -a` me Exited) | `docker logs task-api` dekho, aksar `DATABASE_URL` galat hota hai |
| `{"error":"Tasks fetch nahi hue"}` | App chal rahi hai par DB se connect nahi hui. Password/`task.env` check karo |
| `exec format error` | Image ka architecture mismatch (EC2 `t3.micro` x86 hai) |
| `.env` badli par asar nahi | Env container banate time lagta hai. `docker rm` karke naya container chalao |

---

## 11. Paise / credits bachane ke liye

**Instance Stop karo** (container band karne se paise nahi bachte, EC2 chalne se katte hain):

1. **[CONSOLE] EC2 -> Instances -> Instance state -> Stop instance**
2. **Terminate nahi**, Stop. Terminate karoge to sab hamesha ke liye delete

**Dobara start karne par:**

- **Public IP badal jaata hai**, Console se naya dekho
- Container, Nginx aur PostgreSQL apne aap start hote hain (`docker ps` se check karo)

**Cleanup checklist (project khatam hone par):**

- ECR ki purani images aur repository delete karo
- Elastic IPs release karo, Load Balancer, NAT Gateway, unattached Volumes, RDS delete karo
- **Billing -> Credits** me kharcha dekhte raho
- Free plan me **Paid plan pe upgrade mat karo**

---

## 12. Aage ke steps

1. **Jenkins CI/CD**: push karte hi build, ECR push aur server pe deploy (Jenkinsfile)
2. `/health` route add karna (ALB ke liye)
3. **Custom VPC**: public/private subnet, ALB, RDS (**ek hi din me karke delete karo**)
4. ECS ya Kubernetes (baad me, zaroorat padne par)