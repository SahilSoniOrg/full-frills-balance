import Currency from '@/src/data/models/Currency';
import { useDatabase } from '@nozbe/watermelondb/react';
import { useEffect, useState } from 'react';

/**
 * Hook to reactively get all available currencies
 */
export function useCurrencies() {
    const database = useDatabase();
    const [currencies, setCurrencies] = useState<Currency[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const collection = database.collections.get<Currency>('currencies');
        const subscription = collection
            .query()
            .observe()
            .subscribe((data) => {
                setCurrencies(data);
                setIsLoading(false);
            });

        return () => subscription.unsubscribe();
    }, [database]);

    return { currencies, isLoading };
}
