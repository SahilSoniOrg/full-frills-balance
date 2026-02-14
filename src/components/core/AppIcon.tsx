import { useTheme } from '@/src/hooks/use-theme';
import {
    AlertCircle,
    AlertTriangle,
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    ArrowRightLeft,
    ArrowUp,
    ArrowUpDown,
    BarChart3,
    Briefcase,
    Bus,
    Calendar,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Circle,
    Coffee,
    Copy,
    CreditCard,
    DollarSign,
    Edit2,
    Eye,
    EyeOff,
    FileText,
    Film,
    FolderOpen,
    Home,
    Landmark,
    LogOut,
    Menu,
    MoreVertical,
    Plus,
    PlusCircle,
    Receipt,
    RefreshCw,
    Search,
    Settings,
    ShoppingBag,
    ShoppingCart,
    Tag,
    Trash2,
    TrendingUp,
    Vault,
    Wallet,
    X,
    XCircle
} from 'lucide-react-native';
import React from 'react';
import { ViewStyle } from 'react-native';

// Map internal names to Lucide components
export const IconMap = {
    home: Home,
    wallet: Wallet,
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
    eject: LogOut,
} as const;

export type IconName = keyof typeof IconMap;

/**
 * Helper to check if a string is a valid icon name
 */
export const isValidIconName = (name: string | undefined): name is IconName => {
    return Boolean(name && name in IconMap);
};

interface AppIconProps {
    name: IconName | string | undefined;
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
    strokeWidth = 2
}: AppIconProps) => {
    const { theme } = useTheme();

    const iconToUse = (name && name in IconMap)
        ? name as IconName
        : (fallbackIcon && fallbackIcon in IconMap)
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
