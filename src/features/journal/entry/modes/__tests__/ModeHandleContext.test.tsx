import {
  ModeHandleProvider,
  useActiveModeHandle,
  useRegisterModeHandle,
} from '@/src/features/journal/entry/modes/ModeHandleContext';
import { ModeHandle } from '@/src/features/journal/entry/modes/ModeHandle';
import { act, render, renderHook } from '@testing-library/react-native';
import { ReactNode, useState } from 'react';
import { Text } from 'react-native';

function wrapper({ children }: { children: ReactNode }) {
  return <ModeHandleProvider>{children}</ModeHandleProvider>;
}

describe('ModeHandle registry', () => {
  it('registers handle and routes submit to the latest callback', () => {
    const submit = jest.fn();
    const handle: ModeHandle = {
      submitLabel: 'Save',
      isSubmitDisabled: false,
      submit,
    };

    const { result } = renderHook(
      () => {
        useRegisterModeHandle(handle);
        return useActiveModeHandle();
      },
      { wrapper },
    );

    expect(result.current?.submitLabel).toBe('Save');
    expect(result.current?.isSubmitDisabled).toBe(false);

    act(() => {
      result.current?.submit();
    });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('updates when submitLabel / disabled change', () => {
    function useHarness() {
      const [label, setLabel] = useState('Save expense');
      const [disabled, setDisabled] = useState(true);
      useRegisterModeHandle({
        submitLabel: label,
        isSubmitDisabled: disabled,
        submit: () => {},
      });
      const active = useActiveModeHandle();
      return { active, setLabel, setDisabled };
    }

    const { result } = renderHook(() => useHarness(), { wrapper });

    expect(result.current.active?.submitLabel).toBe('Save expense');
    expect(result.current.active?.isSubmitDisabled).toBe(true);

    act(() => {
      result.current.setLabel('Save income');
      result.current.setDisabled(false);
    });

    expect(result.current.active?.submitLabel).toBe('Save income');
    expect(result.current.active?.isSubmitDisabled).toBe(false);
  });

  it('invokes latest submit through stable registration', () => {
    const submitA = jest.fn();
    const submitB = jest.fn();

    function useHarness(submit: () => void) {
      useRegisterModeHandle({
        submitLabel: 'Save',
        isSubmitDisabled: false,
        submit,
      });
      return useActiveModeHandle();
    }

    const { result, rerender } = renderHook(
      ({ submit }: { submit: typeof submitA }) => useHarness(submit),
      { wrapper, initialProps: { submit: submitA } },
    );

    act(() => {
      result.current?.submit();
    });
    expect(submitA).toHaveBeenCalledTimes(1);

    rerender({ submit: submitB });

    act(() => {
      result.current?.submit();
    });
    expect(submitB).toHaveBeenCalledTimes(1);
    expect(submitA).toHaveBeenCalledTimes(1);
  });

  it('clears the active handle when the registrar unmounts', () => {
    function Registrar() {
      useRegisterModeHandle({
        submitLabel: 'Save',
        isSubmitDisabled: false,
        submit: () => {},
      });
      return null;
    }

    function Label() {
      const active = useActiveModeHandle();
      return <Text testID="label">{active?.submitLabel ?? 'none'}</Text>;
    }

    function Root({ showRegistrar }: { showRegistrar: boolean }) {
      return (
        <ModeHandleProvider>
          {showRegistrar ? <Registrar /> : null}
          <Label />
        </ModeHandleProvider>
      );
    }

    const { getByTestId, rerender } = render(<Root showRegistrar />);
    expect(getByTestId('label').props.children).toBe('Save');

    rerender(<Root showRegistrar={false} />);
    expect(getByTestId('label').props.children).toBe('none');
  });
});
