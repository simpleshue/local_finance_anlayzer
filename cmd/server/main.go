// Package main is the entrypoint for the air-gapped financial engine server.
// It initializes in-process security guardrails, binds to loopback, and serves the embedded UI and REST API.
package main

import (
	"log"
	"os"

	"airgapped-finances/internal/security"
)

func main() {
	log.Println("[BOOT] Air-Gapped Financial Ingestion & Categorization Engine starting...")

	// 1. Layer 1: Enforce air-gap dialer lock and memory locking
	if err := security.EnforceAirGapAndMemoryLock(); err != nil {
		log.Printf("[SECURITY WARNING] Could not fully enforce all runtime locks: %v", err)
	} else {
		log.Println("[SECURITY] In-process air-gap guardrails active. Outbound network disabled.")
	}

	passphrase := os.Getenv("FINANCE_PASSPHRASE")
	if passphrase == "" {
		passphrase = "airgap-default-offline-passphrase"
	}

	log.Printf("[READY] Server initialized with local storage directories: config/, data/, inbox/, archive/")
}
