import { chromium } from "@playwright/test";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const posts = [];
p.on("response", async (r) => { if (r.request().method() === "POST" && /checkins/.test(r.url())) posts.push({ s: r.status(), u: r.url().slice(-70) }); });
await p.goto("http://localhost:3300/login", { waitUntil: "networkidle" });
await p.locator('input[type="email"], input[name="email"]').first().fill("p597-coach@vari8.test");
await p.locator('input[type="password"]').first().fill("p597-coach-pass-4d8e1b");
await Promise.all([p.waitForURL(/\/coach/, { timeout: 25000 }).catch(() => null), p.locator('button[type="submit"]').first().click()]);
await p.waitForTimeout(3000);
// open Emma's client settings — client card → settings
await p.evaluate(() => { const x=[...document.querySelectorAll("button, a")].find((e) => /clients/i.test(e.textContent || "")); if (x) x.click(); });
await p.waitForTimeout(1500);
await p.evaluate(() => { const x=[...document.querySelectorAll("button")].find((e) => /emma/i.test(e.textContent||"") && /settings|⋯|⚙|view/i.test(e.textContent||e.getAttribute("aria-label")||"")); if (x) x.click(); });
await p.waitForTimeout(1500);
const opened = await p.evaluate(() => ({ dialog: document.body.innerText.includes("Recurring check-in"), text: document.body.innerText.match(/Recurring check-in[\s\S]{0,200}/)?.[0] }));
console.log("settings:", JSON.stringify(opened).slice(0, 300));
await p.screenshot({ path: "/private/tmp/p561-shots/p597-settings.png" });
// toggle Wed on + Mon off
await p.evaluate(() => { const x=[...document.querySelectorAll(".cd-weekdays button")].find((e) => /wed/i.test(e.textContent||"")); if (x) x.click(); });
await p.waitForTimeout(4000);
await p.evaluate(() => { const x=[...document.querySelectorAll(".cd-weekdays button")].find((e) => /mon/i.test(e.textContent||"")); if (x) x.click(); });
await p.waitForTimeout(4000);
console.log("posts:", JSON.stringify(posts));
const st = await p.evaluate(() => ({ err: document.querySelector('[role=alert]')?.textContent ?? null, toast: document.body.innerText.match(/recurring schedule updated|generated[^\n]*/gi)?.slice(0, 4) }));
console.log("state:", JSON.stringify(st));
await b.close();
