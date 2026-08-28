import { InlineSearchField } from '@/src/components/core/InlineSearchField';
import { fireEvent, render, screen } from '@/src/utils/test-utils';

const defaultProps = {
  value: '',
  onChangeText: jest.fn(),
};

describe('InlineSearchField', () => {
  it('provides a named search trigger with a comfortable hit area', () => {
    render(<InlineSearchField {...defaultProps} />);

    const searchButton = screen.getByRole('search');

    expect(searchButton.props.accessibilityLabel).toBe('Search…');
    expect(searchButton.props.hitSlop).toBe(8);
  });

  it('provides a named button for collapsing the expanded search field', () => {
    render(<InlineSearchField {...defaultProps} />);
    fireEvent.press(screen.getByRole('search'));

    const collapseButton = screen.getByRole('button', { name: 'Collapse search' });

    expect(collapseButton.props.hitSlop).toBe(8);
  });
});
