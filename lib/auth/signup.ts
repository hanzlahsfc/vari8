import { randomBytes } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "../db";
import { normalizeEmail } from "../email";
import { hashPassword } from "../password";
import { validatePasswordSetup } from "../password-policy";

/**
 * PR-05 coach self-signup (owner answer 5): a coach creates their account AND
 * their workspace in one transaction — user, credential account (Better Auth
 * password store), workspace, and the WORKSPACE_OWNER membership are either
 * all written or none. Better Auth's own /sign-up/email endpoint is disabled
 * so no orphan users can be created outside this flow.
 *
 * Clients never self-register — they join through workspace invitations.
 */

export type SignupErrorCode = "invalid_input" | "email_taken";

export class SignupError extends Error {
  constructor(readonly code: SignupErrorCode) {
    super(code);
    this.name = "SignupError";
  }
}

export type SignupInput = {
  name: unknown;
  email: unknown;
  password: unknown;
  workspaceName: unknown;
};

export type SignupResult = { userId: string; workspaceId: string };

const NAME_MAX = 120;

function boundedName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (name.length === 0 || name.length > NAME_MAX) {
    throw new SignupError("invalid_input");
  }
  return name;
}

function workspaceSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base === "" ? "workspace" : base}-${randomBytes(4).toString("hex")}`;
}

export async function signUpCoachAccount(
  input: SignupInput,
  client: PrismaClient = prisma,
): Promise<SignupResult> {
  const email = normalizeEmail(input.email);
  const name = boundedName(input.name);
  const workspaceName = boundedName(input.workspaceName);
  if (!email.includes("@") || email.length > 254) {
    throw new SignupError("invalid_input");
  }
  // validatePasswordSetup throws PasswordPolicyError with a structural code —
  // callers map codes to copy; the candidate never appears in errors.
  const password = validatePasswordSetup(input.password);
  const passwordHash = await hashPassword(password);
  const slug = workspaceSlug(workspaceName);

  try {
    return await client.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (existing) throw new SignupError("email_taken");

      const user = await tx.user.create({
        data: { email, name, passwordHash, status: "ACTIVE" },
        select: { id: true },
      });
      await tx.account.create({
        data: {
          userId: user.id,
          accountId: user.id,
          providerId: "credential",
          password: passwordHash,
        },
      });
      const workspace = await tx.workspace.create({
        data: { name: workspaceName, slug },
        select: { id: true },
      });
      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: "WORKSPACE_OWNER",
          status: "ACTIVE",
        },
      });
      return { userId: user.id, workspaceId: workspace.id };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new SignupError("email_taken");
    }
    throw error;
  }
}
