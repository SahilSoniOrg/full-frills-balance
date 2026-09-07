import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const appConfig = fs.readFileSync(path.join(root, 'src/constants/app-config.ts'), 'utf8');
const policy = fs.readFileSync(path.join(root, 'PRIVACY.MD'), 'utf8');
const version = appConfig.match(/privacyPolicyVersion:\s*'([^']+)'/)?.[1];

if (!version) {
  throw new Error('Could not find AppConfig.legal.privacyPolicyVersion.');
}

const [year, month, day] = version.split('-').map(Number);
const effectiveDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
}).format(new Date(Date.UTC(year, month - 1, day)));

const requiredMarkers = [
  `Effective Date: ${effectiveDate}`,
  `Last Updated: ${effectiveDate}`,
  `- ${effectiveDate} —`,
];
const missingMarkers = requiredMarkers.filter(marker => !policy.includes(marker));

if (missingMarkers.length > 0) {
  throw new Error(
    `Privacy policy version ${version} is out of sync with PRIVACY.MD. Missing: ${missingMarkers.join(', ')}`,
  );
}

console.log(`Privacy policy ${version} matches PRIVACY.MD.`);
