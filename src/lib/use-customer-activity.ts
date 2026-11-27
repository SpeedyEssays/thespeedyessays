import { useEffect } from "react";
import { recordPortalActivity } from "./customer-presence.functions";

export function useCustomerActivity(enabled: boolean) {
  useVisibleActivity(recordPortalActivity, enabled);
}

export function useVisibleActivity(reportActivity: () => Promise<unknown>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    let pending = false;
    function report() {
      if (document.hidden || pending) return;
      pending = true;
      void reportActivity()
        .catch(() => {})
        .finally(() => {
          pending = false;
        });
    }

    report();
    const timer = window.setInterval(report, 30_000);
    document.addEventListener("visibilitychange", report);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", report);
    };
  }, [enabled, reportActivity]);
}
