# BharatCode Browse privacy policy

_Last updated: November 18, 2026_

BharatCode Browse connects your browser to an agent through a relay on your computer or another computer you choose. It is based on [Anomaly's Browse](https://github.com/anomalyco/browse). This policy describes the extension and Browse relay, not the separate practices of your agent or model provider.

## What the extension handles

- **Page content, screenshots, network traffic, and actions** in tabs an agent opened, or tabs you let agents use with the toolbar button.
- **Recordings** of a tab, including optional tab audio, when requested.
- Agent tab/group identifiers, settings, relay addresses, browser identity and pairing information in browser extension storage. The relay receives browser identity/version information and settings when connecting.
- The pairing code you enter and a per-relay browser key. Initial pairing transfers the key in a wrapped form; later connections prove possession without resending the raw key. This protects authentication, not subsequent browser traffic.
- Connection diagnostics and system notifications. Notifications can include a site name and handoff message; they appear during recording by default, or on every handoff if configured.
- **Site secrets** you choose to save, such as passwords or one-time-code seeds, and credentials intentionally saved from network captures. These are stored on the relay computer as JSON with restrictive file permissions, not application-level encryption. The secrets API returns metadata rather than raw values. To fill an allowed field, a site secret passes through browser automation into that page; page scripts may then read or transmit it. Redaction is not a guarantee that captures contain no sensitive data.

## Where it goes

- **Local by default:** the extension connects to the relay at `127.0.0.1:19989`.
- **Optional remote relay:** if you choose another host, browser data travels to that computer and may be processed and stored there. Its operator can access data handled by the relay.
- **Agent and provider:** your connected agent may send browser data to its configured model provider or other services it uses. Their processing and retention are separate from Browse. The extension itself does not choose a model provider or upload telemetry to a vendor endpoint.

Relay connections use `ws://`, not TLS. Pairing authenticates the relay but does not encrypt browser traffic. Entering `wss://` does not enable TLS. Remote use requires a secured private network or tunnel for transport protection; the extension does not enforce that protection.

## Storage and retention

- **Browser storage:** settings, browser identity and per-relay keys persist without a timed expiry. A tried pairing code is removed from the active-code field, but up to 20 spent codes remain. The connection diagnostic log keeps its latest 500 entries in browser session storage. A normal pairing code's ten-minute validity is not a storage-deletion deadline.
- **Relay storage:** pairing records, session metadata, operational logs and saved secrets reside on the relay computer. Operational logs have size limits rather than a timed deletion rule. Stored keys and secrets have no general automatic deletion deadline.
- **Session journals:** the relay records agent-code excerpts, result previews and URLs with targeted redaction. At startup and every six hours while running, it prunes non-live journals inactive for more than 14 days, then the oldest non-live journals toward a 200-journal limit. Live sessions are exempt, so neither age nor count is a universal cap.
- **Captures and exports:** the flight recorder keeps a rolling in-memory buffer, normally 60 seconds and configurable up to 120 seconds. Cancelling a network capture discards its in-memory data; cancelling an unfinished recording attempts to remove its temporary file. Saved screenshots, recordings, network exports and secret profiles have no general automatic deletion deadline. Exported files may be outside Browse's own directories.

## Your choices

- Agents use tabs they open or existing tabs you share through the toolbar. Click again to take a shared tab back; that does not erase data already captured or sent.
- `browse pair --revoke <browser>` removes that browser's key from the addressed relay and disconnects it. Revocation stops access; it does not delete browser storage, journals or exports.
- Remove the extension and its browser storage separately from relay data. Removing the extension does not delete files on a local or remote relay.
- For a standalone installation, `browse uninstall` attempts to remove that installation's Browse config, data, state and cache directories. Run cleanup on the correct relay computer and with the correct data-directory configuration. It does not delete exports elsewhere, other installations, or copies held by agents, websites or model providers. Desktop-managed data requires separate cleanup; do not assume standalone uninstall removes all Desktop state.

## Contact

Questions: open an issue in the [BharatCode Browse repository](https://github.com/BharatCode-ai/browse/issues). Do not include pairing keys, credentials or sensitive browsing data in a public issue.
