# Build from the repo root:  docker build -f apps/api/Dockerfile -t smm-api .
# One image, two roles:
#   API:    node apps/api/dist/server.js   (default)
#   Worker: node apps/api/dist/worker.js
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w apps/api --include-workspace-root
COPY apps/api apps/api
RUN npm run build -w apps/api
ENV NODE_ENV=production
USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
