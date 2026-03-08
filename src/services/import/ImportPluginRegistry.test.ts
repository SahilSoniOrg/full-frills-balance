import { importRegistry } from '@/src/services/import/registry';
import { ImportPlugin } from '@/src/services/import/types';

describe('ImportRegistry', () => {
    const mockPlugin: ImportPlugin = {
        id: 'test-plugin',
        name: 'Test Plugin',
        description: 'Test Description',
        icon: 'test',
        detect: jest.fn(),
        import: jest.fn(),
    };

    beforeEach(() => {
        // Since importRegistry is a singleton, we need to clear it manually for tests
        // or access the private property if necessary.
        // For testing, we can just use fresh plugins with unique IDs if clear is not available.
        (importRegistry as any).plugins.clear();
    });

    it('registers and retrieves a plugin', () => {
        importRegistry.register(mockPlugin);
        expect(importRegistry.get('test-plugin')).toBe(mockPlugin);
        expect(importRegistry.getAll()).toContain(mockPlugin);
    });

    it('throws error when registering duplicate ID', () => {
        importRegistry.register(mockPlugin);
        expect(() => importRegistry.register(mockPlugin)).toThrow(/already registered/);
    });

    it('auto-detects format using plugin detect method', () => {
        const otherPlugin: ImportPlugin = {
            id: 'other-plugin',
            name: 'Other',
            description: 'Other Description',
            icon: 'other',
            detect: (context: any) => context.json?.type === 'other',
            import: jest.fn(),
        };

        importRegistry.register(mockPlugin);
        importRegistry.register(otherPlugin);

        (mockPlugin.detect as jest.Mock).mockReturnValue(false);
        const result = importRegistry.detect({ json: { type: 'other' } } as any);
        expect(result).toBe(otherPlugin);
    });

    it('returns undefined if no plugin matches during detection', () => {
        (mockPlugin.detect as jest.Mock).mockReturnValue(false);
        importRegistry.register(mockPlugin);

        const result = importRegistry.detect({ json: { unknown: true } } as any);
        expect(result).toBeUndefined();
    });
});
