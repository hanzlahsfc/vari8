import Link from "next/link";

/**
 * S1-H access-denied page, rendered by Next `forbidden()` with HTTP 403.
 * Deliberately discloses nothing about the requested workspace — no name, no
 * existence confirmation, no ids.
 */
export default function Forbidden() {
  return (
    <main className="app-main access-denied" data-testid="access-denied">
      <h1 className="app-title">Access denied</h1>
      <p className="app-lede">
        You do not have access to this area with your current account.
      </p>
      <p className="app-lede">
        <Link href="/workspace">Back to your workspaces</Link>
      </p>
    </main>
  );
}
