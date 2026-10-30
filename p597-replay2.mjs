import { chromium } from "@playwright/test";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const posts = [];
p.on("response", async (r) => { if (r.request().method() === "POST" && /checkins/.test(r.url())) posts.push({ s: r.status(), u: r.url().slice(-80) }); });
await p.goto("http://localhost:3300/login", { waitUntil: "networkidle" });
await p.locator('input[type="email"], input[name="email"]').first().fill("p597-coach@vari8.test");
await p.locator('input[type="password"]').first().fill("p597-coach-pass-4d8e1b");
await Promise.all([p.waitForURL(/\/coach/, { timeout: 25000 }).catch(() => null), p.locator('button[type="submit"]').first().click()]);
await p.waitForTimeout(3000);
await p.evaluate(() => { const x=[...document.querySelectorAll("button, a")].find((e) => /clients/i.test(e.textContent || "")); if (x) x.click(); });
await p.waitForTimeout(1500);
// open Emma's overview
await p.evaluate(() => { const x=[...document.querySelectorAll("button, a, [role=button]")].find((e) => /emma anders/i.test(e.textContent||"")); if (x) x.click(); });
await p.waitForTimeout(2000);
const hasSettings = await p.locator('button[aria-label="Client settings"]').count();
console.log("settings btn:", hasSettings);
if (hasSettings) {
  await p.locator('button[aria-label="Client settings"]').first().click();
  await p.waitForTimeout(1800);
  console.log("dialog:", await p.evaluate(() => document.body.innerText.includes("Recurring check-in")));
  // Wed on, Mon off
  await p.evaluate(() => { const x=[...document.querySelectorAll(".cd-weekdays button")].find((e) => /^we/i.test((e.textContent||"").trim())); if (x) x.click(); });
  await p.waitForTimeout(4500);
  await p.evaluate(() => { const x=[...document.querySelectorAll(".cd-weekdays button")].find((e) => /^mo/i.test((e.textContent||"").trim())); if (x) x.click(); });
  await p.waitForTimeout(4500);
}
console.log("posts:", JSON.stringify(posts));
const st = await p.evaluate(() => ({ err: document.querySelector('[role=alert]')?.textContent ?? null, days: document.body.innerText.match(/from tomorrow[^\n]*/gi)?.slice(0, 2) }));
console.log("state:", JSON.stringify(st));
await p.screenshot({ path: "/private/tmp/p561-shots/p597-replay.png" });
await b.close();
