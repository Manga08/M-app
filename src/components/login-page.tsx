"use client";

import { useState } from "react";
import { ArrowRight, KeyRound, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { PublicSurface } from "@/components/public-surface";
import { Button } from "@/components/ui/button";
import { createClient, hasPublicSupabaseEnv } from "@/lib/supabase/client";

export function LoginPage({ nextPath = "/", errorCode }: { nextPath?: string; errorCode?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(() => errorMessage(errorCode));

  async function signIn() {
    const supabase = createClient(); if (!supabase) return;
    setPending(true);
    setError(null);
    try {
      const callback = new URL("/auth/callback", window.location.origin);
      callback.searchParams.set("next", nextPath);
      const { error: authError } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback.toString() } });
      if (authError) throw authError;
    } catch {
      setError("No pudimos iniciar el acceso con Google. Inténtalo de nuevo.");
      setPending(false);
    }
  }
  const configured = hasPublicSupabaseEnv();
  return <PublicSurface
    eyebrow="Acceso personal"
    title="Tu dinero, claro desde el primer vistazo."
    description="Entra a un espacio pensado para entender el mes, anticipar compromisos y decidir sin ruido. Cada cuenta conserva su propio historial y configuración."
    icon={<KeyRound className="size-5" />}
    facts={[
      { label: "Identidad", value: "Google" },
      { label: "Acceso", value: "Lista privada" },
      { label: "Datos", value: "Aislados por usuario" },
    ]}
  >
    <p className="text-xs font-medium uppercase tracking-[.13em] text-primary">Entrar a Moneva</p>
    <h2 className="mt-3 text-2xl font-medium tracking-[-.04em] sm:text-3xl">Continúa con tu cuenta autorizada</h2>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">Moneva solo recibe de Google la identidad necesaria para comprobar el acceso. Tus datos financieros no se comparten con Google.</p>
    {error ? <p role="alert" className="mt-5 border-l-2 border-destructive bg-destructive/8 px-4 py-3 text-sm leading-6 text-destructive">{error}</p> : null}
    <Button onClick={signIn} disabled={!configured || pending} aria-busy={pending} className="mt-7 h-12 w-full rounded-full px-5 text-[15px]">
      {pending ? <LoaderCircle className="size-4 animate-spin" /> : <GoogleMark />}
      {pending ? "Abriendo Google…" : "Continuar con Google"}
      <ArrowRight className="ml-auto size-4" />
    </Button>
    {configured ? <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />Solo podrás entrar si ese correo está activo en la lista privada.</p> : process.env.NODE_ENV !== "production" ? <><Button asChild variant="outline" className="mt-3 h-12 w-full rounded-full"><Link href={nextPath}>Explorar modo demo</Link></Button><p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><LockKeyhole className="mt-0.5 size-3.5 shrink-0" />Este entorno no está conectado a Supabase. El modo demo mantiene sus cambios en este dispositivo.</p></> : <p className="mt-4 text-sm text-destructive">El servicio de acceso no está configurado.</p>}
  </PublicSurface>;
}

function errorMessage(code: string | undefined) {
  if (code === "oauth") return "Google no completó el acceso. Puedes intentarlo otra vez.";
  return null;
}
function GoogleMark() { return <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.35 12.25c0-.71-.06-1.23-.19-1.77H12v3.33h5.38a4.6 4.6 0 0 1-2 3.02v2.16h3.24c1.9-1.75 2.73-4.33 2.73-6.74Z"/><path fill="currentColor" opacity=".8" d="M12 21.75c2.7 0 4.98-.89 6.63-2.42l-3.24-2.5c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.58A10 10 0 0 0 12 21.75Z"/><path fill="currentColor" opacity=".6" d="M6.39 13.66A6 6 0 0 1 6.08 12c0-.58.1-1.14.3-1.66V7.76H3.05A10 10 0 0 0 2 12c0 1.52.36 2.96 1.04 4.24l3.35-2.58Z"/><path fill="currentColor" opacity=".45" d="M12 6.21c1.47 0 2.78.5 3.82 1.49l2.87-2.87A9.63 9.63 0 0 0 12 2.25a10 10 0 0 0-8.96 5.51l3.35 2.58C7.18 7.97 9.39 6.21 12 6.21Z"/></svg>; }
