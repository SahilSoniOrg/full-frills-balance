import { FlashList } from '@shopify/flash-list';
import React from 'react';

/**
 * TypedFlashList - A wrapper for FlashList that fixes typing issues 
 * with estimatedItemSize and other props in some versions.
 */
export function TypedFlashList<T>(props: any) {
    const Component = FlashList as any;
    return <Component {...props} />;
}
