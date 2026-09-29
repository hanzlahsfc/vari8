import Link from "next/link";

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
