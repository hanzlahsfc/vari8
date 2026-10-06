"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { publishTemplate, saveTemplateDraft } from "../actions";

/**
 * P-014 — bounded coaching-template draft editor.
 *
 * Local state mirrors the stored caller shape: { title, sections[] } with
 * server-minted section/item IDs echoed back for known rows. Submitted
 * drafts carry no server-stamped fields — the server mints IDs for new
 * rows and stamps acknowledgment revisions. Server conflicts
 * (`stale_revision`, `parameter_changed`, archived-reference rejections)
 * surface verbatim via the boundary's stable messages.
 */
type Param = { key: string; label: string; kind: string; status: string };

type EditableItem = {
  itemId?: string;
  // Index into `activeParameters` — parameter keys/IDs never enter the DOM.
  parameterIndex: number;
  required: boolean;
  order: number;
};
type EditableSection = {
  sectionId?: string;
  label: string;
  order: number;
  items: EditableItem[];
};

type Draft = {
  title: string;
  sections: Array<{
    sectionId: string;
    label: string;
    order: number;
    items: Array<{
      itemId: string;
      parameterKey: string;
      required: boolean;
      order: number;
    }>;
  }>;
};

function toEditable(draft: Draft, parameters: Param[]): EditableSection[] {
  return draft.sections.map((s) => ({
    sectionId: s.sectionId,
    label: s.label,
    order: s.order,
    items: s.items.map((i) => ({
      itemId: i.itemId,
      // Resolve the stored key to the picker's index; -1 = the parameter is
      // no longer active (archived/removed) — submission fails closed
      // server-side, forcing the coach to remove or replace it.
      parameterIndex: Math.max(
        -1,
        parameters.findIndex((p) => p.key === i.parameterKey),
      ),
      required: i.required,
      order: i.order,
    })),
  }));
}

