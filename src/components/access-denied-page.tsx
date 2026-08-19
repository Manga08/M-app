"use client";

import { ArrowLeft, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function AccessDeniedPage() {
  const router = useRouter();
  async function returnToLogin() {
    const client = createClient();
    if (client) await client.auth.signOut({ scope: "local" });
    router.replace("/login");
    router.refresh();
  }
  return <main className="grid min-h-screen place-items-center bg-background p-6"><section className="w-full max-w-lg border-y py-12 text-center"><div className="mx-auto flex w-fit items-center gap-2"><BrandMark /><span className="font-semibold">Moneva</span></div><span className="mx-auto mt-10 grid size-14 place-items-center rounded-full bg-destructive/10 text-destructive"><LockKeyhole className="size-6" /></span><h1 className="mt-6 text-3xl font-medium tracking-[-.045em]">Esta cuenta no está autorizada</h1><p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted-foreground">Moneva es una instalación privada. Pídele al administrador que agregue exactamente tu correo de Google y vuelve a intentarlo.</p><Button className="mt-8 rounded-full" onClick={returnToLogin}><ArrowLeft className="size-4" />Usar otra cuenta</Button></section></main>;
}
