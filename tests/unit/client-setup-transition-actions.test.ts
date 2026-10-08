import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P-020B — action-layer gate ordering: with ENABLE_CLIENT_SETUP_TRANSITIONS
 * absent/not exactly "1" (or the parent ENABLE_CLIENT_SETUP off), the real
 * server actions must refuse before auth(), FormData reads, or boundary/DB
 * work. Exact-match only — no truthy parsing.
 */

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u_test" } })),
}));
vi.mock("@/lib/coaching/client-setup-transition-boundary", () => ({
  getTransitionTargetsFromAction: vi.fn(async () => ({ ok: true, value: {} })),
  reviewTransitionFromAction: vi.fn(async () => ({ ok: true, value: {} })),
  executeTransitionFromAction: vi.fn(async () => ({ ok: true, value: {} })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/auth";
import {
  executeTransitionFromAction,
  getTransitionTargetsFromAction,
  reviewTransitionFromAction,
} from "@/lib/coaching/client-setup-transition-boundary";
import {
  executeSetupTransition,
  loadTransitionTargets,
  reviewSetupTransition,
} from "../../app/workspace/[workspaceId]/client-setups/transition-actions";

const TRANSITIONS_FLAG = "ENABLE_CLIENT_SETUP_TRANSITIONS";
const SETUP_FLAG = "ENABLE_CLIENT_SETUP";
const WS = "ws_test";
const OFF = "This feature is not available.";

function trackedFormData(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  const getAll = vi.spyOn(fd, "getAll");
  const get = vi.spyOn(fd, "get");
  return { fd, getAll, get };
}

const FIELDS = {
  pinIndex: "0",
  rowFingerprint: "fp",
  direction: "UPGRADE",
  reviewFingerprint: "rfp",
  confirm: "1",
};

const ACTIONS = [
  {
    name: "loadTransitionTargets",
    call: (fd: FormData) => loadTransitionTargets(WS, fd),
    boundary: getTransitionTargetsFromAction,
  },
  {
    name: "reviewSetupTransition",
    call: (fd: FormData) => reviewSetupTransition(WS, fd),
    boundary: reviewTransitionFromAction,
  },
  {
    name: "executeSetupTransition",
    call: (fd: FormData) => executeSetupTransition(WS, fd),
    boundary: executeTransitionFromAction,
  },
] as const;

describe("P-020B transition actions — flag ordering", () => {
  let savedT: string | undefined;
  let savedS: string | undefined;

  beforeEach(() => {
    savedT = process.env[TRANSITIONS_FLAG];
    savedS = process.env[SETUP_FLAG];
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (savedT === undefined) delete process.env[TRANSITIONS_FLAG];
    else process.env[TRANSITIONS_FLAG] = savedT;
    if (savedS === undefined) delete process.env[SETUP_FLAG];
    else process.env[SETUP_FLAG] = savedS;
  });

  for (const action of ACTIONS) {
    it.each([undefined, "", "yes", "true", "01", " 1"] as const)(
      `${action.name}: transitions flag=%j → refuses before everything`,
      async (value) => {
        if (value === undefined) delete process.env[TRANSITIONS_FLAG];
        else process.env[TRANSITIONS_FLAG] = value;
        process.env[SETUP_FLAG] = "1";
        const { fd, get, getAll } = trackedFormData(FIELDS);
        const r = await action.call(fd);
        expect(r).toEqual({ ok: false, message: OFF });
        expect(vi.mocked(auth)).not.toHaveBeenCalled();
        expect(get).not.toHaveBeenCalled();
        expect(getAll).not.toHaveBeenCalled();
        expect(vi.mocked(action.boundary)).not.toHaveBeenCalled();
      },
    );

    it(`${action.name}: parent gate off → refuses before everything`, async () => {
      process.env[TRANSITIONS_FLAG] = "1";
      delete process.env[SETUP_FLAG];
      const { fd, get, getAll } = trackedFormData(FIELDS);
      const r = await action.call(fd);
      expect(r).toEqual({ ok: false, message: OFF });
      expect(vi.mocked(auth)).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
      expect(getAll).not.toHaveBeenCalled();
      expect(vi.mocked(action.boundary)).not.toHaveBeenCalled();
    });

    it(`${action.name}: both flags on → proceeds to auth + boundary`, async () => {
      process.env[TRANSITIONS_FLAG] = "1";
      process.env[SETUP_FLAG] = "1";
      const { fd } = trackedFormData(FIELDS);
      await action.call(fd);
      expect(vi.mocked(auth)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(action.boundary)).toHaveBeenCalledTimes(1);
    });
  }
});
