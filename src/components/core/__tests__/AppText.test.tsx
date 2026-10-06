import { AppInputField } from '@/src/components/core/AppInputField';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { FontIds, FontSchemes } from '@/src/constants/design-tokens';
import { ThemeOverride } from '@/src/contexts/UIContext';
import { ensureAllFontSetsLoaded } from '@/src/utils/loadFontSet';
import { AppText } from '@/src/components/core/AppText';
import { render, screen } from '@/src/utils/test-utils';

describe('AppText', () => {
  it('renders correctly', () => {
    render(<AppText>Hello World</AppText>);
    expect(screen.getByText('Hello World')).toBeTruthy();
  });

  it('applies correct base styles', () => {
    render(<AppText>Styled Text</AppText>);
    const textElement = screen.getByText('Styled Text');
    // Basic check to ensure it renders. Detailed style checks might depend on theme impl.
    expect(textElement).toBeTruthy();
  });

  it('passes standard text props', () => {
    render(<AppText numberOfLines={1}>Truncated Text</AppText>);
    const textElement = screen.getByText('Truncated Text');
    expect(textElement).toBeTruthy();
    expect(textElement.props.numberOfLines).toBe(1);
  });
});

describe('Typography across font themes', () => {
  beforeAll(async () => {
    await ensureAllFontSetsLoaded();
  });

  it.each(Object.values(FontIds))('%s keeps display, UI, and numeric roles distinct', fontId => {
    const fonts = FontSchemes[fontId];
    render(
      <ThemeOverride fontId={fontId} mode="light">
        <AppText variant="title">Accounts</AppText>
        <AppText variant="heading">Monthly spending</AppText>
        <AppText variant="heading" weight="bold">
          Explicit emphasis
        </AppText>
        <MoneyText amount={1234.56} currencyCode="USD" variant="title" testID="total" />
        <AppInputField placeholder="Account name" />
        <AppInputField keyboardType="decimal-pad" placeholder="Amount" />
      </ThemeOverride>,
    );

    expect(screen.getByText('Accounts')).toHaveStyle({ fontFamily: fonts.heading });
    expect(screen.getByText('Monthly spending')).toHaveStyle({ fontFamily: fonts.semibold });
    expect(screen.getByText('Explicit emphasis')).toHaveStyle({ fontFamily: fonts.bold });
    expect(screen.getByTestId('total')).toHaveStyle({
      fontFamily: (fonts.numeric ?? fonts).semibold,
      fontVariant: ['tabular-nums', 'lining-nums'],
    });
    expect(screen.getByPlaceholderText('Account name')).toHaveStyle({ fontFamily: fonts.regular });
    expect(screen.getByPlaceholderText('Amount')).toHaveStyle({
      fontFamily: (fonts.numeric ?? fonts).regular,
    });
  });

  it('keeps weights stable between light and dark and updates existing text on theme switches', () => {
    const view = (fontId: (typeof FontIds)[keyof typeof FontIds], mode: 'light' | 'dark') => (
      <ThemeOverride fontId={fontId} mode={mode}>
        <AppText>Body copy</AppText>
        <AppText variant="title">Screen title</AppText>
      </ThemeOverride>
    );
    const { rerender } = render(view(FontIds.DEEP_SPACE, 'light'));
    expect(screen.getByText('Body copy')).toHaveStyle({
      fontFamily: FontSchemes[FontIds.DEEP_SPACE].regular,
    });
    rerender(view(FontIds.DEEP_SPACE, 'dark'));
    expect(screen.getByText('Body copy')).toHaveStyle({
      fontFamily: FontSchemes[FontIds.DEEP_SPACE].regular,
    });
    rerender(view(FontIds.EDITORIAL, 'dark'));
    expect(screen.getByText('Body copy')).toHaveStyle({
      fontFamily: FontSchemes[FontIds.EDITORIAL].regular,
    });
    expect(screen.getByText('Screen title')).toHaveStyle({
      fontFamily: FontSchemes[FontIds.EDITORIAL].heading,
    });
  });

  it('only enables tabular numerals for data or explicit opt-in', () => {
    render(
      <>
        <AppText testID="prose">Readable paragraphs</AppText>
        <AppText tabular testID="count">
          128
        </AppText>
      </>,
    );
    expect(screen.getByTestId('prose')).not.toHaveStyle({
      fontVariant: ['tabular-nums', 'lining-nums'],
    });
    expect(screen.getByTestId('count')).toHaveStyle({
      fontVariant: ['tabular-nums', 'lining-nums'],
    });
  });
});
