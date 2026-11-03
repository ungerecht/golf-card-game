# Build from the repository root:
#   docker build -f packages/server/Dockerfile -t golf-server .
FROM node:24-slim

WORKDIR /app
RUN npm install -g pnpm@12.11.2

# Dependencies first, so this layer is cached until a package.json changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile --prod --filter @golf/server...

COPY packages/shared packages/shared
COPY packages/server packages/server

ENV NODE_ENV=production \
    PORT=2567
WORKDIR /app/packages/server
USER node
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["./node_modules/.bin/tsx", "src/index.ts"]
