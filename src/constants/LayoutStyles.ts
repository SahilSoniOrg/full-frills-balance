/**
 * Common Layout Styles
 * 
 * Reusable style patterns for consistent layout across screens.
 */
import { StyleSheet } from 'react-native';
import { Spacing } from './design-tokens';

/**
 * Common layout styles that are reused across multiple screens.
 * Import these instead of duplicating style definitions.
 */
export const LayoutStyles = StyleSheet.create({
    /**
     * Centered container - flex: 1 with center alignment
     */
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },

    /**
     * Loading container - centered with optional background
     */
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },

    /**
     * Header actions row - for Screen header action buttons
     */
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },

    /**
     * Loading more footer - for paginated lists
     */
    loadingMore: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: Spacing.lg,
        gap: Spacing.sm,
    },

    /**
     * Row with space between items
     */
    rowSpaceBetween: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },

    /**
     * Row with items aligned to start
     */
    row: {
        flexDirection: 'row',
        alignItems: 'center',
    },

    /**
     * Full width container
     */
    fullWidth: {
        width: '100%',
    },

    /**
     * Flex 1 container
     */
    flex1: {
        flex: 1,
    },
});
