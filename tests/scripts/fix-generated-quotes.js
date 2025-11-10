const fs = require('fs');
const path = require('path');
function walk(dir) {
  const res = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) res.push(...walk(p));
    else if (st.isFile() && p.endsWith('.spec.ts')) res.push(p);
  }
  return res;
}

const GENERATED_DIR = path.resolve(__dirname, '..', 'tests', 'generated');
if (!fs.existsSync(GENERATED_DIR)) {
  console.log('No generated directory found at', GENERATED_DIR);
  process.exit(0);
}

const files = walk(GENERATED_DIR);
for (const f of files) {
  let txt = fs.readFileSync(f, 'utf8');
  if (txt.includes("test('") && txt.includes("', async")) {
    txt = txt.replace("test('", 'test(`');
    txt = txt.replace("', async", '`, async');
    fs.writeFileSync(f, txt, 'utf8');
    console.log('Fixed', f);
  }
}
console.log('Done');
