import { test, expect } from '@playwright/test';
import fs from 'fs';
// Temporary declaration for `process` until @types/node is installed
declare const process: any;

// Reuse saved session if it exists
if (fs.existsSync('auth.json')) {
  test.use({ storageState: 'auth.json' });
}

test('Perform Google login and save session', async ({ page }) => {
  // Increase timeout for first-time login
  test.setTimeout(90000);

  // Step 1: Navigate to login page
  await page.goto('https://dev-admin.wellityhealth.com/login');
  console.log('✅ Opened login page');

  // Step 2: Wait for page load and capture screenshot
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);
  console.log('🔍 Page title:', await page.title());
  await page.screenshot({ path: 'debug-login-page.png', fullPage: true });
  console.log('📸 Screenshot captured: debug-login-page.png');

  // Detect whether we're already authenticated (e.g. storageState preloaded) and skip sign-in if so.
  // Presence of a user menu or referrals UI indicates already logged in.
  const alreadyLoggedIn = await page.locator('text=User menu').count() || await page.locator('text=Referral List').count();
  if (alreadyLoggedIn) {
    console.log('ℹ️ Session appears already authenticated — skipping Google sign-in flow.');
  } else {
    // Step 3: Locate and click Google Sign-In control
  // Use a broader text-based locator so we find anchors/divs as well as buttons.
  const googleTextLocator = page.locator('text=/Google/i');

  // Log how many matches and their texts to help debugging when locator fails
  const matchCount = await googleTextLocator.count();
  console.log(`🔎 Google text matches on page: ${matchCount}`);
  if (matchCount > 0) {
    const texts = await googleTextLocator.allInnerTexts();
    console.log('🔎 Matched elements inner texts:', texts);
  }

  // Wait for any matching element to become visible then click the first visible one
  let clicked = false;
  for (let i = 0; i < matchCount; i++) {
    const locator = googleTextLocator.nth(i);
    try {
      await locator.waitFor({ state: 'visible', timeout: 5000 });
      await locator.click({ timeout: 5000 });
      console.log('✅ Clicked Google Sign-In control');
      clicked = true;
      break;
    } catch (e) {
      // ignore and try next
    }
  }
  if (!clicked) {
    throw new Error('Google Sign-In control not found or not visible');
  }
  }


  // Step 4: Handle popup or redirect Google flow
  let authPage = null;

  // Try to capture popup (common flow) first
  authPage = await page.waitForEvent('popup', { timeout: 20000 }).catch(() => null);

  // If no popup, check whether the current page navigated to Google's sign-in (redirect flow)
  if (!authPage) {
    const navigated = await page.waitForURL(/accounts\.google\.com/, { timeout: 20000 }).catch(() => null);
    if (navigated) authPage = page;
  }

  if (authPage) {
    console.log('✅ Google sign-in page detected (popup or redirect).');
    await authPage.waitForLoadState('domcontentloaded');

    // Use environment variables for credentials (no fallbacks). Failing fast if not set.
    const email = process.env.GOOGLE_EMAIL;
    const password = process.env.GOOGLE_PASSWORD;
    if (!email || !password) {
      throw new Error('Environment variables GOOGLE_EMAIL and GOOGLE_PASSWORD are required for Google login');
    }

    // Fill email
    const emailInput = authPage.locator('input[type="email"]');
    await emailInput.fill(email);
    const nextBtn = authPage.locator('button:has-text("Next")');
    if (await nextBtn.count()) await nextBtn.first().click();

    // Small wait for password field to appear
    await authPage.waitForTimeout(1000);

    // Fill password
    const passwordInput = authPage.locator('input[type="password"]');
    await passwordInput.fill(password);
    if (await nextBtn.count()) await nextBtn.first().click();
  } else {
    console.log('⚠️ No Google sign-in page detected within timeout — manual intervention may be required.');
  }

  // Step 5: Wait for post-login page
  await page.waitForURL('**/referrals', { timeout: 60000 });
  console.log('✅ Logged in successfully.');

  // Step 6: Save authenticated session for reuse
  await page.context().storageState({ path: 'auth.json' });
  console.log('💾 Session saved to auth.json');
});





