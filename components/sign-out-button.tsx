"use client";

import { signOutAction } from "@/app/logout/actions";
import { clearVoiceTranscriptCache } from "./canvas/coach/voice-transcript";

/** S1-H sign-out control for the workspace shell header. */
export function SignOutButton() {
  return (
    <form
      action={async () => {
        // P693: temporary transcripts are sensitive per-actor state — drop
        // them at the logout boundary, before the session ends.
        clearVoiceTranscriptCache();
        await signOutAction();
      }}
      className="shell__signout"
    >
      <button type="submit" className="auth-button" data-testid="sign-out">
        Sign out
      </button>
    </form>
  );
}
