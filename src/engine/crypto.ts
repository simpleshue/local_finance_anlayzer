/**
 * Cryptographic routines matching the Go implementation in main.go
 * Uses standard Web Crypto API for zero-leak local execution in-browser.
 */

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const hashBuf = await crypto.subtle.digest('SHA-256', data as ArrayBufferView<ArrayBuffer>);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hmacSha256(keyStr: string, data: Uint8Array): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(keyStr),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, data as ArrayBufferView<ArrayBuffer>);
  const sigArr = Array.from(new Uint8Array(signature));
  return sigArr.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function maskAccountNumber(rawAcct: string): string {
  const clean = rawAcct.trim();
  if (clean.length >= 4) {
    return '****' + clean.slice(-4);
  }
  return '****' + clean;
}

export function simulateClearBuffer(buf: Uint8Array): void {
  // Directly overwrite memory with zeros matching Go's clear(buf)
  buf.fill(0);
}
