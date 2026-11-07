# BharatCode Browse

Use a Chromium browser you already have with agents in BharatCode Desktop. The extension works through a local
MCP relay. It keeps agent tabs separate, lets you share a tab from the toolbar, and hands control back when your
input is needed. BharatCode Browse is based on [Anomaly's Browse](https://github.com/anomalyco/browse).

## Desktop preview

1. In a BharatCode Desktop build that bundles Browse, open **Settings → General → Connect browser**.
2. Open the extensions page in your Chromium browser, enable **Developer mode**, then click **Load unpacked**.
   Select the extension folder shown in Desktop.
3. Enter the one-time code from Desktop on the extension's setup page, then click **Check connection** in Desktop.
4. Ask the local agent to open a page and report its title. Click the extension's toolbar button to share a tab
   you already have open.

The preview uses a separate extension identity, relay port, and Desktop-managed data directory. It is intended
for Desktop's bundled local runtime. The browser installation step uses Chromium's unpacked extension workflow.

## Development

Build the extension and a standalone relay from this checkout using Bun 1.4.4.

```sh
bun install --frozen-lockfile
bun run build
cd cli
bun install --frozen-lockfile
bun script/compile.ts linux-x64-baseline
```

Use the target for your OS and CPU, such as `darwin-arm64` or `windows-x64-baseline`.
From the Desktop checkout, stage the matching build and then build Desktop as usual.

```sh
bun packages/desktop/scripts/stage-browse.ts \
  /path/to/browse/cli/dist-bin/browse-linux-x64-baseline/bin/browse \
  /path/to/browse/dist /path/to/browse/LICENSE
```

For a standalone test, use a dedicated absolute directory for `OPENCODE_BROWSER_HOME` and set
`OPENCODE_BROWSER_AUTO_UPDATE=off` for both the CLI and its MCP entry. Load `dist` unpacked and run
`browse pair` using the built executable. Use the executable with the `mcp` argument from any stdio MCP client.

## Tools

| Tool | What it does |
| --- | --- |
| `execute` | Run Playwright code against the session's page (`page`, `context`, `snapshot()`, `handoff()`, …) |
| `session_new`, `session_list`, `session_use`, `session_reset`, `session_delete` | Named sessions, each with its own tabs; they survive restarts |
| `session_adopt` | Take over a tab you handed over with the toolbar button |
| `session_allowlist` | Limit a session's tabs to the sites you name (also `allowedOrigins` on `session_new`) |
| `network` (`action`: `start`, `status`, `stop`, `cancel`) | Capture traffic to a redacted HAR |
| `recording` (`action`: `start`, `stop`, `status`, `cancel`) | Record a tab to MP4 or WebM (`cursor: true` draws the ghost cursor) |
| `flight_recorder` (`action`: `start`, `status`, `save_last`, `cancel`) | Keep the last minute of video, save it when something breaks |
| `secrets_list` | Site secrets you stored for the session's sites; agents type them with `secrets.type()` only on their sites, without seeing them |
| `secrets_status`, `secrets_refresh`, `secrets_run` | Reuse captured credentials while keeping their values out of transcripts and artifacts |
| `tabs_cleanup` | Close the agent's idle tabs |
| `settings` | Read or change the settings below when the user asks (never the security switches or update behaviour); the options page updates live |
| `status` | Connection status |

The agent reference is [`cli/skills/browse/SKILL.md`](cli/skills/browse/SKILL.md)
(`browse skill` prints it). The MCP server also sends a short usage guide in its
initialize instructions. Everything is also a CLI:
`node cli/dist/cli.mjs --help`.

## How it works

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/how-dark.png">
  <img src="assets/how-light.png" alt="Three machines on one bench, cabled in a line: the agent's terminal calling browse.execute, the relay box in the middle, and the computer whose browser the agent drives.">
</picture>

The agent talks to the `browse` MCP server over stdio. The server hands each command to the relay on
`127.0.0.1:19989`, and the extension, connected to the relay over a WebSocket, runs it in your browser through
`chrome.debugger`.

- **The relay** (`cli/`) is a local Chrome DevTools endpoint backed by the extension. It keeps named sessions,
  handoffs, recordings, network capture and a journal, and starts on demand.
- **The extension** (`src/`) connects to the relay and runs its commands through `chrome.debugger`. It keeps agent
  tabs in collapsed groups (or their own window), closes idle ones, and shows the toolbar badge and the handoff card.
- **Quiet in the page.** `execute` uses [Patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright), which hides
  the usual automation tells (`navigator.webdriver`, the `Runtime.enable` leak), and the relay drops Patchright's media
  emulation overrides. The extension adds nothing to pages you browse; in agent tabs it adds nothing to the DOM except
  the handoff card while a handoff waits (and the ghost cursor when asked for). Both live in a closed shadow root on an
  anonymous element, drawn from an isolated world. Input moves like a person: curved mouse paths, paced typing,
  gliding scroll (turn *Human-like input* off on the options page, or `OPENCODE_BROWSER_HUMAN_INPUT=0`, for full speed). This makes an agent hard to spot, not impossible: the
  browser shows its "started debugging" bar while the debugger is attached, focus emulation keeps background agent tabs
  "visible", the card and cursor elements exist while shown, and `fillInput`'s fallback dispatches synthetic events
  (it warns when it does).

Permissions: `debugger`, `tabs`, `tabGroups`, `storage`, `alarms`, `offscreen` and `tabCapture` (recordings),
`scripting` (to add the handoff script only to tabs agents use, never to every page), `webNavigation` (to keep popups
agents open with their other tabs), `notifications` (to tell you an agent needs you while it records a tab), and access to
all sites so agents can work wherever you ask. Nothing leaves your computer except what your agent sends to its model
provider; see the [privacy policy](store/privacy-policy.md).

## Security

browse drives the browser you're signed in to, so it assumes that what an agent reads (a web page, an email)
may try to steer it, and that other programs on your computer may try to use the relay.

- **Relay token.** Every HTTP request and CDP connection to the relay needs the token in
  `~/.local/share/browse/relay-token` (readable only by you): an `Authorization: Bearer` header, or
  `?opencodeBrowserToken=` on the CDP WebSocket URL. The MCP server and CLI read it for you. The relay listens on
  `127.0.0.1` only and refuses cross-site browser requests and foreign `Host` headers.
- **Pairing.** `pair` prints a short code (`XXXX-XXXX`) that works once, within 10 minutes; five wrong codes in a row
  void every pending one. A browser exchanges it for a random key of its own, kept by the relay
  (`browser-tokens.json` in the data folder, readable only by you) and in the extension's storage. The exchange runs
  over a fresh key agreement (ECDH), so neither the code nor the key crosses the connection, and each side proves it
  knows the code before the other gives anything away. On every later connection both sides prove they hold the key
  (HMAC over fresh nonces) before the extension obeys anything, so a program that grabs the port first can't drive
  your browser. `pair --list` shows paired browsers and when each was last seen; `pair --revoke <browser>` deletes a
  browser's key and disconnects it. The relay accepts the fork's unpacked extension ID, a configured store ID,
  and any IDs listed in `OPENCODE_BROWSER_EXTENSION_ORIGINS`. Browsers paired by an earlier version with its shared
  code switch to a key of their own the next time they connect. Use `pair --revoke legacy` to retire that code.
- **Restricted `execute`.** Agent code runs in a restricted JavaScript realm on the relay: it withholds Node
  APIs (`process`, `require`, `import()`, `fs`, network modules, Node fetch), limits files to the file roots, and
  stops synchronous code after about 2 seconds. It shares the relay's process, so it is not a security boundary:
  treat code an agent runs as code running as you. The relay starts with an allowlisted environment (the basics plus
  `OPENCODE_BROWSER_*`, proxy variables and CA certificate paths), so your API keys aren't in it.
- **CDP guardrails.** Cookie reads return only cookies for the session's own pages; cookie writes are limited to
  those hosts. Clearing cookies, cache or site data, and closing the browser, are always refused. `page.bringToFront()`
  is refused so agents can't raise windows over your work.
- **Domain allowlists (opt-in).** `session new <name> --allow-origin example.com` (or `session allow`, or
  `allowedOrigins` on `session_new` / `session_allowlist`) limits where a session's tabs go. The relay refuses agent
  navigations and new tabs to other hosts, stops or blanks links, redirects and script navigations that leave the
  list, and closes popups that open elsewhere. Private, loopback and link-local addresses need an entry naming that
  exact host; names are resolved first and the document's real remote IP is checked, against DNS rebinding.
  Subresources (images, fetch, iframes, workers) are not blocked: request interception is shared with Playwright's
  `page.route()`, so the relay can't own it reliably. Browsing through a local proxy makes every document look like
  it came from the proxy's address, so name the hosts you need exactly.
- **Site secrets.** `browse secrets add <name> --origin https://example.com` stores a password, key or (with
  `--totp`) a TOTP seed, read from stdin or a hidden prompt, in `~/.local/share/browse/site-secrets/`
  (0700/0600). An agent types it with `secrets.type(locator, "<name>")`: the relay checks the field's frame URL from
  the browser's frame tree against the secret's origins (and the session's allowlist) right before it inserts the
  value, so a cross-origin iframe or a redirect gets nothing. The value never enters the execute realm, results,
  logs, journals or HARs. Once typed it is in the page, where page script could read it, so pair secrets with an
  allowlist (execute warns when you don't). A stored TOTP seed makes 2FA one factor; keep handing 2FA to yourself
  when you can. `secrets list` and `secrets remove` manage them.
- **Bot challenges.** After a navigation, execute reports Cloudflare, Akamai, DataDome, PerimeterX, Imperva, AWS WAF,
  captcha walls and "access denied" pages in `aftermath.challenge`. It waits up to 15 s
  (`OPENCODE_BROWSER_CHALLENGE_WAIT_MS`) for checks the browser clears by itself, and tells the agent to hand
  interactive ones to you. It never solves them.
- **Your tabs stay yours.** Agents use only tabs they opened or you lent them. The toolbar button always takes a tab
  back; only a real click on the card or the toolbar button finishes a handoff, so a page can't fake it.
- **Less on disk.** Session journals are private (0700/0600), redact typed passwords, codes and tokens, and are pruned
  after 14 days (200 at most). HARs replace credentials with references; typed passwords and one-time codes are never
  stored. Secret profiles keep values out of transcripts and artifacts, but anything that runs with them (like
  `secrets_run`) can use them. `secrets_run` commands get the relay's allowlisted environment plus the profile's
  `BC_SECRET_N` values, not the environment you started opencode with: `PATH`, `HOME`, locale, `HTTP_PROXY`,
  `HTTPS_PROXY`, `NO_PROXY`, `ALL_PROXY`, `SSL_CERT_FILE`, `SSL_CERT_DIR` and `NODE_EXTRA_CA_CERTS` pass through; other
  variables (API keys included) don't.

Escape hatches. Set them in the environment you start opencode (or your MCP client) from; the relay inherits
`OPENCODE_BROWSER_*` variables. Run `node cli/dist/cli.mjs relay restart` after changing them:

| Variable | Effect |
| --- | --- |
| `OPENCODE_BROWSER_ALLOW_NODE=1` | Run `execute` code with full Node access (`process`, `fs`, `import()`, any file path) |
| `OPENCODE_BROWSER_ALLOW_ALL_COOKIES=1` | Let sessions read and write every cookie in the profile |
| `OPENCODE_BROWSER_ALLOW_FOREGROUND=1` | Allow `page.bringToFront()` |
| `OPENCODE_BROWSER_AGENT_WINDOW=separate` | Open agent tabs in a separate window (`current`: in the user's window), overriding the options page's *Where agents open their tabs* |
| `OPENCODE_BROWSER_EXECUTE_SLICE_MS=2000` | Longest `execute` JavaScript may run without yielding before it is stopped (50 to 60000; every session waits meanwhile) |
| `OPENCODE_BROWSER_GHOST_CURSOR=1` | Show the agent cursor on every agent tab outside recordings (pages can see it); `0` keeps it off. Overrides the options page's *Agent cursor* |
| `OPENCODE_BROWSER_AUTO_UPDATE=notify` | Installs: only show new versions (`off`: don't check; `on`: install them when idle, the default). Overrides the status page's *Updates* |
| `OPENCODE_BROWSER_HUMAN_INPUT=0` | Send input at full speed instead of human-like paths and pacing; `1` keeps them on. Overrides the options page's *Human-like input* |
| `OPENCODE_BROWSER_CHALLENGE_WAIT_MS=15000` | How long `execute` waits for a bot check the browser clears by itself (0 to 60000; 0 reports it without waiting) |

## Troubleshooting

- `node cli/dist/cli.mjs status` shows the relay, the extension and every tab agents can use.
- `node cli/dist/cli.mjs doctor` checks the install.
- Logs: `~/.local/state/browse/logs/relay.log`.
- Extension says another browser is connected: the relay is running an older browse that drives one browser profile at
  a time. Update browse on the computer running the relay (or close the other browser), then click **Reconnect** on the
  status page.
- Extension says it's not paired (or that the relay was refused): run `bun run setup` again, then reload the extension
  on your browser's extensions page.
- **Load unpacked** fails, or the extension shows errors: load the `browse/dist` folder (built by `setup`), not
  `browse` itself or `browse/public`. `node cli/dist/cli.mjs extension` shows the right folder.

## Running the test suite

```sh
bun install && bun run dev       # rebuilds dist/ on change; reload the extension to pick it up
bun run typecheck
bun run test                     # the extension and cli/ test suites (bun test), no browser needed
cd cli && bun src/main.ts status # the CLI from source
```

## License

[MIT](LICENSE)
