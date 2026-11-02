#!/usr/bin/env node
// E2E TLS terminator — the https side of the canonical flow-spec
// environment (issue #197). Browsers hit https://127.0.0.1:$PORT;
// this process forwards to the `next start` http backend. It exists so
// the app under test sees a real configured https origin end to end —
// no security-check exemption, no fictional https with an http browser.
//
// The self-signed certificate is generated fresh per run into a
// mkdtemp dir and removed immediately after the credentials are in
// memory: disposable, local-only, uncommitted.

import { createLocalTlsProxy } from "../../tools/local-tls-proxy.mjs";

const port = Number(process.env.PLAYWRIGHT_TLS_PORT);
const target = process.env.PLAYWRIGHT_TLS_TARGET ?? "";
try {
  await createLocalTlsProxy({ port, target });
} catch (error) {
  console.error(`e2e tls-proxy: ${error.message}`);
  process.exit(1);
}
