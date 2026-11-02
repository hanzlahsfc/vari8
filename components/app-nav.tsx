import Link from "next/link";

// The Daily Tracker prototype at /daily is intentionally NOT linked from
// navigation: static routes cannot know the runtime dev flag, so a link would
// be baked into builds. Reach it directly when ENABLE_DAILY_PROTOTYPE=1.
export function AppNav() {
  return (
    <nav className="app-nav" aria-label="Primary">
      <Link href="/">Home</Link>
      <Link href="/workspace">Workspaces</Link>
      <Link href="/library/foods">Foods</Link>
      <Link href="/library/exercises">Exercises</Link>
    </nav>
  );
}
