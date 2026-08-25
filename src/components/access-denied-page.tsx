"use client";

import { useState } from "react";
import { ArrowRight, LoaderCircle, LockKeyhole, ShieldX } from "lucide-react";
import { useRouter } from "next/navigation";
import { PublicSurface } from "@/components/public-surface";
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

  return <PublicSurface
    eyebrow="Acceso privado"
    title="Esta cuenta aún no puede entrar."
    description="La comprobación se detuvo antes de abrir Moneva. No se mostró ni se mezcló información financiera de ninguna persona."
    tone="destructive"
    icon={<ShieldX className="size-5" />}
    facts={[
      { label: "Sesión", value: "Detenida" },
      { label: "Datos", value: "No abiertos" },
      { label: "Siguiente paso", value: "Autorizar correo" },
    ]}
  >
      <p className="text-xs font-medium uppercase tracking-[.13em] text-destructive">Recuperar el acceso</p>
      <h2 className="mt-3 text-2xl font-medium tracking-[-.04em] sm:text-3xl">Comprueba el correo con el administrador</h2>
      <ol className="mt-6 divide-y border-y" aria-label="Cómo recuperar el acceso">
        <RecoveryStep number="1" text="Pídele al administrador que agregue exactamente tu correo de Google." />
        <RecoveryStep number="2" text="Cuando confirme el cambio, vuelve aquí e inicia sesión con esa misma cuenta." />
      </ol>

      {error ? <p className="mt-5 text-sm text-destructive" role="alert">{error}</p> : null}
      <Button className="mt-8 min-h-11 w-full rounded-full sm:w-auto" onClick={() => void returnToLogin()} disabled={pending} aria-busy={pending}>
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
        {pending ? "Preparando acceso…" : "Intentar de nuevo"}
      </Button>
      <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><LockKeyhole className="mt-0.5 size-3.5 shrink-0" />En Google podrás elegir la misma cuenta autorizada u otra diferente.</p>
  </PublicSurface>;
}

function RecoveryStep({ number, text }: { number: string; text: string }) {
  return <li className="flex min-h-16 items-center gap-3 py-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold" aria-hidden="true">{number}</span><span className="min-w-0 flex-1 text-sm leading-6">{text}</span></li>;
}
