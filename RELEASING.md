# Browse releases

BharatCode Desktop distributes the relay as part of its normal Beta and stable releases.
The Desktop candidate workflow builds the relay and extension from a pinned commit in
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
