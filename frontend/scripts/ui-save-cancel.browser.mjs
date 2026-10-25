// Durable browser regression for save/cancel dirty-state baselines.
// Manual check — intentionally not part of Node test/check discovery.
//
//   UI_BASE_URL=http://127.0.0.1:3010 node frontend/scripts/ui-save-cancel.browser.mjs
//
// Requires Chrome already running with --remote-debugging-port (CHROME_DEBUG_URL,
// default http://127.0.0.1:9222). Creates a fresh isolated browser context so the
// owner's storage is never read or cleared; only that context is disposed.
// Exit 0 = both regressions pass; exit 1 = failure details on stderr.

const UI_BASE_URL = process.env.UI_BASE_URL;
const CHROME_DEBUG_URL =
  process.env.CHROME_DEBUG_URL ?? "http://127.0.0.1:9222";
const STORE_KEY = "coach-desktop-mockup-v1";
const POLL_MS = 5000;

if (
  !UI_BASE_URL ||
  !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(UI_BASE_URL)
) {
  console.error(
    "UI_BASE_URL must be an explicit local URL, e.g. http://127.0.0.1:3010",
  );
  process.exit(2);
}
const APP = UI_BASE_URL.replace(/\/$/, "");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(new Error(`ws connect failed: ${url}`));
  });
}

