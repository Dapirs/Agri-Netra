# syntax=docker/dockerfile:1
# Build from the repository root:  docker build -f server/Dockerfile .
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# The weather server has no dependencies to install. This file only marks the
# folder as ES modules; the layout below mirrors the repo so ../api/weather.js resolves.
COPY server/package.json ./package.json
COPY server/index.js ./server/index.js
COPY api/weather.js ./api/weather.js

USER node
EXPOSE 3000
CMD ["node", "server/index.js"]