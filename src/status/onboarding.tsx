// The onboarding page (onboarding.html): opened on install, and by the toolbar button while this browser isn't paired.
import { createEffect, createMemo, createSignal, Match, onCleanup, Show, Switch, type JSX } from "solid-js"
import { render } from "solid-js/web"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { TextInput } from "@opencode/ui/text-input"
import { unpackedExtensionId, unpackedReloadAdvice } from "../../cli/src/protocol"
import { firstRunStep, relayProbeResult, shouldProbe, type FirstRunStep, type RelayProbe } from "./first-run"
import { TRY_PROMPT, checklist } from "./checklist"
import { remoteInstallCommand } from "./install"
import { RelayForm } from "./relay-form"
import { applyColorScheme, Brand, createFlash, createRelay, Note, Rich, type Relay } from "./ui"
import "./onboarding.css"

// `browse install` opens the setup page with a one-time code in the fragment (welcome.html#code=…, which
// forwards here) for a store build (cli/src/setup.ts pairStoreExtension). Take it, then drop it from the URL (address
// bar and history) before anything else.
let fragmentCode = /^#code=([0-9A-Za-z-]{8,9})$/.exec(location.hash)?.[1]
const installTab = !!fragmentCode
if (/^#(code|ticket|pair)=/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search)

const settingsUrl = () => chrome.runtime.getURL("settings.html")

type Where = "here" | "remote"

function Onboarding() {
  const relay = createRelay()
  const [probe, setProbe] = createSignal<RelayProbe>("unknown")
  const [installWaiting, setInstallWaiting] = createSignal(installTab)
  const [wasConnected, setWasConnected] = createSignal(false)
  const [tried, setTried] = createSignal(false)
  const [pairedBy, setPairedBy] = createSignal<"link" | "code">()
  const [linkNote, setLinkNote] = createSignal<string>()
  const [where, setWhere] = createSignal<Where>()

  const step = createMemo(() => firstRunStep(relay.state(), installWaiting() ? "install-waiting" : probe()))
  const list = createMemo(() => checklist({ state: relay.state(), wasConnected: wasConnected(), tried: tried() }))
  const connected = () => list().agent === "done"
  // Until the user picks, it follows where the extension already points.
  const remote = () => (where() ?? (relay.state()?.relay.remote ? "remote" : "here")) === "remote"

  createEffect(() => {
    const state = relay.state()
    if (!state) return
    if (state.status === "connected") setWasConnected(true)
    if (state.status === "connected" && state.tabs.length > 0) setTried(true)
    if (installWaiting() && state.status === "connected") {
      setInstallWaiting(false)
      void returnToFirstRunTab().catch(() => {})
    }
    // The code from install's URL, used once, and only when this extension isn't paired with the relay (no token, or
    // one the relay refused). A working pairing is never replaced; the page says it ignored the link instead. While
    // it's still connecting (or the relay is starting), wait for a status that tells.
    if (fragmentCode && state.status !== "offline" && state.status !== "connecting") {
      if (state.status === "unpaired" || state.status === "untrusted") relay.send({ type: "pairing.link", code: fragmentCode })
      else setLinkNote("Already paired with the relay; the pairing link from install was ignored.")
      fragmentCode = undefined
    }
    if (shouldProbe(state)) void probeRelay()
  })
  relay.onMessage((message) => {
    if (message?.type !== "pairing.link.result") return
    if (message.ok) setPairedBy("link")
    else setLinkNote("Already paired with the relay; the pairing link from install was ignored.")
  })

  /**
   * Asks this computer's relay port whether a browse relay answers (its /version is open), while the extension has
   * no token or code to connect with. One probe at a time, and again while the page stays in that state.
   */
  let probing = false
  let probeTimer: ReturnType<typeof setTimeout> | undefined
  async function probeRelay() {
    if (probing || probeTimer !== undefined) return
    probing = true
    const port = /:(\d+)$/.exec(relay.state()?.relay.address ?? "")?.[1]
    let result: Exclude<RelayProbe, "unknown"> = "absent"
    if (port) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/version`, {
          headers: { "x-browse-install": "probe" },
          cache: "no-store",
          signal: AbortSignal.timeout(2_000),
        })
        result = relayProbeResult(response.status, await response.json().catch(() => undefined))
      } catch {
        result = "absent"
      }
    }
    probing = false
    setProbe(result)
    probeTimer = setTimeout(() => {
      probeTimer = undefined
      if (shouldProbe(relay.state())) void probeRelay()
    }, 3_000)
  }
  onCleanup(() => clearTimeout(probeTimer))

  const tryIt = (number: number, desktop = true) => (
    <Step
      number={number}
      title={desktop ? "Finish in BharatCode Desktop" : "Try your connection"}
      done={list().tryIt === "done"}
      description={
        list().tryIt === "done"
          ? "Your agent opened a tab. BharatCode Browse is ready."
          : desktop
            ? "Select Check connection in Desktop, then try this prompt in a chat."
            : "Try this prompt in a chat with your agent."
      }
    >
      <Show when={list().tryIt !== "done"}>
        <Command text={TRY_PROMPT} label="Copy prompt" />
      </Show>
    </Step>
  )

  return (
    <main class="page">
      <Brand />

      <section class="guide" aria-labelledby="guide-title">
        <header class="guide-head">
          <h1 id="guide-title" class="guide-title">
            {remote() ? "Connect an agent on another computer" : "Connect your browser"}
            <Show when={connected()}>
              <span class="guide-connected">
                <span aria-hidden="true">·</span>
                <span class="ok">Connected</span>
              </span>
            </Show>
          </h1>
          <p class="guide-sub">
            <Show when={remote()} fallback="Let your BharatCode agent open tabs and work in tabs you share.">
              For an agent on a server, a dev box or another laptop.{" "}
              <button type="button" class="link" onClick={() => setWhere("here")}>
                Agent on this computer?
              </button>
            </Show>
          </p>
        </header>

        <Show
          when={remote()}
          fallback={
            <>
              <div class="hr" />
              <div class="guide-body">
                <div class="steps">
                  <Step
                    number={1}
                    title="Pair with BharatCode Desktop"
                    done={connected()}
                    description={
                      connected() ? (
                        <AgentDone relay={relay} pairedBy={pairedBy()} />
                      ) : (
                        <>Open <strong>Settings → General → Connect browser</strong> in Desktop to get a one-time code.</>
                      )
                    }
                  >
                    <Show when={!connected()}>
                      <AgentStep relay={relay} step={step()} linkNote={linkNote()} onPaired={() => setPairedBy("code")} />
                    </Show>
                  </Step>
                  <Show when={connected()}>{tryIt(2)}</Show>
                </div>
              </div>
            </>
          }
        >
          <div class="hr" />
          <div class="guide-body">
            <div class="steps">
              <Step
                number={1}
                title="On that computer, run"
                done={connected()}
                description="Build BharatCode Browse on that computer and open the relay on a private network. Then run browse pair there."
              >
                <Show when={!connected()}>
                  <Command text={remoteInstallCommand} label="Copy command" />
                  <a class="link" href="https://github.com/BharatCode-ai/browse#development" target="_blank" rel="noreferrer">
                    Source setup instructions
                  </a>
                </Show>
              </Step>
              <Step
                number={2}
                title="Enter its address and code"
                done={connected()}
                description={connected() ? <AgentDone relay={relay} pairedBy={pairedBy()} /> : "The code works once, within 10 minutes."}
              >
                <Show when={!connected()}>
                  <RelayForm relay={relay} remote />
                </Show>
              </Step>
              <Show when={connected()}>{tryIt(3, false)}</Show>
            </div>
          </div>
        </Show>

        <div class="hr" />
        <footer class="guide-foot">
          <Show when={!connected() && !remote()}>
            <button type="button" class="link" onClick={() => setWhere("remote")}>
              Use a relay on another computer
            </button>
          </Show>
          <Show when={connected()}>
            <button type="button" class="link" onClick={() => location.assign(settingsUrl())}>
              Extension settings
            </button>
          </Show>
          <a class="link" href="https://github.com/BharatCode-ai/browse#desktop-preview" target="_blank" rel="noreferrer">
            Setup guide
          </a>
        </footer>
      </section>
    </main>
  )
}

/** One numbered step on the rail: the number turns into a check once it's done. */
function Step(props: { number: number; title: string; description?: JSX.Element; done?: boolean; children?: JSX.Element }) {
  return (
    <div class="step" data-done={props.done ? "" : undefined}>
      <div class="rail" aria-hidden="true">
        <span class="num">
          <Show when={props.done} fallback={props.number}>
            <Icon name="check" size="small" />
          </Show>
        </span>
        <span class="line" />
      </div>
      <div class="step-body">
        <div class="step-text">
          <h2 class="step-title">{props.title}</h2>
          <Show when={props.description}>
            <p class="step-desc">{props.description}</p>
          </Show>
        </div>
        {props.children}
      </div>
    </div>
  )
}

/** A command or prompt to copy. */
function Command(props: { text: string; label: string }) {
  const [copied, flash] = createFlash("copy", "check")
  return (
    <div class="cmd">
      <div class="cmd-text">
        <code>{props.text}</code>
        <IconButton
          variant="ghost-muted"
          size="small"
          aria-label={props.label}
          icon={<Icon name={copied() === "check" ? "check" : "copy"} size="small" />}
          onClick={() => void navigator.clipboard.writeText(props.text).then(flash)}
        />
      </div>
    </div>
  )
}

function Waiting(props: { children: JSX.Element }) {
  return (
    <p class="waiting" aria-live="polite">
      <span class="pulse" aria-hidden="true" />
      <span>{props.children}</span>
    </p>
  )
}

function AgentDone(props: { relay: Relay; pairedBy: "link" | "code" | undefined }) {
  const state = () => props.relay.state()
  const remote = () => (state()?.relay.remote ? state()?.relay.address : undefined)
  return (
    <>
      {props.pairedBy ? "Paired and connected" : "Connected"}
      <Show when={state()?.browser}>
        {(browser) => (
          <>
            {". This browser is "}
            <span class="kbd">{browser().id}</span>
          </>
        )}
      </Show>
      <Show when={remote()}>{(address) => <>{" on the relay at "}<span class="kbd">{address()}</span></>}</Show>
      .
    </>
  )
}

/** Pairing and recovery controls for the relay on this computer. */
function AgentStep(props: {
  relay: Relay
  step: FirstRunStep
  linkNote: string | undefined
  onPaired: () => void
}) {
  const here = (remote: string | undefined) => (remote ? `the relay at ${remote}` : "the relay on this computer")
  const kind = () => props.step.kind
  const unpacked = () => (props.step.kind === "update-extension" ? props.step.unpacked || chrome.runtime.id === unpackedExtensionId : false)
  const showCode = () => {
    const step = props.step
    return (
      step.kind === "checking" ||
      step.kind === "install" ||
      step.kind === "pair" ||
      (step.kind === "connecting" && step.pairing) ||
      (step.kind === "waiting" && step.pairing === "code")
    )
  }

  return (
    <>
      <Show when={showCode()}>
        <CodeForm relay={props.relay} onPaired={props.onPaired} />
      </Show>

      <Switch>
        <Match when={kind() === "finishing"}>
          <Waiting>Finishing setup from your terminal. Keep install running.</Waiting>
        </Match>
        <Match when={props.step.kind === "pair" && props.step.reason !== "unpaired" && props.step}>
          {(pair) => (
            <Note tone="warn">
              {pair().reason === "code-rejected"
                ? "This code was rejected. It may have expired or already been used. Generate a new one in Desktop."
                : "Desktop no longer recognizes this browser. Generate a fresh pairing code in Desktop."}
            </Note>
          )}
        </Match>
        <Match when={props.step.kind === "waiting" && props.step}>
          {(waiting) =>
            waiting().pairing === "code" ? (
              <Waiting>
                Code saved. Pairing resumes when {here(waiting().remote)} starts, as long as the code is still valid.
              </Waiting>
            ) : (
              <Waiting>Paired with {here(waiting().remote)}. The relay starts when your agent uses the browse tools.</Waiting>
            )
          }
        </Match>
        <Match when={props.step.kind === "connecting" && props.step}>
          {(connecting) => <Waiting>{connecting().pairing ? "Pairing" : "Connecting"} with {here(connecting().remote)}…</Waiting>}
        </Match>
        <Match when={kind() === "update-cli"}>
          <Note tone="warn">This extension needs a newer BharatCode Desktop build. Update Desktop and try again.</Note>
        </Match>
        <Match when={kind() === "update-extension"}>
          <Show
            when={!unpacked()}
            fallback={
              <Note tone="warn">
                <Rich text={unpackedReloadAdvice} />
              </Note>
            }
          >
            <Note tone="warn">
              This extension is older than the browse CLI on this computer. Chrome updates it within a few hours; to update
              now, open the extensions page, turn on Developer mode and click Update.
            </Note>
            <div class="actions">
              <Button variant="neutral" onClick={() => void chrome.tabs.create({ url: "chrome://extensions" })}>
                Open the extensions page
              </Button>
            </div>
          </Show>
        </Match>
        <Match when={kind() === "mismatch"}>
          <Note tone="warn">The extension and relay versions differ. Load the extension folder shown by Desktop, then reconnect.</Note>
          <div class="actions">
            <Button variant="neutral" icon="refresh" onClick={() => props.relay.send({ type: "agents.reconnect" })}>
              Reconnect
            </Button>
          </div>
        </Match>
        <Match when={kind() === "conflict"}>
          <Note tone="warn">
            Another browser or profile is using this connection. Close BharatCode Browse there, then reconnect.
          </Note>
          <div class="actions">
            <Button variant="neutral" icon="refresh" onClick={() => props.relay.send({ type: "agents.reconnect" })}>
              Reconnect
            </Button>
          </div>
        </Match>
      </Switch>

      <Show when={props.linkNote}>{(text) => <Note>{text()}</Note>}</Show>
    </>
  )
}

/** A pairing code for the relay the extension already points at. */
function CodeForm(props: { relay: Relay; onPaired: () => void }) {
  const [code, setCode] = createSignal("")
  const [pending, setPending] = createSignal(false)
  const [note, setNote] = createSignal<string>()
  props.relay.onMessage((message) => {
    if (message === undefined) return setPending(false)
    if (message.type !== "relay.result" || !pending()) return
    setPending(false)
    if (message.status === "connected") props.onPaired()
    if (message.status === "invalid-code") return setNote("Enter the eight characters shown in Desktop. The hyphen is optional.")
    setCode("")
    const address = message.address ?? ""
    setNote(message.status === "connecting" ? `The relay ${address.startsWith("localhost:") ? "on this computer" : `at ${address}`} hasn't answered yet. This updates when it does.` : undefined)
  })
  return (
    <form
      class="code-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (pending() || !code().trim()) return
        setPending(true)
        setNote(undefined)
        props.relay.send({ type: "relay.connect", address: props.relay.state()?.relay.address ?? "", code: code() })
      }}
    >
      <label for="pairing-code" class="step-title">Pairing code</label>
      <div class="inline-form">
        <TextInput
          id="pairing-code"
          value={code()}
          onInput={(event) => setCode(event.currentTarget.value)}
          placeholder="XXXX-XXXX"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck={false}
          appearance="large"
        />
        <Button type="submit" variant="contrast" size="large" disabled={pending() || !code().trim()}>
          {pending() ? "Pairing…" : "Pair"}
        </Button>
      </div>
      <Show when={note()}>
        {(text) => <div role="status"><Note tone="warn">{text()}</Note></div>}
      </Show>
    </form>
  )
}

// Only remove this install-created code tab, after success, if the original first-run tab still exists in its window.
async function returnToFirstRunTab() {
  const self = await chrome.tabs.getCurrent()
  if (self?.id === undefined) return
  const firstRun = new Set(["onboarding.html?first-run", "welcome.html?first-run"].map((page) => chrome.runtime.getURL(page)))
  const original = (await chrome.tabs.query({ windowId: self.windowId })).find((tab) => tab.url !== undefined && firstRun.has(tab.url))
  if (original?.id === undefined || original.id === self.id) return
  if (self.active) await chrome.tabs.update(original.id, { active: true })
  await chrome.tabs.remove(self.id)
}

applyColorScheme()
render(() => <Onboarding />, document.getElementById("root")!)
