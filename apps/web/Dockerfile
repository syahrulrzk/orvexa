# Build dari root monorepo: docker build -f apps/web/Dockerfile .
FROM node:22-slim AS base
ENV TZ=Asia/Jakarta
WORKDIR /app

# --- deps ---
FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm install --workspaces --include-workspace-root

# --- build ---
FROM base AS build
# npm workspaces menaruh dependency di root /app/node_modules (hoisted),
# sehingga apps/web/node_modules biasanya tidak ada.
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build -w apps/web

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/apps/web/next.config.mjs ./apps/web/next.config.mjs
COPY --from=build /app/node_modules ./node_modules
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["npm", "run", "start"]
