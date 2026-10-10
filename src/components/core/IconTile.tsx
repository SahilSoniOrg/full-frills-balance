import { Size, type ColorKey } from '@/src/constants';
import { Box } from '@/src/design-system/Box';
import type { IconName } from '@/src/types/domainIcons';
import { AppIcon } from './AppIcon';

const TILE_SIZES = {
  sm: { box: Size.md, icon: Size.iconXs },
  md: { box: Size.lg, icon: Size.iconSm },
  lg: { box: Size.xl, icon: Size.iconSm },
  /** Card-level emblem (e.g. update prompt). */
  xl: { box: Size.avatarLg + Size.sm, icon: Size.iconLg },
  /** Full-screen state emblem (lock, restart). */
  hero: { box: Size.avatarXl, icon: Size.xxl },
} as const;

export type IconTileProps = {
  icon: IconName;
  tint: ColorKey;
  size?: keyof typeof TILE_SIZES;
  shape?: 'rounded' | 'circle';
  testID?: string;
};

/** An icon on a soft fill of its own tint. */
export function IconTile({ icon, tint, size = 'md', shape = 'rounded', testID }: IconTileProps) {
  const { box, icon: iconSize } = TILE_SIZES[size];
  return (
    <Box
      width={box}
      height={box}
      borderRadius={shape === 'circle' ? 'full' : 'md'}
      background={tint}
      backgroundOpacity="soft"
      alignItems="center"
      justifyContent="center"
      testID={testID}
    >
      <AppIcon name={icon} size={iconSize} color={tint} />
    </Box>
  );
}
