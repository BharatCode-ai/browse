# Chrome Web Store listing

Release-preparation copy for the developer dashboard. The build-only workflow produces `browse-extension-<version>.zip` and checksums; it does not upload to a store. See the [release instructions](../RELEASING.md). Confirm the publisher details, compatible setup and public privacy-policy URL before submission.

## Store listing

**Name:** BharatCode Browse

**Summary (132 chars max):**
Let your BharatCode agents use your browser: open and drive tabs, take screenshots, and hand logins back to you.

**Category:** Developer Tools

**Description:**
BharatCode Browse lets your agent use your real browser through a paired Browse relay. It is based on [Anomaly's Browse](https://github.com/anomalyco/browse).

- Agents open their own tabs in the background of your window, grouped at the start of your tab strip and collapsed so they stay out of your way. Prefer a separate window, one shared group or no groups? Choose it on the status page. Idle agent tabs close by themselves after 10 minutes, or the time you set.
- Want an agent to use a tab you have open? Click the toolbar button on it. Click again to take it back, even while the agent is working.
- Hand off when it's your turn: logins, 2FA, passkeys, and payments stay with you, then the agent continues.
- Agents use Playwright, take screenshots, capture network traffic, and record the tab when you ask. Recordings capture the tab, with optional tab audio.

Requires a compatible BharatCode Browse relay; see the [standalone source setup instructions](https://github.com/BharatCode-ai/browse#development). Desktop integration is proposed in [draft PR86](https://github.com/BharatCode-ai/bharatcode-desktop/pull/86) and is not included in the current stable candidate. Desktop pairing instructions apply only to builds that bundle Browse. Run `browse pair` with the built relay and enter its one-time code on the extension's setup page. Pairing gives this browser a key used to authenticate later connections.

The relay is on your computer by default. You can choose a remote relay, in which case browser data is processed and may be stored on that other computer. Your agent may also send data to its configured model provider. The extension itself does not choose a model provider or upload telemetry to a vendor endpoint.

Relay connections use `ws://`, not TLS. Pairing authenticates the connection but does not encrypt browser traffic; entering `wss://` does not enable TLS. Use remote relays only through a secured private network or tunnel. The extension does not enforce that network protection.

## Privacy

**Single purpose:**
Let a user's agent work in browser tabs it opens or the user shares, through a paired BharatCode Browse relay.

**Permission justifications:**
- `debugger`: Lets the user's agent drive tabs it opened or the user shared (click, type, navigate, screenshot, read the page), the same as browser automation tools. The toolbar badge shows which tabs are in use.
- `tabs`, `tabGroups`: Open and list tabs for the agent, and group the agent's tabs so the user can see them.
- `storage`: Remember agent tabs and groups, user settings, relay addresses, browser identity and per-relay pairing keys. Also retain up to 20 spent pairing codes and a bounded session diagnostic log.
- `alarms`: Keep the connection to the selected local or remote Browse relay alive, reconnect, and close agent tabs left idle.
- `offscreen`, `tabCapture`: Record a tab when the user asks an agent for a screen recording.
- `scripting`: Add the extension's handoff card only to tabs agents use (not to every page), so the user can finish a login or payment step and hand the tab back.
- `webNavigation`: Notice when an agent's click opens a new tab or popup, so it joins the agent's tab group (and the agent's own window, if the user chose one), the user's current tab stays in front, and it closes with the agent's other tabs.
- `notifications`: Tell the user an agent needs them while it records a tab, or on every handoff if the user chose that setting. Clicking the notification shows the tab. If a notification cannot be shown, the in-page card may appear in the recording. Used for nothing else.
- Host permission `<all_urls>`: Agents work on whatever site the user asks for, and the page shows a card when an agent waits for the user there.

**Remote code:** No. All extension code ships in the package.

**Data usage:** Disclose website content and user activity, requested recordings, and the pairing, settings and diagnostic data described in the [privacy policy](privacy-policy.md). Include optional remote-relay processing and onward processing by the agent/model provider. Confirm the dashboard's categories and certifications against the publisher's actual practices before submission; do not describe this as local-only processing.

**Privacy policy URL:** Publish [privacy-policy.md](privacy-policy.md) at a stable public URL controlled by the BharatCode publisher, then enter that actual URL in the dashboard. No hosted policy URL or store ID is assigned by this preparation.
