import { Icon, type IconName } from '@/src/types/domainIcons';

/**
 * Account-specific design and configuration constants.
 */

/**
 * Curated accent palette for per-account custom colors.
 * Tested for legibility across light and dark surfaces.
 */
export const ACCOUNT_COLOR_PALETTE: readonly string[] = [
  '#7DD3A8', // mint (brand)
  '#34D399', // emerald
  '#10B981', // green
  '#22C55E', // green strong
  '#16A34A', // green deep
  '#15803D', // green darkest
  '#A3E635', // lime
  '#84CC16', // lime strong
  '#65A30D', // lime deep
  '#4D7C0F', // lime darkest
  '#FACC15', // yellow
  '#FDE047', // yellow light
  '#FBBF24', // amber
  '#F59E0B', // amber strong
  '#D97706', // amber deep
  '#B45309', // amber darkest
  '#FB923C', // orange
  '#EA580C', // orange strong
  '#C2410C', // orange deep
  '#9A3412', // orange darkest
  '#F87171', // red
  '#EF4444', // red strong
  '#DC2626', // red deep
  '#B91C1C', // red darkest
  '#991B1B', // red deeper
  '#FB7185', // rose
  '#E11D48', // rose deep
  '#9F1239', // rose darkest
  '#F472B6', // pink
  '#EC4899', // pink strong
  '#DB2777', // pink deep
  '#BE185D', // pink darkest
  '#9D174D', // pink deeper
  '#E879F9', // fuchsia
  '#D946EF', // fuchsia strong
  '#A21CAF', // fuchsia deep
  '#86198F', // fuchsia darkest
  '#C084FC', // purple
  '#7C3AED', // purple strong
  '#6D28D9', // purple deep
  '#581C87', // purple darkest
  '#A78BFA', // violet
  '#8B5CF6', // violet strong
  '#818CF8', // indigo
  '#4F46E5', // indigo strong
  '#4338CA', // indigo deep
  '#3730A3', // indigo darkest
  '#60A5FA', // blue
  '#3B82F6', // blue strong
  '#1D4ED8', // blue deep
  '#1E40AF', // blue darkest
  '#38BDF8', // sky
  '#0EA5E9', // sky strong
  '#0284C7', // sky deep
  '#22D3EE', // cyan
  '#2DD4BF', // teal
  '#0F766E', // teal deep
  '#155E75', // teal darkest
  '#94A3B8', // slate
  '#64748B', // slate dark
];

/**
 * Curated icon palette for account and category customization.
 */
export const ACCOUNT_ICON_PALETTE = [
  Icon.Tag,
  Icon.TrendingUp,
  Icon.ShoppingCart,
  Icon.Coffee,
  Icon.Bus,
  Icon.Film,
  Icon.ShoppingBag,
  Icon.Document,
  Icon.Home,
  Icon.Wallet,
  Icon.Bank,
  Icon.Safe,
  Icon.CreditCard,
  Icon.Briefcase,
  Icon.Circle,
  Icon.Copy,
  Icon.Receipt,
  Icon.Calendar,
  Icon.Search,
  Icon.Edit,
  Icon.Delete,
  Icon.ArrowUp,
  Icon.ArrowDown,
  Icon.SwapHorizontal,
  Icon.PieChart,
  Icon.Reports,
  Icon.Transaction,
  Icon.TrendingDown,
  Icon.TrendingUpDown,
  Icon.Calculator,
  Icon.BarChart,
  Icon.Dashboard,
  Icon.Activity,
  Icon.Clock,
  Icon.History,
  Icon.Repeat,
  Icon.Archive,
  Icon.FolderOpen,
  Icon.Inbox,
  Icon.User,
  Icon.Heart,
  Icon.Star,
  Icon.Flame,
  Icon.Sparkles,
  Icon.Palette,
  Icon.Shield,
  Icon.Handshake,
  Icon.Zap,
  Icon.Database,
  Icon.Lock,
  Icon.Notifications,
  Icon.MessageCircle,
  Icon.MessageSquare,
  Icon.Mail,
  Icon.Scale,
  Icon.Wrench,
  Icon.ShieldCheck,
  Icon.Info,
  Icon.HelpCircle,
  Icon.Filter,
  Icon.Timeline,
  Icon.Share,
  Icon.Hierarchy,
  Icon.CheckCircle,
  Icon.PlusCircle,
  Icon.ArrowRight,
  Icon.Refresh,
  Icon.Alert,
  Icon.Square,
  Icon.Save,
  Icon.Eject,
  Icon.Merge,
] as const satisfies readonly IconName[];
