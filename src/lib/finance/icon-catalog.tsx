import type { LucideIcon } from "lucide-react";
import {
  Accessibility,
  Activity,
  Anvil,
  Apple,
  Axe,
  BaggageClaim,
  Balloon,
  Baby,
  ArrowRightLeft,
  BadgeCheck,
  BadgePercent,
  Banknote,
  Bath,
  BedDouble,
  Beer,
  BicepsFlexed,
  Bike,
  Binoculars,
  Bird,
  BookOpen,
  Bot,
  Brain,
  BriefcaseMedical,
  BriefcaseBusiness,
  BrushCleaning,
  Building,
  Building2,
  BusFront,
  Cable,
  Calculator,
  Camera,
  CakeSlice,
  CarFront,
  Cat,
  ChartNoAxesCombined,
  ChefHat,
  CircleUserRound,
  CircleParking,
  CircleDollarSign,
  Clapperboard,
  Cloud,
  CodeXml,
  Coffee,
  Coins,
  Compass,
  Construction,
  ContactRound,
  CookingPot,
  Cpu,
  CreditCard,
  Database,
  Dices,
  Dog,
  Drill,
  Droplets,
  Dumbbell,
  Earth,
  Factory,
  FerrisWheel,
  Fish,
  FlagTriangleRight,
  Flower2,
  Footprints,
  Fuel,
  Gamepad2,
  Glasses,
  Gift,
  Goal,
  GraduationCap,
  Guitar,
  Hammer,
  Handshake,
  HandCoins,
  HandHeart,
  HardHat,
  Headset,
  Headphones,
  Heart,
  HeartHandshake,
  HeartPulse,
  Home,
  Hospital,
  Hotel,
  House,
  HousePlug,
  IceCreamBowl,
  KeyRound,
  Landmark,
  LampDesk,
  Languages,
  Laptop,
  Leaf,
  Library,
  Lightbulb,
  Map,
  MapPinned,
  Mars,
  Martini,
  Medal,
  MessageCircle,
  MessagesSquare,
  Microscope,
  MicVocal,
  MonitorSmartphone,
  MonitorPlay,
  MoonStar,
  Mountain,
  MountainSnow,
  Music,
  Music2,
  Navigation,
  NotebookPen,
  Package,
  PaintRoller,
  Paintbrush,
  Palette,
  Palmtree,
  PartyPopper,
  PawPrint,
  Pencil,
  PersonStanding,
  Pill,
  Pizza,
  Plug,
  PlugZap,
  Popcorn,
  Printer,
  PiggyBank,
  Plane,
  ReceiptText,
  Repeat2,
  Router,
  Route,
  Ruler,
  Sailboat,
  Salad,
  Scale,
  School,
  Scissors,
  Server,
  ShieldCheck,
  Ship,
  Shirt,
  ShoppingBag,
  ShoppingBasket,
  ShoppingCart,
  Shovel,
  Smile,
  Sofa,
  Smartphone,
  Sparkles,
  Sprout,
  Stethoscope,
  Store,
  Sunset,
  Syringe,
  Tag,
  Target,
  TentTree,
  Ticket,
  Tickets,
  Timer,
  Tractor,
  TrainFront,
  TreePine,
  Trophy,
  Truck,
  Tv,
  Umbrella,
  Utensils,
  UtensilsCrossed,
  UserCog,
  UserRoundCheck,
  UsersRound,
  Venus,
  VenusAndMars,
  Video,
  Volleyball,
  WashingMachine,
  Warehouse,
  WalletCards,
  Watch,
  Waves,
  Wifi,
  Wine,
  Wrench,
  Zap,
} from "lucide-react";
import { brandIconCatalog, brandIconSlugs, brandIconSpritePath } from "@/generated/brand-icon-catalog";
import { bankIconBySlug, bankIconCatalog } from "@/lib/finance/bank-icon-catalog";
import { cn } from "@/lib/utils";

export type FinanceIconEntry = {
  value: string;
  label: string;
  keywords: string;
  kind: "generic" | "bank" | "brand";
};

