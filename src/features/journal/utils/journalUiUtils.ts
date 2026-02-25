import { TransactionBadge, TransactionCardProps } from '@/src/components/common/TransactionCard';
import { IconName } from '@/src/components/core/AppIcon';
import { AppConfig } from '@/src/constants';
import { EnrichedJournal, JournalDisplayType } from '@/src/types/domain';
import { getAccountTypeVariant } from '@/src/utils/accountCategory';
import { journalPresenter } from '@/src/utils/journalPresenter';

/**
 * Maps an EnrichedJournal model to props compatible with TransactionCard
 */
export function mapJournalToCardProps(journal: EnrichedJournal): Omit<TransactionCardProps, 'onPress'> {
    const displayType = journal.displayType as JournalDisplayType;
    const presentation = journalPresenter.getPresentation(displayType, journal.semanticLabel);

    let typeIcon: IconName = 'document';
    let amountPrefix = '';

    if (displayType === JournalDisplayType.INCOME) {
        typeIcon = 'arrowUp';
        amountPrefix = '+ ';
    } else if (displayType === JournalDisplayType.EXPENSE) {
        typeIcon = 'arrowDown';
        amountPrefix = '− ';
    } else if (displayType === JournalDisplayType.TRANSFER) {
        typeIcon = 'swapHorizontal';
    }

    const badges: TransactionBadge[] = journal.accounts.slice(0, 2).map(acc => {
        const isSource = acc.role === 'SOURCE';
        const isDest = acc.role === 'DESTINATION';
        const showPrefix = isSource ? AppConfig.strings.journal.from : (isDest ? AppConfig.strings.journal.to : '');

        return {
            text: `${showPrefix}${acc.name}`,
            variant: getAccountTypeVariant(acc.accountType),
            icon: (acc.icon as IconName) || (acc.accountType === 'EXPENSE' ? 'tag' : 'wallet'),
        };
    });

    if (journal.accounts.length > 2) {
        badges.push({
            text: AppConfig.strings.journal.more(journal.accounts.length - 2),
            variant: 'default',
        });
    }

    const defaultTitle = displayType === JournalDisplayType.TRANSFER
        ? AppConfig.strings.journal.transfer
        : AppConfig.strings.journal.transaction;

    return {
        title: journal.description || defaultTitle,
        amount: journal.totalAmount,
        currencyCode: journal.currencyCode,
        transactionDate: journal.journalDate,
        presentation: {
            label: presentation.label,
            typeColor: presentation.colorKey,
            typeIcon,
            amountPrefix,
        },
        badges,
        notes: journal.notes,
    };
}
