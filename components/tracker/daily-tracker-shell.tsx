"use client";

import { useEffect, useState } from "react";

import { DAILY_TRACKER_SECTIONS } from "@/lib/daily-tracker";

import { TrackerSection } from "./tracker-section";

/**
 * Phase 1.1 Daily Tracker shell. Renders in-page section navigation plus the
 * nine verified sections. Navigation uses plain in-page anchors so it works
 * without JavaScript; an IntersectionObserver only adds the current-section
 * highlight. No data is loaded, entered, or saved.
 */
export function DailyTrackerShell() {
  const [activeId, setActiveId] = useState(DAILY_TRACKER_SECTIONS[0]?.id ?? "");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const elements = DAILY_TRACKER_SECTIONS.map((section) =>
      document.getElementById(section.id),
    ).filter((element): element is HTMLElement => element !== null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="tracker" data-testid="daily-tracker">
      <nav
        className="tracker__nav"
        aria-label="Daily Tracker sections"
        data-testid="tracker-section-nav"
      >
        <p className="tracker__nav-title">
          Sections
          <span className="tracker__nav-count">
            {DAILY_TRACKER_SECTIONS.length}
          </span>
        </p>
        <ul className="tracker__nav-list">
          {DAILY_TRACKER_SECTIONS.map((section, index) => (
            <li key={section.id}>
              <a
                className="tracker__nav-link"
                href={`#${section.id}`}
                aria-current={activeId === section.id ? "true" : undefined}
                onClick={() => setActiveId(section.id)}
              >
                <span className="tracker__nav-index" aria-hidden="true">
                  {index + 1}
                </span>
                <span>{section.name}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="tracker__sections">
        {DAILY_TRACKER_SECTIONS.map((section) => (
          <TrackerSection key={section.id} section={section} />
        ))}
      </div>
    </div>
  );
}
