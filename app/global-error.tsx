"use client";

/**
 * Root-level error boundary — replaces the root layout when the layout
 * itself throws, so it must render its own <html>/<body>. Deliberately
 * minimal: globals.css may not be applied here, and no error internals are
 * rendered. Uses the stable `retry` prop (Next >= 16.3).
 */
export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main data-testid="global-error">
          <h1>Something went wrong</h1>
          <p>The application hit an unexpected error.</p>
          <button
            type="button"
            onClick={() => retry()}
            data-testid="global-error-retry"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
