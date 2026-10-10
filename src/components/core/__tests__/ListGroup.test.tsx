import { ListGroup } from '@/src/components/core/ListGroup';
import { ListRow, listRowTextInset } from '@/src/components/core/ListRow';
import { fireEvent, render, screen } from '@/src/utils/test-utils';
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

  it('renders ListRowItem items, keyed by id, before children', () => {
    const onPress = jest.fn();
    render(
      <ListGroup
        items={[
          { id: 'a', title: 'Alpha', testID: 'row-a', onPress },
          { id: 'b', title: 'Beta', testID: 'row-b' },
        ]}
      >
        <ListRow title="Custom" testID="row-custom" />
      </ListGroup>,
    );
    const ids = screen
      .UNSAFE_queryAllByProps({})
      .map(node => node.props.testID)
      .filter((id): id is string => typeof id === 'string' && id.startsWith('row-'));
    expect([...new Set(ids)]).toEqual(['row-a', 'row-b', 'row-custom']);
    fireEvent.press(screen.getByTestId('row-a'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('maps items with toRow and applies rowProps, letting item props win', () => {
    const items = [
      { key: 'x', name: 'Ex' },
      { key: 'y', name: 'Why' },
    ];
    render(
      <ListGroup
        items={items}
        toRow={(item, index) => ({
          id: item.key,
          title: `${index}:${item.name}`,
          testID: `row-${item.key}`,
          ...(item.key === 'y' ? { subtitle: 'own' } : null),
        })}
        rowProps={{ subtitle: 'shared' }}
      />,
    );
    expect(screen.getByText('0:Ex')).toBeTruthy();
    expect(screen.getByText('1:Why')).toBeTruthy();
    expect(screen.getAllByText('shared')).toHaveLength(1);
    expect(screen.getByText('own')).toBeTruthy();
  });

  it('keeps one divider between generated and custom rows and renders nothing when empty', () => {
    render(<ListGroup items={[]} testID="empty-group" />);
    expect(screen.queryByTestId('empty-group')).toBeNull();
    render(
      <ListGroup items={[{ id: 'a', title: 'A' }]}>
        <ListRow title="B" />
      </ListGroup>,
    );
    expect(separators()).toHaveLength(1);
  });
});