function makeSession(ws) {
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method === "Page.javascriptDialogOpening") {
      ws.send(
        JSON.stringify({
          id: ++id,
          method: "Page.handleJavaScriptDialog",
          params: { accept: true },
          sessionId: msg.sessionId,
        }),
      );
    }
  };
  const send = (method, params = {}, sessionId) =>
    Promise.race([
      new Promise((resolve, reject) => {
        const call = ++id;
        pending.set(call, (m) =>
          m.error
            ? reject(new Error(`${method}: ${m.error.message}`))
            : resolve(m),
        );
        ws.send(
          JSON.stringify({
            id: call,
            method,
            params,
            ...(sessionId ? { sessionId } : {}),
          }),
        );
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`timeout ${method}`)), 30000),
      ),
    ]);
  return send;
}

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${pass ? "" : `  ${detail}`}`);
};

const version = await (await fetch(`${CHROME_DEBUG_URL}/json/version`)).json();
const browser = await connect(version.webSocketDebuggerUrl);
const bsend = makeSession(browser);

const { browserContextId } = (
  await bsend("Target.createBrowserContext", { disposeOnDetach: true })
).result;
const { targetId } = (
  await bsend("Target.createTarget", { url: "about:blank", browserContextId })
).result;
const { sessionId } = (
  await bsend("Target.attachToTarget", { targetId, flatten: true })
).result;

let failed = false;
try {
  const send = (method, params = {}) => bsend(method, params, sessionId);
  const ev = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.result?.exceptionDetails)
      throw new Error(
        `${JSON.stringify(r.result.exceptionDetails).slice(0, 400)} :: ${expression.slice(0, 140)}`,
      );
    return r.result?.result?.value;
  };
  await send("Page.enable");
  await send("Runtime.enable");

  // Waits up to POLL_MS for a page predicate; throws when it never appears.
  const until = async (expression, label) => {
    const deadline = Date.now() + POLL_MS;
    while (Date.now() < deadline) {
      if (await ev(expression).catch(() => false)) return;
      await sleep(200);
    }
    throw new Error(`timeout waiting for ${label}`);
  };
  const go = async (url, label) => {
    await send("Page.navigate", { url });
    await until(`document.readyState === "complete"`, `${label} load`);
    await sleep(700);
  };
  // Trusted click: locate by page query (throws when missing), click its centre.
  const click = async (expr, label) => {
    const rect = await ev(`(() => {
      const el = ${expr};
      if (!el) return null;
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (!rect) throw new Error(`missing control: ${label}`);
    for (const type of ["mousePressed", "mouseReleased"])
      await send("Input.dispatchMouseEvent", {
        type,
        x: rect.x,
        y: rect.y,
        button: "left",
        clickCount: 1,
      });
    await sleep(200);
  };
  const BTN = (text) =>
    `[...document.querySelectorAll("button")].find((b) => b.innerText.trim() === ${JSON.stringify(text)})`;
  const FIELD_INPUT = (label) =>
    `[...document.querySelectorAll(".v8-field")].find((f) => f.querySelector("label")?.innerText.trim().startsWith(${JSON.stringify(label)}))?.querySelector("input")`;
  const OPTION = (text) =>
    `[...document.querySelectorAll(".v8-select-popup .v8-select-option")].find((o) => o.innerText.includes(${JSON.stringify(text)}))`;
  const typeInto = async (label, text) => {
    await click(FIELD_INPUT(label), `field ${label}`);
    await ev(
      `(() => { const i = ${FIELD_INPUT(label)}; i.select(); return true; })()`,
    );
    await send("Input.insertText", { text });
    await sleep(300);
  };
  const disabled = (text) =>
    ev(
      `(() => { const b = ${BTN(text)}; if (!b) return null; return b.disabled; })()`,
    );
  const state = () =>
    ev(
      `(() => JSON.parse(localStorage.getItem(${JSON.stringify(STORE_KEY)})))()`,
    );
  const client = async () =>
    (await state())?.clients?.find((c) => c.id === "client-001");

  // ---------- scenario 1: supplements save/cancel baseline ----------
  await go(
    `${APP}/coach?section=clients&client=client-001&tab=Plans&plan=supplements`,
    "supplements editor",
  );
  await until(`(() => ${BTN("Add supplement")})() !== null`, "Add supplement");
  await click(BTN("Add supplement"), "Add supplement");
  await typeInto("Brand", "ESN");
  await click(OPTION("ESN"), "ESN option");
  await sleep(400);
  await typeInto("Product", "Vitamin D3");
  await click(OPTION("Vitamin D3+K2"), "D3+K2 option");
  await sleep(400);
  await typeInto("Quantity", "2.0");
  await typeInto("Timing", "with breakfast ");
  await click(BTN("Save plan"), "Save plan");
  await until(
    `(() => { const s = ${"JSON"}; return JSON.parse(localStorage.getItem(${JSON.stringify(STORE_KEY)}))?.clients?.find((c) => c.id === "client-001")?.plans?.supplements?.items?.length > 0; })()`,
    "saved supplement plan",
  );
  await typeInto("Notes", "morning");
  await click(BTN("Cancel"), "Cancel");
  await sleep(500);
  const s1 = {
    save: await disabled("Save plan"),
    cancel: await disabled("Cancel"),
  };
  check(
    "S1 Save/Cancel disabled after Cancel restores saved baseline",
    s1.save === true && s1.cancel === true,
    JSON.stringify(s1),
  );
  await click(
    `[...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "Back")`,
    "Back",
  );
  await sleep(900);
  const leave = await ev(`(() => ({
    guard: !!document.querySelector("dialog[open]"),
    away: !location.search.includes("plan=supplements"),
    url: location.search.slice(0, 90),
  }))()`);
  check(
    "S1 Back navigates away with no unsaved-changes guard",
    leave.away && !leave.guard,
    JSON.stringify(leave),
  );

  // ---------- scenario 2: empty phase plan save baseline ----------
  await go(
    `${APP}/coach?section=clients&client=client-001&tab=Plans`,
    "client plans",
  );
  await until(
    `(() => ${BTN("Save phase plan")})() !== null`,
    "Save phase plan",
  );
  await click(BTN("Save phase plan"), "Save phase plan");
  await until(
    `(() => { const c = ${"JSON"}; return !!JSON.parse(localStorage.getItem(${JSON.stringify(STORE_KEY)}))?.clients?.find((x) => x.id === "client-001")?.phasePlan; })()`,
    "saved phase plan",
  );
  // remove every phase row via its labelled remove control (trusted clicks)
  const REMOVE_BTN = `[...document.querySelectorAll(".cd-phase-plan-editor button")].find((x) => (x.getAttribute("aria-label") ?? "").startsWith("Remove "))`;
  for (let i = 0; i < 10; i++) {
    const has = await ev(`(() => !!(${REMOVE_BTN}))()`);
    if (!has) break;
    await click(REMOVE_BTN, "Remove phase");
    await sleep(300);
  }
  const rowsLeft = await ev(
    `(() => [...document.querySelectorAll(".cd-phase-plan-editor button")].filter((x) => (x.getAttribute("aria-label") ?? "").startsWith("Remove ")).length)()`,
  );
  if (rowsLeft !== 0)
    throw new Error(`phase rows remain after removal: ${rowsLeft}`);
  await click(BTN("Save phase plan"), "Save phase plan");
  await sleep(800);
  const after = await client();
  const s2 = {
    disabled: await disabled("Save phase plan"),
    phasePlan:
      after?.phasePlan === undefined ? "absent" : typeof after?.phasePlan,
  };
  check(
    "S2 Save disabled + client.phasePlan absent after saving empty phases",
    s2.disabled === true && s2.phasePlan === "absent",
    JSON.stringify(s2),
  );
} catch (error) {
  failed = true;
  console.error("ERROR", error.message ?? error);
} finally {
  await bsend("Target.disposeBrowserContext", { browserContextId }).catch(
    () => {},
  );
  browser.close();
}
failed ||= results.some((r) => !r.pass);
console.log(
  results.every((r) => r.pass) && !failed ? "ALL PASS" : "FAILURES PRESENT",
);
process.exit(failed ? 1 : 0);
