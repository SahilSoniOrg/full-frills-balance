import { FlashList } from '@shopify/flash-list';
import React from 'react';

/**
 * TypedFlashList - A wrapper for FlashList that fixes typing issues 
 * with estimatedItemSize and other props in some versions.
 */
export const TypedFlashList = React.forwardRef((props: any, ref: any) => {
    const Component = FlashList as any;
    return <Component {...props} ref={ref} />;
});

TypedFlashList.displayName = 'TypedFlashList';
