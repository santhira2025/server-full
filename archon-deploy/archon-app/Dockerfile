# ── Build stage ────────────────────────────────────────────────
FROM node:20-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

# ── Production stage: nginx ───────────────────────────────────
FROM nginx:alpine AS production

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
