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

const WAV = path.join(__dirname, "fixtures", "jfk.wav");
const FIXTURE_SHA256 =
  "59dfb9a4acb36fe2a2affc14bacbee2920ff435cb13cc314a08c13f66ba7860e";
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
      // Deterministic SYNTHETIC capture: the fake device reads the
      // committed wav as its input — all three flags required together.
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-audio-capture=${WAV}`,
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
  await page.waitForTimeout(2500); // synthetic file-backed capture
  await page.getByRole("button", { name: "Stop & preview" }).click();
  await page.getByRole("button", { name: /Attach voice note/ }).click();
}

test.beforeAll(async () => {
  const { createHash } = await import("node:crypto");
  const { readFileSync } = await import("node:fs");
  expect(createHash("sha256").update(readFileSync(WAV)).digest("hex")).toBe(
    FIXTURE_SHA256,
  );
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
  const sentIds: { messageId?: string; media: string[] } = { media: [] };
  client.on("response", async (res) => {
    if (res.request().method() !== "POST" || !res.url().includes("/messages"))
      return;
    const body = (await res.json().catch(() => null)) as {
      message?: { id?: string; attachments?: { mediaObjectId?: string }[] };
    } | null;
    if (body?.message?.id) {
      sentIds.messageId = body.message.id;
      for (const a of body.message.attachments ?? [])
        if (a.mediaObjectId) sentIds.media.push(a.mediaObjectId);
      console.log("SENT message", sentIds.messageId, sentIds.media.join(","));
    }
  });
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
  const coachMints = new Set<string>();
  coach.on("request", (req) => {
    const m = /\/api\/v1\/media\/[^/]+\/([0-9a-f-]{36})/.exec(req.url());
    if (m) coachMints.add(m[1]);
  });
  await login(coach, "", E2E.coach);
  await coach.goto("/coach");
  await coach
    .getByRole("button", { name: /Messages/i })
    .first()
    .click()
    .catch(() => {});
  await coach.getByText("E2E Client").first().click();
  await coach.waitForSelector("audio", { timeout: 20_000 });
  // ID-bound: the coach card must mint the EXACT media_object ids the
  // send returned — not merely a same-named file.
  expect(sentIds.messageId).toBeTruthy();
  expect(sentIds.media.length).toBeGreaterThanOrEqual(2);
  // Mint URLs fire during thread render — assert the exact ids were
  // requested, not merely same-named attachments.
  for (const id of sentIds.media) {
    await coach
      .waitForResponse((res) => res.url().includes(id), { timeout: 20_000 })
      .catch(() => {});
    expect(coachMints, `missing mint for ${id}`).toContain(id);
  }
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
  // coach replies with a voice note (fake-mic, synthetic) — capture the
  // exact reply message/media ids for the client-side assertions.
  const replyIds: { messageId?: string; media: string[] } = { media: [] };
  coach.on("response", async (res) => {
    if (
      res.request().method() !== "POST" ||
      !res.url().includes("/conversations/")
    )
      return;
    const body = (await res.json().catch(() => null)) as {
      message?: { id?: string; attachments?: { mediaObjectId?: string }[] };
    } | null;
    if (body?.message?.id) {
      replyIds.messageId = body.message.id;
      for (const a of body.message.attachments ?? [])
        if (a.mediaObjectId) replyIds.media.push(a.mediaObjectId);
      console.log(
        "REPLY message",
        replyIds.messageId,
        replyIds.media.join(","),
      );
    }
  });
  await coach.getByRole("button", { name: "Voice note" }).click();
  await recordTake(coach);
  await coach.getByRole("button", { name: "Send message" }).click();
  await coach.waitForTimeout(1500);
  expect(replyIds.media.length).toBeGreaterThanOrEqual(1);
  await coach.waitForTimeout(1500);
  await coach.screenshot({ path: `${SHOTS}/p694-coach-reply.png` });

  // ---------- client reloads: playback + transcript ----------
  // ID-bound: the reply's exact media id must mint on the client, and the
  // transcript runs inside that specific card — not a generic voice match.
  const replyId = replyIds.media[0]!;
  const clientMints = new Set<string>();
  client.on("request", (req) => {
    const m = /\/api\/v1\/media\/[^/]+\/([0-9a-f-]{36})/.exec(req.url());
    if (m) clientMints.add(m[1]);
  });
  await client.reload();
  await client
    .getByRole("button", { name: /Messages/i })
    .first()
    .click()
    .catch(() => {});
  await client.waitForSelector("audio", { timeout: 20_000 });
  await client
    .waitForResponse((res) => res.url().includes(replyId), {
      timeout: 20_000,
    })
    .catch(() => {});
  // Exact binding: the object URL embeds the media id, so the reply
  // card is the one whose audio src carries replyId — never positional.
  const replyCard = client.locator(
    `div.cd-media-card:has(audio[src*="${replyId}"])`,
  );
  await replyCard.waitFor({ timeout: 20_000 });
  await replyCard
    .locator("audio")
    .evaluate((a: HTMLAudioElement) => a.play().catch(() => {}));
  await replyCard.getByRole("button", { name: /transcript/i }).click();
  await client.getByText(/Auto-transcript/i).waitFor({ timeout: 180_000 });
  expect(clientMints, `client mint missing reply id ${replyId}`).toContain(
    replyId,
  );
  await client.screenshot({ path: `${SHOTS}/p694-client-transcript.png` });

  expect(external, `external requests: ${external.join("\n")}`).toEqual([]);
  await clientCtx.close();
  await coachCtx.close();
});
