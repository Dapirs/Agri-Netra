# syntax=docker/dockerfile:1

# ---- Stage 1: build the static site ------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Install dependencies first so this layer is cached until the lockfile changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Stage 2: serve it with nginx (runs as a non-root user on port 8080) ------
FROM nginxinc/nginx-unprivileged:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
