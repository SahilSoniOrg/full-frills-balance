import {
  Activity,
  Archive,
  CircleAlert as AlertCircle,
  TriangleAlert as AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  ArrowUp,
  ArrowUpDown,
  ChartBarBig as BarChart3,
  Bell,
  BetweenHorizontalStart,
  Briefcase,
  Bug,
  Bus,
  Calculator,
  Calendar,
  Check,
  CircleCheck as CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  Clock,
  Coffee,
  Copy,
  CreditCard,
  Database,
  DollarSign,
  Download,
  Pencil as Edit2,
  Eye,
  EyeOff,
  FileText,
  Film,
  ListFilter as Filter,
  Flame,
  FolderOpen,
  Github,
  Handshake,
  Heart,
  CircleQuestionMark as HelpCircle,
  History,
  House as Home,
  Inbox,
  Info,
  Landmark,
  LayoutDashboard,
  ListTree,
  Lock,
  LogOut,
  Menu,
  Merge,
  MessageCircle,
  MessageSquare,
  Mic,
  MicOff,
  EllipsisVertical as MoreVertical,
  Palette,
  Pause,
  ChartPie as PieChart,
  Play,
  SquarePlay as PlaySquare,
  Plus,
  CirclePlus as PlusCircle,
  Receipt,
  RefreshCw,
  Repeat,
  Scale,
  Search,
  Settings,
  Share2,
  Shield,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Square,
  SquareCheck,
  SquareMinus,
  Star,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  TrendingUpDown,
  User,
  Vault,
  Wallet,
  Wrench,
  X,
  CircleX as XCircle,
  Zap,
  Mail,
  Terminal,
} from 'lucide-react-native';

/**
 * Shared icon identifiers and their Lucide renderers.
 * This module has no React context, hooks, or AppIcon dependency so it can
 * be consumed by both domain/constants code and presentation components.
 */

export const IconMap = {
  home: Home,
  wallet: Wallet,
  pieChart: PieChart,
  reports: BarChart3,
  settings: Settings,
  eye: Eye,
  eyeOff: EyeOff,
  reorder: ArrowUpDown,
  chevronRight: ChevronRight,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronUp: ChevronUp,
  add: Plus,
  close: X,
  back: ArrowLeft,
  more: MoreVertical,
  menu: Menu,
  edit: Edit2,
  delete: Trash2,
  transaction: DollarSign,
  calendar: Calendar,
  refresh: RefreshCw,
  alert: AlertTriangle,
  error: AlertCircle,
  arrowUp: ArrowUp,
  arrowDown: ArrowDown,
  swapHorizontal: ArrowRightLeft,
  document: FileText,
  archive: Archive,
  folderOpen: FolderOpen,
  search: Search,
  closeCircle: XCircle,
  tag: Tag,
  check: Check,
  checkCircle: CheckCircle2,
  copy: Copy,
  receipt: Receipt,
  plusCircle: PlusCircle,
  circle: Circle,
  arrowRight: ArrowRight,
  bank: Landmark,
  safe: Vault,
  creditCard: CreditCard,
  trendingUp: TrendingUp,
  trendingDown: TrendingDown,
  briefcase: Briefcase,
  coffee: Coffee,
  shoppingCart: ShoppingCart,
  bus: Bus,
  film: Film,
  shoppingBag: ShoppingBag,
  hierarchy: ListTree,
  history: History,
  eject: LogOut,
  helpCircle: HelpCircle,
  repeat: Repeat,
  plus: Plus,
  sparkles: Sparkles,
  messageCircle: MessageCircle,
  playSquare: PlaySquare,
  github: Github,
  user: User,
  notifications: Bell,
  lock: Lock,
  shield: Shield,
  palette: Palette,
  messageSquare: MessageSquare,
  inbox: Inbox,
  barChart: BarChart3,
  clock: Clock,
  star: Star,
  mic: Mic,
  micOff: MicOff,
  database: Database,
  heart: Heart,
  shieldCheck: ShieldCheck,
  trendingUpDown: TrendingUpDown,
  calculator: Calculator,
  pause: Pause,
  play: Play,
  flame: Flame,
  info: Info,
  scale: Scale,
  wrench: Wrench,
  handshake: Handshake,
  dashboard: LayoutDashboard,
  activity: Activity,
  filter: Filter,
  timeline: BetweenHorizontalStart,
  share: Share2,
  square: Square,
  checkSquare: SquareCheck,
  minusSquare: SquareMinus,
  x: X,
  merge: Merge,
  bug: Bug,
  save: Download,
  zap: Zap,
  mail: Mail,
  terminal: Terminal,
} as const;

export type IconName =
  | 'home'
  | 'wallet'
  | 'pieChart'
  | 'reports'
  | 'settings'
  | 'eye'
  | 'eyeOff'
  | 'reorder'
  | 'chevronRight'
  | 'chevronDown'
  | 'chevronLeft'
  | 'chevronUp'
  | 'add'
  | 'close'
  | 'back'
  | 'more'
  | 'menu'
  | 'edit'
  | 'delete'
  | 'transaction'
  | 'calendar'
  | 'refresh'
  | 'alert'
  | 'error'
  | 'arrowUp'
  | 'arrowDown'
  | 'swapHorizontal'
  | 'document'
  | 'archive'
  | 'folderOpen'
  | 'search'
  | 'closeCircle'
  | 'tag'
  | 'check'
  | 'checkCircle'
  | 'copy'
  | 'receipt'
  | 'plusCircle'
  | 'circle'
  | 'arrowRight'
  | 'bank'
  | 'safe'
  | 'creditCard'
  | 'trendingUp'
  | 'trendingDown'
  | 'briefcase'
  | 'coffee'
  | 'shoppingCart'
  | 'bus'
  | 'film'
  | 'shoppingBag'
  | 'hierarchy'
  | 'history'
  | 'eject'
  | 'helpCircle'
  | 'repeat'
  | 'plus'
  | 'sparkles'
  | 'messageCircle'
  | 'playSquare'
  | 'github'
  | 'user'
  | 'notifications'
  | 'lock'
  | 'shield'
  | 'palette'
  | 'messageSquare'
  | 'inbox'
  | 'barChart'
  | 'clock'
  | 'star'
  | 'mic'
  | 'micOff'
  | 'database'
  | 'heart'
  | 'shieldCheck'
  | 'trendingUpDown'
  | 'calculator'
  | 'pause'
  | 'play'
  | 'flame'
  | 'info'
  | 'scale'
  | 'wrench'
  | 'handshake'
  | 'dashboard'
  | 'activity'
  | 'filter'
  | 'timeline'
  | 'share'
  | 'square'
  | 'checkSquare'
  | 'minusSquare'
  | 'x'
  | 'merge'
  | 'bug'
  | 'save'
  | 'zap'
  | 'mail'
  | 'terminal'
  | (string & {});

/** Check whether a persisted or external string is a supported icon name. */
export const isValidIconName = (name: string | undefined): name is IconName => {
  return Boolean(name && name in IconMap);
};
