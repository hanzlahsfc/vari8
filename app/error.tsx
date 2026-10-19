"use client";

/**
 * Segment error boundary — catches render and escaped-transition errors in
 * this segment's subtree so one failing panel never takes the whole page
 * down. `error.message`/stack are never rendered (they can carry internals);
 * only Next's opaque digest is shown for support correlation. Uses the
 * stable `retry` prop (Next >= 16.3) which re-fetches and re-renders the
 * segment.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="app-main access-denied" data-testid="route-error">
      <h1 className="app-title">Something went wrong</h1>
      <p className="app-lede">
        This page hit an unexpected error. You can try again — your work in
        other parts of the app is unaffected.
      </p>
      {error.digest ? (
        <p className="app-lede">Reference: {error.digest}</p>
      ) : null}
      <p className="app-lede">
        <button
          type="button"
          className="tracker-button"
          onClick={() => retry()}
          data-testid="route-error-retry"
        >
          Try again
        </button>
      </p>
    </main>
  );
}
