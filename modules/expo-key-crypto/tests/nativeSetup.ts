jest.mock('@/src/services/backup/nativeKeyOperations', () => ({
  nativeKeyOperations: {
    recovery: (operation: string, request: unknown) =>
      jest.requireActual('./nativeTestContext').nativeTestOperation(operation, request),
  },
}));
