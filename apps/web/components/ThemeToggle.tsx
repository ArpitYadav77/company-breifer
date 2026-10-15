"use client";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.classList.contains("light"));
  }, []);

  function toggle() {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle("light", next);
    try {
      localStorage.setItem("theme", next ? "light" : "dark");
    } catch {}
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle light/dark theme"
      title={light ? "Switch to dark" : "Switch to light"}
      className="rounded-lg border border-line/15 bg-surface px-3 py-2 text-sm text-muted transition hover:text-content hover:border-teal-500/50"
    >
      {light ? "🌙" : "☀️"}
    </button>
  );
}
