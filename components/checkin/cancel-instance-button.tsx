"use client";

import { useActionState, useState } from "react";

import {
  cancelCheckInInstanceAction,
  type StaffCheckInActionState,
} from "@/app/workspace/[workspaceId]/clients/[clientProfileId]/checkins/actions";

/**
 * P-025-B — two-step destructive cancellation (#97). First press arms the
 * confirmation; only the second press submits. Pending disables both
 * controls; the service still rejects anything that isn't SCHEDULED.
 */
export function CancelCheckInInstanceButton({
  workspaceId,
  clientProfileId,
  instanceId,
}: {
  workspaceId: string;
  clientProfileId: string;
  instanceId: string;
}) {
  const [armed, setArmed] = useState(false);
  const [state, action, pending] = useActionState<
    StaffCheckInActionState,
    FormData
  >(cancelCheckInInstanceAction, { ok: "idle" });

  return (
    <form
      action={action}
      className="checkin-cancel"
      data-testid="checkin-cancel-form"
      onSubmit={() => {
        if (!armed) setArmed(true);
      }}
    >
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="clientProfileId" value={clientProfileId} />
      <input type="hidden" name="instanceId" value={instanceId} />
      {state.ok === false ? (
        <p className="daily-errors" role="alert" aria-live="polite">
          {state.message}
        </p>
      ) : null}
      {state.ok === true ? (
        <p className="daily-todo" role="status" aria-live="polite">
          Check-In cancelled.
        </p>
      ) : null}
      {!armed ? (
        <button
          type="button"
          className="auth-button"
          style={{ minHeight: "44px" }}
          disabled={pending}
          data-testid="checkin-cancel-arm"
          onClick={() => setArmed(true)}
        >
          Cancel Check-In
        </button>
      ) : (
        <span className="checkin-cancel__confirm">
          <button
            type="submit"
            className="auth-button"
            style={{ minHeight: "44px" }}
            disabled={pending}
            data-testid="checkin-cancel-confirm"
          >
            {pending ? "Cancelling…" : "Confirm cancellation"}
          </button>
          <button
            type="button"
            className="auth-button"
            style={{ minHeight: "44px" }}
            disabled={pending}
            data-testid="checkin-cancel-abort"
            onClick={() => setArmed(false)}
          >
            Keep
          </button>
        </span>
      )}
    </form>
  );
}
