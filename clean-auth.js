const fs = require('fs');
const AUTH_FILE = 'auth.json';
const TARGET_DOMAIN = 'wellityhealth.com';

const data = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
data.cookies = data.cookies.filter(cookie => cookie.domain.includes(TARGET_DOMAIN));

fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2));
console.log(`✅ Cleaned ${AUTH_FILE}, kept only cookies for ${TARGET_DOMAIN}`);
