// Smoke the actual store archive, without patching scripts, adding a key, or writing pairing data into it.
// The relay executable is built separately from Desktop PR86's exact Browse source pin.
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { execFile, spawn, type ChildProcess } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { chromium, type BrowserContext } from "patchright-core"
import { chromeExtensionOriginForPath } from "../src/relay/origins.ts"

const exec = promisify(execFile)
const [zipArg, relayArg] = process.argv.slice(2)
assert.ok(zipArg && relayArg, "Usage: node test/release-browser.ts <store zip> <pinned relay executable>")
const zip = path.resolve(zipArg)
const binary = path.resolve(relayArg)
const root = await mkdtemp(path.join(os.tmpdir(), "browse-store-smoke-"))
const extension = path.join(root, "extension")
const home = path.join(root, "relay")
const base = "http://127.0.0.1:19989"
const digest = async () => createHash("sha256").update(await readFile(zip)).digest("hex")
const originalDigest = await digest()
let relay: ChildProcess | undefined
let browser: BrowserContext | undefined
let stage = "extract archive"
const sensitive: string[] = []
const fixture = http.createServer((_request, response) => {
  response.setHeader("content-type", "text/html")
  response.end('<title>Browse release fixture</title><label>Name<input></label><button onclick="document.querySelector(\'output\').textContent=document.querySelector(\'input\').value">Save</button><output></output>')
})
const until = async (check: () => Promise<boolean>, label: string) => {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (await check()) return
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error(label)
}
try {
  await exec("unzip", ["-q", zip, "-d", extension])
  const manifest = JSON.parse(await readFile(path.join(extension, "manifest.json"), "utf8"))
  assert.equal(manifest.key, undefined)
  assert.equal(manifest.update_url, undefined)
  // An unpacked keyless archive has a path-derived ID. Explicitly configure that ID, just as a Desktop
  // candidate must be configured with its assigned store ID; never weaken the relay's origin allowlist.
  const origin = chromeExtensionOriginForPath(extension)
  const id = origin.slice("chrome-extension://".length)
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("OPENCODE_BROWSER_"))),
    OPENCODE_BROWSER_HOME: home,
    OPENCODE_BROWSER_PORT: "19989",
    OPENCODE_BROWSER_STORE_ID: id,
    OPENCODE_BROWSER_AUTO_UPDATE: "off",
    OPENCODE_BROWSER_UPDATE_CHECK: "0",
    OPENCODE_BROWSER_MCP_DIRECT: "1",
  }
  stage = "start pinned relay"
  const binaryVersion = (await exec(binary, ["--version"], { env })).stdout.trim()
  assert.equal(binaryVersion, manifest.version)
  // Never print or upload relay output, tokens, pairing codes or the temporary browser profile.
  relay = spawn(binary, ["serve"], { env, stdio: "ignore" })
  await until(async () => {
    const response = await fetch(`${base}/version`).catch(() => undefined)
    return response?.ok ?? false
  }, "Pinned relay did not start")
  const token = (await readFile(path.join(home, "relay-token"), "utf8")).trim()
  sensitive.push(token)
  const authorization = `Bearer ${token}`
  const api = async (route: string, body?: unknown): Promise<Record<string, any>> => {
    const response = await fetch(`${base}${route}`, {
      headers: { authorization, "content-type": "application/json" },
      ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
    })
    assert.equal(response.status, 200, route)
    return response.json()
  }
  stage = "load archive in Chromium"
  browser = await chromium.launchPersistentContext(path.join(root, "profile"), {
    executablePath: chromium.executablePath(),
    headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  })
  const page = await browser.newPage()
  const pageErrors: string[] = []
  page.on("pageerror", error => pageErrors.push(error.name))
  await page.goto(`${origin}/onboarding.html`)
  const code = (await exec(binary, ["pair", "--code-only"], { env })).stdout.trim()
  sensitive.push(code, code.replaceAll("-", ""))
  assert.ok(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/.test(code), "Pair command returned invalid output")
  stage = "manual pairing"
  await page.getByPlaceholder("XXXX-XXXX").fill(code)
  await page.getByRole("button", { name: "Pair", exact: true }).click()
  await until(async () => (await api("/extension/status")).connected === true, "Store archive did not pair")
  const status = await api("/extension/status")
  assert.equal(status.version, manifest.version)
  assert.equal(status.protocolVersion, 3)
  assert.equal(status.protocolCompatible, true)
  await new Promise<void>(resolve => fixture.listen(0, "127.0.0.1", resolve))
  const address = fixture.address()
  assert.ok(address && typeof address === "object")
  stage = "agent interaction"
  await api("/cli/session/new", { id: "release-smoke" })
  const result = await api("/cli/execute", {
    sessionId: "release-smoke",
    createIfMissing: false,
    code: `await page.goto('http://127.0.0.1:${address.port}'); await page.getByLabel('Name').fill('release ready'); await page.getByRole('button', {name:'Save'}).click(); return {title:await page.title(), value:await page.locator('output').textContent()}`,
  })
  assert.equal(result.ok, true, typeof result.text === "string" ? result.text : "Agent execute failed")
  assert.deepEqual(result.value, { title: "Browse release fixture", value: "release ready" })
  stage = "settings"
  await page.goto(`${origin}/settings.html`)
  assert.ok((await page.locator("body").innerText()).length > 0)
  assert.deepEqual(pageErrors, [])
  // Reopening the same profile must authenticate with its stored browser key, not reuse the one-time code.
  stage = "saved pairing reconnect"
  await browser.close()
  await until(async () => (await api("/extension/status")).connected === false, "Closed browser remained connected")
  browser = await chromium.launchPersistentContext(path.join(root, "profile"), {
    executablePath: chromium.executablePath(),
    headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  })
  await until(async () => (await api("/extension/status")).connected === true, "Saved pairing did not reconnect")
  assert.equal(await digest(), originalDigest)
  const report = { archiveSha256: originalDigest, extensionVersion: manifest.version, relayVersion: binaryVersion,
    relayExecutableSha256: createHash("sha256").update(await readFile(binary)).digest("hex"),
    minimumChromeVersion: manifest.minimum_chrome_version,
    protocol: status.protocolVersion, browserVersion: browser.browser()?.version(),
    checks: ["keyless archive", "manual pairing", "agent navigation/fill/click/read", "settings", "saved pairing reconnect"],
    identity: "temporary path-derived ID explicitly configured in pinned relay; not a store-assigned ID" }
  await writeFile(path.join(path.dirname(zip), "browser-smoke.json"), JSON.stringify(report, null, 2) + "\n")
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  // Browser call logs may contain form values. Redact ephemeral fixture credentials before diagnostics.
  console.error(`Release smoke failed during ${stage} (${error instanceof Error ? error.name : "unknown error"})`)
  let detail = error instanceof Error ? error.message : ""
  for (const value of sensitive) if (value) detail = detail.split(value).join("[redacted]")
  console.error(detail.slice(0, 2_000))
  process.exitCode = 1
} finally {
  await browser?.close().catch(() => {})
  if (relay && relay.exitCode === null && relay.signalCode === null) {
    relay.kill("SIGTERM")
    await new Promise<void>(resolve => {
      const timeout = setTimeout(() => { relay?.kill("SIGKILL"); resolve() }, 2_000)
      relay!.once("exit", () => { clearTimeout(timeout); resolve() })
    })
  }
  await new Promise<void>(resolve => fixture.close(() => resolve()))
  await rm(root, { recursive: true, force: true })
}
