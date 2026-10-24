import fs from "node:fs";
import http from "node:http";
import { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { createLocalTlsProxy } from "../../tools/local-tls-proxy.mjs";
import {
  browserCookies,
  httpsRequest,
  parityPortPair,
  parityUrl,
  selectPortPair,
} from "../../tools/parity/local-https.mjs";

let proxy: Awaited<ReturnType<typeof createLocalTlsProxy>> | null = null;
let backend: http.Server | null = null;

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = http.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const port = (probe.address() as AddressInfo).port;
      probe.close(() => resolve(port));
    });
  });

afterEach(async () => {
  await proxy?.close().catch(() => {});
  await new Promise<void>(
    (resolve) => backend?.close(() => resolve()) ?? resolve(),
  );
  proxy = null;
  backend = null;
});

describe("local TLS proxy", () => {
  it("terminates loopback HTTPS and forwards to the backend", async () => {
    const backendPort = await freePort();
    backend = http.createServer((req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(
        `${req.headers["x-forwarded-proto"]}:${req.headers.host}:${req.url}`,
      );
    });
    await new Promise<void>((resolve) =>
      backend!.listen(backendPort, "127.0.0.1", resolve),
    );

    const proxyPort = await freePort();
    proxy = await createLocalTlsProxy({
      port: proxyPort,
      target: `http://127.0.0.1:${backendPort}`,
    });

    const res = await httpsRequest(`${proxy.url}/coach?x=1`, {
      ca: proxy.cert,
    });
    expect(res.status).toBe(200);
    expect(res.body).toBe(`https:127.0.0.1:${proxyPort}:/coach?x=1`);
    expect(fs.existsSync(proxy.materialDir)).toBe(false);
  });

  it("refuses a non-loopback HTTP backend", async () => {
    await expect(
      createLocalTlsProxy({
        port: await freePort(),
        target: "http://example.com:8080",
      }),
    ).rejects.toThrow("http://127.0.0.1");
  });
});

describe("parity HTTPS origin configuration", () => {
  it("requires a free second port for the backend pair", () => {
    expect(parityPortPair("55880")).toEqual({
      publicPort: 55880,
      backendPort: 55881,
    });
    for (const raw of ["", "abc", "0", "65535", "65536"])
      expect(() => parityPortPair(raw)).toThrow("PARITY_PORT");
  });

  it("refuses an occupied pinned backend port", async () => {
    const bind = async (port: number) => {
      if (port === 55881) throw new Error("address in use");
      return port;
    };
    await expect(selectPortPair(55880, bind)).rejects.toThrow(
      "port 55881 is in use",
    );
  });

  it("keeps allocating until the public and backend ports are distinct", async () => {
    const allocations = [55880, 55880, 55890, 55891];
    let calls = 0;
    const bind = async () => allocations[calls++];
    await expect(selectPortPair(null, bind)).resolves.toEqual({
      publicPort: 55890,
      backendPort: 55891,
    });
    expect(calls).toBe(4);
  });

  it("requires the external root-app URL to be HTTPS", () => {
    expect(() => parityUrl("not-a-url", true)).toThrow("PARITY_URL");
    expect(() => parityUrl("http://127.0.0.1:3000", true)).toThrow("https");
    expect(parityUrl("https://127.0.0.1:3000", true)).toBe(
      "https://127.0.0.1:3000",
    );
    expect(parityUrl("http://127.0.0.1:3000", false)).toBe(
      "http://127.0.0.1:3000",
    );
  });

  it("preserves Secure and SameSite cookie semantics for browser contexts", () => {
    const cookies = browserCookies(
      [
        "better-auth.session_token=abc; Path=/; HttpOnly; Secure; SameSite=Lax",
        "other=value; Path=/; SameSite=Strict",
      ],
      "https://127.0.0.1:55880",
    );
    expect(cookies).toMatchObject([
      {
        name: "better-auth.session_token",
        value: "abc",
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
      {
        name: "other",
        value: "value",
        secure: false,
        sameSite: "Strict",
      },
    ]);
  });
});
