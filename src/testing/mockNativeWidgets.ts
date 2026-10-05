export function createNativeWidgetsStub(): {
  syncWidgetData: jest.Mock<Promise<void>, [unknown]>;
  clearWidgetData: jest.Mock<Promise<void>, []>;
} {
  return {
    syncWidgetData: jest.fn<Promise<void>, [unknown]>(),
    clearWidgetData: jest.fn<Promise<void>, []>(),
  };
}

export function nativeWidgetAdapterModuleMock(): { loadNativeWidgetAdapter: jest.Mock } {
  return {
    loadNativeWidgetAdapter: jest.fn(),
  };
}
