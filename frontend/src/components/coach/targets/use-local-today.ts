"use client";
import { useEffect, useState } from "react";
import { TODAY } from "../model";
import { localToday } from "./model";

export function useLocalToday(): string {
  const [today, setToday] = useState(TODAY);
  useEffect(() => {
    const refresh = () => setToday(localToday());
    refresh();
    const interval = window.setInterval(refresh, 60_000);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return today;
}