const genericIcons: Record<string, LucideIcon> = {
  tag: Tag,
  transfer: ArrowRightLeft,
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
  apartment: Building,
  building: Building2,
  "shopping-cart": ShoppingCart,
  baby: Baby,
  commission: BadgePercent,
  bike: Bike,
  cable: Cable,
  celebration: CakeSlice,
  parking: CircleParking,
  cinema: Clapperboard,
  card: CreditCard,
  dog: Dog,
  water: Droplets,
  fuel: Fuel,
  glasses: Glasses,
  repairs: Hammer,
  charity: HandHeart,
  headphones: Headphones,
  hospital: Hospital,
  hotel: Hotel,
  utilities: HousePlug,
  dessert: IceCreamBowl,
  laptop: Laptop,
  library: Library,
  electricity: Lightbulb,
  location: MapPinned,
  streaming: MonitorPlay,
  music: Music2,
  delivery: Package,
  creativity: Paintbrush,
  hobbies: Palette,
  medicine: Pill,
  pizza: Pizza,
  energy: PlugZap,
  popcorn: Popcorn,
  printer: Printer,
  subscription: Repeat2,
  beauty: Scissors,
  insurance: ShieldCheck,
  clothing: Shirt,
  furniture: Sofa,
  garden: Sprout,
  doctor: Stethoscope,
  store: Store,
  tickets: Ticket,
  train: TrainFront,
  nature: TreePine,
  television: Tv,
  umbrella: Umbrella,
  restaurant: UtensilsCrossed,
  laundry: WashingMachine,
  watch: Watch,
  internet: Wifi,
  drinks: Wine,
  tools: Wrench,
  services: Zap,
  profile: CircleUserRound,
  person: PersonStanding,
  man: Mars,
  woman: Venus,
  friends: UsersRound,
  contact: ContactRound,
  "verified-person": UserRoundCheck,
  relationship: HeartHandshake,
  handshake: Handshake,
  conversations: MessagesSquare,
  message: MessageCircle,
  party: PartyPopper,
  heart: Heart,
  smile: Smile,
  accessibility: Accessibility,
  verified: BadgeCheck,
  "user-settings": UserCog,
  couple: VenusAndMars,
  trophy: Trophy,
  medal: Medal,
  soccer: Goal,
  volleyball: Volleyball,
  strength: BicepsFlexed,
  hiking: Footprints,
  swimming: Waves,
  mountain: Mountain,
  "snow-mountain": MountainSnow,
  camping: TentTree,
  target: Target,
  timer: Timer,
  activity: Activity,
  "finish-line": FlagTriangleRight,
  outdoors: Binoculars,
  sailing: Sailboat,
  "amusement-park": FerrisWheel,
  "board-games": Dices,
  "construction-worker": HardHat,
  construction: Construction,
  drill: Drill,
  measurement: Ruler,
  "gardening-tools": Shovel,
  chef: ChefHat,
  factory: Factory,
  agriculture: Tractor,
  freight: Truck,
  workshop: Anvil,
  carpentry: Axe,
  painting: PaintRoller,
  cleaning: BrushCleaning,
  "medical-work": BriefcaseMedical,
  school: School,
  science: Microscope,
  calculator: Calculator,
  stationery: NotebookPen,
  writing: Pencil,
  languages: Languages,
  photos: Camera,
  video: Video,
  microphone: MicVocal,
  "live-music": Music,
  "event-tickets": Tickets,
  balloon: Balloon,
  beach: Palmtree,
  sunset: Sunset,
  beer: Beer,
  cocktails: Martini,
  "sea-travel": Ship,
  luggage: BaggageClaim,
  route: Route,
  compass: Compass,
  world: Earth,
  navigation: Navigation,
  map: Map,
  night: MoonStar,
  guitar: Guitar,
  house: House,
  warehouse: Warehouse,
  bathroom: Bath,
  bedroom: BedDouble,
  "desk-light": LampDesk,
  keys: KeyRound,
  plug: Plug,
  cat: Cat,
  bird: Bird,
  fish: Fish,
  flowers: Flower2,
  leaf: Leaf,
  vaccine: Syringe,
  brain: Brain,
  "healthy-food": Salad,
  fruit: Apple,
  "body-weight": Scale,
  cooking: CookingPot,
  robot: Bot,
  code: CodeXml,
  processor: Cpu,
  server: Server,
  cloud: Cloud,
  database: Database,
  router: Router,
  headset: Headset,
  devices: MonitorSmartphone,
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
  { value: "apartment", label: "Apartamento", keywords: "apartamento edificio vivienda arriendo propiedad hogar", kind: "generic" },
  { value: "building", label: "Empresa", keywords: "empresa oficina", kind: "generic" },
  { value: "shopping-cart", label: "Carrito de mercado", keywords: "carrito mercado supermercado compras despensa", kind: "generic" },
  { value: "plane", label: "Viajes", keywords: "viaje avion vacaciones", kind: "generic" },
  { value: "fitness", label: "Deporte", keywords: "gym deporte ejercicio", kind: "generic" },
  { value: "education", label: "Educación", keywords: "educacion universidad curso", kind: "generic" },
  { value: "book", label: "Libros", keywords: "libro estudio", kind: "generic" },
  { value: "gift", label: "Regalos", keywords: "regalo celebracion", kind: "generic" },
  { value: "pets", label: "Mascotas", keywords: "mascota perro gato", kind: "generic" },
  { value: "receipt", label: "Facturas", keywords: "factura recibo servicios", kind: "generic" },
  { value: "baby", label: "Bebé", keywords: "bebe familia hijos pañales cuidado", kind: "generic" },
  { value: "charity", label: "Ayuda y donaciones", keywords: "ayuda donacion caridad familia apoyo", kind: "generic" },
  { value: "celebration", label: "Celebraciones", keywords: "cumpleaños fiesta evento pastel celebracion", kind: "generic" },
  { value: "dog", label: "Perros", keywords: "perro mascota veterinaria alimento", kind: "generic" },
  { value: "bike", label: "Bicicleta", keywords: "bicicleta ciclismo transporte deporte", kind: "generic" },
  { value: "train", label: "Tren y metro", keywords: "tren metro transporte viaje", kind: "generic" },
  { value: "fuel", label: "Combustible", keywords: "gasolina combustible carro moto transporte", kind: "generic" },
  { value: "parking", label: "Parqueadero", keywords: "parqueadero parking carro transporte", kind: "generic" },
  { value: "utilities", label: "Servicios del hogar", keywords: "hogar casa servicios arriendo energia agua", kind: "generic" },
  { value: "electricity", label: "Electricidad", keywords: "luz electricidad energia servicio hogar", kind: "generic" },
  { value: "water", label: "Agua", keywords: "agua acueducto servicio hogar", kind: "generic" },
  { value: "internet", label: "Internet", keywords: "internet wifi fibra datos servicio hogar", kind: "generic" },
  { value: "energy", label: "Energía", keywords: "energia electricidad carga servicio", kind: "generic" },
  { value: "laundry", label: "Lavandería", keywords: "lavanderia lavado ropa hogar", kind: "generic" },
  { value: "furniture", label: "Muebles", keywords: "mueble sofa decoracion hogar", kind: "generic" },
  { value: "repairs", label: "Reparaciones", keywords: "reparacion mantenimiento construccion hogar", kind: "generic" },
  { value: "tools", label: "Herramientas", keywords: "herramienta arreglo mantenimiento trabajo", kind: "generic" },
  { value: "medicine", label: "Medicamentos", keywords: "medicina medicamento farmacia salud", kind: "generic" },
  { value: "doctor", label: "Médico", keywords: "medico doctor consulta salud", kind: "generic" },
  { value: "hospital", label: "Hospital", keywords: "hospital clinica emergencia salud", kind: "generic" },
  { value: "insurance", label: "Seguros", keywords: "seguro proteccion poliza salud auto hogar", kind: "generic" },
  { value: "subscription", label: "Suscripciones", keywords: "suscripcion mensual recurrente membresia", kind: "generic" },
  { value: "streaming", label: "Streaming", keywords: "streaming serie pelicula suscripcion entretenimiento", kind: "generic" },
  { value: "cinema", label: "Cine", keywords: "cine pelicula entretenimiento", kind: "generic" },
  { value: "music", label: "Música", keywords: "musica concierto audio entretenimiento", kind: "generic" },
  { value: "headphones", label: "Audio", keywords: "audifonos audio musica tecnologia", kind: "generic" },
  { value: "television", label: "Televisión", keywords: "television tv series entretenimiento", kind: "generic" },
  { value: "tickets", label: "Entradas", keywords: "entrada ticket concierto evento cine", kind: "generic" },
  { value: "popcorn", label: "Snacks", keywords: "snack palomitas cine comida", kind: "generic" },
  { value: "restaurant", label: "Restaurante", keywords: "restaurante comida almuerzo cena", kind: "generic" },
  { value: "pizza", label: "Comida rápida", keywords: "pizza domicilio comida rapida", kind: "generic" },
  { value: "dessert", label: "Postres", keywords: "postre helado dulce comida", kind: "generic" },
  { value: "drinks", label: "Bebidas", keywords: "bebida vino bar salida", kind: "generic" },
  { value: "clothing", label: "Ropa", keywords: "ropa moda camiseta compras", kind: "generic" },
  { value: "beauty", label: "Belleza", keywords: "belleza peluqueria barberia cuidado", kind: "generic" },
  { value: "glasses", label: "Óptica", keywords: "gafas lentes optica salud", kind: "generic" },
  { value: "watch", label: "Accesorios", keywords: "reloj accesorios moda compras", kind: "generic" },
  { value: "laptop", label: "Computador", keywords: "computador portatil tecnologia trabajo", kind: "generic" },
  { value: "printer", label: "Oficina", keywords: "impresora oficina papeleria trabajo", kind: "generic" },
  { value: "cable", label: "Conectividad", keywords: "cable conexion tecnologia servicio", kind: "generic" },
  { value: "store", label: "Negocio", keywords: "negocio tienda venta comercio ingreso", kind: "generic" },
  { value: "delivery", label: "Envíos", keywords: "envio paquete domicilio mensajeria", kind: "generic" },
  { value: "commission", label: "Comisiones", keywords: "comision bono porcentaje ingreso venta", kind: "generic" },
  { value: "card", label: "Tarjeta", keywords: "tarjeta credito debito pago cuenta", kind: "generic" },
  { value: "library", label: "Biblioteca", keywords: "biblioteca libro estudio educacion", kind: "generic" },
  { value: "hotel", label: "Alojamiento", keywords: "hotel alojamiento viaje vacaciones", kind: "generic" },
  { value: "location", label: "Lugar", keywords: "lugar ubicacion viaje mapa", kind: "generic" },
  { value: "umbrella", label: "Vacaciones", keywords: "vacaciones playa viaje descanso", kind: "generic" },
  { value: "nature", label: "Naturaleza", keywords: "naturaleza parque arbol aire libre", kind: "generic" },
  { value: "garden", label: "Jardín", keywords: "jardin planta hogar naturaleza", kind: "generic" },
  { value: "hobbies", label: "Pasatiempos", keywords: "hobby pasatiempo arte creatividad", kind: "generic" },
  { value: "creativity", label: "Arte", keywords: "arte pintura manualidad creatividad", kind: "generic" },
  { value: "services", label: "Servicios", keywords: "servicio profesional trabajo energia", kind: "generic" },
  { value: "profile", label: "Perfil", keywords: "perfil usuario cuenta persona avatar", kind: "generic" },
  { value: "person", label: "Persona", keywords: "persona humano individual usuario", kind: "generic" },
  { value: "man", label: "Hombre", keywords: "hombre masculino persona amigo pareja", kind: "generic" },
  { value: "woman", label: "Mujer", keywords: "mujer femenino persona amiga pareja", kind: "generic" },
  { value: "friends", label: "Amigos", keywords: "amigos grupo personas salida reunion", kind: "generic" },
  { value: "contact", label: "Contacto", keywords: "contacto persona cliente proveedor agenda", kind: "generic" },
  { value: "verified-person", label: "Persona verificada", keywords: "persona verificada usuario cliente confianza", kind: "generic" },
  { value: "relationship", label: "Relación", keywords: "relacion pareja amistad apoyo amor", kind: "generic" },
  { value: "handshake", label: "Acuerdo", keywords: "acuerdo trato negocio sociedad alianza", kind: "generic" },
  { value: "conversations", label: "Conversaciones", keywords: "conversacion mensajes chat amigos comunicacion", kind: "generic" },
  { value: "message", label: "Mensaje", keywords: "mensaje chat comunicacion contacto", kind: "generic" },
  { value: "party", label: "Fiesta", keywords: "fiesta salida celebracion amigos evento", kind: "generic" },
  { value: "heart", label: "Afecto", keywords: "afecto amor pareja familia amigos", kind: "generic" },
  { value: "smile", label: "Bienestar", keywords: "bienestar felicidad cuidado personal ocio", kind: "generic" },
  { value: "accessibility", label: "Accesibilidad", keywords: "accesibilidad inclusion discapacidad cuidado", kind: "generic" },
  { value: "verified", label: "Verificado", keywords: "verificado aprobado certificado seguridad", kind: "generic" },
  { value: "user-settings", label: "Gestión personal", keywords: "usuario persona gestion configuracion servicio", kind: "generic" },
  { value: "couple", label: "Pareja", keywords: "pareja relacion personas amor hogar", kind: "generic" },
  { value: "trophy", label: "Trofeo", keywords: "trofeo premio deporte competencia logro", kind: "generic" },
  { value: "medal", label: "Medalla", keywords: "medalla premio deporte competencia logro", kind: "generic" },
  { value: "soccer", label: "Fútbol", keywords: "futbol balon deporte cancha partido", kind: "generic" },
  { value: "volleyball", label: "Voleibol", keywords: "voleibol volleyball balon deporte partido", kind: "generic" },
  { value: "strength", label: "Fuerza", keywords: "fuerza ejercicio gimnasio deporte entrenamiento", kind: "generic" },
  { value: "hiking", label: "Caminata", keywords: "caminata senderismo pasos deporte paseo", kind: "generic" },
  { value: "swimming", label: "Natación", keywords: "natacion piscina agua deporte", kind: "generic" },
  { value: "mountain", label: "Montaña", keywords: "montaña senderismo paseo viaje naturaleza", kind: "generic" },
  { value: "snow-mountain", label: "Nieve", keywords: "nieve montaña ski viaje vacaciones deporte", kind: "generic" },
  { value: "camping", label: "Camping", keywords: "camping carpa paseo viaje naturaleza salida", kind: "generic" },
  { value: "target", label: "Objetivo", keywords: "objetivo meta deporte precision", kind: "generic" },
  { value: "timer", label: "Cronómetro", keywords: "cronometro tiempo deporte entrenamiento", kind: "generic" },
  { value: "activity", label: "Actividad física", keywords: "actividad ejercicio salud deporte entrenamiento", kind: "generic" },
  { value: "finish-line", label: "Competencia", keywords: "competencia carrera meta deporte bandera", kind: "generic" },
  { value: "outdoors", label: "Aventura", keywords: "aventura explorar paseo salida naturaleza", kind: "generic" },
  { value: "sailing", label: "Navegación", keywords: "velero navegar mar deporte paseo", kind: "generic" },
  { value: "amusement-park", label: "Parque de diversiones", keywords: "parque diversiones feria salida familia amigos", kind: "generic" },
  { value: "board-games", label: "Juegos de mesa", keywords: "juegos mesa dados amigos ocio salida", kind: "generic" },
  { value: "construction-worker", label: "Obra y construcción", keywords: "obrero construccion oficio casco trabajo", kind: "generic" },
  { value: "construction", label: "Construcción", keywords: "construccion obra mantenimiento oficio", kind: "generic" },
  { value: "drill", label: "Taladro", keywords: "taladro herramienta reparacion oficio", kind: "generic" },
  { value: "measurement", label: "Medición", keywords: "regla medida arquitectura diseño oficio", kind: "generic" },
  { value: "gardening-tools", label: "Jardinería", keywords: "pala jardineria campo oficio hogar", kind: "generic" },
  { value: "chef", label: "Cocina profesional", keywords: "chef cocinero restaurante oficio comida", kind: "generic" },
  { value: "factory", label: "Industria", keywords: "fabrica industria produccion empresa trabajo", kind: "generic" },
  { value: "agriculture", label: "Agricultura", keywords: "agricultura campo tractor finca oficio", kind: "generic" },
  { value: "freight", label: "Carga", keywords: "camion carga transporte logistica oficio", kind: "generic" },
  { value: "workshop", label: "Taller", keywords: "taller yunque mecanica oficio reparacion", kind: "generic" },
  { value: "carpentry", label: "Carpintería", keywords: "carpinteria madera hacha oficio trabajo", kind: "generic" },
  { value: "painting", label: "Pintura", keywords: "pintura pintor rodillo oficio hogar", kind: "generic" },
  { value: "cleaning", label: "Limpieza", keywords: "limpieza aseo hogar oficio servicio", kind: "generic" },
  { value: "medical-work", label: "Profesional de salud", keywords: "medico enfermeria salud oficio trabajo", kind: "generic" },
  { value: "school", label: "Colegio", keywords: "colegio escuela educacion estudio", kind: "generic" },
  { value: "science", label: "Ciencia", keywords: "ciencia laboratorio investigacion estudio oficio", kind: "generic" },
  { value: "calculator", label: "Contabilidad", keywords: "calculadora contabilidad numeros trabajo finanzas", kind: "generic" },
  { value: "stationery", label: "Papelería", keywords: "papeleria cuaderno notas estudio oficina", kind: "generic" },
  { value: "writing", label: "Escritura", keywords: "escritura lapiz estudio oficina trabajo", kind: "generic" },
  { value: "languages", label: "Idiomas", keywords: "idiomas traduccion curso educacion viaje", kind: "generic" },
  { value: "photos", label: "Fotografía", keywords: "foto fotografia camara salida recuerdo oficio", kind: "generic" },
  { value: "video", label: "Video", keywords: "video grabacion camara contenido entretenimiento", kind: "generic" },
  { value: "microphone", label: "Micrófono", keywords: "microfono canto musica podcast evento", kind: "generic" },
  { value: "live-music", label: "Música en vivo", keywords: "musica concierto festival salida entretenimiento", kind: "generic" },
  { value: "event-tickets", label: "Boletas", keywords: "boletas entradas evento concierto cine salida", kind: "generic" },
  { value: "balloon", label: "Evento", keywords: "evento globo fiesta celebracion salida", kind: "generic" },
  { value: "beach", label: "Playa", keywords: "playa vacaciones viaje palmera descanso", kind: "generic" },
  { value: "sunset", label: "Atardecer", keywords: "atardecer paseo salida viaje naturaleza", kind: "generic" },
  { value: "beer", label: "Cerveza", keywords: "cerveza bar bebida salida amigos", kind: "generic" },
  { value: "cocktails", label: "Cócteles", keywords: "coctel bar bebida salida amigos", kind: "generic" },
  { value: "sea-travel", label: "Viaje por mar", keywords: "barco crucero mar viaje vacaciones", kind: "generic" },
  { value: "luggage", label: "Equipaje", keywords: "equipaje maleta viaje vacaciones", kind: "generic" },
  { value: "route", label: "Ruta", keywords: "ruta carretera viaje transporte paseo", kind: "generic" },
  { value: "compass", label: "Brújula", keywords: "brujula explorar viaje aventura mapa", kind: "generic" },
  { value: "world", label: "Internacional", keywords: "mundo internacional viaje extranjero", kind: "generic" },
  { value: "navigation", label: "Dirección", keywords: "direccion navegacion ruta transporte mapa", kind: "generic" },
  { value: "map", label: "Mapa", keywords: "mapa lugar ruta viaje ubicacion", kind: "generic" },
  { value: "night", label: "Salida nocturna", keywords: "noche salida ocio entretenimiento", kind: "generic" },
  { value: "guitar", label: "Guitarra", keywords: "guitarra musica instrumento concierto", kind: "generic" },
  { value: "house", label: "Casa", keywords: "casa vivienda hogar propiedad", kind: "generic" },
  { value: "warehouse", label: "Bodega", keywords: "bodega almacen inventario empresa", kind: "generic" },
  { value: "bathroom", label: "Baño", keywords: "baño aseo hogar remodelacion", kind: "generic" },
  { value: "bedroom", label: "Habitación", keywords: "habitacion cama dormitorio hotel hogar", kind: "generic" },
  { value: "desk-light", label: "Escritorio", keywords: "escritorio lampara oficina estudio hogar", kind: "generic" },
  { value: "keys", label: "Llaves", keywords: "llaves casa arriendo propiedad auto", kind: "generic" },
  { value: "plug", label: "Enchufe", keywords: "enchufe electricidad energia hogar", kind: "generic" },
  { value: "cat", label: "Gatos", keywords: "gato mascota veterinaria alimento", kind: "generic" },
  { value: "bird", label: "Aves", keywords: "ave pajaro mascota naturaleza", kind: "generic" },
  { value: "fish", label: "Peces", keywords: "pez pescado mascota comida naturaleza", kind: "generic" },
  { value: "flowers", label: "Flores", keywords: "flores regalo jardin naturaleza decoracion", kind: "generic" },
  { value: "leaf", label: "Plantas", keywords: "planta hoja jardin naturaleza hogar", kind: "generic" },
  { value: "vaccine", label: "Vacuna", keywords: "vacuna inyeccion salud medico", kind: "generic" },
  { value: "brain", label: "Salud mental", keywords: "cerebro terapia psicologia salud mental", kind: "generic" },
  { value: "healthy-food", label: "Comida saludable", keywords: "ensalada saludable comida dieta salud", kind: "generic" },
  { value: "fruit", label: "Frutas", keywords: "fruta manzana mercado comida saludable", kind: "generic" },
  { value: "body-weight", label: "Peso y nutrición", keywords: "peso balanza nutricion dieta salud", kind: "generic" },
  { value: "cooking", label: "Cocina", keywords: "cocina olla comida hogar", kind: "generic" },
  { value: "robot", label: "Automatización", keywords: "robot automatizacion inteligencia artificial tecnologia", kind: "generic" },
  { value: "code", label: "Programación", keywords: "codigo programacion desarrollo tecnologia oficio", kind: "generic" },
  { value: "processor", label: "Componentes", keywords: "procesador chip computador tecnologia", kind: "generic" },
  { value: "server", label: "Servidor", keywords: "servidor hosting nube tecnologia", kind: "generic" },
  { value: "cloud", label: "Nube", keywords: "nube almacenamiento internet suscripcion tecnologia", kind: "generic" },
  { value: "database", label: "Datos", keywords: "datos base de datos almacenamiento tecnologia", kind: "generic" },
  { value: "router", label: "Redes", keywords: "router red internet wifi tecnologia", kind: "generic" },
  { value: "headset", label: "Soporte", keywords: "soporte atencion cliente audifonos trabajo", kind: "generic" },
  { value: "devices", label: "Dispositivos", keywords: "dispositivos computador celular tecnologia", kind: "generic" },
  ...bankIconCatalog.map((bank) => ({
    value: `bank:${bank.slug}`,
    label: bank.title,
    keywords: `${bank.title.toLocaleLowerCase("es")} ${bank.keywords} ${bank.aliases.join(" ")}`,
    kind: "bank" as const,
  })),
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

const bankAliases = bankIconCatalog
  .flatMap((entry) => entry.aliases.map((alias) => ({ alias, slug: entry.slug })))
  .sort((a, b) => b.alias.length - a.alias.length);

export function FinanceIcon({ name, className, title }: { name?: string; className?: string; title?: string }) {
  const normalized = normalizeFinanceIcon(name);
  if (normalized.startsWith("bank:")) {
    const bank = bankIconBySlug.get(normalized.slice(5));
    if (bank?.brandSlug) return <BrandGlyph slug={bank.brandSlug} className={className} title={title} />;
    if (bank?.localMark) return <LocalBankMark mark={bank.localMark} className={className} title={title} />;
    if (bank) return <BankMarkIcon bank={bank} className={className} title={title} />;
  }
  if (normalized.startsWith("brand:")) {
    const slug = normalized.slice(6);
    return <BrandGlyph slug={slug} className={className} title={title} />;
  }
  const Icon = genericIcons[normalized] ?? Tag;
  return <Icon aria-hidden={title ? undefined : true} aria-label={title} className={className} strokeWidth={1.8} />;
}

export function normalizeFinanceIcon(name?: string) {
  if (!name) return "tag";
  if (name.startsWith("lucide:")) return name.slice(7);
  if (name.startsWith("bank:") && bankIconBySlug.has(name.slice(5))) return name;
  if (name.startsWith("brand:") && brandIconSlugs.has(name.slice(6))) return name;
  return genericIcons[name] ? name : "tag";
}

export function getFinanceIconLabel(name?: string) {
  const normalized = normalizeFinanceIcon(name);
  return financeIconCatalog.find((entry) => entry.value === normalized)?.label ?? "Etiqueta";
}

export function suggestFinanceIcon(text: string) {
  const clean = text.toLocaleLowerCase("es");
  const bankMatch = bankAliases.find((entry) => includesAlias(clean, entry.alias));
  if (bankMatch) return `bank:${bankMatch.slug}`;
  const match = brandAliases.find((entry) => includesAlias(clean, entry.alias));
  return match ? `brand:${match.slug}` : undefined;
}

const letterOrNumber = /[\p{L}\p{N}]/u;

function includesAlias(text: string, alias: string) {
  let index = text.indexOf(alias);
  while (index >= 0) {
    const before = index > 0 ? text[index - 1] : "";
    const afterIndex = index + alias.length;
    const after = afterIndex < text.length ? text[afterIndex] : "";
    if ((!before || !letterOrNumber.test(before)) && (!after || !letterOrNumber.test(after))) return true;
    index = text.indexOf(alias, index + 1);
  }
  return false;
}

function BrandGlyph({ slug, className, title }: { slug: string; className?: string; title?: string }) {
  return <svg viewBox="0 0 24 24" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title} focusable="false" className={cn("scale-[.9] fill-current", className)}><use href={`${brandIconSpritePath}#brand-${slug}`} /></svg>;
}

