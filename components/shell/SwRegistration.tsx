"use client";

/**
 * The one place public/sw.js gets registered — mounted once in the root
 * layout. `registerServiceWorker` is a no-op during SSR, in tests, and in
 * non-production environments, and self-guards against reload loops (see
 * lib/modes/sw_register.ts), so a single unconditional call is safe.
 */

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/modes/sw_register";

export function SwRegistration() {
  useEffect(() => {
    void registerServiceWorker();
  }, []);
  return null;
}
