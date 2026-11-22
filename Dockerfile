# Base image: Node 20 (version yahin fixed hota hai)
FROM node:20-slim
WORKDIR /app

# 1) Pehle sirf dependency files copy karo (taaki npm install ki layer cache ho sake)
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm install

# 2) Prisma client generate. Prisma 7 build me DATABASE_URL maangta hai,
#    isliye sirf build ke liye ek dummy URL (asli DB se connect nahi hota)
RUN DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate

# 3) Ab code copy karo (ye layer sabse zyada badalti hai, isliye last me)
COPY src ./src

EXPOSE 3000
CMD ["node", "src/index.js"]