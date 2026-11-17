import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { releaseIdentity } from "./release-identity.ts"

// Existing public development key is a known-vector test, not the store identity.
const key: string = JSON.parse(readFileSync(new URL("../../public/manifest.json", import.meta.url), "utf8")).key
const id = "faccoaejfgiiagkhdlhikildfefmjigf"

test("the supplied Chrome store public key derives the actual item ID", () => {
  const publicKey = readFileSync(new URL("./fixtures/chrome-store-public.pem", import.meta.url), "utf8")
  expect(releaseIdentity(publicKey, "hnibngjhajnicjcbdjggjepamojhkjjh").id).toBe("hnibngjhajnicjcbdjggjepamojhkjjh")
})

test("derives the known ID from a public key", () => {
  expect(releaseIdentity(key, id)).toMatchObject({ id, key })
})

test("accepts the dashboard PEM format", () => {
  const pem = `-----BEGIN PUBLIC KEY-----\n${key.match(/.{1,64}/g)!.join("\n")}\n-----END PUBLIC KEY-----`
  expect(releaseIdentity(pem, id)).toEqual(releaseIdentity(key, id))
})

test("rejects a key that does not belong to the requested store item", () => {
  expect(() => releaseIdentity(key, "hnibngjhajnicjcbdjggjepamojhkjjh")).toThrow("does not match")
})

test("rejects malformed IDs and non-public-key input", () => {
  expect(() => releaseIdentity(key, "not-an-id")).toThrow("Chrome store ID")
  expect(() => releaseIdentity("-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----", id)).toThrow("public SPKI")
  expect(() => releaseIdentity("not base64!", id)).toThrow("public SPKI")
  expect(() => releaseIdentity("AAAA", id)).toThrow()
})
