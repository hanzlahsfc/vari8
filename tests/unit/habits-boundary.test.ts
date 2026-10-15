/**
 * HABITS-I1 (decision 110) — boundary contract: feature gate FIRST,
 * every service error mapped to the closed non-disclosing vocabulary.
 * The service is mocked; flag-off calls must never reach it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

import { AccessDeniedError } from "../../lib/auth/guard";

vi.mock("../../lib/habits/service", async () => {
  const actual = await vi.importActual<
    typeof import("../../lib/habits/service")
  >("../../lib/habits/service");
  return {
    ...actual,
    createHabit: vi.fn(),
    editHabit: vi.fn(),
    archiveHabit: vi.fn(),
    setHabitLog: vi.fn(),
    listStaffHabits: vi.fn(),
    listHabitChoices: vi.fn(),
    listTodayHabits: vi.fn(),
    habitConsistency: vi.fn(),
  };
});

import { HabitError } from "../../lib/habits/service";
import {
  createHabit,
  listTodayHabits,
  setHabitLog,
} from "../../lib/habits/service";
import {
  createHabitFromAction,
  readTodayHabits,
  setHabitLogFromAction,
} from "../../lib/habits/boundary";

const FLAG = "ENABLE_CLIENT_DASHBOARD";
const session = { user: { id: "u_client" } };
const unreachableDb = new Proxy({} as never, {
  get: () => {
    throw new Error("service/db reached — flag-off must not delegate");
  },
});

function flagOn() {
  process.env[FLAG] = "1";
}
function flagOff() {
  delete process.env[FLAG];
}

afterEach(() => {
  flagOff();
  vi.clearAllMocks();
});

const createInput = {
  workspaceId: "w1",
  clientProfileId: "c1",
  name: "Walk",
  target: "30 min",
  startDate: "2026-10-14",
  weekdays: 127,
};

describe("habits boundary — gate first", () => {
  it("flag-off returns not_available and never reaches the service", async () => {
    flagOff();
    const result = await createHabitFromAction(session, createInput, {
      db: unreachableDb,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_available");
    expect(createHabit).not.toHaveBeenCalled();
  });

  it("flag-off denies the TL21 read too", async () => {
    flagOff();
    const result = await readTodayHabits(
      session,
      { workspaceId: "w1" },
      { db: unreachableDb },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_available");
    expect(listTodayHabits).not.toHaveBeenCalled();
  });
});

describe("habits boundary — closed vocabulary", () => {
  it("maps AccessDeniedError to denied", async () => {
    flagOn();
    vi.mocked(createHabit).mockRejectedValue(
      new AccessDeniedError("role_denied", "habits", "write"),
    );
    const result = await createHabitFromAction(session, createInput);
    expect(result).toMatchObject({ ok: false, code: "denied" });
    expect(result.ok ? "" : result.message).not.toMatch(/c1|w1|Walk/);
  });

  it("maps HabitError codes to the closed vocabulary", async () => {
    flagOn();
    const cases: [ConstructorParameters<typeof HabitError>[0], string][] = [
      ["invalid_input", "invalid_input"],
      ["not_available", "not_available"],
      ["conflict", "conflict"],
      ["serialization_conflict", "serialization_conflict"],
    ];
    for (const [serviceCode, safeCode] of cases) {
      vi.mocked(setHabitLog).mockRejectedValue(new HabitError(serviceCode));
      const result = await setHabitLogFromAction(session, {
        workspaceId: "w1",
        clientProfileId: "c1",
        habitId: "h1",
        date: "2026-10-14",
        desired: "DONE",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe(safeCode);
    }
  });

  it("maps raw Prisma P2034 to serialization_conflict (backstop)", async () => {
    // Normally unreachable: service ops are wrapped in withSerializedRetry
    // which converts P2034 to HabitError("serialization_conflict") before it
    // reaches the boundary. This backstop exists for unwrapped paths — the
    // mapping is unit-tested here, not through a manufactured read scenario.
    flagOn();
    const shapes = [
      // Typed-query / transaction-commit conflicts.
      new Prisma.PrismaClientKnownRequestError(
        "Transaction failed due to a write conflict or a deadlock",
        { code: "P2034", clientVersion: Prisma.prismaVersion.client },
      ),
      // Raw-statement conflicts (the FOR UPDATE locks): P2010 with the
      // SQLSTATE in meta — the shape real contention actually produces.
      new Prisma.PrismaClientKnownRequestError(
        "Raw query failed. Code: `40001`.",
        {
          code: "P2010",
          clientVersion: Prisma.prismaVersion.client,
          meta: { code: "40001", message: "could not serialize access" },
        },
      ),
    ];
    for (const shape of shapes) {
      vi.mocked(setHabitLog).mockRejectedValue(shape);
      const result = await setHabitLogFromAction(session, {
        workspaceId: "w1",
        clientProfileId: "c1",
        habitId: "h1",
        date: "2026-10-14",
        desired: "DONE",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("serialization_conflict");
    }
  });

  it("maps unknown errors to the generic closed result", async () => {
    flagOn();
    vi.mocked(listTodayHabits).mockRejectedValue(new Error("db on fire"));
    const result = await readTodayHabits(session, { workspaceId: "w1" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("not_available");
      expect(result.message).not.toMatch(/db on fire/);
    }
  });
});
