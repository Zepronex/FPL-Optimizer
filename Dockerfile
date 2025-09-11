# Multi-stage build for FPL Optimizer

# Stage 1: Build API
FROM node:18-alpine AS api-builder
WORKDIR /app/apps/api
COPY apps/api/package*.json ./
RUN npm ci --only=production
COPY apps/api/ ./
RUN npm run build

# Stage 2: Build Web App
FROM node:18-alpine AS web-builder
WORKDIR /app/apps/web
COPY apps/web/package*.json ./
RUN npm ci
COPY apps/web/ ./
RUN npm run build

# Stage 3: Production
FROM node:18-alpine AS production
WORKDIR /app

# Install production dependencies for API
WORKDIR /app/apps/api
COPY apps/api/package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built API
COPY --from=api-builder /app/apps/api/dist ./dist

# Copy built web app
COPY --from=web-builder /app/apps/web/dist ./public

# Install serve for static files
RUN npm install -g serve

# Create startup script
RUN echo '#!/bin/sh\n\
cd /app/apps/api\n\
node dist/index.js &\n\
cd /app\n\
serve -s apps/api/public -l 3000\n\
' > /app/start.sh && chmod +x /app/start.sh

EXPOSE 3000 3001

CMD ["/app/start.sh"]

