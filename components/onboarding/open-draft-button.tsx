"use client";

/**
 * P-008 ES-4a INERT SCAFFOLD — reopen control for the no-draft branch.
 *
 * Renders the `open-draft` control (plus the alert region the real
 * component will use) so the committed lifecycle tests have a real
 * mountable module; the press is an explicit no-op — no action
 * invocation, no fake outcome. ES-4a production wires the real
 * `openDraft` call, pending disable, and alert surface.
 */
export function OpenDraftButton(_props: {
  workspaceId: string;
  formId: string;
}) {
  return (
    <>
      <div role="alert" />
      <button
        className="auth-button"
        data-testid="open-draft"
        onClick={() => {}}
        type="button"
      >
        Reopen draft
      </button>
    </>
  );
}
