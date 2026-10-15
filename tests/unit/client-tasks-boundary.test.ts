/**
 * CLIENT-TASKS-R2 — boundary contract: feature gate FIRST, every
 * service error mapped to the closed non-disclosing vocabulary. Raw
 * serialization-conflict shapes (P2034, P2010/40001, P2010/40P01) map
 * to serialization_conflict; unrelated raw failures stay not_available.
 * The service is mocked; flag-off calls must never reach it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

import { AccessDeniedError } from "../../lib/auth/guard";

vi.mock("../../lib/tasks/service", async () => {
  const actual = await vi.importActual<
    typeof import("../../lib/tasks/service")
  >("../../lib/tasks/service");
  return {
    ...actual,
    assignClientTask: vi.fn(),
    editClientTask: vi.fn(),
    cancelClientTask: vi.fn(),
    setClientTaskCompletion: vi.fn(),
    listStaffClientTasks: vi.fn(),
    listOwnClientTasks: vi.fn(),
  };
});

import { TaskError, setClientTaskCompletion } from "../../lib/tasks/service";
import { setClientTaskCompletionFromAction } from "../../lib/tasks/boundary";

const FLAG = "ENABLE_CLIENT_DASHBOARD";
const session = { user: { id: "u_client" } };
const unreachableDb = new Proxy({} as never, {
  get: () => {
    throw new Error("service/db reached — flag-off must not delegate");
  },
});

const input = {
  workspaceId: "w1",
  clientProfileId: "c1",
  taskId: "t1",
  desired: "COMPLETED" as const,
  expectedRevision: 1,
};

afterEach(() => {
  delete process.env[FLAG];
  vi.clearAllMocks();
});

const rawError = (sqlstate: string) =>
  new Prisma.PrismaClientKnownRequestError(
    `Raw query failed. Code: \`${sqlstate}\`.`,
    {
      code: "P2010",
      clientVersion: Prisma.prismaVersion.client,
      meta: { code: sqlstate },
    },
  );

describe("client-tasks boundary — gate first", () => {
  it("flag-off returns not_available and never reaches the service", async () => {
    delete process.env[FLAG];
    const result = await setClientTaskCompletionFromAction(session, input, {
      db: unreachableDb,
    });
    expect(result).toMatchObject({ ok: false, code: "not_available" });
    expect(setClientTaskCompletion).not.toHaveBeenCalled();
  });
});

describe("client-tasks boundary — error vocabulary", () => {
  it.each([
    ["TaskError conflict", new TaskError("conflict"), "conflict"],
    [
      "TaskError serialization_conflict",
      new TaskError("serialization_conflict"),
      "serialization_conflict",
    ],
    [
      "TaskError invalid_input",
      new TaskError("invalid_input"),
      "invalid_input",
    ],
  ])("maps %s", async (_label, error, code) => {
    process.env[FLAG] = "1";
    vi.mocked(setClientTaskCompletion).mockRejectedValueOnce(error);
    const result = await setClientTaskCompletionFromAction(session, input);
    expect(result).toMatchObject({ ok: false, code });
  });

  it("maps AccessDeniedError to denied", async () => {
    process.env[FLAG] = "1";
    vi.mocked(setClientTaskCompletion).mockRejectedValueOnce(
      new AccessDeniedError("role_denied", "clientTasks", "write"),
    );
    const result = await setClientTaskCompletionFromAction(session, input);
    expect(result).toMatchObject({ ok: false, code: "denied" });
  });

  it.each([
    ["P2034 transaction failure", { code: "P2034" }],
    ["P2010 raw serialization 40001", rawError("40001")],
    ["P2010 raw deadlock 40P01", rawError("40P01")],
  ])(
    "maps raw %s to serialization_conflict, not not_available",
    async (_label, shape) => {
      process.env[FLAG] = "1";
      const error =
        shape instanceof Prisma.PrismaClientKnownRequestError
          ? shape
          : new Prisma.PrismaClientKnownRequestError(
              "Transaction failed due to a write conflict",
              {
                code: (shape as { code: string }).code,
                clientVersion: Prisma.prismaVersion.client,
              },
            );
      vi.mocked(setClientTaskCompletion).mockRejectedValueOnce(error);
      const result = await setClientTaskCompletionFromAction(session, input);
      expect(result).toMatchObject({
        ok: false,
        code: "serialization_conflict",
      });
    },
  );

  it.each([
    ["P2010 integrity 23505", rawError("23505")],
    ["P2010 undefined 42P01", rawError("42P01")],
    [
      "P2002 typed unique violation",
      new Prisma.PrismaClientKnownRequestError("unique constraint", {
        code: "P2002",
        clientVersion: Prisma.prismaVersion.client,
      }),
    ],
    ["plain Error", new Error("boom")],
  ])("does NOT retry-map %s — stays not_available", async (_label, error) => {
    process.env[FLAG] = "1";
    vi.mocked(setClientTaskCompletion).mockRejectedValueOnce(error);
    const result = await setClientTaskCompletionFromAction(session, input);
    expect(result).toMatchObject({ ok: false, code: "not_available" });
  });
});
