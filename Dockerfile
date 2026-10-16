# Multi-Stage Zero-Dependency FROM scratch Dockerfile
# Air-Gapped Personal Finance Engine with Modern Embedded Web UI

# Stage 1: Build the modern React UI with Vite & Tailwind CSS
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
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

# Security invariant: No shell, no package manager, no certificates needed for local loopback
EXPOSE 8811
ENTRYPOINT ["/finance-engine"]
