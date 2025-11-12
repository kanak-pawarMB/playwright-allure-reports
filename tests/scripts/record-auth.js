const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  console.log('\n=== Manual auth recorder ===');
  console.log('1) A browser window will open.');
  console.log('2) Sign in to https://dev-admin.wellityhealth.com using the Google button (perform any 2FA if required).');
  console.log('3) After you see the app logged in (Referral List visible), return to this terminal and press Enter to save auth.json');
  console.log('');

  await page.goto('https://dev-admin.wellityhealth.com/login');

  // wait until user presses Enter
  console.log('Browser opened. Press Enter here once you have completed manual login...');
  await new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once('data', async () => {
      try {
        await context.storageState({ path: 'auth.json' });
        console.log('Saved auth.json');
      } catch (e) {
        console.error('Failed to save storageState:', e);
      } finally {
        await browser.close();
        resolve();
      }
    });
  });
})();
