/**
 * P694 — authenticated served replay of the voice flow both directions.
 * Synthetic fake-mic capture (labeled) for the recorder path; a known
 * spoken sample (jfk.wav) for transcript-content evidence.
 * External-request watch: every model/audio/worker fetch must be
 * same-origin — anything else fails the run.
 */
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { e2eDatabaseUrl, E2E } from "./global-setup";
import path from "node:path";

const WAV = path.join(__dirname, "..", "..", "_evidence", "jfk.wav");
const SHOTS = path.join(__dirname, "..", "..", "_evidence");
const external: string[] = [];

function watch(page: Page) {
  page.on("request", (req) => {
    // blob:/data: URLs wrap the same origin — not external requests.
    if (req.url().startsWith("blob:") || req.url().startsWith("data:")) return;
    const u = new URL(req.url());
    if (!u.hostname.match(/localhost|127\.0\.0\.1/)) external.push(req.url());
  });
  page.on("response", async (res) => {
    if (res.status() >= 400)
      console.log(
        `FAIL ${res.status()} ${res.url()} ::`,
        (await res.text().catch(() => "")).slice(0, 300),
      );
  });
}

test.use({
  permissions: ["microphone"],
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});
test.setTimeout(300_000);

async function login(page: Page, base: string, email: string) {
  await page.goto(`${base}/login`);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(E2E.password);
  await page.locator('button[type="submit"], form button').first().click();
  await page.waitForURL((u) => !u.pathname.includes("login"), {
    timeout: 20_000,
  });
}

async function recordTake(page: Page) {
  await page.getByRole("button", { name: "Record voice note" }).click();
  await page.waitForTimeout(2500); // synthetic fake-mic capture
  await page.getByRole("button", { name: "Stop & preview" }).click();
  await page.getByRole("button", { name: /Attach voice note/ }).click();
}

test.beforeAll(async () => {
  const prisma = new PrismaClient({
    datasources: { db: { url: e2eDatabaseUrl() } },
  });
  try {
    const ws = await prisma.workspace.findUnique({
      where: { slug: E2E.workspaceSlug },
    });
    const user = await prisma.user.findUnique({ where: { email: E2E.client } });
    if (!ws || !user) throw new Error("e2e seed missing");
    const existing = await prisma.clientProfile.findFirst({
      where: { workspaceId: ws.id, userId: user.id },
    });
    if (!existing)
      await prisma.clientProfile.create({
        data: { workspaceId: ws.id, userId: user.id, name: "E2E Client" },
      });
    else
      await prisma.clientProfile.update({
        where: { id: existing.id },
        data: { name: "E2E Client" },
      });
  } finally {
    await prisma.$disconnect();
  }
});

test("voice note replay: client → coach → client", async ({ browser }) => {
  // ---------- client sends voice + known speech file ----------
  const clientCtx = await browser.newContext();
  const client = await clientCtx.newPage();
  watch(client);
  await login(client, "/me", E2E.client);
  await client.goto("/me");
  await client
    .getByRole("button", { name: /Messages/i })
    .first()
    .click()
    .catch(() => {});
  const micBtn = client.getByRole("button", { name: "Record a voice note" });
  await micBtn.waitFor({ timeout: 20_000 });
  await micBtn.click();
  await recordTake(client);
  // one-recording guard: mic disabled once the take chip is staged
  await client
    .getByText(/voice-note/i)
    .first()
    .waitFor({ timeout: 30_000 });
  await expect(micBtn).toBeDisabled();
  await client.locator('input[type="file"]').first().setInputFiles(WAV);
  await client.waitForTimeout(500);
  await client.getByRole("button", { name: "Send", exact: true }).click();
  await client.waitForTimeout(1500);
  await client.screenshot({ path: `${SHOTS}/p694-client-sent.png` });

  // ---------- coach opens the real client's thread ----------
  const coachCtx = await browser.newContext();
  const coach = await coachCtx.newPage();
  watch(coach);
  await login(coach, "", E2E.coach);
  await coach.goto("/coach");
  await coach
    .getByRole("button", { name: /Messages/i })
    .first()
    .click()
    .catch(() => {});
  await coach.getByText("E2E Client").first().click();
  await coach.waitForSelector("audio", { timeout: 20_000 });
  // play the sent audio
  await coach
    .locator("audio")
    .first()
    .evaluate((a: HTMLAudioElement) => a.play().catch(() => {}));
  await coach.screenshot({ path: `${SHOTS}/p694-coach-thread.png` });
  // View transcript on the known speech file
  const cards = coach.locator("div.cd-media-card", { hasText: "jfk" });
  await cards
    .getByRole("button", { name: /transcript/i })
    .first()
    .click();
  await coach.getByText(/fellow Americans/i).waitFor({ timeout: 180_000 });
  await coach.screenshot({ path: `${SHOTS}/p694-coach-transcript.png` });
  // coach replies with a voice note (fake-mic, synthetic)
  await coach.getByRole("button", { name: "Voice note" }).click();
  await recordTake(coach);
  await coach.getByRole("button", { name: "Send message" }).click();
  await coach.waitForTimeout(1500);
  await coach.screenshot({ path: `${SHOTS}/p694-coach-reply.png` });

  // ---------- client reloads: playback + transcript ----------
  await client.reload();
  await client
    .getByRole("button", { name: /Messages/i })
    .first()
    .click()
    .catch(() => {});
  await client.waitForSelector("audio", { timeout: 20_000 });
  const replyCard = client
    .locator("div.cd-media-card", { hasText: "voice" })
    .last();
  await replyCard
    .locator("audio")
    .evaluate((a: HTMLAudioElement) => a.play().catch(() => {}));
  await replyCard.getByRole("button", { name: /transcript/i }).click();
  await client.getByText(/Auto-transcript/i).waitFor({ timeout: 180_000 });
  await client.screenshot({ path: `${SHOTS}/p694-client-transcript.png` });

  expect(external, `external requests: ${external.join("\n")}`).toEqual([]);
  await clientCtx.close();
  await coachCtx.close();
});
