"use client";

import { useActionState } from "react";

import {
  scheduleCheckInInstanceAction,
  type StaffCheckInActionState,
} from "@/app/workspace/[workspaceId]/clients/[clientProfileId]/checkins/actions";

/**
 * P-025-B — staff one-off scheduling form (decisions #92, #95). The form
 * selects a published version POSITIONALLY — the option value carries the
 * server list index only; the action maps it back to server-side
 * (formId, formVersionId) and never trusts a browser-supplied internal ID.
 */
export function ScheduleCheckInInstanceForm({
  workspaceId,
  clientProfileId,
  options,
}: {
  workspaceId: string;
  clientProfileId: string;
  options: Array<{
    position: number;
    formName: string;
    versionSeq: number;
  }>;
}) {
  const [state, action, pending] = useActionState<
    StaffCheckInActionState,
    FormData
  >(scheduleCheckInInstanceAction, { ok: "idle" });

  return (
    <form
      action={action}
      className="tracker-page"
      data-testid="checkin-schedule-form"
    >
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="clientProfileId" value={clientProfileId} />
      <div className="daily-field">
        <label htmlFor="checkin-schedule-version">Published form version</label>
        <select
          id="checkin-schedule-version"
          name="formVersionPosition"
          className="catalog-search__input"
          disabled={pending || options.length === 0}
          required
          data-testid="checkin-schedule-version"
        >
          {options.map((o) => (
            <option key={o.position} value={String(o.position)}>
              {o.formName} — v{o.versionSeq}
            </option>
          ))}
        </select>
      </div>
      <div className="daily-field">
        <label htmlFor="checkin-schedule-due">Due at (UTC)</label>
        <input
          id="checkin-schedule-due"
          name="dueAt"
          className="catalog-search__input"
          type="datetime-local"
          disabled={pending || options.length === 0}
          required
          data-testid="checkin-schedule-due"
        />
      </div>
      <div aria-live="polite" data-testid="checkin-schedule-alert">
        {state.ok === false ? (
          <p className="daily-errors" role="alert">
            {state.message}
          </p>
        ) : null}
        {state.ok === true ? (
          <p className="daily-todo" role="status">
            {state.status === "already_scheduled"
              ? "That Check-In is already scheduled."
              : "Check-In scheduled."}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        className="auth-button"
        style={{ minHeight: "44px" }}
        disabled={pending || options.length === 0}
        data-testid="checkin-schedule-submit"
      >
        {pending ? "Scheduling…" : "Schedule Check-In"}
      </button>
      {options.length === 0 ? (
        <p className="daily-todo" data-testid="checkin-schedule-empty">
          No published Check-In forms — publish one in Check-In Forms first.
        </p>
      ) : null}
    </form>
  );
}
