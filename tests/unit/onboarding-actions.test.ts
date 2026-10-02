// P-008 slice-5B — server-action seam tests.
// `auth()` and `next/cache` are MOCKED (labeled); the boundary module is
// spied to prove delegation — these tests prove input binding + delegation
// shape, NOT real authentication, membership, or HTTP/CSRF security.

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "../../auth";
import { revalidatePath } from "next/cache";
import * as boundary from "../../lib/onboarding/forms-boundary";

const mockedAuth = auth as unknown as {
  mockReset: () => void;
  mockResolvedValue: (value: unknown) => void;
  mockRejectedValue: (value: unknown) => void;
};
const mockedRevalidate = vi.mocked(revalidatePath);

const DENIED = "You don't have access to do that.";
const INVALID = "Check the form details and try again.";

const actionsPath = "../../app/workspace/[workspaceId]/onboarding/actions";

function fd(entries: Record<string, string | File>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

afterEach(() => {
  vi.restoreAllMocks();
  mockedAuth.mockReset();
  mockedRevalidate.mockReset();
});

describe("P-008 actions — session gate before any service call", () => {
  it("missing session returns safe denial and never reaches the boundary", async () => {
    const actions = await import(actionsPath);
    mockedAuth.mockResolvedValue(null);
    const spy = vi.spyOn(boundary, "createFormFromAction");
    const res = await actions.createForm("w1", fd({ name: "Intake" }));
    expect(res).toEqual({ ok: false, message: DENIED });
    expect(spy).not.toHaveBeenCalled();
    expect(mockedRevalidate).not.toHaveBeenCalled();
  });

  it.each(["saveDraft", "publishForm", "archiveForm", "openDraft"] as const)(
    "%s denies unauthenticated before delegation",
    async (name) => {
      const actions = await import(actionsPath);
      mockedAuth.mockResolvedValue(null);
      const res = await actions[name](
        "w1",
        fd({ formId: "f1", expectedRevision: "1", draftJson: "{}" }),
      );
      expect(res).toEqual({ ok: false, message: DENIED });
    },
  );
});

describe("P-008 actions — strict FormData handling", () => {
  it("rejects File/duplicate/missing/oversized form values pre-delegation", async () => {
    const actions = await import(actionsPath);
    mockedAuth.mockResolvedValue({ user: { id: "u1" } });
    const spy = vi.spyOn(boundary, "createFormFromAction");

    const file = new File(["x"], "f.txt");
    const cases: FormData[] = [
      (() => {
        const f = fd({ name: "N" });
        f.append("name", "N2");
        return f;
      })(), // duplicate key
      fd({ name: file }), // File value
      fd({}), // missing key
      fd({ name: "x".repeat(5000) }), // oversized
    ];
    for (const data of cases) {
      const res = await actions.createForm("w1", data);
      expect(res).toEqual({ ok: false, message: INVALID });
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects malformed revisions — strict decimal, safe Int32", async () => {
    const actions = await import(actionsPath);
    mockedAuth.mockResolvedValue({ user: { id: "u1" } });
    const spy = vi.spyOn(boundary, "publishFromAction");
    for (const bad of [
      "abc",
      "2.5",
      "1e3",
      "",
      "  1",
      "-1",
      "2147483648", // Int32 overflow
      "9999999999999999", // unsafe integer
    ]) {
      const res = await actions.publishForm(
        "w1",
        fd({ formId: "f1", expectedRevision: bad }),
      );
      expect(res).toEqual({ ok: false, message: INVALID });
    }
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("P-008 actions — delegation contract", () => {
  it("success forwards validated inputs + injected-free call; revalidates only on ok", async () => {
    const actions = await import(actionsPath);
    mockedAuth.mockResolvedValue({ user: { id: "u1" } });
    const spy = vi
      .spyOn(boundary, "createFormFromAction")
      .mockResolvedValue({ ok: true, value: { formId: "f9" } });
    const res = await actions.createForm("w1", fd({ name: "Intake" }));
    expect(res).toEqual({ ok: true, value: { formId: "f9" } });
    // Action passes session+validated inputs; boundary uses its own deps —
    // no serialized db/session argument is ever forwarded.
    expect(spy.mock.calls[0][1]).toEqual({
      workspaceId: "w1",
      name: "Intake",
    });
    expect(spy.mock.calls[0].length).toBe(2);
    expect(mockedRevalidate).toHaveBeenCalledOnce();
  });

  it("boundary failure propagates safe message; NO revalidate on failure", async () => {
    const actions = await import(actionsPath);
    mockedAuth.mockResolvedValue({ user: { id: "u1" } });
    vi.spyOn(boundary, "publishFromAction").mockResolvedValue({
      ok: false,
      message: "This form is archived.",
    });
    const res = await actions.publishForm(
      "w1",
      fd({ formId: "f1", expectedRevision: "2" }),
    );
    expect(res).toEqual({ ok: false, message: "This form is archived." });
    expect(mockedRevalidate).not.toHaveBeenCalled();
  });

  it("forged workspaceId argument is forwarded to the guarded boundary", async () => {
    const actions = await import(actionsPath);
    mockedAuth.mockResolvedValue({ user: { id: "u1" } });
    const pub = vi
      .spyOn(boundary, "publishFromAction")
      .mockResolvedValue({ ok: false, message: DENIED });
    // Attacker supplies workspaceId they don't belong to — the action does
    // NOT authorize; it forwards and the service denies.
    const res = await actions.publishForm(
      "ws_victim",
      fd({ formId: "f1", expectedRevision: "1" }),
    );
    expect(res).toEqual({ ok: false, message: DENIED });
    expect(pub.mock.calls[0][1].workspaceId).toBe("ws_victim");
  });
  it("rejects File/duplicate/missing values on EVERY field of save/publish/archive/open", async () => {
    const actions = await import(actionsPath);
    mockedAuth.mockResolvedValue({ user: { id: "u1" } });
    const saveSpy = vi.spyOn(boundary, "saveDraftFromAction");
    const pubSpy = vi.spyOn(boundary, "publishFromAction");
    const archSpy = vi.spyOn(boundary, "archiveFormFromAction");
    const openSpy = vi.spyOn(boundary, "openDraftFromAction");

    const file = new File(["x"], "f.txt");
    const dup = (key: string) => {
      const f = fd({
        formId: "f1",
        expectedRevision: "1",
        draftJson: "{}",
        name: "Base",
      });
      f.append(key, "extra");
      return f;
    };
    const withField = (
      key: string,
      value: string | File,
      extras: Record<string, string> = {},
    ) => {
      const f = fd({
        formId: "f1",
        expectedRevision: "1",
        draftJson: "{}",
        ...extras,
      });
      f.delete(key);
      f.append(key, value);
      return f;
    };
    const missing = (key: string) => {
      const f = fd({
        formId: "f1",
        expectedRevision: "1",
        draftJson: "{}",
      });
      f.delete(key);
      return f;
    };

    // saveDraft touches formId + expectedRevision + draftJson + optional name
    for (const bad of [
      dup("formId"),
      dup("expectedRevision"),
      dup("draftJson"),
      dup("name"),
      withField("formId", file),
      withField("expectedRevision", file),
      withField("draftJson", file),
      withField("name", file),
      missing("formId"),
      missing("expectedRevision"),
      missing("draftJson"),
    ]) {
      expect(await actions.saveDraft("w1", bad)).toEqual({
        ok: false,
        message: INVALID,
      });
    }
    // publish/archive/open only require formId (+ revision for publish)
    expect(await actions.publishForm("w1", dup("formId"))).toEqual({
      ok: false,
      message: INVALID,
    });
    expect(await actions.publishForm("w1", missing("formId"))).toEqual({
      ok: false,
      message: INVALID,
    });
    expect(await actions.archiveForm("w1", withField("formId", file))).toEqual({
      ok: false,
      message: INVALID,
    });
    expect(await actions.openDraft("w1", missing("formId"))).toEqual({
      ok: false,
      message: INVALID,
    });
    for (const s of [saveSpy, pubSpy, archSpy, openSpy])
      expect(s).not.toHaveBeenCalled();
  });

  it("untrusted workspaceId argument is validated before delegation", async () => {
    const actions = await import(actionsPath);
    mockedAuth.mockResolvedValue({ user: { id: "u1" } });
    const spy = vi.spyOn(boundary, "createFormFromAction");
    for (const bad of ["", "x".repeat(5000), 42, null, undefined] as const) {
      const res = await actions.createForm(bad as never, fd({ name: "N" }));
      expect(res).toEqual({ ok: false, message: INVALID });
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("optional name: absent forwards undefined; blank forwards to service policy", async () => {
    const actions = await import(actionsPath);
    mockedAuth.mockResolvedValue({ user: { id: "u1" } });
    const spy = vi
      .spyOn(boundary, "saveDraftFromAction")
      .mockResolvedValue({ ok: false, message: INVALID });
    const okPayload = fd({
      formId: "f1",
      expectedRevision: "1",
      draftJson: "{}",
    });
    await actions.saveDraft("w1", okPayload);
    expect(spy.mock.calls[0][1].name).toBeUndefined();
    // Blank/whitespace name is FORWARDED — the service's cleanText policy
    // rejects it (boundary mock returns INVALID here, as real service does).
    const withBlank = fd({
      formId: "f1",
      expectedRevision: "1",
      draftJson: "{}",
      name: "   ",
    });
    const res = await actions.saveDraft("w1", withBlank);
    expect(spy.mock.calls[1][1].name).toBe("   ");
    expect(res).toEqual({ ok: false, message: INVALID });
  });

  it("auth() exception → generic safe failure, no boundary call, no payload log", async () => {
    const actions = await import(actionsPath);
    mockedAuth.mockRejectedValue(
      new Error("session store exploded token=sekrit"),
    );
    const spy = vi.spyOn(boundary, "createFormFromAction");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await actions.createForm(
      "w1",
      fd({ name: "sensitive-draft-title" }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.message).toMatch(/went wrong|try again/i);
      expect(res.message).not.toContain("sekrit");
      expect(res.message).not.toContain("sensitive-draft-title");
    }
    expect(spy).not.toHaveBeenCalled();
    expect(mockedRevalidate).not.toHaveBeenCalled();
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
