/**
 * Shared email normalization — canonical form is trimmed + lowercased.
 * Moved out of the deleted Auth.js credentials module in PR-05.
 */
import type { PrismaClient } from "@prisma/client";

import { prisma } from "./db";
import { logError } from "./log";
import { sendMail, type MailMessage } from "./mail";
import { memberPreferenceEnabled } from "./workspace/member-preferences";

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * W2-T1 (R10): notification delivery gate. A notification send reads the
 * member's preference row at send time; a disabled type is skipped, a
 * missing row means the default (enabled). Transactional mail (invites,
 * password reset) never goes through this path - it stays on sendMail
 * directly and can never be toggled off.
 */

/** Notification types that can reach the member by email. */
export const EMAIL_NOTIFICATION_KEYS = ["email.messages"] as const;
export type EmailNotificationKey = (typeof EMAIL_NOTIFICATION_KEYS)[number];

type NotifyPrisma = Pick<
  PrismaClient,
  "memberPreference" | "workspaceMember" | "workspace" | "clientProfile"
>;

export type NotificationDeps = {
  db?: NotifyPrisma;
  send?: (message: MailMessage) => Promise<void>;
};

/**
 * One member, one notification type, one message. Answers "sent" or
 * "skipped" so producers can count delivery without catching.
 */
export async function sendMemberNotificationMail(
  input: {
    workspaceId: string;
    memberId: string;
    key: EmailNotificationKey;
    message: MailMessage;
  },
  deps: NotificationDeps = {},
): Promise<"sent" | "skipped"> {
  const enabled = await memberPreferenceEnabled(
    input.workspaceId,
    input.memberId,
    input.key,
    { db: deps.db },
  );
  if (!enabled) return "skipped";
  const send = deps.send ?? sendMail;
  await send(input.message);
  return "sent";
}

/** Staff roles that receive client-message notifications (D15 staff). */
const STAFF_NOTIFY_ROLES = ["WORKSPACE_OWNER", "COACH"] as const;

/**
 * A client authored a message: notify the workspace's ACTIVE staff members
 * whose "email.messages" preference is on. Per-recipient failures are
 * contained - a failed delivery is logged and the loop continues, so mail
 * trouble never fails the message send that triggered it.
 */
export async function notifyStaffOfClientMessage(
  input: { workspaceId: string; clientProfileId: string },
  deps: NotificationDeps = {},
): Promise<number> {
  const db = deps.db ?? prisma;
  const send = deps.send ?? sendMail;
  const [workspace, client, members] = await Promise.all([
    db.workspace.findUnique({
      where: { id: input.workspaceId },
      select: { name: true },
    }),
    db.clientProfile.findFirst({
      where: { id: input.clientProfileId, workspaceId: input.workspaceId },
      select: { id: true, name: true },
    }),
    db.workspaceMember.findMany({
      where: {
        workspaceId: input.workspaceId,
        status: "ACTIVE",
        role: { in: [...STAFF_NOTIFY_ROLES] },
      },
      select: {
        id: true,
        user: { select: { email: true, status: true } },
      },
    }),
  ]);
  if (!workspace || !client) return 0;
  let delivered = 0;
  for (const member of members) {
    const to = normalizeEmail(member.user.email);
    if (member.user.status !== "ACTIVE" || to.length === 0) continue;
    try {
      const result = await sendMemberNotificationMail(
        {
          workspaceId: input.workspaceId,
          memberId: member.id,
          key: "email.messages",
          message: {
            to,
            subject: `New message from ${client.name}`,
            text: `${client.name} sent you a message in ${workspace.name}. Open the workspace to reply.`,
          },
        },
        { db, send },
      );
      if (result === "sent") delivered += 1;
    } catch (error) {
      logError("notification_delivery_failed", {
        workspaceId: input.workspaceId,
        memberId: member.id,
        key: "email.messages",
        error,
      });
    }
  }
  return delivered;
}
