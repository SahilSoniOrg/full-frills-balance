/**
 * Divider - Simple, consistent divider component
 * Clean, minimal divider design inspired by Ivy Wallet
 */

import { Spacing, ThemeMode } from '@/constants/design-tokens'
import { useThemeColors } from '@/constants/theme-helpers'
import { StyleSheet, View, type ViewProps } from 'react-native'

export type DividerProps = ViewProps & {
  // Divider orientation
  orientation?: 'horizontal' | 'vertical'
  // Divider thickness
  thickness?: 'thin' | 'medium'
  // Divider length/span
  length?: 'full' | 'content' | number
  // Theme mode override (for design preview)
  themeMode?: ThemeMode
}

export function Divider({ 
  orientation = 'horizontal',
  thickness = 'thin',
  length = 'full',
  themeMode,
  style,
  ...props 
}: DividerProps) {
  const theme = useThemeColors(themeMode)
  
  // Get thickness styles
  const getThicknessStyles = () => {
    switch (thickness) {
      case 'thin':
        return orientation === 'horizontal' 
          ? { height: 2 }  // Increased from 1 to 2 for better visibility
          : { width: 2 }   // Increased from 1 to 2 for better visibility
      case 'medium':
        return orientation === 'horizontal' 
          ? { height: 4 }  // Increased from 2 to 4 for better visibility
          : { width: 4 }   // Increased from 2 to 4 for better visibility
      default:
        return orientation === 'horizontal' 
          ? { height: 2 }  // Increased from 1 to 2 for better visibility
          : { width: 2 }   // Increased from 1 to 2 for better visibility
    }
  }

  // Get length styles
  const getLengthStyles = () => {
    if (typeof length === 'number') {
      return orientation === 'horizontal' 
        ? { width: length } 
        : { height: length }
    }

    switch (length) {
      case 'full':
        return { flex: 1 }
      case 'content':
        return orientation === 'horizontal' 
          ? { alignSelf: 'stretch' } 
          : { alignSelf: 'stretch' }
      default:
        return { flex: 1 }
    }
  }

  // Get margin styles based on orientation
  const getMarginStyles = () => {
    if (orientation === 'horizontal') {
      return {
        marginVertical: Spacing.sm,
      }
    } else {
      return {
        marginHorizontal: Spacing.sm,
      }
    }
  }

  return (
    <View
      style={[
        styles.divider,
        getThicknessStyles(),
        getLengthStyles(),
        getMarginStyles(),
        {
          backgroundColor: theme.divider,
        },
        style,
      ]}
      {...props}
    />
  )
}

const styles = StyleSheet.create({
  divider: {
    // Base divider styles
  },
})
