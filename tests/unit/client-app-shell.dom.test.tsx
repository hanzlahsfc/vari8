// @vitest-environment jsdom
// Card w2-c1: the client shell's navigation renders exactly the sections the
// `clientAppSections` registry returns, nothing hardcoded in the shell. A
// view the coach disabled produces no nav item, and every registered+enabled
// section produces one in both the desktop sidebar and the mobile bottom nav.

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const remoteCalls = vi.hoisted(() => ({
  fetchOwnMessages: vi.fn(async (_w?: string) => ({ messages: [] })),
  markOwnThreadRead: vi.fn(async (_w?: string) => ({ marked: 0 })),
  sendOwnMessage: vi.fn(
    async (_w?: string, _b?: string, _m?: string[], _r?: string) => ({
      message: { id: "m-0" },
    }),
  ),
}));
vi.mock("../../components/canvas/data/messages", async (importOriginal) => {
  const mod =
    await importOriginal<
      typeof import("../../components/canvas/data/messages")
    >();
  return {
    ...mod,
    fetchOwnMessages: (w: string) => remoteCalls.fetchOwnMessages(w),
    markOwnThreadRead: (w: string) => remoteCalls.markOwnThreadRead(w),
    sendOwnMessage: (w: string, b: string, m?: string[], r?: string) =>
      remoteCalls.sendOwnMessage(w, b, m, r),
  };
});

// jsdom has no ResizeObserver; the dashboard widgets measure themselves.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// jsdom has no matchMedia; the dashboard builder's reduced-motion hook
// needs a stub.
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }),
  });
}

import type { CoachClient, Variant } from "../../components/canvas/coach/model";
import type { ClientPlans } from "../../components/canvas/coach/plans/types";
import { CoachProvider } from "../../components/canvas/coach/store";
import { clientAppSections } from "../../components/canvas/client-app/sections";
import { ClientApp } from "../../components/canvas/client-app/client-app";

function Shell(props: {
  configuration: Variant;
  plans?: ClientPlans;
  brand?: string;
  context?: "standalone" | "preview";
  own?: { workspaceId: string; clientProfileId: string };
}) {
  return (
    <CoachProvider>
      <ClientApp
        configuration={props.configuration}
        client={client(props.plans)}
        context={props.context ?? "standalone"}
        brand={props.brand}
        own={props.own}
      />
    </CoachProvider>
  );
}

function configuration(views: string[], habits = false): Variant {
  return {
    id: "variant-test",
    name: "Test variant",
    nutrition: "Meal plan",
    views,
    habits,
    widgets: [],
    fields: [],
    roadmap: [],
    training: {
      fields: [],
      volume: true,
      breakdown: "",
      presentation: "",
    },
    questions: [],
    summaries: [],
  };
}

function client(plans?: ClientPlans): CoachClient {
  return {
    id: "client-test",
    name: "Amara Lewis",
    email: "",
    priorityMessages: false,
    trainingFlags: 0,
    additionalCheckInDates: [],
    clientTasks: [],
    coachTasks: [],
    internalNotes: [],
    generalNotes: [],
    checkIns: [],
    messages: [],
    media: [],
    schedules: [],
    plan: {
      calories: 0,
      protein: 0,
      sets: 0,
      instructions: "",
      nutritionVariant: "Training day",
      program: "Evergreen",
      weeks: 0,
    },
    entries: [],
    habits: [],
    plans,
  } as unknown as CoachClient;
}

const ALL_VIEWS = [
  "Dashboard",
  "Tracker",
  "Nutrition",
  "Timeline / Roadmap",
  "Training Program",
  "Check-In",
];

const plans: ClientPlans = {
  nutrition: {
    mealPlan: { history: [] },
    iifym: { history: [] },
  },
  training: { history: [] },
  goals: [],
  activityTargets: [{ id: "at-1" }],
  supplements: { items: [] },
} as unknown as ClientPlans;

function navLabels(container: HTMLElement, selector: string) {
  return [...container.querySelectorAll<HTMLElement>(selector)].map((element) =>
    element.textContent?.trim(),
  );
}

describe("client shell navigation", () => {
  afterEach(cleanup);

  it("renders every section the registry returns, in both navs", () => {
    const variant = configuration(ALL_VIEWS);
    const expected = clientAppSections(variant, plans);
    const { container } = render(
      <Shell configuration={variant} plans={plans} />,
    );
    const side = navLabels(container, ".cd-client-app-nav .cd-client-app-link");
    const bottom = navLabels(
      container,
      ".cd-client-app-bottom .cd-client-app-link",
    );
    const labels = expected.map((section) => section.label);
    expect(side).toEqual(labels);
    expect(bottom).toEqual(labels);
    expect(labels).toContain("Check-ins");
  });

  it("omits a section the coach disabled", () => {
    const variant = configuration(ALL_VIEWS.filter((v) => v !== "Check-In"));
    const { container } = render(
      <Shell configuration={variant} plans={plans} />,
    );
    const side = navLabels(container, ".cd-client-app-nav .cd-client-app-link");
    expect(side).not.toContain("Check-ins");
    expect(side).toContain("Home");
  });

  it("shows the workspace brand beside the nav", () => {
    const variant = configuration(ALL_VIEWS);
    const { container } = render(
      <Shell configuration={variant} plans={plans} brand="Studio Meridian" />,
    );
    const brand = container.querySelector(".cd-client-app-brand");
    expect(brand?.textContent).toContain("Studio Meridian");
  });

  it("reaches the conversation with no Dashboard — or any — template view", async () => {
    remoteCalls.fetchOwnMessages.mockClear();
    const { container } = render(
      <Shell
        configuration={configuration([])}
        own={{ workspaceId: "ws-1", clientProfileId: "cp-1" }}
      />,
    );
    const side = navLabels(container, ".cd-client-app-nav .cd-client-app-link");
    expect(side).toEqual(["Messages"]);
    await waitFor(() =>
      expect(remoteCalls.fetchOwnMessages).toHaveBeenCalledWith("ws-1"),
    );
    expect(container.textContent).toContain("Coach conversation");
  });

  it("a preview mount never binds the own scope — no Messages, no calls", async () => {
    remoteCalls.fetchOwnMessages.mockClear();
    remoteCalls.markOwnThreadRead.mockClear();
    const { container } = render(
      <Shell
        configuration={configuration([])}
        plans={plans}
        context="preview"
        own={{ workspaceId: "ws-1", clientProfileId: "cp-1" }}
      />,
    );
    const side = navLabels(container, ".cd-client-app-nav .cd-client-app-link");
    expect(side).not.toContain("Messages");
    expect(side).not.toContain("Home");
    // A stray own pair in preview context must not reach the own routes.
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(remoteCalls.fetchOwnMessages).not.toHaveBeenCalled();
    expect(remoteCalls.markOwnThreadRead).not.toHaveBeenCalled();
  });
});
