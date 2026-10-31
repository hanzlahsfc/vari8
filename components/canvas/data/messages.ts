// Messages domain provider (PR-W0). Owns the own-thread remote calls the
// client messages screen reads and writes through.
//
// W2-A4: the coach-side messages and composer drafts also sync through the
// staff conversation routes below. The slice still persists both so the
// localStorage seam keeps its full-state round-trip: the local copy is the
// cache and first paint, the remote reads overwrite it once they land.

import type { Media, Message } from "../coach/model";
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

/** W2-T8: one media_object linked onto a message (upload-then-link). */
export type WireAttachment = {
  mediaObjectId: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  position: number;
};

export type OwnMessageWire = {
  id: string;
  body: string;
  senderKind: "CLIENT" | "STAFF";
  sentAt: string;
  clientRequestId: string;
  read: boolean;
  attachments: WireAttachment[];
};

/** GET messages - the caller's own thread (empty when none exists yet). */
export function fetchOwnMessages(
  workspaceId: string,
): Promise<{ messages: OwnMessageWire[] }> {
  return apiFetch<{ messages: OwnMessageWire[] }>(
    `/workspaces/${workspaceId}/messages`,
  );
}

/** POST messages - a client-authored send on the caller's own thread. */
export function sendOwnMessage(
  workspaceId: string,
  body: string,
  mediaObjectIds?: string[],
  clientRequestId?: string,
): Promise<{ message: OwnMessageWire }> {
  return apiFetch<{ message: OwnMessageWire }>(
    `/workspaces/${workspaceId}/messages`,
    {
      method: "POST",
      body: { body, mediaObjectIds, clientRequestId },
    },
  );
}

/** POST messages/read - the client's own mark-read on staff messages. */
export function markOwnThreadRead(
  workspaceId: string,
): Promise<{ marked: number }> {
  return apiFetch<{ marked: number }>(
    `/workspaces/${workspaceId}/messages/read`,
    { method: "POST" },
  );
}

/* -------------------------------------------------------------------------
 * W2-A4 staff surface: the workspace conversation list, one thread, the
 * staff send, mark-read and the composer draft. Wire shapes mirror the
 * Staff* views in lib/messages/service.ts.
 * ---------------------------------------------------------------------- */

export type StaffConversationView = {
  clientProfileId: string;
  clientName: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  hasPriority: boolean;
};

export type StaffMessageView = {
  id: string;
  body: string;
  senderKind: "CLIENT" | "STAFF";
  sentAt: string;
  clientRequestId: string;
  read: boolean;
  priority: boolean;
  links: unknown | null;
  attachments: WireAttachment[];
};

export type StaffThreadView = {
  clientProfileId: string;
  messages: StaffMessageView[];
  draft: { body: string; revision: number } | null;
};

/**
 * One wire row as the canvas Message model. The canvas keys messages by its
 * own client id, so the caller passes the id the thread renders under; the
 * row's clientProfileId is the wire key the request paths use.
 */
export function toCanvasMessage(
  view: StaffMessageView,
  clientId: string,
): Message {
  return {
    id: view.id,
    clientId,
    text: view.body,
    from: view.senderKind === "CLIENT" ? "client" : "coach",
    date: view.sentAt,
    read: view.read,
    priority: view.priority,
    attachments: (view.attachments ?? []).map((attachment) => ({
      // Malformed wire metadata degrades to a safe card instead of
      // crashing the thread — the established unavailable-file path.
      id:
        typeof attachment.mediaObjectId === "string" &&
        attachment.mediaObjectId
          ? attachment.mediaObjectId
          : "unavailable",
      name:
        typeof attachment.fileName === "string" && attachment.fileName
          ? attachment.fileName
          : "attachment unavailable",
      type:
        typeof attachment.contentType === "string"
          ? attachment.contentType
          : "",
      size:
        typeof attachment.byteSize === "number" ? attachment.byteSize : 0,
      mediaObjectId:
        typeof attachment.mediaObjectId === "string"
          ? attachment.mediaObjectId
          : "",
    })),
    link: (view.links as { link?: Message["link"] } | null)?.link,
  };
}

/** GET conversations - every thread in the workspace, newest first. */
export function fetchStaffConversations(
  workspaceId: string,
): Promise<{ conversations: StaffConversationView[] }> {
  return apiFetch<{ conversations: StaffConversationView[] }>(
    `/workspaces/${workspaceId}/conversations`,
  );
}

/** GET conversations/:clientProfileId - one thread plus the caller's draft. */
export function fetchStaffThread(
  workspaceId: string,
  clientProfileId: string,
): Promise<StaffThreadView> {
  return apiFetch<StaffThreadView>(
    `/workspaces/${workspaceId}/conversations/${encodeURIComponent(clientProfileId)}`,
  );
}

/** POST conversations/:clientProfileId - a staff-authored send; the
 *  mediaObjectIds carry the upload-then-link attachment ids (W2-T8). */
export function sendStaffMessage(
  workspaceId: string,
  clientProfileId: string,
  body: string,
  mediaObjectIds?: string[],
): Promise<{ message: StaffMessageView }> {
  return apiFetch<{ message: StaffMessageView }>(
    `/workspaces/${workspaceId}/conversations/${encodeURIComponent(clientProfileId)}`,
    { method: "POST", body: { body, mediaObjectIds } },
  );
}

/** POST conversations/:clientProfileId/read - idempotent mark-read. */
export function markStaffThreadRead(
  workspaceId: string,
  clientProfileId: string,
): Promise<{ marked: number }> {
  return apiFetch<{ marked: number }>(
    `/workspaces/${workspaceId}/conversations/${encodeURIComponent(clientProfileId)}/read`,
    { method: "POST" },
  );
}

/** PUT conversations/:clientProfileId/draft - the caller's composer draft. */
export function saveStaffDraft(
  workspaceId: string,
  clientProfileId: string,
  body: string,
): Promise<{ draft: { body: string; revision: number } }> {
  return apiFetch<{ draft: { body: string; revision: number } }>(
    `/workspaces/${workspaceId}/conversations/${encodeURIComponent(clientProfileId)}/draft`,
    { method: "PUT", body: { body } },
  );
}
