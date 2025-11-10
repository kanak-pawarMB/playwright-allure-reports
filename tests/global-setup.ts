import { chromium } from '@playwright/test';
import fs from 'fs';

// Global setup to create auth.json if missing. Uses GOOGLE_EMAIL and GOOGLE_PASSWORD env vars.
export default async function globalSetup() {
  const authPath = 'auth.json';
  if (fs.existsSync(authPath)) {
    console.log('auth.json already exists, skipping global setup.');
    return;
  }

  const email = process.env.GOOGLE_EMAIL;
  const password = process.env.GOOGLE_PASSWORD;
  if (!email || !password) {
    console.warn('GOOGLE_EMAIL/GOOGLE_PASSWORD not set — global setup will skip creating auth.json.');
    return;
  }

  console.log('Global setup: creating auth.json using provided GOOGLE_EMAIL and GOOGLE_PASSWORD');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('https://dev-admin.wellityhealth.com/login', { waitUntil: 'domcontentloaded' });

    // Try to find and click any Google sign-in control
    const googleLocator = page.locator('text=/Google|Sign in with Google/i');
    if (await googleLocator.count()) {
      try {
        await googleLocator.first().waitFor({ state: 'visible', timeout: 10000 });
        await googleLocator.first().click();
      } catch (e) {
        console.warn('Could not click Google locator on main page, continuing to try to detect sign-in page.');
      }
    }

    // Wait for popup or redirect to Google's signin
    let authPage = null;
    // Wait for popup first
    authPage = await page.waitForEvent('popup', { timeout: 15000 }).catch(() => null);
    if (!authPage) {
      // wait for URL change to accounts.google.com
      const navigated = await page.waitForURL(/accounts\.google\.com/, { timeout: 15000 }).catch(() => null);
      if (navigated) authPage = page;
    }

    if (!authPage) {
      console.warn('Google sign-in page not detected — global setup cannot complete automated login.');
      await browser.close();
      return;
    }

    // Wait for email input
    await authPage.waitForLoadState('domcontentloaded');
    const emailInput = authPage.locator('input[type="email"]');
    await emailInput.waitFor({ state: 'visible', timeout: 20000 });
    await emailInput.fill(email);

    const nextBtn = authPage.locator('button:has-text("Next")');
    if (await nextBtn.count()) await nextBtn.first().click();

    // Wait for password field. There can be hidden inputs; pick the visible one.
    const passwordInputs = authPage.locator('input[type="password"]');
    await passwordInputs.first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
    let filled = false;
    const pCount = await passwordInputs.count();
    for (let i = 0; i < pCount; i++) {
      const p = passwordInputs.nth(i);
      if (await p.isVisible()) {
        await p.fill(password);
        filled = true;
        break;
      }
    }
    if (!filled) {
      // Fallback: try an aria-label based selector
      const labelled = authPage.getByLabel('Enter your password');
      if (await labelled.count()) {
        await labelled.first().fill(password);
      } else {
        throw new Error('Password input not found or visible');
      }
    }
    if (await nextBtn.count()) await nextBtn.first().click();

    // Wait until we are redirected back to the app or see a known post-login element
    await page.waitForURL('**/referrals', { timeout: 60000 }).catch(() => null);

    // Save storage state
    await context.storageState({ path: authPath });
    console.log('Saved auth.json');
  } catch (err) {
    console.error('Global setup login failed:', err);
  } finally {
    await browser.close();
  }
}
