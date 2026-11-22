FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY services/api/package.json ./services/api/package.json
RUN npm ci
COPY services/api/tsconfig.json ./services/api/tsconfig.json
COPY services/api/src ./services/api/src
RUN npm run build --workspace @medicore/api
RUN npm prune --omit=dev
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "services/api/dist/server.js"]
