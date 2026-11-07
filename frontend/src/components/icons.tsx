import {
  Activity,
  AlarmClock,
  Anchor,
  Apple,
  Atom,
  Award,
  Baby,
  Backpack,
  Banknote,
  Bed,
  Beer,
  Bell,
  Bike,
  Bird,
  Book,
  BookOpen,
  Bookmark,
  Bot,
  Brain,
  Briefcase,
  BriefcaseBusiness,
  Bug,
  Building2,
  Bus,
  Cake,
  Calculator,
  Calendar,
  CalendarCheck,
  CalendarDays,
  Camera,
  Car,
  Carrot,
  Cat,
  ChartLine,
  ChartPie,
  Church,
  Clapperboard,
  ClipboardList,
  Clock,
  CloudRain,
  CloudSun,
  Code,
  Coffee,
  Coins,
  Compass,
  CookingPot,
  Cpu,
  CreditCard,
  Crown,
  CupSoda,
  Database,
  Dices,
  Dog,
  Drill,
  Droplet,
  Dumbbell,
  Feather,
  Film,
  Fish,
  Flag,
  Flame,
  FlaskConical,
  Flower2,
  Folder,
  FolderCheck,
  FolderClock,
  FolderCode,
  FolderHeart,
  FolderKanban,
  FolderLock,
  FolderOpen,
  Footprints,
  Gamepad2,
  Gem,
  Gift,
  GlassWater,
  Glasses,
  Globe,
  GraduationCap,
  Guitar,
  Hammer,
  Handshake,
  Headphones,
  Heart,
  HeartPulse,
  Hospital,
  Hotel,
  Hourglass,
  House,
  Inbox,
  Infinity as InfinityIcon,
  Kanban,
  Key,
  Lamp,
  Landmark,
  Languages,
  Laptop,
  Leaf,
  Library,
  Lightbulb,
  ListChecks,
  ListTodo,
  Luggage,
  Mail,
  Map as MapIcon,
  MapPin,
  Medal,
  Megaphone,
  Mic,
  Microscope,
  Moon,
  Mountain,
  Music,
  Notebook,
  NotebookPen,
  Paintbrush,
  Palette,
  PartyPopper,
  PawPrint,
  PencilLine,
  PenTool,
  PersonStanding,
  Phone,
  PiggyBank,
  Pill,
  Pizza,
  Plane,
  Presentation,
  Puzzle,
  Rabbit,
  Rainbow,
  Receipt,
  Recycle,
  Rocket,
  Ruler,
  Salad,
  School,
  Scissors,
  Shapes,
  Shield,
  Ship,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Sigma,
  Smartphone,
  Smile,
  Snowflake,
  Sofa,
  Sparkles,
  Sprout,
  SquareCheckBig,
  Star,
  Stethoscope,
  Store,
  Sun,
  Syringe,
  Target,
  Tent,
  Ticket,
  Timer,
  TrainFront,
  TreePine,
  TrendingUp,
  Trophy,
  Turtle,
  Tv,
  Umbrella,
  User,
  Users,
  UtensilsCrossed,
  Utensils,
  Wallet,
  WashingMachine,
  Watch,
  Waves,
  Wine,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { PixelListIcon } from "./brand/Brand";
import { PIXEL_ICONS } from "./brand/pixelIcons";
import { cn } from "@/lib/utils";

/**
 * Icons for lists, folders and habits. Saved as "lucide:<key>" or "lucide:<key>:<color>"; any
 * other value is an emoji the person picked (kept as is). The drawn icons sit on a soft tile in
 * one of the tag colors, which already have AA contrast in light and dark.
 */
export const LUCIDE = "lucide:";

type Def = { icon: LucideIcon; label: string };
export const ICON_GROUPS: { name: string; items: Record<string, Def> }[] = [
  {
    name: "Tarefas",
    items: {
      "list-checks": { icon: ListChecks, label: "Lista de tarefas" },
      "list-todo": { icon: ListTodo, label: "A fazer" },
      check: { icon: SquareCheckBig, label: "Concluído" },
      clipboard: { icon: ClipboardList, label: "Prancheta" },
      kanban: { icon: Kanban, label: "Quadro" },
      inbox: { icon: Inbox, label: "Caixa de entrada" },
      calendar: { icon: Calendar, label: "Agenda" },
      "calendar-check": { icon: CalendarCheck, label: "Compromissos" },
      "calendar-days": { icon: CalendarDays, label: "Calendário" },
      clock: { icon: Clock, label: "Horário" },
      alarm: { icon: AlarmClock, label: "Despertador" },
      timer: { icon: Timer, label: "Cronômetro" },
      hourglass: { icon: Hourglass, label: "Prazo" },
      bell: { icon: Bell, label: "Lembrete" },
      flag: { icon: Flag, label: "Bandeira" },
      target: { icon: Target, label: "Meta" },
      bookmark: { icon: Bookmark, label: "Marcador" },
      star: { icon: Star, label: "Estrela" },
    },
  },
  {
    name: "Trabalho",
    items: {
      briefcase: { icon: Briefcase, label: "Trabalho" },
      business: { icon: BriefcaseBusiness, label: "Negócios" },
      building: { icon: Building2, label: "Empresa" },
      presentation: { icon: Presentation, label: "Apresentação" },
      chart: { icon: ChartLine, label: "Gráfico" },
      pie: { icon: ChartPie, label: "Relatório" },
      trending: { icon: TrendingUp, label: "Crescimento" },
      rocket: { icon: Rocket, label: "Projeto" },
      lightbulb: { icon: Lightbulb, label: "Ideias" },
      handshake: { icon: Handshake, label: "Clientes" },
      megaphone: { icon: Megaphone, label: "Divulgação" },
      mail: { icon: Mail, label: "E-mails" },
      phone: { icon: Phone, label: "Ligações" },
      laptop: { icon: Laptop, label: "Computador" },
      code: { icon: Code, label: "Código" },
      database: { icon: Database, label: "Dados" },
      cpu: { icon: Cpu, label: "Tecnologia" },
      bot: { icon: Bot, label: "Robô" },
      "pen-tool": { icon: PenTool, label: "Design" },
      award: { icon: Award, label: "Prêmio" },
    },
  },
  {
    name: "Estudos",
    items: {
      graduation: { icon: GraduationCap, label: "Faculdade" },
      school: { icon: School, label: "Escola" },
      backpack: { icon: Backpack, label: "Mochila" },
      book: { icon: BookOpen, label: "Livro aberto" },
      "book-closed": { icon: Book, label: "Livro" },
      library: { icon: Library, label: "Biblioteca" },
      notebook: { icon: NotebookPen, label: "Caderno" },
      "notebook-plain": { icon: Notebook, label: "Agenda escolar" },
      pencil: { icon: PencilLine, label: "Redação" },
      brain: { icon: Brain, label: "Mente" },
      atom: { icon: Atom, label: "Física" },
      flask: { icon: FlaskConical, label: "Química" },
      microscope: { icon: Microscope, label: "Biologia" },
      calculator: { icon: Calculator, label: "Matemática" },
      sigma: { icon: Sigma, label: "Fórmulas" },
      languages: { icon: Languages, label: "Idiomas" },
      globe: { icon: Globe, label: "Geografia" },
      map: { icon: MapIcon, label: "Mapa" },
      ruler: { icon: Ruler, label: "Régua" },
      shapes: { icon: Shapes, label: "Formas" },
    },
  },
  {
    name: "Casa",
    items: {
      house: { icon: House, label: "Casa" },
      sofa: { icon: Sofa, label: "Sala" },
      bed: { icon: Bed, label: "Quarto" },
      lamp: { icon: Lamp, label: "Luminária" },
      cooking: { icon: CookingPot, label: "Cozinhar" },
      utensils: { icon: Utensils, label: "Cozinha" },
      "utensils-crossed": { icon: UtensilsCrossed, label: "Restaurante" },
      cart: { icon: ShoppingCart, label: "Mercado" },
      bag: { icon: ShoppingBag, label: "Compras" },
      store: { icon: Store, label: "Loja" },
      laundry: { icon: WashingMachine, label: "Lavanderia" },
      shirt: { icon: Shirt, label: "Roupas" },
      wrench: { icon: Wrench, label: "Consertos" },
      hammer: { icon: Hammer, label: "Obras" },
      drill: { icon: Drill, label: "Ferramentas" },
      paintbrush: { icon: Paintbrush, label: "Pintura" },
      key: { icon: Key, label: "Chaves" },
      scissors: { icon: Scissors, label: "Tesoura" },
      recycle: { icon: Recycle, label: "Reciclar" },
      flower: { icon: Flower2, label: "Jardim" },
    },
  },
  {
    name: "Saúde",
    items: {
      heart: { icon: Heart, label: "Coração" },
      pulse: { icon: HeartPulse, label: "Saúde" },
      activity: { icon: Activity, label: "Atividade" },
      stethoscope: { icon: Stethoscope, label: "Médico" },
      hospital: { icon: Hospital, label: "Hospital" },
      pill: { icon: Pill, label: "Remédios" },
      syringe: { icon: Syringe, label: "Vacina" },
      dumbbell: { icon: Dumbbell, label: "Academia" },
      bike: { icon: Bike, label: "Bicicleta" },
      footprints: { icon: Footprints, label: "Caminhada" },
      person: { icon: PersonStanding, label: "Alongamento" },
      apple: { icon: Apple, label: "Fruta" },
      salad: { icon: Salad, label: "Salada" },
      carrot: { icon: Carrot, label: "Legumes" },
      droplet: { icon: Droplet, label: "Água" },
      water: { icon: GlassWater, label: "Copo d'água" },
      coffee: { icon: Coffee, label: "Café" },
      moon: { icon: Moon, label: "Sono" },
      smile: { icon: Smile, label: "Bem-estar" },
    },
  },
  {
    name: "Dinheiro",
    items: {
      wallet: { icon: Wallet, label: "Carteira" },
      piggy: { icon: PiggyBank, label: "Economias" },
      banknote: { icon: Banknote, label: "Dinheiro" },
      card: { icon: CreditCard, label: "Cartão" },
      coins: { icon: Coins, label: "Moedas" },
      receipt: { icon: Receipt, label: "Contas" },
      bank: { icon: Landmark, label: "Banco" },
      invest: { icon: TrendingUp, label: "Investimentos" },
      gem: { icon: Gem, label: "Joia" },
      shield: { icon: Shield, label: "Seguro" },
    },
  },
  {
    name: "Lazer",
    items: {
      music: { icon: Music, label: "Música" },
      headphones: { icon: Headphones, label: "Podcasts" },
      guitar: { icon: Guitar, label: "Violão" },
      mic: { icon: Mic, label: "Canto" },
      palette: { icon: Palette, label: "Arte" },
      camera: { icon: Camera, label: "Fotos" },
      film: { icon: Film, label: "Filmes" },
      clapper: { icon: Clapperboard, label: "Vídeos" },
      tv: { icon: Tv, label: "Séries" },
      game: { icon: Gamepad2, label: "Jogos" },
      puzzle: { icon: Puzzle, label: "Quebra-cabeça" },
      dice: { icon: Dices, label: "Jogos de mesa" },
      ticket: { icon: Ticket, label: "Ingressos" },
      party: { icon: PartyPopper, label: "Festa" },
      cake: { icon: Cake, label: "Aniversário" },
      gift: { icon: Gift, label: "Presentes" },
      pizza: { icon: Pizza, label: "Pizza" },
      wine: { icon: Wine, label: "Vinho" },
      beer: { icon: Beer, label: "Cerveja" },
      soda: { icon: CupSoda, label: "Lanche" },
    },
  },
  {
    name: "Viagem",
    items: {
      plane: { icon: Plane, label: "Viagem" },
      luggage: { icon: Luggage, label: "Mala" },
      hotel: { icon: Hotel, label: "Hotel" },
      tent: { icon: Tent, label: "Acampar" },
      compass: { icon: Compass, label: "Bússola" },
      pin: { icon: MapPin, label: "Lugar" },
      car: { icon: Car, label: "Carro" },
      bus: { icon: Bus, label: "Ônibus" },
      train: { icon: TrainFront, label: "Trem" },
      ship: { icon: Ship, label: "Navio" },
      mountain: { icon: Mountain, label: "Montanha" },
      waves: { icon: Waves, label: "Praia" },
      umbrella: { icon: Umbrella, label: "Guarda-chuva" },
      anchor: { icon: Anchor, label: "Âncora" },
    },
  },
  {
    name: "Natureza",
    items: {
      sprout: { icon: Sprout, label: "Broto" },
      leaf: { icon: Leaf, label: "Folha" },
      tree: { icon: TreePine, label: "Árvore" },
      sun: { icon: Sun, label: "Sol" },
      "cloud-sun": { icon: CloudSun, label: "Tempo" },
      rain: { icon: CloudRain, label: "Chuva" },
      snow: { icon: Snowflake, label: "Neve" },
      rainbow: { icon: Rainbow, label: "Arco-íris" },
      flame: { icon: Flame, label: "Fogo" },
      zap: { icon: Zap, label: "Energia" },
      feather: { icon: Feather, label: "Pena" },
      paw: { icon: PawPrint, label: "Pet" },
      dog: { icon: Dog, label: "Cachorro" },
      cat: { icon: Cat, label: "Gato" },
      bird: { icon: Bird, label: "Pássaro" },
      fish: { icon: Fish, label: "Peixe" },
      rabbit: { icon: Rabbit, label: "Coelho" },
      turtle: { icon: Turtle, label: "Tartaruga" },
      bug: { icon: Bug, label: "Inseto" },
    },
  },
  {
    name: "Pessoas",
    items: {
      users: { icon: Users, label: "Família" },
      user: { icon: User, label: "Eu" },
      baby: { icon: Baby, label: "Bebê" },
      church: { icon: Church, label: "Igreja" },
      smartphone: { icon: Smartphone, label: "Celular" },
      watch: { icon: Watch, label: "Relógio" },
      glasses: { icon: Glasses, label: "Óculos" },
      trophy: { icon: Trophy, label: "Conquistas" },
      medal: { icon: Medal, label: "Medalha" },
      crown: { icon: Crown, label: "Coroa" },
      sparkles: { icon: Sparkles, label: "Brilho" },
      infinity: { icon: InfinityIcon, label: "Sempre" },
    },
  },
  {
    name: "Pastas",
    items: {
      folder: { icon: Folder, label: "Pasta" },
      "folder-open": { icon: FolderOpen, label: "Pasta aberta" },
      "folder-heart": { icon: FolderHeart, label: "Pasta com coração" },
      "folder-kanban": { icon: FolderKanban, label: "Pasta de quadro" },
      "folder-check": { icon: FolderCheck, label: "Pasta concluída" },
      "folder-clock": { icon: FolderClock, label: "Pasta com relógio" },
      "folder-code": { icon: FolderCode, label: "Pasta de código" },
      "folder-lock": { icon: FolderLock, label: "Pasta trancada" },
    },
  },
];

/** Every icon by key. Older keys (saved before the catalog grew) still resolve. */
export const ICONS: Record<string, Def> = Object.assign({}, ...ICON_GROUPS.map((g) => g.items), {
  graduation: { icon: GraduationCap, label: "Faculdade" },
  pulse: { icon: HeartPulse, label: "Saúde" },
  game: { icon: Gamepad2, label: "Jogos" },
});

/** Tile colors: the app's tag colors (light/dark pairs with AA contrast), plus the brand teal. */
export const ICON_COLORS = ["teal", "blue", "purple", "pink", "red", "orange", "yellow", "green", "brown", "gray"] as const;
export type IconColor = (typeof ICON_COLORS)[number];
export const ICON_COLOR_NAMES: Record<IconColor, string> = {
  teal: "Petróleo",
  blue: "Azul",
  purple: "Roxo",
  pink: "Rosa",
  red: "Vermelho",
  orange: "Laranja",
  yellow: "Amarelo",
  green: "Verde",
  brown: "Marrom",
  gray: "Cinza",
};
const tile = (c: IconColor) =>
  c === "teal"
    ? { background: "color-mix(in oklab, var(--primary) 14%, transparent)", color: "var(--primary-strong)" }
    : { background: `var(--tag-${c}-bg)`, color: `var(--tag-${c}-fg)` };

export type ParsedIcon =
  { kind: "lucide"; key: string; def?: Def; color: IconColor } | { kind: "pixel"; key: string } | { kind: "emoji"; text: string };
/** Pixel-art list icons are stored as "pixel:<key>" (see brand/pixelIcons.ts). */
export const PIXEL = "pixel:";
export const makePixelIcon = (key: string) => PIXEL + key;
export function parseIcon(value: string | undefined): ParsedIcon {
  if (value?.startsWith(PIXEL) && PIXEL_ICONS[value.slice(PIXEL.length)])
    return { kind: "pixel", key: value.slice(PIXEL.length) };
  if (value?.startsWith(LUCIDE)) {
    const [key, color] = value.slice(LUCIDE.length).split(":");
    return {
      kind: "lucide",
      key,
      def: ICONS[key],
      color: (ICON_COLORS as readonly string[]).includes(color) ? (color as IconColor) : "teal",
    };
  }
  return { kind: "emoji", text: value ?? "" };
}
export const makeIcon = (key: string, color: IconColor = "teal") => `${LUCIDE}${key}${color === "teal" ? "" : ":" + color}`;

/** Pixel icons fill most of their tile: a whole number of screen pixels per art pixel where possible. */
const PIXEL_SIZES = { xs: 18, sm: 22, md: 26, lg: 38, xl: 46 } as const;
const SIZES = {
  // "!" so containers that size every svg inside them (sidebar, buttons) don't stretch the icon on its tile.
  xs: { box: "size-5 rounded-[6px]", svg: "size-3!", emoji: "text-sm" },
  sm: { box: "size-6 rounded-md", svg: "size-3.5!", emoji: "text-base" },
  md: { box: "size-7 rounded-lg", svg: "size-4!", emoji: "text-lg" },
  lg: { box: "size-10 rounded-xl", svg: "size-5!", emoji: "text-2xl" },
  xl: { box: "size-12 rounded-2xl", svg: "size-6!", emoji: "text-4xl" },
};

/** An icon as shown in the app: a drawn icon on its colored tile, or the emoji the person chose. */
export function Glyph({
  icon,
  size = "sm",
  className,
  fallback = ListChecks,
}: {
  icon?: string;
  size?: keyof typeof SIZES;
  className?: string;
  /** Drawn icon used when there is no value at all. */
  fallback?: LucideIcon;
}) {
  const p = parseIcon(icon);
  const s = SIZES[size];
  // Pixel art: no tile behind it (the drawing brings its own colors and outline), crisp at every size.
  if (p.kind === "pixel")
    return (
      <span aria-hidden="true" className={cn("inline-flex shrink-0 items-center justify-center", s.box, className)}>
        <PixelListIcon name={p.key} size={PIXEL_SIZES[size]} />
      </span>
    );
  if (p.kind === "emoji" && p.text)
    return (
      <span
        aria-hidden="true"
        className={cn("inline-flex shrink-0 items-center justify-center leading-none", s.box, s.emoji, className)}
      >
        {p.text}
      </span>
    );
  const Icon = (p.kind === "lucide" && p.def?.icon) || fallback;
  const color = p.kind === "lucide" ? p.color : "teal";
  return (
    <span
      aria-hidden="true"
      style={tile(color)}
      className={cn("inline-flex shrink-0 items-center justify-center", s.box, className)}
    >
      <Icon className={s.svg} strokeWidth={2.25} />
    </span>
  );
}
