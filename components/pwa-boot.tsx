"use client";
import { useEffect } from "react";

export function PwaBoot() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") return;
    navigator.serviceWorker.register("/sw.js").catch((e) => {
      console.warn("service worker registration failed", e);
    });
  }, []);
  return null;
}
