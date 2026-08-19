"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, LoaderCircle, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function AccessDeniedPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function returnToLogin() {
    if (pending) return;
    setPending(true);
    setError(null);
    const client = createClient();
    if (client) {
      const { error: signOutError } = await client.auth.signOut({ scope: "local" });
      if (signOutError) {
        setError("No pudimos preparar un nuevo intento. Revisa tu conexión y vuelve a probar.");
        setPending(false);
        return;
      }
    }
    router.replace("/login");
    router.refresh();
  }

  return <main className="grid min-h-screen place-items-center bg-background p-5 sm:p-8">
    <section className="w-full max-w-xl border-y py-10 sm:py-14" aria-labelledby="access-denied-title" aria-describedby="access-denied-description">
      <div className="flex items-center gap-2"><BrandMark /><span className="font-semibold tracking-[-.02em]">Moneva</span></div>
      <div className="mt-10 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4">
        <span className="grid size-12 place-items-center rounded-2xl bg-destructive/10 text-destructive" aria-hidden="true"><LockKeyhole className="size-5" /></span>
        <div>
          <p className="text-xs font-medium uppercase tracking-[.14em] text-destructive">Acceso privado</p>
          <h1 id="access-denied-title" className="mt-2 text-3xl font-medium leading-tight tracking-[-.045em] text-balance sm:text-4xl">Esta cuenta todavía no está autorizada</h1>
        </div>
      </div>
      <p id="access-denied-description" className="mt-5 max-w-lg text-sm leading-6 text-muted-foreground text-pretty">No se abrió ni se mostró información financiera. Para entrar, el correo de Google debe estar activo en la lista privada de Moneva.</p>

      <ol className="mt-8 divide-y border-y" aria-label="Cómo recuperar el acceso">
        <RecoveryStep number="1" text="Pídele al administrador que agregue exactamente tu correo de Google." />
        <RecoveryStep number="2" text="Cuando confirme el cambio, vuelve aquí e inicia sesión con esa misma cuenta." />
      </ol>

      {error ? <p className="mt-5 text-sm text-destructive" role="alert">{error}</p> : null}
      <Button className="mt-8 min-h-11 w-full rounded-full sm:w-auto" onClick={() => void returnToLogin()} disabled={pending} aria-busy={pending}>
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
        {pending ? "Preparando acceso…" : "Intentar de nuevo"}
      </Button>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">En Google podrás elegir la misma cuenta autorizada u otra diferente.</p>
    </section>
  </main>;
}

function RecoveryStep({ number, text }: { number: string; text: string }) {
  return <li className="flex min-h-16 items-center gap-3 py-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold" aria-hidden="true">{number}</span><span className="min-w-0 flex-1 text-sm leading-6">{text}</span><CheckCircle2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /></li>;
}
