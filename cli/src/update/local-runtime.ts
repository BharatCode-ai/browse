// Local runtime metadata and process helpers. BharatCode Desktop distributes relay updates.
import { spawn, spawnSync } from "node:child_process"
import { existsSync, readFileSync, realpathSync } from "node:fs"
import path from "node:path"
import { cliPrefix, compiledBinary, fromCheckout, installedBinary } from "../paths.ts"
import { opencodeBrowserVersion } from "../version.ts"

export const autoUpdateModes = ["on", "notify", "off"] as const
export type AutoUpdateMode = (typeof autoUpdateModes)[number]
export type Channel = "latest" | "dev" | "beta"
export type InstallKind = "binary" | "npm" | "npx" | "checkout" | "other"

/** A version auto-update installs: 1.2.3, 1.2.4-dev.42 (1.2.4-dev.42.2 for a rerun), or a beta. */
export const UPDATE_VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-(dev|beta)\.(\d+)(?:\.(\d+))?)?$/

export const channelOf = (version: string): Channel => (version.includes("-dev.") ? "dev" : version.includes("-beta.") ? "beta" : "latest")

/** Orders versions as semver does for these shapes: dev below beta below the release, then by run. Anything else never compares as newer. */
export function compareVersions(left: string, right: string): number {
  const parse = (value: string) => {
    const match = UPDATE_VERSION.exec(value)
    if (!match) return undefined
    const stage = match[4] === undefined ? 2 : match[4] === "beta" ? 1 : 0
    return [Number(match[1]), Number(match[2]), Number(match[3]), stage, Number(match[5] ?? 0), Number(match[6] ?? 0)]
  }
  const a = parse(left)
  const b = parse(right)
  if (!a || !b) return 0
  for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return a[index]! < b[index]! ? -1 : 1
  return 0
}

// ---- where this process runs from --------------------------------------------------------------------

/** What kind of install this process runs from. */
export function installKind(entry = process.argv[1] ?? "", checkout = fromCheckout()): InstallKind {
  if (checkout) return "checkout"
  if (compiledBinary()) return "binary"
  const normalized = entry.replaceAll("\\", "/")
  if (/\/_npx\/|\/npm-cache\/_npx\//.test(normalized)) return "npx"
  return entry ? "npm" : "other"
}

export type Runtime = {
  readonly kind: "binary" | "npm" | "npx"
  /** The stable path new processes start from: the executable, or the npm package's CLI bundle. */
  readonly entry: string
  /** The version this process runs. */
  readonly version: string
}

const packageVersion = (entry: string): string | undefined => {
  try {
    const manifest = path.join(path.dirname(path.dirname(entry)), "package.json")
    const version = (JSON.parse(readFileSync(manifest, "utf8")) as { version?: unknown }).version
    return typeof version === "string" ? version : undefined
  } catch {
    return undefined
  }
}

/** npm's bin is a symlink; the package manifest lives beside the real bundle. */
const realEntry = (entry: string) => {
  try {
    return realpathSync(entry)
  } catch {
    return entry
  }
}

/** The installed runtime this process belongs to, or undefined for a checkout or an uninstalled executable. */
export function installedRuntime(entry = process.argv[1] ?? process.execPath): Runtime | undefined {
  const kind = installKind(entry)
  if (kind === "binary") {
    const binary = installedBinary()
    if (binary) return { kind, entry: binary, version: opencodeBrowserVersion }
    // A downloaded executable run in place has nothing to update.
    return undefined
  }
  if (kind !== "npm" && kind !== "npx") return undefined
  const resolved = realEntry(entry)
  return { kind, entry: resolved, version: packageVersion(resolved) ?? opencodeBrowserVersion }
}

/** The version currently on disk at the runtime's stable entry (a binary reports it with --version). */
export function installedVersion(runtime: Runtime): string | undefined {
  if (runtime.kind === "binary") {
    const result = spawnSync(runtime.entry, ["--version"], { encoding: "utf8", timeout: 15_000, env: { ...process.env, OPENCODE_BROWSER_AUTOSTART: "0" } })
    return result.status === 0 ? result.stdout.trim() || undefined : undefined
  }
  return packageVersion(runtime.entry)
}

// Preserve the status fields understood by existing extensions and MCP clients.
export const autoUpdateOverride = () => "off" as const
export const storedMode = autoUpdateOverride
export const autoUpdateStatus = () => ({
  install: installKind(),
  cli: cliPrefix(),
  mode: "off" as const,
  effective: "off" as const,
  overriddenBy: "BharatCode Desktop",
  version: opencodeBrowserVersion,
})
export const describeAutoUpdate = () => "Relay updates are delivered with BharatCode Desktop."

export type Run = (command: string, args: readonly string[], options?: { readonly timeoutMs?: number; readonly env?: NodeJS.ProcessEnv }) => Promise<{ status: number | null; stdout: string; stderr: string }>

/**
 * Runs a command without blocking the event loop: the relay keeps serving agents and the extension while the installer
 * downloads an update (minutes on a slow network).
 */
export const runCommand: Run = (command, args, options = {}) =>
  new Promise((resolve) => {
    // On Windows npm is npm.cmd, which Node only runs through a shell; run npm's own entry beside node.exe instead.
    const npmCli = process.platform === "win32" && command === "npm" ? path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js") : undefined
    const [file, argv] = npmCli && existsSync(npmCli) ? [process.execPath, [npmCli, ...args]] : [command, args]
    const child = spawn(file, argv, { env: options.env ?? process.env, stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => void (stdout += chunk))
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => void (stderr += chunk))
    const timer = setTimeout(() => child.kill(), options.timeoutMs ?? 120_000)
    child.on("error", (error) => {
      clearTimeout(timer)
      resolve({ status: null, stdout, stderr: stderr + error.message })
    })
    child.on("close", (status) => {
      clearTimeout(timer)
      resolve({ status, stdout, stderr })
    })
  })
