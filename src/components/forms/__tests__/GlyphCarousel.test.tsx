import { FlatList } from 'react-native';
import { fireEvent, render } from '@/src/utils/test-utils';
import { GlyphCarousel } from '../GlyphCarousel';
import type { GlyphCarouselItem } from '../GlyphCarousel';
import { Icon } from '@/src/components/core';

const items: GlyphCarouselItem[] = [
  { key: 'cash', icon: Icon.Wallet, label: 'Cash', tone: 'asset' },
  { key: 'bank', icon: Icon.Bank, label: 'Bank account', tone: 'asset' },
  { key: 'card', icon: Icon.CreditCard, label: 'Credit card', tone: 'liability' },
];

let scrollToIndex: jest.SpyInstance;
beforeEach(() => {
  scrollToIndex = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('GlyphCarousel', () => {
  it('selects a neighboring glyph when tapped', () => {
    const onSelect = jest.fn();
    const screen = render(
      <GlyphCarousel items={items} selectedKey="bank" onSelect={onSelect} testID="account-kind" />,
    );
    fireEvent.press(screen.getByTestId('account-kind-cash'));
    expect(onSelect).toHaveBeenCalledWith('cash');
  });

  it('supports accessibility increment and decrement actions', () => {
    const onSelect = jest.fn();
    const screen = render(
      <GlyphCarousel items={items} selectedKey="bank" onSelect={onSelect} testID="account-kind" />,
    );
    const carousel = screen.getByTestId('account-kind');
    expect(carousel.props.accessibilityRole).toBe('adjustable');
    fireEvent(carousel, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onSelect).toHaveBeenLastCalledWith('card');
    fireEvent(carousel, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onSelect).toHaveBeenLastCalledWith('cash');
  });

  it('notifies on a manual drag even when the carousel snaps back to the current item', () => {
    const onSelect = jest.fn();
    const screen = render(
      <GlyphCarousel items={items} selectedKey="bank" onSelect={onSelect} testID="account-kind" />,
    );
    fireEvent(screen.getByTestId('account-kind-list'), 'scrollBeginDrag');
    expect(onSelect).toHaveBeenCalledWith('bank');
  });

  it('does not treat an externally selected item as a manual gesture', () => {
    const onSelect = jest.fn();
    const screen = render(
      <GlyphCarousel items={items} selectedKey="bank" onSelect={onSelect} testID="account-kind" />,
    );
    fireEvent(screen.getByTestId('account-kind'), 'layout', {
      nativeEvent: { layout: { width: 320, height: 160 } },
    });
    screen.rerender(
      <GlyphCarousel items={items} selectedKey="card" onSelect={onSelect} testID="account-kind" />,
    );
    expect(onSelect).not.toHaveBeenCalled();
    expect(scrollToIndex).toHaveBeenLastCalledWith(
      expect.objectContaining({ index: 2, viewPosition: 0.5 }),
    );
  });
});
