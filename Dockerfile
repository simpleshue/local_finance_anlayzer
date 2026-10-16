# Zero-Dependency FROM scratch Dockerfile
# Air-Gapped Personal Finance Engine with Modern Embedded Web UI

# Stage 1: Compile 100% static Go binary embedding the prebuilt modern React frontend
FROM golang:1.23-alpine AS builder
WORKDIR /src
COPY go.mod* ./
COPY main.go ./
COPY config ./config
COPY dist ./dist

# Compile 100% static binary using standard library only with stripped debug symbols
# Zero CGO, pure netgo resolver, zero shared libraries
RUN CGO_ENABLED=0 GOOS=linux go build \
    -tags "netgo osusergo" \
    -ldflags="-s -w -extldflags '-static'" \
    -o /finance-engine main.go

# Stage 2: Zero-attack-surface production container
FROM scratch
COPY --from=builder /finance-engine /finance-engine
COPY --from=builder /src/config /config

# Security invariant: No shell, no package manager, no certificates needed for local loopback
EXPOSE 8811
ENTRYPOINT ["/finance-engine"]
