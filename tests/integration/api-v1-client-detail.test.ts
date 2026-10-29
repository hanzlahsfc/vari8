import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auth } from "../../lib/auth/server";
import { hashPassword } from "../../lib/password";
import {
  GET as getClientDetail,
  PUT as putClientDetail,
} from "../../app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/route";
import {
  GET as getBundle,
  PUT as putBundle,
} from "../../app/api/v1/workspaces/[workspaceId]/client-detail/route";
import {
  GET as getWorkspaceNotes,
  PUT as putWorkspaceNotes,
} from "../../app/api/v1/workspaces/[workspaceId]/client-detail/workspace-notes/route";

/**
 * W2-A1 route behaviour test - calls the client detail and workspace note
 * routes the way the canvas store does (real Request, bearer credential from
 * a real sign-in) and asserts the literal JSON contract plus the auth matrix:
 * 200 coach, 403 foreign workspace / client role, 401 without credentials,
 * 400 on bad input, 404 on an unknown or foreign client profile.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const BASE = "http://127.0.0.1:3000";

function clientDetailCall(
  method: "GET" | "PUT",
  workspaceId: string,
  clientProfileId: string,
  headers: Record<string, string> = {},
  body?: unknown,
) {
  const fn = method === "GET" ? getClientDetail : putClientDetail;
  return fn(
    new Request(
      `${BASE}/api/v1/workspaces/${workspaceId}/clients/${clientProfileId}`,
      {
        method,
        headers: body
          ? { ...headers, "content-type": "application/json" }
          : headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    ),
    { params: Promise.resolve({ workspaceId, clientProfileId }) },
  );
}

function notesCall(
  method: "GET" | "PUT",
  workspaceId: string,
  headers: Record<string, string> = {},
  body?: unknown,
) {
  const fn = method === "GET" ? getWorkspaceNotes : putWorkspaceNotes;
  return fn(
    new Request(`${BASE}/api/v1/workspaces/${workspaceId}/notes`, {
      method,
      headers: body
        ? { ...headers, "content-type": "application/json" }
        : headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: Promise.resolve({ workspaceId }) },
  );
}

function bundleCall(
  method: "GET" | "PUT",
  workspaceId: string,
  headers: Record<string, string> = {},
  body?: unknown,
) {
  const fn = method === "GET" ? getBundle : putBundle;
  return fn(
    new Request(`${BASE}/api/v1/workspaces/${workspaceId}/client-detail`, {
      method,
      headers: body
        ? { ...headers, "content-type": "application/json" }
        : headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: Promise.resolve({ workspaceId }) },
  );
}

describe.skipIf(!enabled)("W2-A1 client detail routes (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;
  const PASSWORD = "fixture-pass-1";

  async function signInToken(email: string) {
    const res = await auth.handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `10.211.0.${++n}`,
        },
        body: JSON.stringify({ email, password: PASSWORD }),
      }),
    );
    expect(res.status).toBe(200);
    const token = res.headers.get("set-auth-token");
    expect(token).toBeTruthy();
    return token as string;
  }

  async function staffWorkspace(role: "WORKSPACE_OWNER" | "COACH" | "CLIENT") {
    const tag = `w${++n}_${Date.now()}`;
    const ws = await prisma.workspace.create({
      data: { name: tag, slug: tag, status: "ACTIVE" },
    });
    const email = `${tag}@example.test`;
    const user = await prisma.user.create({
      data: { email, passwordHash: "fixture", name: tag, status: "ACTIVE" },
    });
    await prisma.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: await hashPassword(PASSWORD),
      },
    });
    const member = await prisma.workspaceMember.create({
      data: { workspaceId: ws.id, userId: user.id, role, status: "ACTIVE" },
    });
    return { ws, user, member, email };
  }

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({
      datasources: { db: { url: url as string } },
    });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "rate_limit","verifications","sessions","accounts","audit_event","client_week_note","client_phase","coach_note","client_profile","client_assignment","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("GET detail returns profile, phases, notes and week notes", async () => {
    const { ws, member, email } = await staffWorkspace("COACH");
    const clientUser = await prisma.user.create({
      data: {
        email: "detail-client@example.test",
        name: "Detail Client",
        status: "ACTIVE",
      },
    });
    const cp = await prisma.clientProfile.create({
      data: {
        workspaceId: ws.id,
        userId: clientUser.id,
        name: "Detail Client",
        label: "prep",
        coachingSince: new Date("2026-01-05T00:00:00Z"),
        heightCm: 172.5,
      },
    });
    await prisma.clientPhase.create({
      data: {
        workspaceId: ws.id,
        clientProfileId: cp.id,
        name: "Contest prep",
        startDate: new Date("2026-09-13T00:00:00Z"),
        durationWeeks: 15,
      },
    });
    await prisma.coachNote.create({
      data: {
        workspaceId: ws.id,
        clientProfileId: cp.id,
        visibility: "PRIVATE",
        body: "Check hip hinge",
        pinned: true,
        authorMemberId: member.id,
      },
    });
    await prisma.coachNote.create({
      data: {
        workspaceId: ws.id,
        clientProfileId: cp.id,
        visibility: "GENERAL",
        body: "Responds well to cues",
        authorMemberId: member.id,
      },
    });
    await prisma.clientWeekNote.create({
      data: {
        workspaceId: ws.id,
        clientProfileId: cp.id,
        weekStart: new Date("2026-10-05T00:00:00Z"),
        body: "Strong week",
        authorMemberId: member.id,
      },
    });
    const token = await signInToken(email);

    const res = await clientDetailCall("GET", ws.id, cp.id, {
      authorization: `Bearer ${token}`,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Detail Client");
    expect(body.label).toBe("prep");
    expect(body.email).toBe("detail-client@example.test");
    expect(body.coachingSince).toBe("2026-01-05");
    expect(body.heightCm).toBe(172.5);
    expect(body.phases).toEqual([
      {
        id: expect.any(String),
        name: "Contest prep",
        startDate: "2026-09-13",
        durationWeeks: 15,
      },
    ]);
    expect(body.internalNotes).toEqual([
      { id: expect.any(String), text: "Check hip hinge", pinned: true },
    ]);
    expect(body.generalNotes).toEqual([
      { id: expect.any(String), text: "Responds well to cues" },
    ]);
    expect(body.weekNotes).toEqual({ "2026-10-05": "Strong week" });
  });

  it("PUT reconciles notes, phases and week notes; reload persists", async () => {
    const { ws, email } = await staffWorkspace("COACH");
    const cp = await prisma.clientProfile.create({
      data: { workspaceId: ws.id, name: "Edit Client" },
    });
    const token = await signInToken(email);
    const authz = { authorization: `Bearer ${token}` };

    const put = await clientDetailCall("PUT", ws.id, cp.id, authz, {
      phases: [
        {
          id: "phase-a",
          name: "Base",
          startDate: "2026-10-01",
          durationWeeks: 4,
        },
      ],
      internalNotes: [
        { id: "note-a", text: "First", pinned: true },
        { id: "note-b", text: "Second" },
      ],
      generalNotes: [{ id: "note-g", text: "General" }],
      weekNotes: { "2026-10-05": "Week one" },
    });
    expect(put.status).toBe(200);
    const saved = await put.json();
    expect(saved.internalNotes).toEqual([
      { id: "note-a", text: "First", pinned: true },
      { id: "note-b", text: "Second" },
    ]);

    // Second PUT removes note-b, unpins note-a, adds a week note.
    const put2 = await clientDetailCall("PUT", ws.id, cp.id, authz, {
      phases: [
        {
          id: "phase-a",
          name: "Base",
          startDate: "2026-10-01",
          durationWeeks: 4,
        },
      ],
      internalNotes: [{ id: "note-a", text: "First", pinned: false }],
      generalNotes: [],
      weekNotes: { "2026-10-12": "Week two" },
    });
    expect(put2.status).toBe(200);
    const saved2 = await put2.json();
    expect(saved2.internalNotes).toEqual([{ id: "note-a", text: "First" }]);
    expect(saved2.generalNotes).toEqual([]);
    expect(saved2.weekNotes).toEqual({ "2026-10-12": "Week two" });

    const reload = await clientDetailCall("GET", ws.id, cp.id, authz);
    expect(reload.status).toBe(200);
    const reloaded = await reload.json();
    expect(reloaded.internalNotes).toEqual([{ id: "note-a", text: "First" }]);
    expect(reloaded.weekNotes).toEqual({ "2026-10-12": "Week two" });
  });

  it("workspace notes GET/PUT roundtrip", async () => {
    const { ws, email } = await staffWorkspace("COACH");
    const token = await signInToken(email);
    const authz = { authorization: `Bearer ${token}` };

    const empty = await notesCall("GET", ws.id, authz);
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ notes: [] });

    const put = await notesCall("PUT", ws.id, authz, {
      notes: [{ id: "ws-note-1", text: "Remember the seminar" }],
    });
    expect(put.status).toBe(200);

    const read = await notesCall("GET", ws.id, authz);
    expect(await read.json()).toEqual({
      notes: [{ id: "ws-note-1", text: "Remember the seminar" }],
    });
  });

  it("client-detail bundle returns clients and workspace notes", async () => {
    const { ws, member, email } = await staffWorkspace("COACH");
    const cp = await prisma.clientProfile.create({
      data: { workspaceId: ws.id, name: "Bundle Client" },
    });
    await prisma.coachNote.create({
      data: {
        workspaceId: ws.id,
        clientProfileId: cp.id,
        visibility: "PRIVATE",
        body: "Bundle note",
        authorMemberId: member.id,
      },
    });
    await prisma.coachNote.create({
      data: {
        workspaceId: ws.id,
        clientProfileId: null,
        visibility: "PRIVATE",
        body: "Workspace note",
        authorMemberId: member.id,
      },
    });
    const token = await signInToken(email);

    const res = await bundleCall("GET", ws.id, {
      authorization: `Bearer ${token}`,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clients).toHaveLength(1);
    expect(body.clients[0].clientProfileId).toBe(cp.id);
    expect(body.clients[0].internalNotes).toEqual([
      { id: expect.any(String), text: "Bundle note" },
    ]);
    expect(body.workspaceNotes).toEqual([
      { id: expect.any(String), text: "Workspace note" },
    ]);
  });

  it("bundle PUT writes one client's detail and the bundle reads it back", async () => {
    const { ws, email } = await staffWorkspace("COACH");
    const cp = await prisma.clientProfile.create({
      data: { workspaceId: ws.id, name: "Bundle Write Client" },
    });
    const token = await signInToken(email);
    const authz = { authorization: `Bearer ${token}` };

    const put = await bundleCall("PUT", ws.id, authz, {
      clientProfileId: cp.id,
      phases: [
        {
          id: "b-phase-a",
          name: "Base",
          startDate: "2026-10-01",
          durationWeeks: 4,
        },
      ],
      internalNotes: [{ id: "b-note-a", text: "Pinned bundle", pinned: true }],
      generalNotes: [{ id: "b-note-g", text: "Bundle general" }],
      weekNotes: { "2026-10-05": "Bundle week" },
    });
    expect(put.status).toBe(200);
    const saved = await put.json();
    expect(saved.clientProfileId).toBe(cp.id);
    expect(saved.internalNotes).toEqual([
      { id: "b-note-a", text: "Pinned bundle", pinned: true },
    ]);

    const read = await bundleCall("GET", ws.id, authz);
    expect(read.status).toBe(200);
    const bundle = await read.json();
    const entry = bundle.clients.find(
      (c: { clientProfileId: string }) => c.clientProfileId === cp.id,
    );
    expect(entry.internalNotes).toEqual([
      { id: "b-note-a", text: "Pinned bundle", pinned: true },
    ]);
    expect(entry.generalNotes).toEqual([
      { id: "b-note-g", text: "Bundle general" },
    ]);
    expect(entry.weekNotes).toEqual({ "2026-10-05": "Bundle week" });
  });

  it("bundle PUT denies foreign workspace 403 and unauthenticated 401", async () => {
    const a = await staffWorkspace("COACH");
    const b = await staffWorkspace("COACH");
    const cp = await prisma.clientProfile.create({
      data: { workspaceId: a.ws.id, name: "Foreign Bundle Client" },
    });
    const tokenB = await signInToken(b.email);
    const payload = {
      clientProfileId: cp.id,
      phases: [],
      internalNotes: [],
      generalNotes: [],
      weekNotes: {},
    };

    const foreign = await bundleCall(
      "PUT",
      a.ws.id,
      { authorization: `Bearer ${tokenB}` },
      payload,
    );
    expect(foreign.status).toBe(403);

    const anon = await bundleCall("PUT", a.ws.id, {}, payload);
    expect(anon.status).toBe(401);
  });

  it("denies a foreign-workspace coach with literal 403", async () => {
    const a = await staffWorkspace("COACH");
    const b = await staffWorkspace("COACH");
    const cp = await prisma.clientProfile.create({
      data: { workspaceId: a.ws.id, name: "Private Client" },
    });
    const tokenB = await signInToken(b.email);

    const res = await clientDetailCall("GET", a.ws.id, cp.id, {
      authorization: `Bearer ${tokenB}`,
    });
    expect(res.status).toBe(403);
    const foreign = await clientDetailCall(
      "PUT",
      a.ws.id,
      cp.id,
      {
        authorization: `Bearer ${tokenB}`,
      },
      {
        phases: [],
        internalNotes: [],
        generalNotes: [],
        weekNotes: {},
      },
    );
    expect(foreign.status).toBe(403);
    const notes = await notesCall("GET", a.ws.id, {
      authorization: `Bearer ${tokenB}`,
    });
    expect(notes.status).toBe(403);
  });

  it("denies the client role with 403 and unknown client with 404", async () => {
    const { ws, email } = await staffWorkspace("CLIENT");
    const staff = await staffWorkspace("COACH");
    const cp = await prisma.clientProfile.create({
      data: { workspaceId: ws.id, name: "Guarded Client" },
    });
    const clientToken = await signInToken(email);
    const res = await clientDetailCall("GET", ws.id, cp.id, {
      authorization: `Bearer ${clientToken}`,
    });
    expect(res.status).toBe(403);

    const staffToken = await signInToken(staff.email);
    const missing = await clientDetailCall("GET", staff.ws.id, "no-such", {
      authorization: `Bearer ${staffToken}`,
    });
    expect(missing.status).toBe(404);
  });

  it("rejects unauthenticated calls and invalid bodies", async () => {
    const { ws, email } = await staffWorkspace("COACH");
    const cp = await prisma.clientProfile.create({
      data: { workspaceId: ws.id, name: "Auth Client" },
    });
    const res = await clientDetailCall("GET", ws.id, cp.id);
    expect(res.status).toBe(401);

    const token = await signInToken(email);
    const bad = await clientDetailCall(
      "PUT",
      ws.id,
      cp.id,
      { authorization: `Bearer ${token}` },
      {
        phases: [{ id: "x" }],
        internalNotes: [],
        generalNotes: [],
        weekNotes: {},
      },
    );
    expect(bad.status).toBe(400);
  });
});
