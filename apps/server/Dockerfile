# Viking 4X server (P2.O01). One image, runs anywhere Docker runs — the host is a rental, not a
# dependency (stack.md).
#
# IMPORTANT: the build context is the REPOSITORY ROOT, not this directory, so every path below is
# written from the root. Railway keeps the context at the repo root even when a service has a root
# directory set, and a Dockerfile that assumes otherwise fails with "/package-lock.json not found".
# Build it locally the same way:
#     docker build -f apps/server/Dockerfile -t viking-server .

FROM node:22-slim AS deps
WORKDIR /app
COPY apps/server/package.json apps/server/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-slim AS build
WORKDIR /app
COPY apps/server/package.json apps/server/package-lock.json ./
RUN npm ci
COPY apps/server/tsconfig.json ./
COPY apps/server/src ./src
RUN npx tsc -p tsconfig.json --outDir dist

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Migrations are applied by the server itself on boot, so the SQL has to travel with it.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY apps/server/package.json ./
COPY apps/server/migrations ./migrations

# Never run the game as root.
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
