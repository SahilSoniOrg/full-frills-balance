import {
  PlannedPaymentMonthStrip,
  PlannedPaymentMonthSummary,
} from '@/src/features/planned-payments/components/PlannedPaymentMonthSummary';
import { buildPlannedPaymentListPresentation } from '@/src/features/planned-payments/hooks/plannedPaymentListPresentation';
import { render } from '@/src/utils/test-utils';
import { StyleSheet, View } from 'react-native';

function makeListData() {
  const list = buildPlannedPaymentListPresentation(
    { items: [], savedOccurrences: [] },
    'USD',
    new Date(2026, 9, 10).getTime(),
  );
  return {
    ...list,
    summary: {
      ...list.summary,
      outgoing: { ...list.summary.outgoing, count: 4 },
    },
    monthStrip: list.monthStrip.map(day => {
      if (day.day === 1) return { ...day, outgoingAmount: 999_999, isPast: true };
      if (day.day === 10) return { ...day, outgoingAmount: 20, incomingAmount: 100 };
      if (day.day === 11) return { ...day, outgoingAmount: 10, incomingAmount: 10 };
      return day;
    }),
  };
}

function makeSummaryData() {
  const list = makeListData();
  return {
    ...list,
    summary: {
      ...list.summary,
      outgoing: {
        ...list.summary.outgoing,
        mainCurrency: { currencyCode: 'USD', amount: 50, count: 1 },
        perCurrency: [
          { currencyCode: 'USD', amount: 50, count: 1 },
          { currencyCode: 'EUR', amount: 500, count: 2 },
        ],
        count: 3,
        otherCurrencyCount: 2,
      },
      incoming: {
        ...list.summary.incoming,
        mainCurrency: { currencyCode: 'USD', amount: 0, count: 0 },
        perCurrency: [{ currencyCode: 'EUR', amount: 500, count: 2 }],
        count: 2,
        otherCurrencyCount: 2,
      },
    },
  };
}

describe('PlannedPaymentMonthStrip', () => {
  it('describes only remaining days and payment count without exposing amounts', () => {
    const listData = makeListData();
    const { getByLabelText } = render(
      <PlannedPaymentMonthStrip listData={listData} monthName="October" />,
    );
    const strip = getByLabelText('October: 4 payments remaining, largest remaining day Oct 10');
    expect(strip.props.accessibilityRole).toBe('image');
    expect(strip.props.accessibilityLabel).not.toMatch(/999999|100|20/);
  });

  it('scales incoming and outgoing bars against independent monthly maxima', () => {
    const listData = makeListData();
    const { getByLabelText, UNSAFE_getAllByType } = render(
      <PlannedPaymentMonthStrip listData={listData} monthName="October" />,
    );
    expect(
      getByLabelText('October: 4 payments remaining, largest remaining day Oct 10').props.accessibilityRole,
    ).toBe('image');
    const barHeights = UNSAFE_getAllByType(View)
      .map(view => StyleSheet.flatten(view.props.style)?.height)
      .filter((height): height is number => typeof height === 'number');
    expect(barHeights).toContain(4); // outgoing 20 / outgoing maximum 20
    expect(barHeights).toContain(12); // incoming 100 / incoming maximum 100
  });
});

describe('PlannedPaymentMonthSummary', () => {
  it('keeps foreign amounts out of the summary and qualifies incoming with its count', () => {
    const { getByText, getAllByText, queryByText } = render(
      <PlannedPaymentMonthSummary listData={makeSummaryData()} />,
    );
    expect(getByText('coming in · 2 payments')).toBeTruthy();
    expect(getAllByText('+ 2 in other currencies')).toHaveLength(2);
    expect(queryByText('EUR')).toBeNull();
  });

  it('hides the complete incoming block when there are no incoming occurrences', () => {
    const listData = makeSummaryData();
    listData.summary.incoming = {
      ...listData.summary.incoming,
      count: 0,
      otherCurrencyCount: 0,
    };
    const { queryByText } = render(<PlannedPaymentMonthSummary listData={listData} />);
    expect(queryByText(/coming in/)).toBeNull();
  });
});