function LocalBankMark({ mark, className, title }: { mark: NonNullable<(typeof bankIconCatalog)[number]["localMark"]>; className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
      className={cn("overflow-visible fill-current", className)}
    >
      {mark === "bancolombia" ? <BancolombiaMark /> : null}
      {mark === "bbva" ? <BbvaMark /> : null}
      {mark === "nequi" ? <NequiMark /> : null}
      {mark === "rappipay" ? <RappiPayMark /> : null}
    </svg>
  );
}

// Reducción del símbolo actual: tres trazos curvos, con el central más largo.
// Referencia: kit de prensa y página de identidad oficiales de Bancolombia.
function BancolombiaMark() {
  return (
    <g transform="rotate(-7 12 12)">
      <path d="M7.18 4.65h8.15c1.08 0 1.77.78 1.52 1.72l-.18.67c-.18.7-.94 1.22-1.77 1.22H6.75c-1.08 0-1.77-.78-1.52-1.72l.18-.67c.18-.7.94-1.22 1.77-1.22Z" />
      <path d="M5.18 10.18h13.64c1.08 0 1.77.78 1.52 1.72l-.18.67c-.18.7-.94 1.22-1.77 1.22H4.75c-1.08 0-1.77-.78-1.52-1.72l.18-.67c.18-.7.94-1.22 1.77-1.22Z" />
      <path d="M7.18 15.72h8.15c1.08 0 1.77.78 1.52 1.72l-.18.67c-.18.7-.94 1.22-1.77 1.22H6.75c-1.08 0-1.77-.78-1.52-1.72l.18-.67c.18-.7.94-1.22 1.77-1.22Z" />
    </g>
  );
}

