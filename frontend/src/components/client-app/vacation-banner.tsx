"use client";
import { resolvedTimeZone, vacationFor, zonedToday } from "../coach/model";
import { useCoach, useCoachNow, useDisplay } from "../coach/store";
import { vacationBackDay } from "../coach/vacations";

/** "Your coach is away until Sun 26 Oct. Back on Mon 27 Oct." — shown in
 * the athlete app while the coach's vacation covers today. */
export function VacationBanner() {
  const { state } = useCoach();
  const { formatDate } = useDisplay();
  const now = useCoachNow();
  const vacation = vacationFor(
    state.preferences,
    zonedToday(resolvedTimeZone(state.preferences), now),
  );
  if (!vacation) return null;
  const fmt = (d: string) =>
    formatDate(d, { weekday: "short", day: "numeric", month: "short" });
  return (
    <p className="cm-vacation-banner" role="status">
      Your coach is away until {fmt(vacation.end)}. Back on{" "}
      {fmt(vacationBackDay(state.preferences, vacation))}.
    </p>
  );
}
