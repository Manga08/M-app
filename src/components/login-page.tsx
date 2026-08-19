"use client";

import { useState } from "react";
import { ArrowRight, Check, LoaderCircle, LockKeyhole, Sparkles } from "lucide-react";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
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
  return <main className="grid min-h-screen bg-background lg:grid-cols-[1.1fr_.9fr]">
    <section className="relative hidden overflow-hidden border-r p-12 lg:flex lg:flex-col"><div className="absolute -left-32 top-1/4 size-[480px] rounded-full bg-primary/10 blur-3xl" /><div className="relative flex items-center gap-2"><BrandMark /><span className="text-lg font-semibold">Moneva</span></div><div className="relative my-auto max-w-xl"><p className="mb-4 text-xs font-medium uppercase tracking-[.16em] text-primary">Finanzas personales, sin ruido</p><p className="text-6xl font-medium leading-[.98] tracking-[-.065em]">Tu dinero merece claridad.</p><p className="mt-6 max-w-lg text-lg leading-8 text-muted-foreground">Presupuesto, movimientos y cuentas en un solo lugar. Diseñado para tomar mejores decisiones con menos clics.</p><div className="mt-10 grid gap-4 text-sm"><Feature text="Tus datos privados y separados con RLS" /><Feature text="Funciona incluso cuando pierdes conexión" /><Feature text="Presupuestos inspirados en tu plantilla 50/30/20" /></div></div><p className="relative text-xs text-muted-foreground">Moneva · Hecho para Colombia · COP</p></section>
    <section className="flex min-h-screen items-center justify-center p-6"><div className="w-full max-w-md"><div className="mb-12 flex items-center gap-2 lg:hidden"><BrandMark /><span className="text-lg font-semibold">Moneva</span></div><span className="grid size-12 place-items-center rounded-2xl bg-primary/12 text-primary"><Sparkles className="size-5" /></span><h1 className="mt-7 text-4xl font-medium tracking-[-.055em]">Bienvenido a tu calma financiera.</h1><p className="mt-4 text-sm leading-6 text-muted-foreground">Tu espacio personal, separado del de cualquier otra persona y listo para acompañar cada decisión.</p>{error ? <p role="alert" className="mt-5 rounded-xl border border-destructive/40 bg-destructive/8 px-4 py-3 text-sm text-destructive">{error}</p> : null}<Button onClick={signIn} disabled={!configured || pending} aria-busy={pending} className="mt-9 h-12 w-full rounded-full text-[15px]">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <GoogleMark />}{pending ? "Abriendo Google…" : "Continuar con Google"}<ArrowRight className="ml-auto size-4" /></Button>{configured ? <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs leading-5 text-muted-foreground"><LockKeyhole className="size-3.5 shrink-0" />Acceso privado: necesitas una cuenta de Google previamente autorizada.</p> : process.env.NODE_ENV !== "production" ? <><Button asChild variant="outline" className="mt-3 h-12 w-full rounded-full"><Link href={nextPath}>Explorar modo demo</Link></Button><p className="mt-4 text-center text-xs leading-5 text-muted-foreground">Supabase aún no está conectado en este entorno. El modo demo guarda cambios cifrados en este dispositivo.</p></> : <p className="mt-4 text-center text-xs text-destructive">El servicio de acceso no está configurado.</p>}</div></section>
  </main>;
}

function Feature({ text }: { text: string }) { return <p className="flex items-center gap-3"><span className="grid size-6 place-items-center rounded-full bg-primary/12 text-primary"><Check className="size-3.5" /></span>{text}</p>; }
function errorMessage(code: string | undefined) {
  if (code === "oauth") return "Google no completó el acceso. Puedes intentarlo otra vez.";
  return null;
}
function GoogleMark() { return <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.35 12.25c0-.71-.06-1.23-.19-1.77H12v3.33h5.38a4.6 4.6 0 0 1-2 3.02v2.16h3.24c1.9-1.75 2.73-4.33 2.73-6.74Z"/><path fill="currentColor" opacity=".8" d="M12 21.75c2.7 0 4.98-.89 6.63-2.42l-3.24-2.5c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.58A10 10 0 0 0 12 21.75Z"/><path fill="currentColor" opacity=".6" d="M6.39 13.66A6 6 0 0 1 6.08 12c0-.58.1-1.14.3-1.66V7.76H3.05A10 10 0 0 0 2 12c0 1.52.36 2.96 1.04 4.24l3.35-2.58Z"/><path fill="currentColor" opacity=".45" d="M12 6.21c1.47 0 2.78.5 3.82 1.49l2.87-2.87A9.63 9.63 0 0 0 12 2.25a10 10 0 0 0-8.96 5.51l3.35 2.58C7.18 7.97 9.39 6.21 12 6.21Z"/></svg>; }
