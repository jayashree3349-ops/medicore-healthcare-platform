FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY services/api/package.json ./services/api/package.json
RUN npm ci
COPY apps/frontend ./apps/frontend
RUN npm run build --workspace frontend

FROM docker.io/library/nginx:alpine
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html
EXPOSE 80
