import assert from "node:assert/strict"
import { createHash, createPublicKey } from "node:crypto"

/** Accept only the dashboard's public SPKI key, never a private key or a claimed ID alone. */
export function releaseIdentity(publicKey: string, expectedId: string) {
  assert.match(expectedId, /^[a-p]{32}$/, "Expected a 32-letter Chrome store ID")
  const key = publicKey.trim().replace(/^-----BEGIN PUBLIC KEY-----/, "").replace(/-----END PUBLIC KEY-----$/, "").replace(/\s/g, "")
  assert.ok(/^[A-Za-z0-9+/]+={0,2}$/.test(key), "Expected a public SPKI key in PEM or base64 form")
  const der = Buffer.from(key, "base64")
  assert.ok(der.toString("base64") === key, "Invalid public key base64")
  assert.equal(createPublicKey({ key: der, format: "der", type: "spki" }).asymmetricKeyType, "rsa", "Expected an RSA public key")
  const sha256 = createHash("sha256").update(der).digest("hex")
  const id = sha256.slice(0, 32).replace(/[0-9a-f]/g, digit => String.fromCharCode(97 + parseInt(digit, 16)))
  assert.equal(id, expectedId, "Public key does not match expected store ID")
  return { id, key, publicKeySha256: sha256 }
}
