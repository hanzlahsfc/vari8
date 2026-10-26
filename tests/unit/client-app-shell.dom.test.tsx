// @vitest-environment jsdom
// Card w2-c1: the client shell's navigation renders exactly the sections the
// `clientAppSections` registry returns, nothing hardcoded in the shell. A
// view the coach disabled produces no nav item, and every registered+enabled
// section produces one in both the desktop sidebar and the mobile bottom nav.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

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
}) {
  return (
    <CoachProvider>
      <ClientApp
        configuration={props.configuration}
        client={client(props.plans)}
        context="standalone"
        brand={props.brand}
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
});
