import { notFound } from "next/navigation";

import { AppNav } from "@/components/app-nav";
import { isDailyPrototypeEnabled, TODO_MARKER } from "@/lib/daily-prototype";

import { DailyTrackerPrototype } from "./daily-tracker";

// Development-only prototype: evaluate the gate on every request so a normal
// production build (flag unset) returns 404 rather than exposing a health form.
export const dynamic = "force-dynamic";

export const metadata = { title: "Daily Tracker (prototype) — App" };

export default function DailyPrototypePage() {
  if (!isDailyPrototypeEnabled(process.env.ENABLE_DAILY_PROTOTYPE)) {
    notFound();
  }
  return (
    <main className="app-main">
      <AppNav />
      <h1 className="app-title">Daily Tracker (prototype)</h1>
      <p className="notice" role="note">
        Prototype only. Entries are held in memory for this page only — they are{" "}
        <strong>not saved</strong> and disappear on refresh.
      </p>
      <p className="app-lede">
        Source-backed fields only. Computed columns show <code>{TODO_MARKER}</code> and are not
        calculated. E2/PROG, PED/HRT, coach notes, targets, calories and averages are excluded.
      </p>
      <DailyTrackerPrototype />
    </main>
  );
}
