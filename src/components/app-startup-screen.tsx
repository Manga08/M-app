import { BrandMark } from "@/components/brand-mark";
import styles from "./app-startup-screen.module.css";

type AppStartupScreenProps = {
  state: "loading" | "unavailable";
  error?: string | null;
  onRetry?: () => void;
  exiting?: boolean;
  onExitComplete?: () => void;
};

export function AppStartupScreen({ state, error, onRetry, exiting = false, onExitComplete }: AppStartupScreenProps) {
  const loading = state === "loading";

  return (
    <main
      className={styles.screen}
      data-app-startup-screen
      data-exiting={exiting || undefined}
      onAnimationEnd={(event) => {
        if (exiting && event.target === event.currentTarget) onExitComplete?.();
      }}
    >
      <section
        className={styles.content}
        role={loading ? "status" : "alert"}
        aria-live={loading ? "polite" : "assertive"}
        aria-busy={loading}
      >
        <span className={styles.markStage} aria-hidden="true">
          <BrandMark className="size-12" />
        </span>
        <p className={styles.brand}>Moneva</p>
        <h1 className={styles.title}>{loading ? "Preparando tu espacio" : "Tus datos siguen protegidos"}</h1>
        <p className={styles.description}>
          {loading
            ? "Estamos reuniendo tus cuentas, movimientos y planes antes de mostrar cualquier cifra."
            : error ?? "No pudimos abrir una copia confiable de tu información."}
        </p>
        {loading ? (
          <>
            <span className={styles.progress} aria-hidden="true" />
            <span className={styles.detail} aria-hidden="true">Cuentas · movimientos · planes</span>
            <span className="sr-only">Moneva continúa preparando tu información financiera.</span>
          </>
        ) : onRetry ? (
          <button type="button" className={styles.retry} onClick={onRetry}>Intentar de nuevo</button>
        ) : null}
      </section>
      <p className={styles.privacy}>Tu información solo aparece cuando la copia está lista.</p>
    </main>
  );
}
