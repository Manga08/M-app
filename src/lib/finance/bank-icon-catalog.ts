export type BankIconEntry = {
  slug: string;
  title: string;
  short: string;
  color: string;
  foreground?: string;
  brandSlug?: string;
  localMark?: "bancolombia" | "bbva" | "nequi" | "rappipay";
  keywords: string;
  aliases: string[];
};

// Entidades bancarias inscritas en Fogafín y billeteras de uso común en Colombia.
// Los bancos con un glifo exacto disponible reutilizan el sprite local de marcas.
// Bancolombia, BBVA, Nequi y RappiPay usan una reducción local de su marca oficial,
// optimizada para 24 px y sin solicitudes remotas. El resto usa una marca
// tipográfica transparente y monocroma: el contenedor de la
// interfaz aporta color y superficie, evitando el efecto de "cuadro dentro de cuadro".
export const bankIconCatalog: BankIconEntry[] = [
  { slug: "bancolombia", title: "Bancolombia", short: "BC", color: "#f7d117", foreground: "#171717", localMark: "bancolombia", keywords: "banco cuenta colombia", aliases: ["bancolombia"] },
  { slug: "davivienda", title: "Davivienda", short: "DV", color: "#d71920", keywords: "banco cuenta colombia", aliases: ["davivienda"] },
  { slug: "davi-bank", title: "DAVIbank", short: "DB", color: "#ed1b2f", keywords: "banco scotiabank colpatria cuenta", aliases: ["davibank", "davi bank", "scotiabank", "colpatria"] },
  { slug: "banco-de-bogota", title: "Banco de Bogotá", short: "BG", color: "#00529b", keywords: "banco cuenta colombia", aliases: ["banco de bogota", "banco bogota"] },
  { slug: "bbva-colombia", title: "BBVA Colombia", short: "BB", color: "#004481", localMark: "bbva", keywords: "banco cuenta colombia", aliases: ["bbva", "bbva colombia"] },
  { slug: "banco-de-occidente", title: "Banco de Occidente", short: "BO", color: "#00539b", keywords: "banco cuenta aval colombia", aliases: ["banco de occidente", "banco occidente"] },
  { slug: "av-villas", title: "Banco AV Villas", short: "AV", color: "#e51b23", keywords: "banco cuenta aval colombia", aliases: ["av villas", "banco av villas"] },
  { slug: "banco-popular", title: "Banco Popular", short: "BP", color: "#e2231a", keywords: "banco cuenta aval colombia", aliases: ["banco popular"] },
  { slug: "banco-caja-social", title: "Banco Caja Social", short: "CS", color: "#e30613", keywords: "banco cuenta colombia", aliases: ["banco caja social", "caja social", "bcsc"] },
  { slug: "itau-colombia", title: "Itaú Colombia", short: "IT", color: "#ec7000", keywords: "banco cuenta colombia", aliases: ["itau", "itaú", "itau colombia"] },
  { slug: "banco-agrario", title: "Banco Agrario", short: "BA", color: "#16713d", keywords: "banco cuenta rural colombia", aliases: ["banco agrario", "banagrario"] },
  { slug: "gnb-sudameris", title: "GNB Sudameris", short: "GN", color: "#003c71", keywords: "banco cuenta colombia", aliases: ["gnb", "gnb sudameris", "sudameris"] },
  { slug: "banco-falabella", title: "Banco Falabella", short: "BF", color: "#348d2d", keywords: "banco cuenta tarjeta colombia", aliases: ["banco falabella", "falabella"] },
  { slug: "banco-pichincha", title: "Banco Pichincha", short: "PI", color: "#f4c400", foreground: "#263238", keywords: "banco cuenta colombia", aliases: ["banco pichincha", "pichincha"] },
  { slug: "bancamia", title: "Bancamía", short: "BM", color: "#e61f2d", keywords: "banco microfinanzas cuenta colombia", aliases: ["bancamia", "bancamía"] },
  { slug: "bancoomeva", title: "Bancoomeva", short: "BV", color: "#007f5f", keywords: "banco coomeva cuenta colombia", aliases: ["bancoomeva", "banco coomeva"] },
  { slug: "banco-w", title: "Banco W", short: "W", color: "#ef7b10", keywords: "banco microfinanzas cuenta colombia", aliases: ["banco w"] },
  { slug: "banco-finandina", title: "Banco Finandina", short: "FI", color: "#005baa", keywords: "banco cuenta vehiculo colombia", aliases: ["banco finandina", "finandina"] },
  { slug: "banco-mundo-mujer", title: "Banco Mundo Mujer", short: "MM", color: "#8e3a8f", keywords: "banco microfinanzas cuenta colombia", aliases: ["banco mundo mujer", "mundo mujer"] },
  { slug: "mibanco", title: "Mibanco Colombia", short: "MI", color: "#e2232a", keywords: "banco microempresa microfinanzas colombia", aliases: ["mibanco", "banco de la microempresa"] },
  { slug: "banco-contactar", title: "Banco Contactar", short: "CO", color: "#f28c00", keywords: "banco microfinanzas cuenta colombia", aliases: ["banco contactar", "contactar"] },
  { slug: "ban100", title: "Ban100", short: "100", color: "#ed1c24", keywords: "banco cuenta colombia", aliases: ["ban100", "bancien"] },
  { slug: "banco-serfinanza", title: "Banco Serfinanza", short: "SF", color: "#0054a6", keywords: "banco cuenta colombia", aliases: ["banco serfinanza", "serfinanza"] },
  { slug: "banco-union", title: "Banco Unión", short: "BU", color: "#d62027", keywords: "banco giros finanzas cuenta colombia", aliases: ["banco union", "banco unión", "giros y finanzas"] },
  { slug: "coopcentral", title: "Banco Coopcentral", short: "CC", color: "#007a3d", keywords: "banco cooperativo cuenta colombia", aliases: ["coopcentral", "banco cooperativo coopcentral"] },
  { slug: "santander-colombia", title: "Banco Santander Colombia", short: "ST", color: "#ec0000", keywords: "banco cuenta colombia", aliases: ["santander colombia", "banco santander"] },
  { slug: "citibank-colombia", title: "Citibank Colombia", short: "CI", color: "#056dae", keywords: "banco cuenta corporativa colombia", aliases: ["citibank", "citi colombia"] },
  { slug: "btg-pactual", title: "BTG Pactual Colombia", short: "BT", color: "#0b2d52", keywords: "banco inversion cuenta colombia", aliases: ["btg pactual", "btg"] },
  { slug: "jp-morgan-colombia", title: "J.P. Morgan Colombia", short: "JP", color: "#152f4e", keywords: "banco corporativo inversion colombia", aliases: ["jp morgan", "j.p. morgan"] },
  { slug: "lulo-bank", title: "Lulo Bank", short: "LU", color: "#6fdf72", foreground: "#17351f", keywords: "banco digital cuenta colombia", aliases: ["lulo", "lulo bank"] },
  { slug: "nu-colombia", title: "Nu Colombia", short: "NU", color: "#820ad1", brandSlug: "nubank", keywords: "banco digital tarjeta cuenta colombia", aliases: ["nu colombia", "nubank", "nu bank"] },
  { slug: "revolut-colombia", title: "Revolut Bank Colombia", short: "RV", color: "#111111", brandSlug: "revolut", keywords: "banco digital cuenta colombia", aliases: ["revolut", "revolut colombia"] },
  { slug: "nequi", title: "Nequi", short: "NQ", color: "#6f2c91", localMark: "nequi", keywords: "billetera digital cuenta colombia", aliases: ["nequi"] },
  { slug: "daviplata", title: "DaviPlata", short: "DP", color: "#d71920", keywords: "billetera digital cuenta colombia", aliases: ["daviplata", "davi plata"] },
  { slug: "dale", title: "dale!", short: "DA", color: "#ec1c24", keywords: "billetera digital aval cuenta colombia", aliases: ["dale", "dale aval"] },
  { slug: "movii", title: "MOVii", short: "MO", color: "#5d2bbf", keywords: "billetera digital cuenta colombia", aliases: ["movii", "movi"] },
  { slug: "rappipay", title: "RappiPay", short: "RP", color: "#ff5a4e", localMark: "rappipay", keywords: "billetera digital cuenta colombia", aliases: ["rappipay", "rappi pay", "rappi cuenta", "rappicuenta"] },
  { slug: "bold", title: "Bold", short: "BD", color: "#131313", keywords: "billetera pagos cuenta colombia", aliases: ["bold", "bold cf"] },
];

export const bankIconBySlug = new Map(bankIconCatalog.map((bank) => [bank.slug, bank]));
