FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/package.json
RUN pnpm install --filter @deploypilot/worker --frozen-lockfile=false
COPY apps/worker apps/worker
RUN pnpm --filter @deploypilot/worker build
CMD ["node", "apps/worker/dist/main.js"]
