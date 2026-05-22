# syntax=docker/dockerfile:1.7

# ---------- 1) Bağımlılıklar ----------
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Paket dosyalarını kopyala ve sadece prod + dev (build için gerekli) bağımlılıkları yükle
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# ---------- 2) Build ----------
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ---------- 3) Runtime ----------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Root olmayan kullanıcı
RUN addgroup --system --gid 1001 nodejs \
    && adduser  --system --uid 1001 nextjs

# Standalone çıktı: minimal node_modules + server.js
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Yüklenen dosyalar için kalıcı dizin (Dokploy üzerinden volume mount edilmeli):
#   Host/Volume  ->  /app/public/uploads
RUN mkdir -p /app/public/uploads/incidents \
    && chown -R nextjs:nodejs /app/public/uploads

USER nextjs

EXPOSE 3000

# Basit healthcheck (Next.js kök sayfası)
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
