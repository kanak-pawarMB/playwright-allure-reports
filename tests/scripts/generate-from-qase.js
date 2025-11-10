// scripts/generate-from-qase.js
// Usage: node scripts/generate-from-qase.js
// Node >= 16 recommended

const fs = require('fs');
const path = require('path');

// CONFIG
const QASE_JSON = path.resolve(__dirname, '../data/qase-cases.json'); // from API/UI export
const MAPPING_FILE = path.resolve(__dirname, '../mappings/qase-mapping.json');
const TESTS_DIR = path.resolve(__dirname, '../tests');

// Ensure directories exist
if (!fs.existsSync(path.dirname(MAPPING_FILE))) fs.mkdirSync(path.dirname(MAPPING_FILE), { recursive: true });
if (!fs.existsSync(TESTS_DIR)) fs.mkdirSync(TESTS_DIR, { recursive: true });

// Read QASE export (JSON expected)
if (!fs.existsSync(QASE_JSON)) {
  console.error('Missing QASE export:', QASE_JSON);
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(QASE_JSON, 'utf8'));

// QASE API returns { status: true, result: { cases: [...] } } or plain array depending on export.
// Try to normalize:
let cases = [];
if (Array.isArray(raw)) cases = raw;
else if (raw.result && (raw.result.cases || raw.result.items)) {
  cases = raw.result.cases || raw.result.items;
} else if (raw.cases) cases = raw.cases;
else {
  // fallback: if object with numeric keys
  console.warn('Unknown JSON shape, inspecting keys...');
  cases = raw;
}

// Helper: make safe filename
function safeFileName(s) {
  return s.replace(/[^a-z0-9\-_.]/gi, '-').slice(0, 120);
}

// Load or initialize mapping
let mapping = [];
if (fs.existsSync(MAPPING_FILE)) {
  mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
} else {
  mapping = [];
}

// Build map for quick lookup by qase_id or title
const mapById = new Map(mapping.map(m => [String(m.qase_id), m]));

// Loop through exported cases and add mapping entries if missing
for (const c of cases) {
  // adapt these depending on your JSON fields from QASE export:
  const qase_id = c.id || c.case_id || c.caseId || c.external_id || c.number; // try common fields
  const title = c.title || c.name || c.summary || (c.case && c.case.title) || 'Untitled';
  const qaseCode = c.code || c.key || (c.project && `${c.project}-${qase_id}`) || String(qase_id);

  if (!qase_id) {
    console.warn('Skipping case with no id:', title);
    continue;
  }

  if (!mapById.has(String(qase_id))) {
    const suggestedFile = path.join('tests', `${qaseCode || 'QASE'}-${safeFileName(title)}.spec.ts`);
    const entry = {
      qase_id,
      qase_code: qaseCode,
      title,
      test_file: suggestedFile,
      skip: false
    };
    mapping.push(entry);
    mapById.set(String(qase_id), entry);
    console.log(`Mapped QASE ${qase_id} -> ${entry.test_file}`);
  }
}

// Write mapping file (if newly created or updated)
fs.writeFileSync(MAPPING_FILE, JSON.stringify(mapping, null, 2));
console.log('Mapping saved to', MAPPING_FILE);

// Create test stubs for new mapping entries
for (const m of mapping) {
  if (m.skip) continue;
  const filePath = path.resolve(__dirname, '..', m.test_file);
  if (fs.existsSync(filePath)) {
    // don't overwrite existing test file
    continue;
  }
  const content = `import { test, expect } from '@playwright/test';

// QASE: ${m.qase_code} (${m.qase_id})
// Title: ${m.title}

test('${m.qase_code} - ${m.title}', async ({ page }) => {
  // TODO: Implement steps from QASE for this case.
  // 1) Navigate to base URL or specific path
  // await page.goto('/');
  // 2) Replace the placeholders below with real locators and assertions
  // await expect(page.getByText('Some text')).toBeVisible();
});
`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, { encoding: 'utf8' });
  console.log('Created test stub:', filePath);
}

console.log('Done.');