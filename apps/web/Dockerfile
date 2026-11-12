# Build from the repo root:
#   docker build -f apps/web/Dockerfile --build-arg API_URL=https://<internal-api-host> -t smm-web .
# API_URL is baked in at build time (it configures the /api proxy).
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w apps/web --include-workspace-root
COPY apps/web apps/web
ARG API_URL
ARG NEXT_PUBLIC_SITE_NAME="SMM Panel"
ENV API_URL=$API_URL NEXT_PUBLIC_SITE_NAME=$NEXT_PUBLIC_SITE_NAME NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w apps/web
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "apps/web"]
