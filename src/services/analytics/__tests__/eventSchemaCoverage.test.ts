import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';
import {
  isAnalyticsEventDeclared,
  sanitizeAnalyticsProperties,
} from '@/src/utils/observabilityPrivacy';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.[jt]sx?$/.test(entry.name) && !entry.name.includes('.test.') ? [path] : [];
  });
}

describe('analytics event schema coverage', () => {
  it('declares every literal event and feature emitted by application code', () => {
    const src = join(process.cwd(), 'src');
    if (!existsSync(src)) return;
    const missing: string[] = [];
    for (const file of sourceFiles(src)) {
      const text = readFileSync(file, 'utf8');
      const callPattern = /(?:analytics\.track|trackUserInteraction)\(\s*['"]([^'"]+)['"]/g;
      for (const match of text.matchAll(callPattern)) {
        const event = match[0].includes('trackUserInteraction') ? `user_${match[1]}` : match[1];
        if (!isAnalyticsEventDeclared(event)) missing.push(`${relative(src, file)}: ${event}`);
      }
      const featurePattern = /trackFeatureUsage\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/g;
      for (const match of text.matchAll(featurePattern)) {
        const event = `feature_${match[1]}_${match[2]}`;
        if (!isAnalyticsEventDeclared(event)) missing.push(`${relative(src, file)}: ${event}`);
      }
      const metricPattern = /logger\.metric\(\s*['"]([^'"]+)['"]/g;
      for (const match of text.matchAll(metricPattern)) {
        if (!sanitizeAnalyticsProperties('performance', { metric: match[1], value: 1 })) {
          missing.push(`${relative(src, file)}: performance.metric=${match[1]}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
