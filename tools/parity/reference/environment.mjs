import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { fileHash } from "./reference.mjs";
const require = createRequire(import.meta.url);
export async function environment() {
  const browser = await chromium.launch({ args: ["--disable-partial-raster"] });
  try {
    const c = await browser.newBrowserCDPSession();
    const version = await c.send("Browser.getVersion");
    const system = await c.send("SystemInfo.getInfo");
    const commands = [];
    for (const pid of execFileSync("pgrep", ["-P", String(process.pid)], {
      encoding: "utf8",
    })
      .trim()
      .split(/\s+/)) {
      try {
        const line = execFileSync("ps", ["-p", pid, "-o", "command="], {
          encoding: "utf8",
        }).trim();
        if (
          line.includes("playwright") &&
          line.includes("--remote-debugging-pipe")
        )
          commands.push(line);
      } catch {}
    }
    const command = commands[0];
    if (!command) throw new Error("browser executable identity unavailable");
    const executable = command.split(" --")[0];
    if (!fs.existsSync(executable))
      throw new Error("browser executable path unavailable");
    return {
      os: {
        type: os.type(),
        release: os.release(),
        arch: os.arch(),
        version: execFileSync("sw_vers", { encoding: "utf8" }),
      },
      node: process.version,
      nodeExecutable: process.execPath,
      nodeSha256: fileHash(process.execPath),
      playwright: require("@playwright/test/package.json").version,
      browser: {
        executable,
        sha256: fileHash(executable),
        version,
        command,
        system,
      },
      capture: {
        deviceScaleFactor: 1,
        locale: "en-US",
        colorScheme: "light",
        reducedMotion: "reduce",
        serviceWorkers: "block",
        fullPage: true,
        animations: "disabled",
        caret: "hide",
        launchArgs: ["--disable-partial-raster"],
        storageSeed: {},
        randomSeed: "0x2545f491",
        settle: "networkidle; fonts.ready; DOM quiet 400ms / 3000ms cap",
      },
    };
  } finally {
    await browser.close();
  }
}
export function fonts(app) {
  return fs
    .readdirSync(path.join(app, "public/fonts"))
    .sort()
    .map((name) => ({
      path: "public/fonts/" + name,
      sha256: fileHash(path.join(app, "public/fonts", name)),
    }));
}
