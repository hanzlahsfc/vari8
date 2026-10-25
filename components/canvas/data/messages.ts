// Messages domain provider (PR-W0). Owns the conversation messages and the
// per-client composer drafts. Card 05a adds the own-thread remote calls the
// client messages screen reads and writes through.

import type { CoachState, Media, Message } from "../coach/model";
import { apiFetch } from "./http";
import type { CoachSlice } from "./provider";

export const MESSAGES_KEY = "coach-data-messages-v1";

type MessagesData = {
  messages: Message[];
  drafts: Record<
    string,
    { text: string; attachments: Media[]; link?: Message["link"] }
  >;
};

export const messagesSlice: CoachSlice = {
  key: MESSAGES_KEY,
  extract: (state): MessagesData => ({
    messages: state.messages,
    drafts: state.drafts,
  }),
  merge: (slice, state) => {
    if (!slice || typeof slice !== "object")
      throw new Error("Invalid messages slice");
    const data = slice as Partial<MessagesData>;
    state.messages = data.messages as MessagesData["messages"];
    state.drafts = data.drafts as MessagesData["drafts"];
  },
};

/* -------------------------------------------------------------------------
 * Card 05a remote surface: GET/POST /messages over the caller's own thread.
 * Wire shape mirrors lib/messages/service.ts.
 * ---------------------------------------------------------------------- */

export type OwnMessageWire = {
  id: string;
  body: string;
  senderKind: "CLIENT" | "STAFF";
  sentAt: string;
  clientRequestId: string;
};

/** GET messages — the caller's own thread (empty when none exists yet). */
export function fetchOwnMessages(
  workspaceId: string,
): Promise<{ messages: OwnMessageWire[] }> {
  return apiFetch<{ messages: OwnMessageWire[] }>(
    `/workspaces/${workspaceId}/messages`,
  );
}

/** POST messages — a client-authored text send on the caller's own thread. */
export function sendOwnMessage(
  workspaceId: string,
  body: string,
): Promise<{ message: OwnMessageWire }> {
  return apiFetch<{ message: OwnMessageWire }>(
    `/workspaces/${workspaceId}/messages`,
    { method: "POST", body: { body } },
  );
}
