import { ListGroup } from '@/src/components/core/ListGroup';
import { ListRow, listRowTextInset } from '@/src/components/core/ListRow';
import { render, screen } from '@/src/utils/test-utils';
import { StyleSheet, View } from 'react-native';

const separators = () =>
  screen.UNSAFE_getAllByType(View).filter(node => {
    const style = StyleSheet.flatten(node.props.style);
    return style?.height === 1 && style?.backgroundColor;
  });

describe('ListGroup', () => {
  it('renders the header and footer', () => {
    render(
      <ListGroup header="Preferences" footer="Applies to this device">
        <ListRow title="Theme" />
      </ListGroup>,
    );
    expect(screen.getByRole('header')).toBeTruthy();
    expect(screen.getByText('Preferences')).toBeTruthy();
    expect(screen.getByText('Applies to this device')).toBeTruthy();
  });

  it('draws a divider between rows, inset to the row text', () => {
    render(
      <ListGroup variant="plain">
        <ListRow title="One" />
        <ListRow title="Two" />
        {null}
        <ListRow title="Three" />
      </ListGroup>,
    );
    const lines = separators();
    expect(lines).toHaveLength(2);
    expect(StyleSheet.flatten(lines[0].props.style).marginLeft).toBe(listRowTextInset('plain'));
  });

  it('honours a numeric inset and dividerInset="none"', () => {
    const { rerender } = render(
      <ListGroup dividerInset={7}>
        <ListRow title="One" />
        <ListRow title="Two" />
      </ListGroup>,
    );
    expect(StyleSheet.flatten(separators()[0].props.style).marginLeft).toBe(7);
    rerender(
      <ListGroup dividerInset="none">
        <ListRow title="One" />
        <ListRow title="Two" />
      </ListGroup>,
    );
    expect(separators()).toHaveLength(0);
  });

  it('sits rows on a surface card unless flat', () => {
    const surfaceCount = () =>
      screen
        .UNSAFE_getAllByType(View)
        .filter(node => StyleSheet.flatten(node.props.style)?.borderRadius !== undefined).length;
    const { rerender } = render(
      <ListGroup>
        <ListRow title="One" />
      </ListGroup>,
    );
    const card = surfaceCount();
    rerender(
      <ListGroup variant="plain">
        <ListRow title="One" />
      </ListGroup>,
    );
    expect(surfaceCount()).toBeLessThan(card);
  });
});
