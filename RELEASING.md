# Browse releases

Browse integration is currently proposed in Desktop draft PR86. Its candidate workflow
builds the relay and extension from a pinned commit in
[the organization Browse repository](https://github.com/BharatCode-ai/browse).
Port the source before pointing a candidate at that commit.

For a local build, use the Bun version in `package.json` and install the root and
`cli` dependencies with `--frozen-lockfile`. Run `bun run build` from the root
and `bun script/compile.ts <target>` from `cli`. The relay executable is under
`cli/dist-bin/browse-<target>/bin`.

Run `bun run release:check` to validate versions and build and check the extension
archive. It writes the archive and its SHA-256 digest under `release/`. Stable
archives omit the unpacked extension key. Desktop candidates use the unpacked
build from `dist/` for local development and preview use.

A future store release needs a BharatCode-owned listing. Set the Desktop
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

The successful Desktop candidate at `bb25eddcf8343376a81602d407d69ed26582eef8`
(run `44074220785`) has no Browse integration. It cannot pair with this extension
out of the box. Before store rollout, obtain the owned store ID, configure it for
a Browse-enabled Desktop build, and test that exact Desktop/extension combination.
Do not work around this by accepting arbitrary extension origins. Listing and
privacy-policy factual updates are a separate store-preparation task.
