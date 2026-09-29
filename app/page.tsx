import Link from "next/link";

import { AppNav } from "@/components/app-nav";

export default function HomePage() {
  return (
    <main className="app-main">
      <AppNav />
      <h1 className="app-title">App</h1>
      <p className="app-lede">
        Foundation scaffold · read-only reference and workbook views.
      </p>
      <ul className="sheet-list">
        <li>
          <Link href="/library/foods">Foods</Link>
          <span className="sheet-list__meta">Nutrition reference library</span>
        </li>
        <li>
          <Link href="/library/exercises">Exercises</Link>
          <span className="sheet-list__meta">Exercise reference library</span>
        </li>
      </ul>
      <p className="app-lede">
        Development-only tools: raw sheet viewer at <code>/sheets</code>{" "}
        (ENABLE_SHEET_VIEWER=1) and the Daily Tracker prototype at{" "}
        <code>/daily</code> (ENABLE_DAILY_PROTOTYPE=1).
      </p>
    </main>
  );
}
