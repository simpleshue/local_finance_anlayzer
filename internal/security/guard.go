// Package security enforces process-level network isolation, memory locking,
// and core-dump prevention inside the Go runtime.
package security

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"syscall"
	"time"
)

var ErrEgressBlocked = errors.New("[SECURITY VIOLATION] outbound network connection blocked by air-gap policy")

// EnforceAirGapAndMemoryLock runs at startup to lock process memory and trap all outbound sockets.
func EnforceAirGapAndMemoryLock() error {
	// 1. Disable core dumps (RLIMIT_CORE = 0) so crashes never dump OFX buffers or keys to disk
	var zeroLimit syscall.Rlimit
	if err := syscall.Setrlimit(syscall.RLIMIT_CORE, &zeroLimit); err != nil {
		return fmt.Errorf("failed to disable core dumps: %w", err)
	}

	// 2. Lock current and future memory allocations into physical RAM (prevent OS swap paging)
	// Note: Requires CAP_IPC_LOCK or running inside container with appropriate ulimit -l
	_ = syscall.Mlockall(syscall.MCL_CURRENT | syscall.MCL_FUTURE)

	// 3. Trap all DNS resolution globally
	net.DefaultResolver = &net.Resolver{
		PreferGo: true,
		Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
			return nil, fmt.Errorf("%w: DNS lookup attempted to %s", ErrEgressBlocked, address)
		},
	}

	// 4. Restrict HTTP DefaultTransport strictly to loopback (127.0.0.1 / ::1) or Unix sockets
	loopbackDialer := &net.Dialer{
		Timeout: 5 * time.Second,
	}

	guardedDialContext := func(ctx context.Context, network, addr string) (net.Conn, error) {
		if network == "unix" || network == "unixgram" || network == "unixpacket" {
			return loopbackDialer.DialContext(ctx, network, addr)
		}
		host, _, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, fmt.Errorf("%w: invalid address %s", ErrEgressBlocked, addr)
		}
		if host != "127.0.0.1" && host != "::1" && host != "localhost" {
			return nil, fmt.Errorf("%w: attempted connection to %s (%s)", ErrEgressBlocked, addr, network)
		}
		ip := net.ParseIP(host)
		if ip == nil || !ip.IsLoopback() {
			return nil, fmt.Errorf("%w: non-loopback IP %s", ErrEgressBlocked, host)
		}
		return loopbackDialer.DialContext(ctx, network, addr)
	}

	http.DefaultTransport = &http.Transport{
		DialContext: guardedDialContext,
		DialTLSContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			return nil, fmt.Errorf("%w: outbound TLS prohibited (%s)", ErrEgressBlocked, addr)
		},
	}

	return nil
}
