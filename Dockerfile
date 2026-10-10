# syntax=docker/dockerfile:1
# UniSphere production image (Next.js standalone output) and background worker.
#
#   docker build -t unisphere .                          # the web app
#   docker build --target worker -t unisphere-worker .   # the background worker
#
# NEXT_PUBLIC_* values are compiled into the browser bundle, so they are BUILD arguments: change one and rebuild.
# Server secrets (SUPABASE_SECRET_KEY, RESEND_API_KEY, ...) are runtime environment variables and are never baked in.

ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# 1) Dependencies (cached until package*.json changes)
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# 2) Build
FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=
ARG NEXT_PUBLIC_MEDIA_URL=
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY \
    NEXT_PUBLIC_MEDIA_URL=$NEXT_PUBLIC_MEDIA_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The build only needs placeholders for server-side values; the real ones arrive at runtime.
RUN SUPABASE_SECRET_KEY=build-placeholder-not-used-at-runtime npm run build

# 3) Web app runtime: small, non-root, with a health check
FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

# 4) Worker: a thin loop that calls the app's /api/cron/tick (emails, push, reminders, embeddings, deletions)
FROM node:${NODE_VERSION}-alpine AS worker
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs worker
COPY --chown=worker:nodejs scripts/worker.mjs ./scripts/worker.mjs
USER worker
CMD ["node", "scripts/worker.mjs"]
