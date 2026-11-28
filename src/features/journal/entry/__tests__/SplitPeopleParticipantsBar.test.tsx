import { fireEvent, render, screen } from '@/src/testing/render';
import { asPersonId } from '@/src/types/ids';
import { SplitPeopleParticipantsBar } from '../components/SplitPeopleParticipantsBar';

const alice = { id: asPersonId('alice'), name: 'Alice' };
const bob = { id: asPersonId('bob'), name: 'Bob' };

function renderBar(
  overrides: Partial<React.ComponentProps<typeof SplitPeopleParticipantsBar>> = {},
) {
  const props: React.ComponentProps<typeof SplitPeopleParticipantsBar> = {
    people: [alice, bob],
    selectedPersonIds: [alice.id],
    onTogglePerson: jest.fn(),
    onQuickAddPerson: jest.fn().mockResolvedValue(undefined),
    hasParticipants: true,
    splitMode: 'equal',
    onChangeSplitMode: jest.fn(),
    remainingAmountText: '$12.00',
    canAddRemainingToYours: true,
    onAddRemainingToYours: jest.fn(),
    isQuickAdding: false,
    ...overrides,
  };
  return { ...render(<SplitPeopleParticipantsBar {...props} />), props };
}

describe('SplitPeopleParticipantsBar', () => {
  it('renders participants and toggles their selection', () => {
    const { props } = renderBar();
    fireEvent.press(screen.getByTestId('split-participant-bob'));
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(props.onTogglePerson).toHaveBeenCalledWith(bob.id);
  });

  it('opens quick add and submits the entered person name', async () => {
    const { props } = renderBar();
    fireEvent.press(screen.getByText('+ Quick add'));
    fireEvent.changeText(screen.getByPlaceholderText('Person name'), 'Carol');
    fireEvent.press(screen.getByText('Add'));
    expect(props.onQuickAddPerson).toHaveBeenCalledWith('Carol');
  });

  it('changes split mode and adds the remaining amount to yours', () => {
    const { props } = renderBar();
    fireEvent.press(screen.getByText('Custom'));
    fireEvent.press(screen.getByTestId('split-add-remaining'));
    expect(props.onChangeSplitMode).toHaveBeenCalledWith('custom');
    expect(props.onAddRemainingToYours).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Remaining to assign: $12.00')).toBeTruthy();
  });
});
