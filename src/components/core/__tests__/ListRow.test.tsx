import { ListRow } from '@/src/components/core/ListRow';
import { render, screen } from '@/src/utils/test-utils';
import { StyleSheet, View } from 'react-native';

describe('ListRow', () => {
  it('uses minimum leading width so custom leading content is not clipped', () => {
    render(
      <ListRow
        title="Checking"
        leadingWidth={48}
        leading={<View testID="wide-leading" style={{ width: 48 }} />}
      />,
    );

    const leadingSlot = screen
      .UNSAFE_getAllByType(View)
      .find(node => StyleSheet.flatten(node.props.style)?.minWidth === 48);

    expect(leadingSlot).toBeTruthy();
  });
});
