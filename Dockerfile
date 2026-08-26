# TimeMark Docker Image - Multi-stage build
# Build: docker build -t timemark:latest .
# Or pre-build: pnpm -r build && docker build -t timemark:latest .

# Stage 1: Build (compile TypeScript)
FROM node:22-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm@9

# Copy package files and install all dependencies (including dev for compilation)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/

RUN pnpm install --frozen-lockfile

# Copy source and compile
COPY shared/ ./shared/
COPY backend/ ./backend/

RUN pnpm build:shared && pnpm build:backend

# Stage 2: Runtime (minimal production image)
FROM node:22-alpine

# icu-data-full: Required for correct Chinese date formatting (Intl.DateTimeFormat)
# dumb-init: Proper PID 1 signal handling in containers
# su-exec: drop privileges after entrypoint ownership self-heal (root-run NAS case)
RUN apk add --no-cache dumb-init su-exec ca-certificates icu-data-full

WORKDIR /app

ENV NODE_ENV=production
ENV TZ=Asia/Shanghai

# Install pnpm via npm
RUN npm install -g pnpm@9

# Create non-root user
RUN addgroup -S app && adduser -S app -G app

# Copy package files and install production dependencies only (no optional: wechaty/baileys/oicq)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/

# --no-optional excludes heavy optional deps (wechaty, baileys, oicq) for smaller image
RUN pnpm install --prod --frozen-lockfile --no-optional

# Copy compiled artifacts from builder stage
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/backend/dist ./backend/dist

# Copy pre-built frontend static files
COPY frontend/dist ./frontend/dist

# Copy schema for database initialization
COPY docker/schema.sql ./docker/schema.sql

# Create data directory owned by the non-root user (no world-writable modes —
# this directory holds timemark.db and data/.env secrets).
# Bind-mount ownership (FNOS/NAS root-owned volumes) is self-healed at container
# start by docker/entrypoint.sh (chown as root, then drop to app via su-exec).
RUN mkdir -p /app/data && chown -R app:app /app

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Switch to non-root user
USER app

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "./backend/dist/backend/src/index.js"]
