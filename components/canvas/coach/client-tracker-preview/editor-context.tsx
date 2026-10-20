"use client";

import { createContext, useContext, useEffect } from "react";

export const TrackerEditorContext = createContext<
  ((id: string, editing: boolean) => void) | null
>(null);

export function useTrackerEditor(id: string, editing: boolean) {
  const report = useContext(TrackerEditorContext);
  useEffect(() => {
    report?.(id, editing);
    return () => report?.(id, false);
  }, [id, editing, report]);
  return report !== null;
}