// BBVA no usa un isotipo separado: la reducción conserva las cuatro letras y la
// A ascendente, el rasgo más distintivo del wordmark global en espacios pequeños.
function BbvaMark() {
  return (
    <g aria-hidden="true">
      <text x=".6" y="16.6" fontFamily="Arial, Helvetica, sans-serif" fontSize="9.25" fontWeight="900" letterSpacing="-.9">BBV</text>
      <text x="17.25" y="12.9" fontFamily="Arial, Helvetica, sans-serif" fontSize="9.25" fontWeight="900" letterSpacing="-.5">A</text>
    </g>
  );
}

// Nequi publica el wordmark como recurso oficial de prensa. La reducción mantiene
// el nombre completo porque la marca tampoco ofrece un monograma NQ.
function NequiMark() {
  return (
    <text x="12" y="15.45" textAnchor="middle" fontFamily="Arial Rounded MT Bold, Arial, Helvetica, sans-serif" fontSize="8.8" fontWeight="800" letterSpacing="-.55">nequi</text>
  );
}

// El sitio actual de RappiPay usa el nombre completo sin isotipo independiente;
// mantenerlo evita sustituir la marca por un monograma RP inventado.
function RappiPayMark() {
  return (
    <text x="12" y="14.75" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="6.7" fontWeight="800" letterSpacing="-.55">RappiPay</text>
  );
}

function BankMarkIcon({ bank, className, title }: { bank: (typeof bankIconCatalog)[number]; className?: string; title?: string }) {
  const fontSize = bank.short.length > 2 ? 6.8 : bank.short.length > 1 ? 8.7 : 11;
  const letterSpacing = bank.short.length > 2 ? "-.28" : "-.16";
  return <svg viewBox="0 0 24 24" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title} focusable="false" className={cn("overflow-visible fill-current", className)}>
    <text x="12" y="12.35" textAnchor="middle" dominantBaseline="middle" fontFamily="var(--font-geist), ui-sans-serif, system-ui, sans-serif" fontSize={fontSize} fontWeight="800" letterSpacing={letterSpacing}>{bank.short}</text>
    <path d="M5.25 18.25h13.5" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" opacity=".42" />
  </svg>;
}
