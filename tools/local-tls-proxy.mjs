import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";

const LOOPBACK_TARGET = /^http:\/\/127\.0\.0\.1:(\d+)$/;

function parseTarget(target) {
  const match = LOOPBACK_TARGET.exec(target ?? "");
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 65535)
    throw new Error("local TLS proxy target must be http://127.0.0.1:<port>");
  return Number(match[1]);
}

export async function createLocalTlsProxy({ port, target }) {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("local TLS proxy port must be a TCP port");
  const targetPort = parseTarget(target);
  const materialDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "vari8-local-tls-"),
  );
  let credentials;
  try {
    const keyPath = path.join(materialDir, "key.pem");
    const certPath = path.join(materialDir, "cert.pem");
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
    credentials = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
  } finally {
    fs.rmSync(materialDir, { recursive: true, force: true });
  }

  const server = https.createServer(credentials, (req, res) => {
    const upstream = http.request(
      {
        host: "127.0.0.1",
        port: targetPort,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          "x-forwarded-proto": "https",
          "x-forwarded-port": String(port),
        },
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end("local tls-proxy: upstream unreachable");
    });
    req.pipe(upstream);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const actualPort = server.address().port;
  return {
    server,
    cert: credentials.cert,
    materialDir,
    port: actualPort,
    url: `https://127.0.0.1:${actualPort}`,
    close: async () => {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
