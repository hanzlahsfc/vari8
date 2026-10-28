"use client";

import { useState, useTransition, type FormEvent } from "react";

import { issueClientInvite } from "./actions";

const GENERIC = "Something went wrong. Please try again in a moment.";

/**
 * T3 - invite-link issuance, rendered alongside the setup/pin flow on the
 * client-setups surface for owner/coach (`canWrite`). The issued link is
 * shown once to the inviting coach so they can deliver it through their own
 * channel; the browser never sees an internal id, and the action re-runs
 * the full server-side authorization.
 */
export function InvitePanel({
  workspaceId,
  canWrite,
}: {
  workspaceId: string;
  canWrite: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!canWrite) return null;

  function onIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const formData = new FormData(event.currentTarget);
    setError(null);
    setCopied(false);
    startTransition(async () => {
      try {
        const result = await issueClientInvite(workspaceId, formData);
        if (!result.ok) {
          setError(result.message ?? GENERIC);
          return;
        }
        setLink(result.value.link);
      } catch {
        setError(GENERIC);
      }
    });
  }

  async function onCopy() {
    if (link === null) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${link}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section aria-label="Invite a client" className="invite-panel">
      <h2 className="assignment-manager__subtitle">Invite a client</h2>
      <p className="app-lede">
        Send the invitee a link. They set their name and password on the invite
        page to join this workspace as a client.
      </p>
      <form
        className="assignment-create"
        onSubmit={onIssue}
        data-testid="invite-create"
      >
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <label className="catalog-search__field" htmlFor="invite-email">
          Client email
          <input
            id="invite-email"
            name="email"
            type="email"
            className="catalog-search__input"
            autoComplete="off"
            required
            disabled={pending}
          />
        </label>
        <button
          type="submit"
          className="catalog-search__submit"
          disabled={pending}
        >
          Create invite link
        </button>
      </form>
      {error !== null ? (
        <p
          className="assignment-manager__alert"
          role="alert"
          data-testid="invite-alert"
        >
          {error}
        </p>
      ) : null}
      {link !== null ? (
        <div className="invite-panel__result" data-testid="invite-link-result">
          <label className="catalog-search__field" htmlFor="invite-link">
            Invite link
            <input
              id="invite-link"
              className="catalog-search__input"
              type="text"
              readOnly
              value={`${typeof window === "undefined" ? "" : window.location.origin}${link}`}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <button
            type="button"
            className="catalog-search__submit"
            onClick={onCopy}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <p className="app-lede">The link works once and expires soon.</p>
        </div>
      ) : null}
    </section>
  );
}
