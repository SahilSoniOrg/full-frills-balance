type WasmFactory = (options?: {
  locateFile?: (file: string) => string;
  ffbVault?: {
    load(name: string): Promise<Uint8Array | null>;
    save(name: string, bytes: Uint8Array): Promise<void>;
    remove(name: string): Promise<void>;
  };
}) => Promise<{
  ccall: (
    name: string,
    returnType: 'number' | 'void',
    argumentTypes: ('string' | 'number')[],
    args: (string | number)[],
  ) => number | void;
  UTF8ToString(pointer: number): string;
  _free(pointer: number): void;
}>;

declare const createKeyCryptoModule: WasmFactory;
export default createKeyCryptoModule;
