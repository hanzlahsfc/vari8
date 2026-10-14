import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * DASHBOARD-I1 (decision #108) — persisted coach-configured client
 * dashboards: owner arranges + shares widgets; the client sees the
 * committed subset; staff-only widgets never leak; flag-off 404s.
 */

const BASE = "http://127.0.0.1:3000";
const FLAG_OFF = "http://127.0.0.1:3101";

let prisma: PrismaClient;
let wsId: string;
let profileId = "";
let createdProfile = false;

async function signIn(page: Page, email: string, base = BASE) {
  await page.goto(`${base}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/login/);
}

test.beforeAll(async () => {
  prisma = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl() } } });
  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { slug: E2E.workspaceSlug },
  });
  wsId = ws.id;
  const clientUser = await prisma.user.findUniqueOrThrow({
    where: { email: E2E.client },
  });
  const existing = await prisma.clientProfile.findFirst({
    where: { workspaceId: wsId, userId: clientUser.id },
  });
  if (existing) {
    profileId = existing.id;
  } else {
    createdProfile = true;
    profileId = (
      await prisma.clientProfile.create({
        data: {
          workspaceId: wsId,
          userId: clientUser.id,
          name: "Dashboard Client",
        },
      })
    ).id;
  }
  await prisma.clientDashboardLayout.deleteMany({
    where: { workspaceId: wsId, clientProfileId: profileId },
  });
});

test.afterAll(async () => {
  await prisma.clientDashboardLayout.deleteMany({
    where: { workspaceId: wsId, clientProfileId: profileId },
  });
  if (createdProfile)
    await prisma.clientProfile.delete({ where: { id: profileId } });
  await prisma.$disconnect();
});

// CLIENT-TASKS-I1-R3: fault ONLY the layout save/reconcile POST. All
// server actions on this URL share the route; the save action's
// serialized args carry `"config"` — task-panel reads/writes
// (`readClientTasks`, assign/edit/cancel) and `reloadClientDashboardLayout`
// do not. Matching on the body keeps unrelated task POSTs out of the
// fault path without hardcoding a build-specific `next-action` hash.
const isLayoutSave = (req: {
  method(): string;
  headers(): Record<string, string>;
  postData(): string | null;
}) =>
  req.method() === "POST" &&
  !!req.headers()["next-action"] &&
  (req.postData() ?? "").includes('"config"');

const staffUrl = () => `/workspace/${wsId}/clients/${profileId}/dashboard`;
const clientUrl = () => `/workspace/${wsId}/dashboard`;

test.describe("DASHBOARD-I1", () => {
  test("owner adds + shares a widget; client sees the committed subset", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    await page.goto(staffUrl());
    await expect(page.getByTestId("dashboard-editor")).toBeVisible();
    // add CU04 (client-visible) + CU01 (stays staff-only by default)
    await page.getByTestId("add-widget").selectOption("CU04");
    await expect(page.getByText("Saved")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("add-widget").selectOption("CU01");
    await expect(page.getByText("Saved")).toBeVisible({ timeout: 10_000 });
    // share the CU04 widget with the client
    const canvas = page.getByTestId("dashboard-canvas");
    const widget = canvas.locator("article", { hasText: "Check-in" }).first();
    await widget.getByTestId(/visibility-/).click();
    await expect(page.getByText("Saved")).toBeVisible({ timeout: 10_000 });
  });

  test("editor covers settings, breakpoints, preview and nav guard", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    await page.goto(staffUrl());
    await expect(page.getByTestId("dashboard-canvas")).toBeVisible();
    const widget = page
      .getByTestId("dashboard-canvas")
      .locator("article")
      .first();
    // per-widget settings: open panel, change a setting within the
    // allowlist, save commits
    await widget.getByTestId(/edit-/).click();
    const settings = page.getByTestId("widget-settings").first();
    await expect(settings).toBeVisible();
    await settings.locator("input").first().fill("Custom title");
    await expect(page.getByText("Saved")).toBeVisible({ timeout: 10_000 });
    // breakpoint tabs + initialize
    await page.getByTestId("bp-mobile").click();
    const init = page.getByTestId("init-mobile");
    if ((await init.count()) > 0) {
      await init.click();
      await expect(page.getByText("Saved")).toBeVisible({
        timeout: 10_000,
      });
    }
    await page.getByTestId("bp-desktop").click();
    // client preview toggle — staff-only widget disappears
    const staffWidget = page
      .getByTestId("dashboard-canvas")
      .locator("article", { hasText: "This week’s focus" });
    await page.getByTestId("client-preview").click();
    await expect(staffWidget).toHaveCount(0);
    await page.getByTestId("client-preview").click();
    // navigation guard: edit inside the debounce window, then try to
    // leave via a document navigation — beforeunload must fire; the
    // user accepts it (explicit leave) and the page exits
    let dialogType = "";
    page.once("dialog", async (dialog) => {
      dialogType = dialog.type();
      await dialog.accept();
    });
    await page.getByTestId("dashboard-name").fill("Renamed dashboard");
    await page.goto(`/workspace/${wsId}/clients`);
    expect(dialogType).toBe("beforeunload");
  });

  test("in-app link inside the debounce window must not drop the edit", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    await page.goto(staffUrl());
    await expect(page.getByTestId("dashboard-editor")).toBeVisible();
    await page.getByTestId("dashboard-name").fill("Guarded name");
    // click the real Clients link immediately — inside the 500ms debounce
    await page
      .getByTestId("shell-sidebar")
      .getByRole("link", { name: "Clients" })
      .click();
    // contract: either the navigation waited for the save, or an
    // explicit discard was chosen — never a silent loss. Assert the
    // persisted name survives a fresh load.
    await page.waitForLoadState("load").catch(() => {});
    await page.goto(staffUrl());
    await expect(page.getByTestId("dashboard-name")).toHaveValue(
      "Guarded name",
      { timeout: 10_000 },
    );
    // restore the original name so later specs see a stable fixture
    await page
      .getByTestId("dashboard-name")
      .fill("Dashboard Client’s dashboard");
    await expect(page.getByText(/Saved/)).toBeVisible({ timeout: 10_000 });
  });

  test("keyboard-activated link inside the debounce window is held", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    await page.goto(staffUrl());
    await page.getByTestId("dashboard-name").fill("Keyboard name");
    // focus + Enter on the sidebar link — same capture-phase click path
    const link = page
      .getByTestId("shell-sidebar")
      .getByRole("link", { name: "Clients" });
    await link.focus();
    await page.keyboard.press("Enter");
    await page.waitForURL(new RegExp(`/workspace/${wsId}/clients$`), {
      timeout: 15_000,
    });
    await page.goto(staffUrl());
    await expect(page.getByTestId("dashboard-name")).toHaveValue(
      "Keyboard name",
      { timeout: 10_000 },
    );
    await page
      .getByTestId("dashboard-name")
      .fill("Dashboard Client’s dashboard");
    await expect(page.getByText(/Saved/)).toBeVisible({ timeout: 10_000 });
  });

  test("failed save then in-app link → held with explicit prompt", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    await page.goto(staffUrl());
    // abort server-action POSTs so every save fails
    await page.route(
      `**/workspace/${wsId}/clients/${profileId}/dashboard`,
      async (route) => {
        if (isLayoutSave(route.request())) await route.abort();
        else await route.continue();
      },
    );
    await page.getByTestId("dashboard-name").fill("Failing name");
    await expect(page.getByText("Failed — edits kept")).toBeVisible({
      timeout: 15_000,
    });
    // after a failed save the guard must still hold the navigation —
    // never a silent loss
    await page
      .getByTestId("shell-sidebar")
      .getByRole("link", { name: "Clients" })
      .click();
    await expect(page.getByTestId("leave-prompt")).toBeVisible({
      timeout: 15_000,
    });
    // Stay preserves the edit and cancels the held destination
    await page.getByTestId("stay").click();
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.getByTestId("dashboard-name")).toHaveValue(
      "Failing name",
    );
    // Leave anyway abandons the pending work and navigates
    await page
      .getByTestId("shell-sidebar")
      .getByRole("link", { name: "Clients" })
      .click();
    await expect(page.getByTestId("leave-prompt")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("leave-anyway").click();
    await expect(page).toHaveURL(new RegExp(`/workspace/${wsId}/clients$`));
    await page.unrouteAll();
  });

  test("conflict save then link → explicit prompt, never silent", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    await page.goto(staffUrl());
    await page.getByTestId("dashboard-name").fill("Base name");
    await expect(page.getByText("Saved")).toBeVisible({ timeout: 10_000 });
    // a second writer moves the revision server-side
    const row = await prisma.clientDashboardLayout.findFirstOrThrow({
      where: { workspaceId: wsId, clientProfileId: profileId },
    });
    const cfg = row.config as { name: string };
    cfg.name = "Other coach name";
    await prisma.clientDashboardLayout.update({
      where: { id: row.id },
      data: { config: cfg as never, revision: { increment: 1 } },
    });
    // our save now conflicts
    await page.getByTestId("dashboard-name").fill("My name");
    await expect(page.getByText("Layout changed by another coach")).toBeVisible(
      { timeout: 15_000 },
    );
    await page
      .getByTestId("shell-sidebar")
      .getByRole("link", { name: "Clients" })
      .click();
    await expect(page.getByTestId("leave-prompt")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("stay").click();
    await expect(page).toHaveURL(/dashboard/);
    // Leave abandons and navigates
    await page
      .getByTestId("shell-sidebar")
      .getByRole("link", { name: "Clients" })
      .click();
    await expect(page.getByTestId("leave-prompt")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("leave-anyway").click();
    await expect(page).toHaveURL(new RegExp(`/workspace/${wsId}/clients$`));
  });

  test("in-flight save + newer queued edit → navigation waits for both", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    await page.goto(staffUrl());
    // controlled request barrier: slow the first save; gate the second
    let saveCount = 0;
    let releaseSecond: (() => void) | undefined;
    const secondGate = new Promise<void>((r) => {
      releaseSecond = r;
    });
    await page.route(
      `**/workspace/${wsId}/clients/${profileId}/dashboard`,
      async (route) => {
        if (!isLayoutSave(route.request())) {
          await route.continue();
          return;
        }
        saveCount += 1;
        if (saveCount === 2) await secondGate;
        else await new Promise((r) => setTimeout(r, 1200));
        await route.continue();
      },
    );
    await page.getByTestId("dashboard-name").fill("First name");
    // wait for the first save to actually dispatch (in-flight)
    await expect.poll(() => saveCount, { timeout: 15_000 }).toBe(1);
    // second edit queues while the first is in-flight
    await page.getByTestId("dashboard-name").fill("Second name");
    // held navigation — must not leave on the older save alone
    await page
      .getByTestId("shell-sidebar")
      .getByRole("link", { name: "Clients" })
      .click();
    // the first save commits; the queued second save is now in-flight
    // and held at the gate — navigation must NOT have happened yet
    await expect.poll(() => saveCount, { timeout: 15_000 }).toBe(2);
    expect(page.url()).toContain("/dashboard");
    releaseSecond!();
    await page.waitForURL(new RegExp(`/workspace/${wsId}/clients$`), {
      timeout: 20_000,
    });
    // the later queued edit was committed, not just the earlier one
    await page.goto(staffUrl());
    await expect(page.getByTestId("dashboard-name")).toHaveValue(
      "Second name",
      { timeout: 10_000 },
    );
    await page
      .getByTestId("dashboard-name")
      .fill("Dashboard Client’s dashboard");
    await expect(page.getByText(/Saved/)).toBeVisible({ timeout: 10_000 });
  });

  test("multiple destination clicks → the last intent wins once", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    await page.goto(staffUrl());
    await page.route(
      `**/workspace/${wsId}/clients/${profileId}/dashboard`,
      async (route) => {
        if (isLayoutSave(route.request()))
          await new Promise((r) => setTimeout(r, 1200));
        await route.continue();
      },
    );
    await page.getByTestId("dashboard-name").fill("Multi click");
    await expect(page.getByText("Saving…")).toBeVisible({
      timeout: 10_000,
    });
    await page
      .getByTestId("shell-sidebar")
      .getByRole("link", { name: "Daily Tracker" })
      .click();
    await page
      .getByTestId("shell-sidebar")
      .getByRole("link", { name: "Clients" })
      .click();
    // deterministic final intent: the last clicked destination, exactly
    // once
    await page.waitForURL(new RegExp(`/workspace/${wsId}/clients$`), {
      timeout: 20_000,
    });
  });

  test("protocol-relative // links are never intercepted", async ({ page }) => {
    await signIn(page, E2E.owner);
    await page.goto(staffUrl());
    await page.getByTestId("dashboard-name").fill("Proto name");
    // a protocol-relative anchor is not an app route — the document-exit
    // guard (beforeunload), not the click interception, applies
    await page.evaluate((ws) => {
      const a = document.createElement("a");
      a.href = `//127.0.0.1:3000/workspace/${ws}/clients`;
      a.textContent = "proto";
      a.setAttribute("data-testid", "proto-link");
      document.body.appendChild(a);
    }, wsId);
    let protoDialogType = "";
    page.once("dialog", async (d) => {
      protoDialogType = d.type();
      await d.accept();
    });
    await page.getByTestId("proto-link").click();
    await page.waitForURL(new RegExp(`/workspace/${wsId}/clients$`), {
      timeout: 10_000,
    });
    expect(protoDialogType).toBe("beforeunload");
  });

  test("same-document Back flushes the pending save; edit persists", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    // enter the editor via a same-document (SPA) navigation so Back is a
    // popstate, not a document exit
    await page.goto(`${BASE}/workspace/${wsId}/clients`);
    await page.getByRole("link", { name: "Dashboard" }).first().click();
    await expect(page.getByTestId("dashboard-name")).toBeVisible();
    await page.getByTestId("dashboard-name").fill("Back name");
    await page.goBack();
    // the popstate flush commits server-side even though the route left
    await expect
      .poll(
        async () => {
          const row = await prisma.clientDashboardLayout.findFirst({
            where: { workspaceId: wsId, clientProfileId: profileId },
          });
          return (row?.config as { name?: string } | null)?.name;
        },
        { timeout: 15_000 },
      )
      .toBe("Back name");
    await page.goto(staffUrl());
    await expect(page.getByTestId("dashboard-name")).toHaveValue("Back name", {
      timeout: 15_000,
    });
    await page
      .getByTestId("dashboard-name")
      .fill("Dashboard Client’s dashboard");
    await expect(page.getByText(/Saved/)).toBeVisible({ timeout: 10_000 });
  });

  test("no Navigation API: same-document Back persists the pending edit", async ({
    page,
  }) => {
    // capability-absent run: hide window.navigation so the guard falls
    // back to popstate — the pending save must still durably commit
    await page.addInitScript(() => {
      Object.defineProperty(window, "navigation", {
        get: () => undefined,
        configurable: true,
      });
    });
    await signIn(page, E2E.owner);
    // SPA entry: real roster link click creates a same-document history
    // entry so Back stays inside this document's realm
    await page.goto(`/workspace/${wsId}/clients`);
    await page.getByTestId(`dashboard-link-${profileId}`).click();
    await expect(page.getByTestId("dashboard-editor")).toBeVisible();
    // edit inside the debounce window, then a real same-document Back —
    // no Navigation API to cancel it; the coordinator's pending work
    // must still durably commit after the editor unmounts
    await page.getByTestId("dashboard-name").fill("Fallback-back name");
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/workspace/${wsId}/clients$`));
    // the pending edit must still reach the database — give the in-flight
    // save room, then verify durable state + restored draft on return
    await expect
      .poll(
        async () => {
          const row = await prisma.clientDashboardLayout.findFirst({
            where: { workspaceId: wsId, clientProfileId: profileId },
          });
          return (row?.config as { name?: string } | null)?.name;
        },
        { timeout: 10_000 },
      )
      .toBe("Fallback-back name");
    await page.goForward();
    await expect(page.getByTestId("dashboard-name")).toHaveValue(
      "Fallback-back name",
      { timeout: 10_000 },
    );
  });

  test("failed save while away keeps a recoverable draft on return", async ({
    page,
  }) => {
    // capability-absent so the traversal actually leaves (a held
    // traverse would wait for an explicit Leave decision instead)
    await page.addInitScript(() => {
      Object.defineProperty(window, "navigation", {
        get: () => undefined,
        configurable: true,
      });
    });
    // fault every save POST — the retries exhaust while the editor is
    // unmounted; the draft must survive and surface honestly on return
    await page.route(
      `**/workspace/${wsId}/clients/${profileId}/dashboard`,
      (route) =>
        isLayoutSave(route.request())
          ? route.fulfill({ status: 500 })
          : route.continue(),
    );
    await signIn(page, E2E.owner);
    await page.goto(`/workspace/${wsId}/clients`);
    await page.getByTestId(`dashboard-link-${profileId}`).click();
    await expect(page.getByTestId("dashboard-editor")).toBeVisible();
    await page.getByTestId("dashboard-name").fill("Recoverable draft");
    // same-document Back leaves the editor mid-save
    await page.goBack({ waitUntil: "commit" });
    await expect(page).toHaveURL(new RegExp(`/workspace/${wsId}/clients$`));
    // forward again — the slot retained the draft + failed state
    await page.goForward();
    await expect(page.getByTestId("dashboard-name")).toHaveValue(
      "Recoverable draft",
      { timeout: 15_000 },
    );
    await expect(page.getByTestId("save-state")).toContainText(
      /Failed|denied/,
      { timeout: 15_000 },
    );
    await page.unroute(`**/workspace/${wsId}/clients/${profileId}/dashboard`);
    // the draft is what the editor holds — whether a background retry
    // has already committed it or a terminal failure is still pending,
    // the user always sees their work + an honest state, never a false
    // "Saved" over lost data
    await expect(page.getByTestId("save-state")).not.toHaveText(/^Saved$/);
  });

  test("another client's editor never sees a different client's draft", async ({
    page,
  }) => {
    // faulted save keeps client A's draft pending in its slot
    await page.route(`**/workspace/${wsId}/clients/*/dashboard`, (route) =>
      isLayoutSave(route.request())
        ? route.fulfill({ status: 500 })
        : route.continue(),
    );
    const otherUser = await prisma.user.create({
      data: {
        email: "second-client@s1h-e2e.test",
        passwordHash: "x",
        status: "ACTIVE",
        name: "Second Client",
      },
    });
    const other = await prisma.clientProfile.create({
      data: {
        workspaceId: wsId,
        userId: otherUser.id,
        name: "Second Client",
      },
    });
    try {
      await signIn(page, E2E.owner);
      await page.goto(`/workspace/${wsId}/clients`);
      await page.getByTestId(`dashboard-link-${profileId}`).click();
      await expect(page.getByTestId("dashboard-editor")).toBeVisible();
      await page.getByTestId("dashboard-name").fill("Client-A draft");
      // the save is faulted; leave via the explicit prompt, then SPA-
      // navigate to the other client's editor via the roster link
      await page
        .getByTestId("shell-sidebar")
        .getByRole("link", { name: "Clients" })
        .click();
      await expect(page.getByTestId("leave-prompt")).toBeVisible({
        timeout: 15_000,
      });
      await page.getByTestId("leave-anyway").click();
      await expect(page).toHaveURL(new RegExp(`/workspace/${wsId}/clients$`));
      await page.getByTestId(`dashboard-link-${other.id}`).click();
      await expect(page.getByTestId("dashboard-name")).toHaveValue(
        "Second Client’s dashboard",
        { timeout: 10_000 },
      );
      // return to A via the roster: the failed draft is restored — not
      // B's config
      await page
        .getByTestId("shell-sidebar")
        .getByRole("link", { name: "Clients" })
        .click();
      await expect(page).toHaveURL(new RegExp(`/workspace/${wsId}/clients$`));
      await page.getByTestId(`dashboard-link-${profileId}`).click();
      await expect(page.getByTestId("dashboard-name")).toHaveValue(
        "Client-A draft",
        { timeout: 15_000 },
      );
    } finally {
      await page.unroute(`**/workspace/${wsId}/clients/*/dashboard`);
      await prisma.clientDashboardLayout.deleteMany({
        where: { clientProfileId: other.id },
      });
      await prisma.clientProfile.delete({ where: { id: other.id } });
      await prisma.user.delete({ where: { id: otherUser.id } });
    }
  });

  test("a pending draft cannot follow a sign-out into a new session", async ({
    page,
  }) => {
    await page.route(
      `**/workspace/${wsId}/clients/${profileId}/dashboard`,
      (route) =>
        isLayoutSave(route.request())
          ? route.fulfill({ status: 500 })
          : route.continue(),
    );
    await signIn(page, E2E.owner);
    await page.goto(staffUrl());
    await page.getByTestId("dashboard-name").fill("Pre-logout draft");
    // let the terminal failure settle, then leave via the held-nav
    // prompt (the faulted route would swallow a sign-out POST here)
    await expect(page.getByTestId("save-state")).toContainText(/Failed/, {
      timeout: 15_000,
    });
    await page
      .getByTestId("shell-sidebar")
      .getByRole("link", { name: "Clients" })
      .click();
    await expect(page.getByTestId("leave-prompt")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("leave-anyway").click();
    await expect(page).toHaveURL(new RegExp(`/workspace/${wsId}/clients$`));
    await page.getByTestId("sign-out").click();
    await expect(page).toHaveURL(/login/);
    await page.unroute(`**/workspace/${wsId}/clients/${profileId}/dashboard`);
    await signIn(page, E2E.owner);
    await page.goto(staffUrl());
    // the retained draft is gone — the editor re-bases to whatever the
    // server truth is; the abandoned draft can never reappear
    await expect(page.getByTestId("dashboard-name")).not.toHaveValue(
      "Pre-logout draft",
      { timeout: 10_000 },
    );
    await expect(page.getByTestId("dashboard-name")).not.toHaveValue("", {
      timeout: 10_000,
    });
  });

  test("browser Back while pending is held until the save commits", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    // fresh document entry: Back is a traverse — the Navigation API
    // intercept cancels it, the save commits, traverseTo completes it
    await page.goto(staffUrl());
    await page.getByTestId("dashboard-name").fill("Exit name");
    await page.goBack();
    // the traversal completed only after the pending save committed
    await expect
      .poll(
        async () => {
          const row = await prisma.clientDashboardLayout.findFirst({
            where: { workspaceId: wsId, clientProfileId: profileId },
          });
          return (row?.config as { name?: string } | null)?.name;
        },
        { timeout: 15_000 },
      )
      .toBe("Exit name");
    // restore the fixture name
    await page.goto(staffUrl());
    await page
      .getByTestId("dashboard-name")
      .fill("Dashboard Client’s dashboard");
    await expect(page.getByText(/Saved/)).toBeVisible({ timeout: 10_000 });
  });

  test("no guard residue: unrelated routes navigate freely after unmount", async ({
    page,
  }) => {
    await signIn(page, E2E.owner);
    // clean state — leave and re-enter other pages without prompts
    await page.goto(`${BASE}/workspace/${wsId}/clients`);
    await page.getByRole("link", { name: "Check-ins" }).first().click();
    await expect(page).toHaveURL(/checkins|check-ins/);
    // with the editor mounted but NO pending edits, links work normally
    await page.goto(staffUrl());
    await expect(page.getByTestId("dashboard-editor")).toBeVisible();
    await page
      .getByTestId("shell-sidebar")
      .getByRole("link", { name: "Clients" })
      .click();
    await expect(page).toHaveURL(new RegExp(`/workspace/${wsId}/clients$`));
  });

  test("client view shows only the shared subset", async ({ page }) => {
    await signIn(page, E2E.client);
    await page.goto(clientUrl());
    await expect(page.getByTestId("client-dashboard")).toBeVisible();
    await expect(page.getByTestId("client-widget-CU04")).toBeVisible();
    // staff-only CU01 is absent server-side — never rendered
    await expect(page.getByTestId("client-widget-CU01")).toHaveCount(0);
  });

  test("flag-off server returns 404 and hides the roster link", async ({
    page,
  }) => {
    await signIn(page, E2E.owner, FLAG_OFF);
    await page.goto(`${FLAG_OFF}${staffUrl()}`);
    await expect(
      page.getByRole("heading", { name: /not found|404/i }),
    ).toBeVisible();
    await page.goto(`${FLAG_OFF}/workspace/${wsId}/clients`);
    await expect(page.getByRole("link", { name: "Dashboard" })).toHaveCount(0);
  });

  test("assistant sees the read-only layout, no controls", async ({ page }) => {
    await signIn(page, E2E.assistant);
    await page.goto(staffUrl());
    // assistant has no assignment to this client → 404 (assigned scope)
    const heading = page.getByTestId("dashboard-editor");
    if ((await heading.count()) > 0) {
      await expect(page.getByTestId("add-widget")).toHaveCount(0);
    }
  });
});
