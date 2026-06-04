FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml* .npmrc ./
RUN pnpm install --frozen-lockfile

COPY prisma ./prisma
RUN pnpm prisma:generate

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable

COPY --from=build /app/package.json /app/pnpm-lock.yaml* ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY tsconfig.json tsconfig.build.json jest.config.js ./
COPY scripts ./scripts
COPY test ./test
COPY src ./src

EXPOSE 3000

CMD ["sh", "-c", "pnpm prisma:migrate:deploy && node dist/main.js"]
