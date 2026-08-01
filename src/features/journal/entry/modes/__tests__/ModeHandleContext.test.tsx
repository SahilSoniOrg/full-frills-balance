import {
  ModeHandleProvider,
  useModeAccountActions,
  useModeSubmitBar,
  useRegisterModeHandle,
} from '@/src/features/journal/entry/modes/ModeHandleContext';
import { ModeHandle } from '@/src/features/journal/entry/modes/ModeHandle';
import { AccountId } from '@/src/types/domain';
import { act, render, renderHook } from '@testing-library/react-native';
import { ReactNode, useState } from 'react';
import { Text } from 'react-native';

function wrapper({ children }: { children: ReactNode }) {
  return <ModeHandleProvider>{children}</ModeHandleProvider>;
}

describe('ModeHandle registry', () => {
  it('registers submit chrome and routes submit to the latest callback', () => {
    const submit = jest.fn();
    const handle: ModeHandle = {
      submitLabel: 'Save',
      isSubmitDisabled: false,
      submit,
    };

    const { result } = renderHook(
      () => {
        useRegisterModeHandle(handle);
        return useModeSubmitBar();
      },
      { wrapper },
    );

    expect(result.current.submitLabel).toBe('Save');
    expect(result.current.isSubmitDisabled).toBe(false);

    act(() => {
      result.current.submit();
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
      return { bar: useModeSubmitBar(), setLabel, setDisabled };
    }

    const { result } = renderHook(() => useHarness(), { wrapper });

    expect(result.current.bar.submitLabel).toBe('Save expense');
    expect(result.current.bar.isSubmitDisabled).toBe(true);

    act(() => {
      result.current.setLabel('Save income');
      result.current.setDisabled(false);
    });

    expect(result.current.bar.submitLabel).toBe('Save income');
    expect(result.current.bar.isSubmitDisabled).toBe(false);
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
      return useModeSubmitBar();
    }

    const { result, rerender } = renderHook(
      ({ submit }: { submit: typeof submitA }) => useHarness(submit),
      { wrapper, initialProps: { submit: submitA } },
    );

    act(() => {
      result.current.submit();
    });
    expect(submitA).toHaveBeenCalledTimes(1);

    rerender({ submit: submitB });

    act(() => {
      result.current.submit();
    });
    expect(submitB).toHaveBeenCalledTimes(1);
    expect(submitA).toHaveBeenCalledTimes(1);
  });

  it('routes account application to the registered panel', () => {
    const applyAccountToLine = jest.fn();

    function useHarness() {
      useRegisterModeHandle({
        submitLabel: 'Save',
        isSubmitDisabled: false,
        submit: () => {},
        applyAccountToLine,
        resolveSelectedAccountId: lineId =>
          lineId === 'line-1' ? ('acc-1' as AccountId) : undefined,
      });
      return useModeAccountActions();
    }

    const { result } = renderHook(() => useHarness(), { wrapper });

    act(() => {
      result.current.applyAccountToLine('line-1', 'acc-2' as AccountId);
    });

    expect(applyAccountToLine).toHaveBeenCalledWith('line-1', 'acc-2');
    expect(result.current.resolveSelectedAccountId('line-1')).toBe('acc-1');
    expect(result.current.resolveSelectedAccountId('line-2')).toBeUndefined();
  });

  it('does not re-render account-action consumers when a panel re-registers', () => {
    const shellRenders = jest.fn();

    function Shell() {
      useModeAccountActions();
      shellRenders();
      return null;
    }

    // Mirrors a mode panel rebuilding its callbacks on every render.
    function Panel({ label }: { label: string }) {
      useRegisterModeHandle({
        submitLabel: label,
        isSubmitDisabled: false,
        submit: () => {},
        applyAccountToLine: () => {},
        resolveSelectedAccountId: () => undefined,
      });
      return null;
    }

    function Root({ label }: { label: string }) {
      return (
        <ModeHandleProvider>
          <Shell />
          <Panel label={label} />
        </ModeHandleProvider>
      );
    }

    const { rerender } = render(<Root label="Save expense" />);
    const rendersAfterMount = shellRenders.mock.calls.length;

    rerender(<Root label="Save income" />);

    expect(shellRenders).toHaveBeenCalledTimes(rendersAfterMount);
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
      const { submitLabel } = useModeSubmitBar();
      return <Text testID="label">{submitLabel || 'none'}</Text>;
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
