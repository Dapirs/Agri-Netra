# syntax=docker/dockerfile:1
# Build from the repository root:  docker build -f server/Dockerfile .
FROM node:22-alpine
# The base image can lag behind Alpine's security fixes, so upgrade its packages (Trivy checks this in CI).
# npm is never used at runtime (the server has no dependencies), so remove it and the packages it bundles.
RUN apk upgrade --no-cache && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

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
