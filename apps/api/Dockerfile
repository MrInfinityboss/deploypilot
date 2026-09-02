FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --filter @deploypilot/api --frozen-lockfile=false
COPY apps/api apps/api
RUN pnpm --filter @deploypilot/api build
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
