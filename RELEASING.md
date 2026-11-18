# Browse releases

## Current release state (2026-11-19 IST)

Desktop 1.15.52 stable is published with the bundled Browse relay and extension. Its candidate workflow builds them
from a pinned commit in [the organization Browse repository](https://github.com/BharatCode-ai/browse), with the owned
Chrome store ID configured. The store's existing 0.0.14 draft is not yet published. Reuse the verified ZIP below;
documentation updates do not require another extension build. Exact store-ID native smoke passed, but the store
installation/update path and complete installed-Desktop pairing acceptance remain unconfirmed.

For a local build, use the Bun version in `package.json` and install the root and
`cli` dependencies with `--frozen-lockfile`. Run `bun run build` from the root
and `bun script/compile.ts <target>` from `cli`. The relay executable is under
`cli/dist-bin/browse-<target>/bin`.

Run `bun run release:check` to validate versions and build and check the extension
archive. It writes the archive and its SHA-256 digest under `release/`. Stable
archives omit the unpacked extension key. Desktop candidates use the unpacked
build from `dist/` for local development and preview use.

The BharatCode-owned draft item is `hnibngjhajnicjcbdjggjepamojhkjjh`. Set the Desktop
repository's `BROWSE_CHROME_STORE_ID` variable to the listing's extension ID
before building a candidate for it. Test the extension against the currently
supported Desktop relay versions before releasing the extension.

## Build-only preparation

`Prepare extension (build only)` runs on `codex/browse-release-*` branches, without
publishing a release, changing Desktop, or contacting a store. It checks both
TypeScript projects and test suites and uploads the keyless extension ZIP with
`SHA256SUMS`, `SOURCE_SHA`, and builder versions. The ZIP includes runtime files,
the source license, and generated bundled-dependency notices only; it contains no
pairing file, source maps, or test hooks.
Both Vite builds use the minimum Chrome version declared in the manifest.

The browser job downloads that exact ZIP and tests it against a native relay built
from Browse `5ef871cf6dd17f44a12be89774950e73b28118bc`, the pin in Desktop PR86 at
`87878047f88d711fbcef67c3f206a0c04ad86f9b`. It tests manual pairing, agent navigation
and form interaction, settings, and reconnect using the saved browser key.
`browse-compatibility-<source SHA>` records the archive and relay hashes and browser
version. The test explicitly authorizes the temporary unpacked path-derived ID;
this does not certify a future store-assigned ID or a Desktop installer.

Historical preparation note: the earlier Desktop candidate at `bb25eddcf8343376a81602d407d69ed26582eef8`
(run `44074220785`) had no Browse integration. It cannot pair with this extension
out of the box. Before store rollout, obtain the owned store ID, configure it for
a Browse-enabled Desktop build, and test that exact Desktop/extension combination.
Do not work around this by accepting arbitrary extension origins. Listing and
privacy-policy factual updates are a separate store-preparation task.

## Exact store-ID verification (2026-11-18)

The draft item ID is `hnibngjhajnicjcbdjggjepamojhkjjh`. Its supplied public key is
kept in `cli/test/fixtures/chrome-store-public.pem`; this is public fixture material,
not a private signing key. From `cli/`, the existing native smoke accepts:

```sh
node --no-warnings test/release-browser.ts \
  ../release/final/browse-extension-0.0.14.zip \
  dist-bin/browse-linux-x64-baseline/bin/browse \
  hnibngjhajnicjcbdjggjepamojhkjjh test/fixtures/chrome-store-public.pem
```

The local Linux run passed with Bun 1.4.4, Node 24.21.0 and Chromium 153.0.8010.12.
Relay compilation inputs were unchanged from PR86's pinned Browse commit above;
the local build used that commit's timestamp. The browser reported the exact store
ID, rejected a real unrelated keyless extension origin, paired, executed agent
navigation/fill/click/read, rendered settings and reconnected with its stored key.
Only the disposable fixture's manifest gained the public key; all other files and
the original ZIP were checked unchanged. The keyless smoke also passed, as did five
identity tests, both CLI typechecks and `git diff --check`. No CI was dispatched.

Local evidence (ignored under `release/`; no new hosted artifact):

- ZIP SHA-256: `d4d0a8e092aa126373f2b1709288536c3175dea28ff282ffea0a7836886c0827`.
- Native relay SHA-256: `250dc35b33c1472c03274c10d43f4d915748ab030df352abbffd1b45d5056577`.
- `release/final/browser-store-id-smoke.json` SHA-256: `fe175bcd79dc3a589f4e360d49b966cd9f598a792041d160ab66edfceb9e1689`.

Exact-ID mode writes that separate report without overwriting the earlier CI
`browser-smoke.json`. It configures `OPENCODE_BROWSER_STORE_ID` at runtime and does
not widen the additional-origin allowlist. Runtime configuration avoids a relay
recompile for this test; changing a repository variable alone does not update an
already-running relay. This proves exact-ID unpacked compatibility, not store
installation/update behavior or packaged Desktop acceptance. The locally downloaded
test browser was removed afterward to recover disk space; the native relay remains.
