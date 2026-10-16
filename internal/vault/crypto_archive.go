// Package vault provides zero-plaintext statement handling, explicit RAM zeroization,
// and authenticated AES-256-GCM encryption using only the Go standard library.
package vault

import (
	"bytes"
	"compress/zlib"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"io"
	"os"
	"path/filepath"
)

var MagicHeader = []byte("OFXENC01")

// DeriveKey implements PBKDF2-HMAC-SHA256 using strictly the Go standard library.
func DeriveKey(passphrase []byte, salt []byte, iterations int) []byte {
	prf := hmac.New(sha256.New, passphrase)
	hashLen := prf.Size()
	dk := make([]byte, 32) // 256-bit key for AES-256

	u := make([]byte, hashLen)
	t := make([]byte, hashLen)
	block1 := make([]byte, len(salt)+4)
	copy(block1, salt)
	block1[len(salt)+3] = 1 // Block index 1 (big-endian)

	prf.Write(block1)
	u = prf.Sum(u[:0])
	copy(t, u)

	for i := 2; i <= iterations; i++ {
		prf.Reset()
		prf.Write(u)
		u = prf.Sum(u[:0])
		for j := 0; j < hashLen; j++ {
			t[j] ^= u[j]
		}
	}
	copy(dk, t[:32])
	clear(u)
	clear(t)
	return dk
}

// ArchiveEncryptedStatement compresses and encrypts raw OFX bytes in RAM before writing .enc to disk.
func ArchiveEncryptedStatement(rawBytes []byte, filename string, archiveDir string, passphrase []byte) (string, error) {
	salt := make([]byte, 16)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return "", err
	}

	key := DeriveKey(passphrase, salt, 600000)
	defer clear(key) // Wipe derived key from RAM immediately upon exit

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, aesgcm.NonceSize()) // 12 bytes
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	// Compress in memory
	var compressedBuf bytes.Buffer
	zw, err := zlib.NewWriterLevel(&compressedBuf, zlib.BestCompression)
	if err != nil {
		return "", err
	}
	if _, err := zw.Write(rawBytes); err != nil {
		return "", err
	}
	zw.Close()
	compressedBytes := compressedBuf.Bytes()
	defer clear(compressedBytes) // Wipe compressed plaintext from RAM

	safeName := filepath.Base(filename)
	ciphertext := aesgcm.Seal(nil, nonce, compressedBytes, []byte(safeName))

	targetPath := filepath.Join(archiveDir, safeName+".enc")
	f, err := os.OpenFile(targetPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return "", err
	}
	defer f.Close()

	if _, err := f.Write(MagicHeader); err != nil {
		return "", err
	}
	if _, err := f.Write(salt); err != nil {
		return "", err
	}
	if _, err := f.Write(nonce); err != nil {
		return "", err
	}
	if _, err := f.Write(ciphertext); err != nil {
		return "", err
	}
	if err := f.Sync(); err != nil {
		return "", err
	}

	return targetPath, nil
}

// SecureUnlink overwrites a file on tmpfs/disk with zeros before unlinking.
func SecureUnlink(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	if info.IsDir() {
		return errors.New("cannot secure-unlink a directory")
	}

	f, err := os.OpenFile(path, os.O_WRONLY, 0)
	if err != nil {
		return err
	}
	zeros := make([]byte, 4096)
	remaining := info.Size()
	for remaining > 0 {
		toWrite := int64(len(zeros))
		if remaining < toWrite {
			toWrite = remaining
		}
		n, err := f.Write(zeros[:toWrite])
		if err != nil {
			f.Close()
			return err
		}
		remaining -= int64(n)
	}
	f.Sync()
	f.Close()
	return os.Remove(path)
}
