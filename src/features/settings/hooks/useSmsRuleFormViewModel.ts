import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import SmsAutoPostRule from '@/src/data/models/SmsAutoPostRule';
import { useAccounts } from '@/src/features/accounts';
import { smsService } from '@/src/services/sms-service';
import { toast } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import SmsInboxRecord from '@/src/data/models/SmsInboxRecord';
import { useEffect, useState } from 'react';

export interface SmsRuleFormViewModel {
    id?: string;
    senderMatch: string;
    setSenderMatch: (val: string) => void;
    bodyMatch: string;
    setBodyMatch: (val: string) => void;
    sourceAccountId: string;
    setSourceAccountId: (val: string) => void;
    categoryAccountId: string;
    setCategoryAccountId: (val: string) => void;
    isActive: boolean;
    setIsActive: (val: boolean) => void;
    pickingAccountFor: 'source' | 'category' | null;
    setPickingAccountFor: (val: 'source' | 'category' | null) => void;
    isSubmitting: boolean;
    isValid: boolean;
    handleSave: () => Promise<void>;
    handleDelete: () => Promise<void>;
    accounts: Account[];
    previewMatches: SmsInboxRecord[];
}

export function useSmsRuleFormViewModel(id?: string, seed?: {
    senderMatch?: string;
    bodyMatch?: string;
    sourceAccountId?: string;
    categoryAccountId?: string;
}): SmsRuleFormViewModel {
    const { accounts } = useAccounts();

    const [senderMatch, setSenderMatch] = useState(seed?.senderMatch || '');
    const [bodyMatch, setBodyMatch] = useState(seed?.bodyMatch || '');
    const [sourceAccountId, setSourceAccountId] = useState(seed?.sourceAccountId || '');
    const [categoryAccountId, setCategoryAccountId] = useState(seed?.categoryAccountId || '');
    const [isActive, setIsActive] = useState(true);

    const [pickingAccountFor, setPickingAccountFor] = useState<'source' | 'category' | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [previewMatches, setPreviewMatches] = useState<SmsInboxRecord[]>([]);

    useEffect(() => {
        if (id) {
            const loadRule = async () => {
                try {
                    const rule = await database.collections.get<SmsAutoPostRule>('sms_auto_post_rules').find(id);
                    setSenderMatch(rule.senderMatch);
                    setBodyMatch(rule.bodyMatch || '');
                    setSourceAccountId(rule.sourceAccountId);
                    setCategoryAccountId(rule.categoryAccountId);
                    setIsActive(rule.isActive);
                } catch {
                    toast.error('Failed to load rule');
                    AppNavigation.back();
                }
            };
            loadRule();
        }
    }, [id]);

    useEffect(() => {
        let isActive = true;
        const loadPreview = async () => {
            if (!senderMatch.trim()) {
                setPreviewMatches([]);
                return;
            }

            try {
                const matches = await smsService.previewRuleMatches(senderMatch.trim(), bodyMatch.trim() || undefined);
                if (isActive) {
                    setPreviewMatches(matches);
                }
            } catch {
                if (isActive) {
                    setPreviewMatches([]);
                }
            }
        };

        loadPreview();
        return () => {
            isActive = false;
        };
    }, [senderMatch, bodyMatch]);

    const isValid = senderMatch.trim().length > 0 && !!sourceAccountId && !!categoryAccountId;

    const handleSave = async () => {
        if (!isValid) return;

        try {
            new RegExp(senderMatch.trim(), 'i');
            if (bodyMatch.trim()) new RegExp(bodyMatch.trim(), 'i');
        } catch {
            toast.error('Invalid Regex syntax in match fields');
            return;
        }

        setIsSubmitting(true);
        try {
            await smsService.saveAutoPostRule({
                id,
                senderMatch: senderMatch.trim(),
                bodyMatch: bodyMatch.trim() || undefined,
                sourceAccountId,
                categoryAccountId,
                isActive
            });
            toast.success('Rule saved');
            AppNavigation.back();
        } catch {
            toast.error('Failed to save rule');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!id) return;
        setIsSubmitting(true);
        try {
            await smsService.deleteAutoPostRule(id);
            toast.success('Rule deleted');
            AppNavigation.back();
        } catch {
            toast.error('Failed to delete rule');
        } finally {
            setIsSubmitting(false);
        }
    };

    return {
        id,
        senderMatch,
        setSenderMatch,
        bodyMatch,
        setBodyMatch,
        sourceAccountId,
        setSourceAccountId,
        categoryAccountId,
        setCategoryAccountId,
        isActive,
        setIsActive,
        pickingAccountFor,
        setPickingAccountFor,
        isSubmitting,
        isValid,
        handleSave,
        handleDelete,
        accounts,
        previewMatches
    };
}
