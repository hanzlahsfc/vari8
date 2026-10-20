// Messages domain provider (PR-W0). Owns the conversation messages and the
// per-client composer drafts. PR-MSG wires this domain to the server; it
// edits this file only.

import type { CoachState, Media, Message } from "../coach/model";
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
    state.messages = data.messages as Message[];
    state.drafts = data.drafts as MessagesData["drafts"];
  },
};
