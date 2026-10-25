#!/usr/bin/env node
// E2E TLS terminator — the https side of the canonical flow-spec
// environment (issue #197). Browsers hit https://127.0.0.1:$PORT;
// this process forwards to the `next start` http backend. It exists so
// the app under test sees a real configured https origin end to end —
// no security-check exemption, no fictional https with an http browser.
//
// The self-signed certificate is generated fresh per run into a
// mkdtemp dir and removed on exit: disposable, local-only, uncommitted.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";

const port = Number(process.env.PLAYWRIGHT_TLS_PORT);
const target = process.env.PLAYWRIGHT_TLS_TARGET ?? "";
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("e2e tls-proxy: PLAYWRIGHT_TLS_PORT must be a TCP port");
  process.exit(1);
}
const targetMatch = /^http:\/\/127\.0\.0\.1:(\d+)$/.exec(target);
if (!targetMatch) {
  console.error(
    "e2e tls-proxy: PLAYWRIGHT_TLS_TARGET must be http://127.0.0.1:<port>",
  );
  process.exit(1);
}
const targetPort = Number(targetMatch[1]);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vari8-e2e-tls-"));
// Register cleanup before anything that can fail — an openssl spawn
// failure must still remove the temp dir.
const cleanup = () => fs.rmSync(dir, { recursive: true, force: true });
process.on("exit", cleanup);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(0));

const keyPath = path.join(dir, "key.pem");
const certPath = path.join(dir, "cert.pem");
execFileSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    keyPath,
    "-out",
    certPath,
    "-days",
    "1",
    "-subj",
    "/CN=127.0.0.1",
    "-addext",
    "subjectAltName=IP:127.0.0.1",
  ],
  { stdio: "ignore" },
);

// The key/cert are only needed to construct the server — hold them in
// memory and delete the dir immediately, so even a hard kill (Playwright
// SIGKILLs webServers) leaves no material on disk.
const credentials = {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath),
};
cleanup();

https
  .createServer(credentials, (req, res) => {
    const upstream = http.request(
      {
        host: "127.0.0.1",
        port: targetPort,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502).end("e2e tls-proxy: upstream unreachable");
    });
    req.pipe(upstream);
  })
  .listen(port, "127.0.0.1");
