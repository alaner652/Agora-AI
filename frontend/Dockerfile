# TPCU 前端：Next.js（standalone 輸出）

# ---- builder ----
FROM node:22-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# 同源（反向代理）部署：留空 → client 走相對路徑，image 完全通用、可跨 host。
# 若要直連後端（無 proxy），才用 --build-arg NEXT_PUBLIC_API_URL=http://<host>:8000 烘入。
ARG NEXT_PUBLIC_API_URL=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# ---- runner ----
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# standalone 自帶最小 node_modules + server.js
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
