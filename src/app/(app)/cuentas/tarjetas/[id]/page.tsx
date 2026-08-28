import { CreditCardDetailPage } from "@/components/credit-card-detail-page";

export const metadata = { title: "Detalle de tarjeta" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CreditCardDetailPage accountId={id} />;
}
