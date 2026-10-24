import http from "node:http";
import https from "node:https";

import { ConfigError } from "./compare.mjs";

export class ParityRefuse extends Error {}

export function parityPortPair(raw) {
  if (!/^\d+$/.test(raw ?? "") || Number(raw) < 1 || Number(raw) > 65534)
    throw new ConfigError(
      `PARITY_PORT="${raw}" must name the public HTTPS port and leave <port+1> free for the backend (1-65534)`,
    );
  const publicPort = Number(raw);
  return { publicPort, backendPort: publicPort + 1 };
}

export async function selectPortPair(pinned, bind) {
  if (pinned !== null) {
    const pair = parityPortPair(String(pinned));
    for (const port of [pair.publicPort, pair.backendPort])
      if (
        !(await bind(port).then(
          () => true,
          () => false,
        ))
      )
        throw new ParityRefuse(
          `port ${port} is in use; PARITY_PORT must leave the HTTPS port and <port+1> backend free. Nothing was compared.`,
        );
    return pair;
  }
  for (let i = 0; i < 100; i++) {
    const publicPort = await bind(0);
    const backendPort = await bind(0);
    if (publicPort !== backendPort) return { publicPort, backendPort };
  }
  throw new ParityRefuse(
    "could not reserve a distinct local HTTPS/backend port pair",
  );
}

export function parityUrl(raw, rootApp) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError(`PARITY_URL="${raw}" is not a valid URL`);
  }
  if (rootApp && url.protocol !== "https:")
    throw new ConfigError(
      `PARITY_URL="${raw}" must use an https: origin for the production root app`,
    );
  return url.origin;
}

/**
 * @param {string} rawUrl
 * @param {{ca?: Buffer | string | null, method?: string, headers?: Record<string, string>, body?: string | null}} [options]
 */
export function httpsRequest(
  rawUrl,
  { ca = null, method = "GET", headers = {}, body = null } = {},
) {
  const url = new URL(rawUrl);
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = transport.request(
      url,
      {
        ca: ca ?? undefined,
        method,
        headers,
        rejectUnauthorized: Boolean(ca) || undefined,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            setCookie: res.headers["set-cookie"] ?? [],
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    if (body !== null) req.write(body);
    req.end();
  });
}

export function browserCookies(setCookieLines, baseUrl) {
  const domain = new URL(baseUrl).hostname;
  return setCookieLines.map((line) => {
    const [pair, ...attrs] = line.split(";");
    const i = pair.indexOf("=");
    const values = Object.fromEntries(
      attrs.map((attr) => {
        const j = attr.indexOf("=");
        return j === -1
          ? [attr.trim().toLowerCase(), true]
          : [attr.slice(0, j).trim().toLowerCase(), attr.slice(j + 1).trim()];
      }),
    );
    return {
      name: pair.slice(0, i).trim(),
      value: pair.slice(i + 1).trim(),
      domain,
      path: values.path ?? "/",
      httpOnly: values.httponly === true,
      secure: values.secure === true,
      sameSite: values.samesite ?? "Lax",
    };
  });
}
