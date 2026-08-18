import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  BusFront,
  CarFront,
  ChartNoAxesCombined,
  CircleDollarSign,
  Coffee,
  Coins,
  Dumbbell,
  Gamepad2,
  Gift,
  GraduationCap,
  HandCoins,
  HeartPulse,
  Home,
  Landmark,
  PawPrint,
  PiggyBank,
  Plane,
  ReceiptText,
  ShoppingBag,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  Tag,
  Utensils,
  WalletCards,
} from "lucide-react";
import { brandIconCatalog, brandIconSlugs } from "@/generated/brand-icon-catalog";
import { cn } from "@/lib/utils";

export type FinanceIconEntry = {
  value: string;
  label: string;
  keywords: string;
  kind: "generic" | "brand";
};

const genericIcons: Record<string, LucideIcon> = {
  tag: Tag,
  home: Home,
  sparkles: Sparkles,
  "piggy-bank": PiggyBank,
  "trending-up": ChartNoAxesCombined,
  "chart-no-axes-combined": ChartNoAxesCombined,
  chart: ChartNoAxesCombined,
  landmark: Landmark,
  "hand-coins": HandCoins,
  "circle-dollar-sign": CircleDollarSign,
  utensils: Utensils,
  car: CarFront,
  "heart-pulse": HeartPulse,
  coffee: Coffee,
  briefcase: BriefcaseBusiness,
  coins: Coins,
  shopping: ShoppingBag,
  basket: ShoppingBasket,
  plane: Plane,
  bus: BusFront,
  gaming: Gamepad2,
  smartphone: Smartphone,
  fitness: Dumbbell,
  education: GraduationCap,
  book: BookOpen,
  gift: Gift,
  pets: PawPrint,
  receipt: ReceiptText,
  wallet: WalletCards,
  banknote: Banknote,
  building: Building2,
  folder: Tag,
};

export const financeIconCatalog: FinanceIconEntry[] = [
  { value: "tag", label: "Etiqueta", keywords: "categoria etiqueta general", kind: "generic" },
  { value: "home", label: "Hogar", keywords: "casa vivienda arriendo servicios", kind: "generic" },
  { value: "utensils", label: "Comida", keywords: "alimentacion restaurante comida", kind: "generic" },
  { value: "car", label: "Auto", keywords: "transporte carro taxi gasolina", kind: "generic" },
  { value: "bus", label: "Transporte público", keywords: "bus metro transporte", kind: "generic" },
  { value: "heart-pulse", label: "Salud", keywords: "salud medicina farmacia", kind: "generic" },
  { value: "coffee", label: "Café", keywords: "cafe restaurante salida", kind: "generic" },
  { value: "shopping", label: "Compras", keywords: "tienda compras ropa", kind: "generic" },
  { value: "basket", label: "Mercado", keywords: "supermercado mercado comida", kind: "generic" },
  { value: "sparkles", label: "Gustos", keywords: "ocio gustos entretenimiento", kind: "generic" },
  { value: "gaming", label: "Videojuegos", keywords: "juegos gaming entretenimiento", kind: "generic" },
  { value: "smartphone", label: "Tecnología", keywords: "celular tecnologia internet", kind: "generic" },
  { value: "piggy-bank", label: "Ahorro", keywords: "ahorro meta fondo", kind: "generic" },
  { value: "chart-no-axes-combined", label: "Inversión", keywords: "inversion bolsa rendimiento", kind: "generic" },
  { value: "landmark", label: "Banco", keywords: "banco deuda credito", kind: "generic" },
  { value: "hand-coins", label: "Dinero", keywords: "dinero pago ingreso", kind: "generic" },
  { value: "circle-dollar-sign", label: "Finanzas", keywords: "dinero dolar finanzas", kind: "generic" },
  { value: "briefcase", label: "Trabajo", keywords: "trabajo nomina empresa", kind: "generic" },
  { value: "coins", label: "Monedas", keywords: "monedas ingreso efectivo", kind: "generic" },
  { value: "wallet", label: "Billetera", keywords: "billetera cuenta", kind: "generic" },
  { value: "banknote", label: "Efectivo", keywords: "efectivo billete", kind: "generic" },
  { value: "building", label: "Empresa", keywords: "empresa oficina", kind: "generic" },
  { value: "plane", label: "Viajes", keywords: "viaje avion vacaciones", kind: "generic" },
  { value: "fitness", label: "Deporte", keywords: "gym deporte ejercicio", kind: "generic" },
  { value: "education", label: "Educación", keywords: "educacion universidad curso", kind: "generic" },
  { value: "book", label: "Libros", keywords: "libro estudio", kind: "generic" },
  { value: "gift", label: "Regalos", keywords: "regalo celebracion", kind: "generic" },
  { value: "pets", label: "Mascotas", keywords: "mascota perro gato", kind: "generic" },
  { value: "receipt", label: "Facturas", keywords: "factura recibo servicios", kind: "generic" },
  ...brandIconCatalog.map((brand) => ({
    value: `brand:${brand.slug}`,
    label: brand.title,
    keywords: `${brand.title.toLocaleLowerCase("es")} ${brand.keywords} app marca comercio`,
    kind: "brand" as const,
  })),
];

const brandAliases = brandIconCatalog
  .flatMap((entry) => entry.aliases.map((alias) => ({ alias, slug: entry.slug })))
  .sort((a, b) => b.alias.length - a.alias.length);

export function FinanceIcon({ name, className, title }: { name?: string; className?: string; title?: string }) {
  const normalized = normalizeFinanceIcon(name);
  if (normalized.startsWith("brand:")) {
    const slug = normalized.slice(6);
    return <svg viewBox="0 0 24 24" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title} focusable="false" className={cn("fill-current", className)}><use href={`/brand-icons.svg#brand-${slug}`} /></svg>;
  }
  const Icon = genericIcons[normalized] ?? Tag;
  return <Icon aria-hidden={title ? undefined : true} aria-label={title} className={className} />;
}

export function normalizeFinanceIcon(name?: string) {
  if (!name) return "tag";
  if (name.startsWith("lucide:")) return name.slice(7);
  if (name.startsWith("brand:") && brandIconSlugs.has(name.slice(6))) return name;
  return genericIcons[name] ? name : "tag";
}

export function getFinanceIconLabel(name?: string) {
  const normalized = normalizeFinanceIcon(name);
  return financeIconCatalog.find((entry) => entry.value === normalized)?.label ?? "Etiqueta";
}

export function suggestFinanceIcon(text: string) {
  const clean = text.toLocaleLowerCase("es");
  const match = brandAliases.find((entry) => clean.includes(entry.alias));
  return match ? `brand:${match.slug}` : undefined;
}
