import { LoginPage } from "@/components/login-page";

export const metadata = { title: "Entrar" };
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return <LoginPage nextPath={safeNextPath(next)} errorCode={error} />;
}

function safeNextPath(next: string | undefined) {
  if (!next?.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}
