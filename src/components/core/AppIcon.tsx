import { useTheme } from '@/src/hooks/use-theme';
import {
  Activity,
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
  Info,
  Landmark,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  MessageCircle,
  MessageSquare,
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
  Shield,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Star,
  Tag,
  Trash2,
  TrendingUp,
  TrendingUpDown,
  User,
  Vault,
  Wallet,
  Wrench,
  X,
  CircleX as XCircle,
} from 'lucide-react-native';
import React from 'react';
import { ViewStyle } from 'react-native';

// Map internal names to Lucide components
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
  briefcase: Briefcase,
  coffee: Coffee,
  shoppingCart: ShoppingCart,
  bus: Bus,
  film: Film,
  shoppingBag: ShoppingBag,
  hierarchy: FolderOpen,
  history: History,
  eject: LogOut,
  helpCircle: HelpCircle,
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
  barChart: BarChart3,
  clock: Clock,
  star: Star,
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
  repeat: Repeat,
  activity: Activity,
  filter: Filter,
  timeline: BetweenHorizontalStart,
} as const;

export type IconName = keyof typeof IconMap;

/**
 * Helper to check if a string is a valid icon name
 */
export const isValidIconName = (name: string | undefined): name is IconName => {
  return Boolean(name && name in IconMap);
};

interface AppIconProps {
  name: IconName | undefined;
  fallbackIcon?: IconName;
  color?: string;
  size?: number;
  style?: ViewStyle;
  strokeWidth?: number;
}

/**
 * AppIcon - Centralized icon component using Lucide
 * Enforces consistency and maps semantic names to specific icons.
 */
export const AppIcon = ({
  name,
  fallbackIcon,
  color,
  size = 24,
  style,
  strokeWidth = 2,
}: AppIconProps) => {
  const { theme } = useTheme();

  const iconToUse =
    name && name in IconMap
      ? (name as IconName)
      : fallbackIcon && fallbackIcon in IconMap
        ? fallbackIcon
        : null;

  if (!iconToUse) return null;

  const IconComponent = IconMap[iconToUse];

  return (
    <IconComponent
      color={color || theme.icon}
      size={size}
      style={style}
      strokeWidth={strokeWidth}
    />
  );
};
