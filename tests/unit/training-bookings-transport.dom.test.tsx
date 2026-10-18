// @vitest-environment jsdom

/**
 * TRAINING-I1B-R3 — transport-failure regression for the staff booking
 * panel (acceptance defect A1-D1). A rejected server-action promise must
 * not escape startTransition to the app error boundary: mutations surface
 * truthful uncertainty in `booking-message` (a lost response does not
 * prove the server failed to commit), inputs/pending are preserved, and
 * pagination surfaces `bookings-history-error` with rows + cursor intact
 * so the same-cursor retry succeeds without duplicates. Structured action
 * errors keep their existing handling. Rejections here are mocked
 * transport failures — component-only evidence, not real-server proof.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock(
  "../../app/workspace/[workspaceId]/clients/[clientProfileId]/training-program/actions",
  () => ({
    bookTrainingSessionAction: vi.fn(),
    cancelTrainingBookingAction: vi.fn(),
    listTrainingBookingsAction: vi.fn(),
    moveTrainingBookingAction: vi.fn(),
  }),
);

import { TrainingBookings } from "../../components/trainingprogram/program-bookings";
import type { StaffBooking } from "../../lib/trainingprogram/service";
import {
  bookTrainingSessionAction,
  cancelTrainingBookingAction,
  listTrainingBookingsAction,
  moveTrainingBookingAction,
} from "../../app/workspace/[workspaceId]/clients/[clientProfileId]/training-program/actions";

const session = (id: string, name = `Session ${id}`) => ({
  id,
  name,
  exercises: [],
});

const booking = (id: string, date: string): StaffBooking => ({
  bookingId: id,
  scheduledDate: date,
  bookedWeek: 1,
  pinnedVersionSeq: 1,
  session: session(`sess-${id}`, `Pinned ${id}`),
  cancelledAt: null,
  programUpdatedSinceBooked: false,
});

const initial = (over?: Partial<Parameters<typeof TrainingBookings>[0]["initial"]>) => ({
  upcoming: [] as StaffBooking[],
  history: [booking("h1", "2026-09-01")],
  nextCursor: { scheduledDate: "2026-09-01", id: "h1" } as {
    scheduledDate: string;
    id: string;
  } | null,
  hasMore: true,
  canWrite: true,
  ...over,
});

function renderPanel(over?: Parameters<typeof initial>[0]) {
  return render(
    <TrainingBookings
      workspaceId="ws1"
      clientProfileId="cp1"
      programId="prog1"
      initial={initial(over)}
      bookableSessions={[session("s1", "Lift day")]}
      canWrite
    />,
  );
}

function fillBookingForm() {
  fireEvent.change(screen.getByTestId("booking-session"), {
    target: { value: "s1" },
  });
  fireEvent.change(screen.getByTestId("booking-date"), {
    target: { value: "2026-11-05" },
  });
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("TRAINING-I1B-R3 transport failures (A1-D1)", () => {
  it("rejected mutation dispatch shows truthful uncertainty in booking-message, keeps inputs, clears pending", async () => {
    // Response lost after the request was sent — the client cannot know
    // whether the server committed.
    vi.mocked(bookTrainingSessionAction).mockRejectedValue(
      new Error("fetch failed"),
    );
    renderPanel();
    fillBookingForm();
    fireEvent.click(screen.getByTestId("booking-submit"));

    const msg = await screen.findByTestId("booking-message");
    // Truthful copy: confirmation not received — never claims the
    // booking did or did not happen.
    expect(msg.textContent).toMatch(/could not confirm/i);
    // Reconciliation offered instead of auto-retry.
    expect(refresh).toHaveBeenCalled();
    // Inputs preserved; pending released.
    expect(
      (screen.getByTestId("booking-session") as HTMLSelectElement).value,
    ).toBe("s1");
    expect(
      (screen.getByTestId("booking-date") as HTMLInputElement).value,
    ).toBe("2026-11-05");
    await vi.waitFor(() =>
      expect(
        screen.getByTestId("booking-submit") as HTMLButtonElement,
      ).not.toBeDisabled(),
    );
  });

  it("rejected move dispatch reports uncertainty without claiming failure", async () => {
    vi.mocked(moveTrainingBookingAction).mockRejectedValue(new Error("offline"));
    renderPanel({ upcoming: [booking("u1", "2026-11-10")] });
    const date = screen.getByTestId("booking-u1-move-date");
    fireEvent.change(date, { target: { value: "2026-11-12" } });
    fireEvent.click(screen.getByTestId("booking-u1-move"));
    const msg = await screen.findByTestId("booking-message");
    expect(msg.textContent).toMatch(/could not confirm/i);
    expect(msg.textContent).not.toMatch(/not moved/i);
  });

  it("rejected cancel dispatch reports uncertainty without claiming failure", async () => {
    vi.mocked(cancelTrainingBookingAction).mockRejectedValue(
      new Error("offline"),
    );
    renderPanel({ upcoming: [booking("u1", "2026-11-10")] });
    fireEvent.click(screen.getByTestId("booking-u1-cancel"));
    const msg = await screen.findByTestId("booking-message");
    expect(msg.textContent).toMatch(/could not confirm/i);
    expect(msg.textContent).not.toMatch(/not cancelled/i);
  });

  it("rejected pagination dispatch shows bookings-history-error; rows + cursor intact; same-cursor retry dedupes", async () => {
    vi.mocked(listTrainingBookingsAction)
      .mockRejectedValueOnce(new Error("transport"))
      .mockResolvedValue({
        status: "ok",
        // Server re-returns the boundary row — dedupe keeps it single.
        history: [booking("h1", "2026-09-01"), booking("h2", "2026-08-20")],
        nextCursor: null,
      });
    renderPanel();
    const more = screen.getByTestId("bookings-history-more");
    fireEvent.click(more);

    await screen.findByTestId("bookings-history-error");
    // Loaded row still rendered; control still offered for the same cursor.
    expect(screen.getByTestId("history-h1-booking")).toBeTruthy();
    expect(screen.getByTestId("bookings-history-more")).toBeTruthy();
    await vi.waitFor(() =>
      expect(
        screen.getByTestId("bookings-history-more") as HTMLButtonElement,
      ).not.toBeDisabled(),
    );

    // Retry — must send the ORIGINAL cursor, not an advanced one.
    fireEvent.click(screen.getByTestId("bookings-history-more"));
    await screen.findByTestId("history-h2-booking");
    expect(
      vi.mocked(listTrainingBookingsAction).mock.calls[1][0].cursor,
    ).toEqual({ scheduledDate: "2026-09-01", id: "h1" });
    expect(
      document.querySelectorAll('[data-testid="history-h1-booking"]'),
    ).toHaveLength(1);
    // Final page: control removed.
    expect(screen.queryByTestId("bookings-history-more")).toBeNull();
    expect(screen.queryByTestId("bookings-history-error")).toBeNull();
  });

  it("structured action errors keep their existing presentation", async () => {
    vi.mocked(bookTrainingSessionAction).mockResolvedValue({
      status: "error",
      message: "You don't have access to do that.",
    });
    renderPanel();
    fillBookingForm();
    fireEvent.click(screen.getByTestId("booking-submit"));
    const msg = await screen.findByTestId("booking-message");
    expect(msg.textContent).toBe("You don't have access to do that.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("normal book path still surfaces its success message", async () => {
    vi.mocked(bookTrainingSessionAction).mockResolvedValue({
      status: "ok",
      message: "Session booked.",
    });
    renderPanel();
    fillBookingForm();
    fireEvent.click(screen.getByTestId("booking-submit"));
    const msg = await screen.findByTestId("booking-message");
    expect(msg.textContent).toBe("Session booked.");
  });
});
