"use client";

import { useEffect } from "react";
import { toast } from "sonner";

const UPDATE_TOAST_ID = "moneva-pwa-update";

export function isPwaUpdateReady(state: ServiceWorkerState, hasController: boolean) {
  return state === "installed" && hasController;
}

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;

    let disposed = false;
    let announced = false;
    let registration: ServiceWorkerRegistration | null = null;
    let watchedWorker: ServiceWorker | null = null;

    const announceUpdate = () => {
      if (disposed || announced) return;
      announced = true;
      toast.info("Actualización lista", {
        id: UPDATE_TOAST_ID,
        description: "Puedes seguir trabajando y aplicarla cuando te convenga.",
        duration: 12_000,
        action: { label: "Actualizar", onClick: () => window.location.reload() },
      });
    };

    const handleWorkerState = () => {
      if (watchedWorker && isPwaUpdateReady(watchedWorker.state, Boolean(navigator.serviceWorker.controller))) announceUpdate();
    };

    const watchInstallingWorker = () => {
      watchedWorker?.removeEventListener("statechange", handleWorkerState);
      watchedWorker = registration?.installing ?? null;
      watchedWorker?.addEventListener("statechange", handleWorkerState);
      handleWorkerState();
    };

    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((nextRegistration) => {
      if (disposed) return;
      registration = nextRegistration;
      registration.addEventListener("updatefound", watchInstallingWorker);
      if (registration.waiting && navigator.serviceWorker.controller) announceUpdate();
      watchInstallingWorker();
    }).catch(() => undefined);

    return () => {
      disposed = true;
      registration?.removeEventListener("updatefound", watchInstallingWorker);
      watchedWorker?.removeEventListener("statechange", handleWorkerState);
    };
  }, []);

  return null;
}
