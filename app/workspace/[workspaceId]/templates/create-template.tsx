"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createTemplate } from "./actions";

/** P-014 — create a coaching template container (server-minted ID; the
 * draft opens empty and sections/items are added in the editor). */
export function CreateTemplateForm({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await createTemplate(workspaceId, fd);
      if (r.ok) {
        router.push(
          `/workspace/${encodeURIComponent(workspaceId)}/templates/${encodeURIComponent(r.value.templateId)}`,
        );
      } else setError(r.message);
    });
  }

  return (
    <form
      className="auth-form"
      data-testid="create-template-form"
      onSubmit={submit}
    >
      {error ? (
        <p className="auth-error" role="alert" data-testid="template-error">
          {error}
        </p>
      ) : null}
      <label className="auth-field" htmlFor="template-name">
        Template name
        <input
          className="auth-input"
          id="template-name"
          maxLength={120}
          name="name"
          required
          type="text"
        />
      </label>
      <button
        className="auth-button"
        data-testid="create-template"
        disabled={pending}
        type="submit"
      >
        New template
      </button>
    </form>
  );
}
