import { expect, test } from "bun:test"
import { $ } from "bun"
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { capabilityProblems, checkStoreZip, readAllowlist } from "../scripts/check-artifacts"
import { versionProblems } from "../scripts/release-check"
import manifest from "../public/manifest.json"

test("extension, root and relay release versions agree", async () => {
  expect((await versionProblems()).problems).toEqual([])
})

test("permissions exactly match the reviewed capability allowlist", async () => {
  const allowlist = await readAllowlist()
  expect(capabilityProblems(manifest, allowlist, "source")).toEqual([])
  expect(capabilityProblems({ ...manifest, permissions: [...manifest.permissions, "cookies"] }, allowlist, "source")).not.toEqual([])
})

test("store archive rejects keys, pairing data, missing runtime pages and license loss", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "browse-release-test-"))
  const zip = path.join(root, "artifact.zip")
  const staging = path.join(root, "files")
  try {
    await mkdir(staging)
    const { key: _key, ...storeManifest } = manifest
    await writeFile(path.join(staging, "manifest.json"), JSON.stringify(storeManifest))
    for (const name of ["background.js", "content.js"]) await writeFile(path.join(staging, name), "/* 19989 */")
    for (const name of ["welcome", "onboarding", "settings", "offscreen"]) await writeFile(path.join(staging, `${name}.html`), "<!doctype html>")
    await cp(path.resolve(import.meta.dir, "../LICENSE"), path.join(staging, "LICENSE.txt"))
    await writeFile(path.join(staging, "THIRD_PARTY_NOTICES.txt"), "Fixture dependency notices")
    const check = async () => {
      await rm(zip, { force: true })
      await $`zip -qrX ${zip} .`.cwd(staging).quiet()
      return checkStoreZip(zip, manifest.version)
    }
    expect(await check()).toEqual([])
    await writeFile(path.join(staging, "manifest.json"), JSON.stringify(manifest))
    expect((await check()).some(problem => problem.includes("manifest has `key`"))).toBe(true)
    await writeFile(path.join(staging, "manifest.json"), JSON.stringify(storeManifest))
    await writeFile(path.join(staging, "relay-pairing.json"), "{}")
    expect((await check()).some(problem => problem.includes("pairing code"))).toBe(true)
    await rm(path.join(staging, "relay-pairing.json"))
    await rm(path.join(staging, "offscreen.html"))
    expect((await check()).some(problem => problem.includes("missing offscreen.html"))).toBe(true)
    await rm(path.join(staging, "LICENSE.txt"))
    expect((await check()).some(problem => problem.includes("missing LICENSE.txt"))).toBe(true)
    await writeFile(path.join(staging, "THIRD_PARTY_NOTICES.txt"), "")
    expect((await check()).some(problem => problem.includes("THIRD_PARTY_NOTICES.txt is empty"))).toBe(true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
