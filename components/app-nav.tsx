import Link from "next/link";

// Development-only tools (the raw sheet viewer at /sheets and the Daily Tracker
// prototype at /daily) are intentionally NOT linked from navigation: static
// routes cannot know the runtime dev flags, so links would be baked into builds.
// Reach them directly when ENABLE_SHEET_VIEWER=1 / ENABLE_DAILY_PROTOTYPE=1.
export function AppNav() {
  return (
    <nav className="app-nav" aria-label="Primary">
      <Link href="/">Home</Link>
      <Link href="/library/foods">Foods</Link>
      <Link href="/library/exercises">Exercises</Link>
    </nav>
  );
}
