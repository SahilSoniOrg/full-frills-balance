#!/usr/bin/env node
import { collectArchitectureFindings } from './check-architecture-ratchets.mjs';

const root = process.argv[2] ?? process.cwd();
const findings = collectArchitectureFindings(root).filter(
  finding => finding.rule === 'service_database_collection_access',
);

if (findings.length > 0) {
  console.error('Service database collection access is forbidden. Use a repository API:');
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line}: ${finding.message}`);
  }
  process.exit(1);
}

console.log('Service database collection access guard OK.');
