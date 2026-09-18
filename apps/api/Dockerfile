# syntax=docker/dockerfile:1.7
# Build from the repo root:  docker build -f apps/api/Dockerfile -t portfolio-api .

FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

# Manifests first, so dependency layers are cached across source-only changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile --filter @repo/api...

COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @repo/api build

# A self-contained copy of @repo/api with production dependencies only. Contracts, Zod, Drizzle
# and ulid are devDependencies because tsup inlined them into dist/main.js.
RUN pnpm --filter @repo/api deploy --prod /out

FROM gcr.io/distroless/nodejs22-debian13:nonroot
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
EXPOSE 8080
# The distroless entrypoint is `node`.
CMD ["--enable-source-maps", "dist/main.js"]
