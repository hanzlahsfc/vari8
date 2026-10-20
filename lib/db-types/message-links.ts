/**
 * PR-M0 (schema v2) - message/draft `links` JSONB shape. Mirrors the
 * canvas `Route` in frontend/src/components/coach/model.ts.
 */
import { z } from "zod";

export const messageLinkRoute = z.object({
  section: z.enum(["clients", "templates", "check-ins", "messages", "notes"]),
  client: z.string().optional(),
  editor: z.string().optional(),
  review: z.string().optional(),
  plan: z.string().optional(),
  tab: z.string().optional(),
});
export type MessageLinkRoute = z.infer<typeof messageLinkRoute>;

export const messageLink = z.object({
  label: z.string(),
  route: messageLinkRoute,
});
export type MessageLink = z.infer<typeof messageLink>;

export const messageLinks = z.array(messageLink);
export type MessageLinks = z.infer<typeof messageLinks>;
