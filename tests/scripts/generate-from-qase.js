// scripts/generate-from-qase.js
// Usage: node tests/scripts/generate-from-qase.js
// Node >= 16 recommended

const fs = require('fs');
const path = require('path');

// CONFIG
const QASE_JSON = path.resolve(__dirname, '../data/qase-cases.json'); // expected QASE export file
const MAPPING_FILE = path.resolve(__dirname, '../mappings/qase-mapping.json');
const TESTS_DIR = path.resolve(__dirname, '../tests/generated'); // put generated tests into a subfolder for clarity

// Ensure directories exist
fs.mkdirSync(path.dirname(MAPPING_FILE), { recursive: true });
fs.mkdirSync(TESTS_DIR, { recursive: true });

// ✅ Step 1: Verify QASE export exists
if (!fs.existsSync(QASE_JSON)) {
  console.error('\n❌ Missing QASE export file!');
  console.error('Expected at:', QASE_JSON);
  console.error('\n💡 Fix:');
  console.error('1️⃣ Export your test cases from QASE (in JSON format).');
  console.error('2️⃣ Save it to: tests/data/qase-cases.json');
  console.error('3️⃣ Then re-run: node tests/scripts/generate-from-qase.js\n');
  process.exit(1);
}

// ✅ Step 2: Read and normalize QASE data
const raw = JSON.parse(fs.readFileSync(QASE_JSON, 'utf8'));
let cases = [];

if (Array.isArray(raw)) {
  cases = raw;
} else if (raw.result && (raw.result.cases || raw.result.items)) {
  cases = raw.result.cases || raw.result.items;
} else if (raw.cases) {
  cases = raw.cases;
} else if (typeof raw === 'object' && Object.keys(raw).length > 0) {
  console.warn('⚠️ Unknown JSON shape — using all object values.');
  cases = Object.values(raw);
} else {
  console.error('❌ Could not find any test cases in JSON export.');
  process.exit(1);
}

// ✅ Step 3: Helper — safe filename
function safeFileName(s) {
  return s.replace(/[^a-z0-9\-_.]/gi, '-').slice(0, 100);
}

// ✅ Step 4: Load or initialize mapping
let mapping = [];
if (fs.existsSync(MAPPING_FILE)) {
  mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
}
const mapById = new Map(mapping.map(m => [String(m.qase_id), m]));

// ✅ Step 5: Generate mappings and test stubs
for (const c of cases) {
  const qase_id = c.id || c.case_id || c.caseId || c.external_id || c.number;
  const title = c.title || c.name || c.summary || 'Untitled';
  const qaseCode = c.code || c.key || (c.project && `${c.project}-${qase_id}`) || String(qase_id);

  if (!qase_id) {
    console.warn('⚠️ Skipping case with no ID:', title);
    continue;
  }

  if (!mapById.has(String(qase_id))) {
    const suggestedFile = path.join('tests/generated', `${safeFileName(qaseCode)}-${safeFileName(title)}.spec.ts`);
    const entry = { qase_id, qase_code: qaseCode, title, test_file: suggestedFile, skip: false };
    mapping.push(entry);
    mapById.set(String(qase_id), entry);
    console.log(`🆕 Mapped QASE ${qase_id} -> ${entry.test_file}`);
  }
}

// ✅ Step 6: Save updated mapping
fs.writeFileSync(MAPPING_FILE, JSON.stringify(mapping, null, 2));
console.log('\n💾 Mapping saved to', MAPPING_FILE);

// ✅ Step 7: Create Playwright test stubs
for (const m of mapping) {
  if (m.skip) continue;
  const filePath = path.resolve(__dirname, '..', m.test_file);
  if (fs.existsSync(filePath)) continue;

  const content = `import { test, expect } from '@playwright/test';

// QASE: ${m.qase_code} (${m.qase_id})
// Title: ${m.title}

test('${m.qase_code} - ${m.title}', async ({ page }) => {
  // TODO: Implement steps from QASE for this case.
  // 1) Navigate to base URL or specific path
  // await page.goto('/');
  // 2) Replace with real locators and assertions
  // await expect(page.getByText('Some text')).toBeVisible();
});
`;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ Created test stub:', filePath);
}

console.log('\n🎉 Done generating test stubs from QASE!\n');
