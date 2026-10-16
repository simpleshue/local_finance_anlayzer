# Multi-Stage Zero-Dependency FROM scratch Dockerfile
# Air-Gapped Personal Finance Engine
FROM golang:1.23-alpine AS builder

WORKDIR /src
COPY main.go .

# Compile 100% static binary using standard library only with stripped debug symbols
# Zero CGO, pure netgo resolver, zero shared libraries
RUN CGO_ENABLED=0 GOOS=linux go build \
    -tags "netgo osusergo" \
    -ldflags="-s -w -extldflags '-static'" \
    -o /finance-engine main.go

# Verify static compilation (no dynamic links)
# ldd /finance-engine will report "not a dynamic executable"

FROM scratch
COPY --from=builder /finance-engine /finance-engine

# Security invariant: No shell, no package manager, no certificates needed for local loopback
EXPOSE 8000
ENTRYPOINT ["/finance-engine"]
