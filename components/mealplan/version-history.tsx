"use client";

import { useState, useTransition } from "react";

import type { StaffMealPlanView } from "@/lib/mealplan/service";
import { MealPlanVersionView } from "@/components/mealplan/plan-version-view";

import {
  listMealPlanVersionsAction,
  viewMealPlanVersionAction,
} from "@/app/workspace/[workspaceId]/clients/[clientProfileId]/meal-plan/actions";

/**
 * MEAL-PLAN-I1 — staff version history: bounded keyset-ordered headers
 * (versionSeq DESC), current/upcoming markers from the server-resolved
 * selection, an explicit "View" per row (one committed detail read = one
 * READ audit), and "Load more" for the bounded page. Published versions
 * are immutable — there is no edit affordance.
 */
export function MealPlanVersionHistory({
  workspaceId,
  clientProfileId,
  initialVersions,
  initialCursor,
  currentVersionId,
  upcoming,
}: {
  workspaceId: string;
  clientProfileId: string;
  initialVersions: StaffMealPlanView["versions"];
  initialCursor: number | null;
  currentVersionId: string | null;
  upcoming: StaffMealPlanView["upcoming"];
}) {
  const [versions, setVersions] = useState(initialVersions);
  const [cursor, setCursor] = useState(initialCursor);
  const [detail, setDetail] = useState<
    | { status: "idle" }
    | { status: "error"; message: string }
    | {
        status: "ok";
        id: string;
        versionSeq: number;
        effectiveDate: string;
        effectiveTimezone: string;
        activationInstant: string;
        publishedAt: string;
        payload: Parameters<typeof MealPlanVersionView>[0]["payload"];
        foods: Parameters<typeof MealPlanVersionView>[0]["foods"];
      }
  >({ status: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const view = (versionId: string) =>
    startTransition(async () => {
      const r = await viewMealPlanVersionAction({
        workspaceId,
        clientProfileId,
        versionId,
      });
      setDetail(
        r.status === "ok"
          ? {
              status: "ok",
              ...r.detail,
              foods: new Map(r.foods.map((f) => [f.id, f])),
            }
          : {
              status: "error",
              message: r.status === "error" ? r.message : "Load failed.",
            },
      );
    });

  const loadMore = () =>
    startTransition(async () => {
      if (cursor === null) return;
      const r = await listMealPlanVersionsAction({
        workspaceId,
        clientProfileId,
        cursor,
      });
      if (r.status === "error") {
        setError(r.message);
        return;
      }
      setVersions((vs) => [...vs, ...r.versions]);
      setCursor(r.nextCursor);
    });

  return (
    <section className="tracker-section" data-testid="mealplan-versions">
      <h2 className="tracker-section__title">Published versions</h2>
      {upcoming !== null ? (
        <p className="app-lede" data-testid="mealplan-upcoming">
          Upcoming: version {upcoming.versionSeq} starts{" "}
          {upcoming.effectiveDate} ({upcoming.effectiveTimezone})
        </p>
      ) : null}
      {versions.length === 0 ? (
        <p className="app-lede" data-testid="mealplan-versions-empty">
          No published versions yet.
        </p>
      ) : (
        <ul className="tracker-list">
          {versions.map((v) => (
            <li
              key={v.id}
              className="tracker-list__row"
              data-testid={`mealplan-version-row`}
            >
              <span className="tracker-list__title">
                Version {v.versionSeq}
                {v.id === currentVersionId ? " — current" : ""}
              </span>
              <span className="tracker-list__sub">
                Effective {v.effectiveDate} ({v.effectiveTimezone}) · Published{" "}
                {new Date(v.publishedAt).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <button
                type="button"
                data-testid={`mealplan-version-view-${v.versionSeq}`}
                onClick={() => view(v.id)}
                disabled={pending}
              >
                View
              </button>
            </li>
          ))}
        </ul>
      )}
      {cursor !== null ? (
        <button
          type="button"
          data-testid="mealplan-versions-more"
          onClick={loadMore}
          disabled={pending}
        >
          Load more
        </button>
      ) : null}
      {error !== null ? (
        <p className="daily-errors" role="alert">
          {error}
        </p>
      ) : null}
      {detail.status === "error" ? (
        <p className="daily-errors" role="alert">
          {detail.message}
        </p>
      ) : null}
      {detail.status === "ok" ? (
        <div data-testid="mealplan-version-detail">
          <h3>
            Version {detail.versionSeq} — effective {detail.effectiveDate} (
            {detail.effectiveTimezone})
          </h3>
          <MealPlanVersionView
            payload={detail.payload}
            testidPrefix="mealplan-version-detail"
            foods={detail.foods}
          />
        </div>
      ) : null}
    </section>
  );
}
