# Multi-Stage Zero-Dependency Production Dockerfile
# Air-Gapped Personal Finance Engine with Modern Embedded Web UI

# Stage 1: Build modern React frontend using Debian glibc Node for complete native module compatibility
FROM node:22-slim AS frontend-builder
WORKDIR /app

# Copy dependency specifications first to leverage Docker layer caching
COPY package.json package-lock.json* ./

# Install dependencies cleanly
RUN npm ci --prefer-offline --no-audit --no-fund || npm install --no-audit --no-fund

# Copy frontend source code and configs
COPY index.html vite.config.ts tsconfig.json ./
COPY src ./src
COPY config ./config

# Build production assets into /app/dist
RUN npm run build

# Stage 2: Compile 100% static Go binary embedding the compiled frontend
FROM golang:1.23-alpine AS builder
WORKDIR /src

COPY go.mod* ./
COPY main.go ./
COPY config ./config
COPY --from=frontend-builder /app/dist ./dist

# Compile 100% static binary using standard library only with stripped debug symbols
# Zero CGO, pure netgo resolver, zero shared libraries
RUN CGO_ENABLED=0 GOOS=linux go build \
    -tags "netgo osusergo" \
    -ldflags="-s -w -extldflags '-static'" \
    -o /finance-engine main.go

# Stage 3: Zero-attack-surface production container
FROM scratch
COPY --from=builder /finance-engine /finance-engine
COPY --from=builder /src/config /config

# Security invariant: No shell, no package manager, zero network callouts
EXPOSE 8811
ENTRYPOINT ["/finance-engine"]
