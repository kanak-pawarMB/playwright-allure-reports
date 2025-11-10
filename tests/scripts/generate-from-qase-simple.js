const fs = require('fs');
const path = require('path');

const QASE_JSON = path.resolve(__dirname, '../data/qase-cases.json');
const MAPPING_FILE = path.resolve(__dirname, '../mappings/qase-mapping.json');
const TESTS_DIR = path.resolve(__dirname, '../generated');

if (!fs.existsSync(QASE_JSON)) {
  console.error('Missing QASE export at', QASE_JSON);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(QASE_JSON, 'utf8'));

// collect case objects recursively
const cases = [];
function collect(node) {
  if (!node) return;
  if (Array.isArray(node)) return node.forEach(collect);
  if (node.cases && Array.isArray(node.cases)) {
    node.cases.forEach(c => cases.push(c));
  }
  if (node.suites && Array.isArray(node.suites)) {
    node.suites.forEach(collect);
  }
}
collect(raw);

if (cases.length === 0) {
  console.error('No cases found in QASE JSON');
  process.exit(1);
}

if (!fs.existsSync(path.dirname(MAPPING_FILE))) {
  fs.mkdirSync(path.dirname(MAPPING_FILE), { recursive: true });
}
if (!fs.existsSync(TESTS_DIR)) {
  fs.mkdirSync(TESTS_DIR, { recursive: true });
}

const mapping = [];
for (const c of cases) {
  const qase_id = c.id || c.case_id || c.caseId || c.external_id || c.number;
  const title = c.title || c.name || c.summary || 'Untitled';
  const qaseCode = c.code || `QASE-${qase_id}`;
  const safeName = title.replace(/[^a-z0-9\-_.]/gi, '-').slice(0, 100);
  const suggestedFile = path.join('tests/generated', `${qaseCode}-${safeName}.spec.ts`);
  mapping.push({ qase_id, qase_code: qaseCode, title, test_file: suggestedFile, skip: false });
}

fs.writeFileSync(MAPPING_FILE, JSON.stringify(mapping, null, 2));
console.log('Saved mapping to', MAPPING_FILE);

for (const m of mapping) {
  if (m.skip) continue;
  const filePath = path.resolve(__dirname, '..', m.test_file);
  if (fs.existsSync(filePath)) continue;
  const content = `import { test, expect } from '@playwright/test';

// QASE: ${m.qase_code} (${m.qase_id})
// Title: ${m.title}

test('${m.qase_code} - ${m.title}', async ({ page }) => {
  // TODO: implement steps from QASE case ${m.qase_id}
  // This is a generated stub.
});
`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Created stub:', filePath);
}

console.log('Done generating', mapping.length, 'stubs.');
