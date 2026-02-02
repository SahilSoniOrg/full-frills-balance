import * as Orchestrator from '@/src/services/import/orchestrator';
import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';
import { Platform } from 'react-native';

// Mock dependencies
jest.mock('expo-file-system/legacy');
jest.mock('jszip');
// Platform needs specific mocking approach as it is a getter usually or requires jest.replaceProperty if available
// Or we mock the module. safely mocking react-native is tricky.
// We will mock it by using Object.defineProperty if needed or jest.mock.

jest.mock('react-native', () => ({
    Platform: {
        OS: 'ios',
        select: jest.fn(),
    },
}));

describe('ImportOrchestrator', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Platform.OS = 'ios'; // Reset to default
    });

    describe('isZipFile (internal via extractIfZip)', () => {
        // We can't test internal functions directly if not exported.
        // But extractIfZip usage of it can be tested.
    });

    describe('readFileAsBytes', () => {
        it('should read file as base64 on native', async () => {
            const mockBase64 = Buffer.from('Hello World').toString('base64');
            (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(mockBase64);
            Platform.OS = 'ios';

            const bytes = await Orchestrator.readFileAsBytes('file://test');

            // Check byte conversion
            const text = new TextDecoder().decode(bytes);
            expect(text).toBe('Hello World');
            expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith('file://test', { encoding: FileSystem.EncodingType.Base64 });
        });

        it('should fetch and arrayBuffer on web', async () => {
            Platform.OS = 'web';

            const mockBuffer = new TextEncoder().encode('Web File').buffer;
            global.fetch = jest.fn().mockResolvedValue({
                arrayBuffer: () => Promise.resolve(mockBuffer)
            } as any);

            const bytes = await Orchestrator.readFileAsBytes('http://test');
            const text = new TextDecoder().decode(bytes);
            expect(text).toBe('Web File');

            // cleanup
            delete (global as any).fetch;
        });
    });

    describe('extractIfZip', () => {
        it('should return original bytes if NOT a zip', async () => {
            const bytes = new TextEncoder().encode('Just text properties');
            const result = await Orchestrator.extractIfZip(bytes);
            expect(result).toBe(bytes); // Should return input ref or eq
        });

        it('should extract valid JSON if IS a zip', async () => {
            // Mock ZIP magic bytes (PK\x03\x04 = 50 4B 03 04 hex)
            const zipBytes = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0x00]);

            const mockUnzippedContent = new TextEncoder().encode('{"data":1}');

            // Mock JSZip behavior
            const mockZipInstance = {
                files: {
                    'data.json': {
                        dir: false,
                        async: jest.fn().mockResolvedValue(mockUnzippedContent)
                    },
                    '__MACOSX/': { dir: true }
                }
            };
            // JSZip is imported as default
            (JSZip.loadAsync as jest.Mock).mockResolvedValue(mockZipInstance);

            const result = await Orchestrator.extractIfZip(zipBytes);
            expect(result).toBe(mockUnzippedContent);
        });

        it('should throw if zip has no valid files', async () => {
            const zipBytes = new Uint8Array([0x50, 0x4B, 0x03, 0x04]);
            const mockZipInstance = {
                files: {
                    '__MACOSX/foo': { dir: false }
                }
            };
            (JSZip.loadAsync as jest.Mock).mockResolvedValue(mockZipInstance);

            // The orchestrator wraps the error
            await expect(Orchestrator.extractIfZip(zipBytes)).rejects.toThrow('Failed to extract file from ZIP archive.');
        });
    });

    describe('decodeContent', () => {
        it('should decode valid UTF-8', () => {
            const bytes = new TextEncoder().encode('{"foo":"bar"}');
            const result = Orchestrator.decodeContent(bytes);
            expect(result).toBe('{"foo":"bar"}');
        });

        // Simulating UTF-16BE is harder without Buffer in RN environment fully polyfilled in test?
        // JS env usually has TextDecoder.
        // We need to bypass UTF-8 check. internal decodeContent checks if trim() starts with { or [
        // If we give it random bytes, UTF-8 might succeed but JSON check fails, triggering fallback.

        it('should fallback to UTF-16BE if UTF-8 fails JSON check', () => {
            // "{" in UTF-16BE is 00 7B
            // "A" is 00 41
            // Let's make a simple string: "{}" -> 00 7B 00 7D
            const bytes = new Uint8Array([0x00, 0x7B, 0x00, 0x7D]);

            // UTF-8 decode of this is "\x00{\x00}" which doesn't start with {
            // So it should throw 'Likely encoding issue' and go to catch block

            const result = Orchestrator.decodeContent(bytes);
            expect(result).toBe('{}');
        });
    });
});