export function TemplateEditor({
  workspaceId,
  templateId,
  templateName,
  initialDraft,
  initialRevision,
  activeParameters,
}: {
  workspaceId: string;
  templateId: string;
  templateName: string;
  initialDraft: Draft;
  initialRevision: number;
  activeParameters: Param[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(initialDraft.title);
  const [sections, setSections] = useState<EditableSection[]>(() =>
    toEditable(initialDraft, activeParameters),
  );
  const [revision, setRevision] = useState(initialRevision);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const payload = () => ({
    title,
    sections: sections.map((s, order) => ({
      ...(s.sectionId ? { sectionId: s.sectionId } : {}),
      label: s.label,
      order,
      items: s.items.map((i, iOrder) => ({
        ...(i.itemId ? { itemId: i.itemId } : {}),
        // Unresolvable picks submit the empty string — the server rejects.
        parameterKey: activeParameters[i.parameterIndex]?.key ?? "",
        required: i.required,
        order: iOrder,
      })),
    })),
  });

  function submitSave() {
    const body = new FormData();
    body.append("templateId", templateId);
    body.append("expectedRevision", String(revision));
    body.append("draft", JSON.stringify(payload()));
    startTransition(async () => {
      const r = await saveTemplateDraft(workspaceId, body);
      if (r.ok) {
        setError(null);
        setNotice("Draft saved.");
        setRevision(r.value.revision);
        router.refresh();
      } else {
        setNotice(null);
        setError(r.message);
      }
    });
  }

  function submitPublish() {
    const body = new FormData();
    body.append("templateId", templateId);
    body.append("expectedRevision", String(revision));
    startTransition(async () => {
      const r = await publishTemplate(workspaceId, body);
      if (r.ok) {
        setError(null);
        router.refresh();
      } else {
        setNotice(null);
        setError(r.message);
      }
    });
  }

  function addSection() {
    setSections((s) => [...s, { label: "", order: s.length, items: [] }]);
  }

  function addItem(sectionIndex: number) {
    setSections((s) =>
      s.map((sec, i) =>
        i === sectionIndex
          ? {
              ...sec,
              items: [
                ...sec.items,
                {
                  parameterIndex: 0,
                  required: false,
                  order: sec.items.length,
                },
              ],
            }
          : sec,
      ),
    );
  }

  function moveItem(sectionIndex: number, itemIndex: number, dir: -1 | 1) {
    setSections((s) =>
      s.map((sec, i) => {
        if (i !== sectionIndex) return sec;
        const items = [...sec.items];
        const j = itemIndex + dir;
        if (j < 0 || j >= items.length) return sec;
        [items[itemIndex], items[j]] = [items[j], items[itemIndex]];
        return { ...sec, items };
      }),
    );
  }

  return (
    <section data-testid="template-draft-editor">
      {error ? (
        <p className="auth-error" role="alert" data-testid="template-error">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="auth-hint" data-testid="template-notice" role="status">
          {notice}
        </p>
      ) : null}
      <label className="auth-field" htmlFor="template-title">
        Draft title
        <input
          className="auth-input"
          data-testid="draft-title"
          id="template-title"
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          type="text"
          value={title}
        />
      </label>
      <p className="auth-hint">Editing {templateName}</p>
      {sections.map((section, si) => (
        <fieldset
          className="auth-form"
          data-testid={`draft-section-${si}`}
          key={section.sectionId ?? `new-${si}`}
        >
          <legend>Section {si + 1}</legend>
          <label className="auth-field" htmlFor={`section-label-${si}`}>
            Section label
            <input
              className="auth-input"
              data-testid={`section-label-${si}`}
              id={`section-label-${si}`}
              maxLength={120}
              onChange={(e) =>
                setSections((s) =>
                  s.map((x, i) =>
                    i === si ? { ...x, label: e.target.value } : x,
                  ),
                )
              }
              type="text"
              value={section.label}
            />
          </label>
          <ul>
            {section.items.map((item, ii) => (
              <li
                data-testid={`draft-item-${si}-${ii}`}
                key={item.itemId ?? `new-${ii}`}
              >
                <label>
                  Parameter
                  <select
                    aria-label={`Parameter for section ${si + 1} item ${ii + 1}`}
                    className="auth-input"
                    data-testid={`item-param-${si}-${ii}`}
                    onChange={(e) =>
                      setSections((s) =>
                        s.map((x, i) =>
                          i === si
                            ? {
                                ...x,
                                items: x.items.map((it, j) =>
                                  j === ii
                                    ? {
                                        ...it,
                                        parameterIndex: Number(e.target.value),
                                      }
                                    : it,
                                ),
                              }
                            : x,
                        ),
                      )
                    }
                    value={item.parameterIndex}
                  >
                    {item.parameterIndex < 0 ? (
                      <option value={-1}>(parameter unavailable)</option>
                    ) : null}
                    {activeParameters.map((p, pi) => (
                      <option key={pi} value={pi}>
                        {p.label} ({p.kind})
                      </option>
                    ))}
                  </select>
                </label>{" "}
                <label>
                  <input
                    checked={item.required}
                    data-testid={`item-required-${si}-${ii}`}
                    onChange={(e) =>
                      setSections((s) =>
                        s.map((x, i) =>
                          i === si
                            ? {
                                ...x,
                                items: x.items.map((it, j) =>
                                  j === ii
                                    ? { ...it, required: e.target.checked }
                                    : it,
                                ),
                              }
                            : x,
                        ),
                      )
                    }
                    type="checkbox"
                  />{" "}
                  Required
                </label>{" "}
                <button
                  aria-label={`Move item ${ii + 1} up`}
                  className="auth-button"
                  disabled={ii === 0 || pending}
                  onClick={() => moveItem(si, ii, -1)}
                  type="button"
                >
                  ↑
                </button>{" "}
                <button
                  aria-label={`Move item ${ii + 1} down`}
                  className="auth-button"
                  disabled={ii === section.items.length - 1 || pending}
                  onClick={() => moveItem(si, ii, 1)}
                  type="button"
                >
                  ↓
                </button>{" "}
                <button
                  aria-label={`Remove item ${ii + 1}`}
                  className="auth-button"
                  data-testid={`remove-item-${si}-${ii}`}
                  onClick={() =>
                    setSections((s) =>
                      s.map((x, i) =>
                        i === si
                          ? {
                              ...x,
                              items: x.items.filter((_, j) => j !== ii),
                            }
                          : x,
                      ),
                    )
                  }
                  type="button"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <button
            className="auth-button"
            data-testid={`add-item-${si}`}
            disabled={activeParameters.length === 0 || pending}
            onClick={() => addItem(si)}
            type="button"
          >
            Add item
          </button>{" "}
          <button
            className="auth-button"
            data-testid={`remove-section-${si}`}
            onClick={() => setSections((s) => s.filter((_, i) => i !== si))}
            type="button"
          >
            Remove section
          </button>
        </fieldset>
      ))}
      <button
        className="auth-button"
        data-testid="add-section"
        disabled={pending}
        onClick={addSection}
        type="button"
      >
        Add section
      </button>{" "}
      <button
        className="auth-button"
        data-testid="save-draft"
        disabled={pending}
        onClick={submitSave}
        type="button"
      >
        Save draft
      </button>{" "}
      <button
        className="auth-button"
        data-testid="publish-template"
        disabled={pending}
        onClick={submitPublish}
        type="button"
      >
        Publish version
      </button>
    </section>
  );
}
