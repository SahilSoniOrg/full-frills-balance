import { ScreenHeader } from '@/src/components/layout/ScreenHeader';
import { render, screen } from '@/src/utils/test-utils';
import React from 'react';
import { View } from 'react-native';

describe('ScreenHeader', () => {
  it('renders correctly with title', () => {
    render(<ScreenHeader title="Test Title" />);

    expect(screen.getByText('Test Title')).toBeTruthy();
  });

  it('renders with title and subtitle', () => {
    render(<ScreenHeader title="Test Title" subtitle="Test Subtitle" />);

    expect(screen.getByText('Test Title')).toBeTruthy();
    expect(screen.getByText('Test Subtitle')).toBeTruthy();
  });

  it('renders with actions', () => {
    const TestActions = () => <View testID="test-actions" />;

    render(<ScreenHeader title="Test Title" actions={<TestActions />} />);

    expect(screen.getByText('Test Title')).toBeTruthy();
    expect(screen.getByTestId('test-actions')).toBeTruthy();
  });


  it('passes additional props to View', () => {
    render(<ScreenHeader title="Test Title" testID="custom-header" />);

    expect(screen.getByTestId('custom-header')).toBeTruthy();
  });

  it('renders without actions', () => {
    render(<ScreenHeader title="Test Title" />);

    expect(screen.getByText('Test Title')).toBeTruthy();
    // Should not have actions container
    expect(screen.queryAllByTestId('test-actions')).toHaveLength(0);
  });

  it('renders without subtitle', () => {
    render(<ScreenHeader title="Test Title" />);

    expect(screen.getByText('Test Title')).toBeTruthy();
    // Should not have subtitle text
    expect(screen.queryAllByText('Test Subtitle')).toHaveLength(0);
  });

});
