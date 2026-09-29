import Link from "next/link";

// The dev-only Daily Tracker prototype (/daily) is intentionally NOT linked from
// navigation: a static route cannot know the runtime dev flag, so a link would be
// baked into builds. Reach it directly at /daily when ENABLE_DAILY_PROTOTYPE=1.
export function AppNav() {
  return (
    <nav className="app-nav" aria-label="Primary">
      <Link href="/">Home</Link>
      <Link href="/sheets">Sheets</Link>
      <Link href="/library/foods">Foods</Link>
      <Link href="/library/exercises">Exercises</Link>
    </nav>
  );
}
