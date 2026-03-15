# ── Build stage ────────────────────────────────────────────────
FROM node:20.19.0-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ── Production stage ──────────────────────────────────────────
FROM node:20.19.0-slim AS production

WORKDIR /app

ENV NODE_ENV=production

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
COPY drizzle.config.ts ./

# Non-root user
RUN addgroup --system archon && adduser --system --ingroup archon archon
USER archon

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
