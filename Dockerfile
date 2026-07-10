# incubWorkflow – Produktions-Image (Next.js standalone)
FROM node:22-alpine AS base

# ── Dependencies ────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ── Build ───────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# ── Runtime ─────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Vollständige node_modules für Prisma-CLI (migrate deploy) und Seed (tsx);
# Superset der Standalone-Module aus demselben Lockfile – nur lokaler Betrieb,
# Image-Größe ist hier zweitrangig.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && mkdir -p /data/incubWorkflow-Ablage && chown -R nextjs:nodejs /data /app

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

ENTRYPOINT ["./docker-entrypoint.sh"]
