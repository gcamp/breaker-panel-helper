# Multi-stage build for production optimization
FROM node:25-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Remove development files
RUN rm -rf tests/ *.test.js test-data.js validate-features.js plan-critical-move.js import-csv.js

# Production stage
FROM node:25-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S breaker -u 1001

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=breaker:nodejs /app /app

# Create data directory for SQLite database
RUN mkdir -p /app/data && chown breaker:nodejs /app/data

# Switch to non-root user
USER breaker

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r) => { r.statusCode === 200 ? process.exit(0) : process.exit(1) })"

# Set environment variables
ENV NODE_ENV=production
ENV DB_PATH=/app/data/breaker_panel.db
ENV PORT=3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "server.js"]