# syntax=docker/dockerfile:1

# ---------- Base ----------
FROM node:24-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1

# ---------- Dépendances (compile better-sqlite3 si aucun binaire précompilé) ----------
FROM base AS deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- Build (tests + build Next.js standalone) ----------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm test && npm run build

# ---------- Runtime : Node + LibreOffice headless + polices ----------
FROM base AS runner
# Polices métriquement compatibles : Liberation (Arial, Times New Roman, Courier New),
# Carlito (Calibri), Caladea (Cambria) → le PDF a la même mise en page que le .docx.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libreoffice-writer-nogui \
      fonts-liberation2 fonts-crosextra-carlito fonts-crosextra-caladea fonts-dejavu-core fontconfig \
 && rm -rf /var/lib/apt/lists/* \
 && fc-cache -f

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data \
    HOME=/tmp

RUN mkdir -p /data && chown node:node /data

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
