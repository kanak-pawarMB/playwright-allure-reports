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
  // If an `auth.json` file exists, prefer validating it over attempting automated Google login.
  if (fs.existsSync('auth.json')) {
    console.log('🔁 Found auth.json — validating recorded session by opening /referrals');
    await page.goto('https://dev-admin.wellityhealth.com/referrals', { waitUntil: 'networkidle' });
    // Give the app some time to render from client state
    await page.waitForTimeout(2000);
    const valid = (await page.locator('text=/Referral List/i').count()) || (await page.locator('text=/User menu/i').count());
    if (valid) {
      console.log('✅ Recorded session appears valid — skipping automated Google login.');
      // refresh storage state in case cookies/localStorage were updated
      await page.context().storageState({ path: 'auth.json' }).catch(() => null);
      return;
    }
    console.warn('⚠️ auth.json present but session validation failed. Consider re-recording auth.json with the manual recorder.');
    // fall through to attempt interactive/login flows below
  }
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
      // If credentials aren't provided but we have a recorded auth.json, try restoring client-side state
      if (fs.existsSync('auth.json')) {
        console.log('⚠️ GOOGLE_* not set — restoring client localStorage from auth.json instead of automated login.');
        try {
          const raw = fs.readFileSync('auth.json', 'utf8');
          const parsed = JSON.parse(raw);
          const originEntry = (parsed.origins || []).find((o: any) => o.origin && o.origin.includes('dev-admin.wellityhealth.com'));
          // restore cookies for the app domain first (helps serverside sessions)
          if (parsed.cookies && Array.isArray(parsed.cookies)) {
            const appCookies = parsed.cookies.filter((c: any) => c.domain && c.domain.includes('wellityhealth.com'));
            if (appCookies.length) {
              try {
                const toAdd = appCookies.map((c: any) => ({
                  name: c.name,
                  value: c.value,
                  domain: c.domain,
                  path: c.path || '/',
                  expires: c.expires ? Math.floor(Number(c.expires)) : undefined,
                  httpOnly: !!c.httpOnly,
                  secure: !!c.secure,
                  sameSite: (c.sameSite || undefined) as any,
                }));
                // @ts-ignore - Playwright typing mismatch in this context
                await page.context().addCookies(toAdd);
                console.log(`✅ Restored ${toAdd.length} cookies for app domain from auth.json`);
              } catch (e) {
                console.warn('Failed to restore cookies from auth.json:', e);
              }
            }
          }
          if (originEntry && originEntry.localStorage) {
            for (const kv of originEntry.localStorage) {
              const name = kv.name;
              const value = kv.value;
              // use a single serialized object arg to satisfy Playwright typings
              await page.evaluate((pair: { k: string; v: string }) => localStorage.setItem(pair.k, pair.v), { k: name, v: value });
            }
            await page.reload({ waitUntil: 'networkidle' });
            console.log('✅ Restored client localStorage from auth.json and reloaded.');
          } else {
            console.warn('No localStorage entry for app origin found in auth.json.');
          }
        } catch (e) {
          console.warn('Failed to restore auth.json localStorage fallback:', e);
        }

        // Close popup if it opened
        if (authPage !== page) {
          try { await authPage.close(); } catch (e) { /* ignore */ }
        }
      } else {
        throw new Error('Environment variables GOOGLE_EMAIL and GOOGLE_PASSWORD are required for Google login');
      }
    } else {
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
    }
  } else {
    console.log('⚠️ No Google sign-in page detected within timeout — manual intervention may be required.');
  }

  // Step 5: Wait for post-login UI (more robust than strict URL check)
  try {
    // Wait for either the referrals URL or a visible UI indicator (Referral List or User menu)
    await Promise.race([
      page.waitForURL('**/referrals', { timeout: 30000 }).catch(() => null),
      page.waitForSelector('text=/Referral List/i', { timeout: 30000 }).catch(() => null),
      page.waitForSelector('text=/User menu/i', { timeout: 30000 }).catch(() => null),
    ]);

    // If none detected yet, try navigating directly to referrals and wait for the UI
    const hasReferralText = await page.locator('text=/Referral List/i').count();
    const hasUserMenu = await page.locator('text=/User menu/i').count();
    if (!hasReferralText && !hasUserMenu) {
      console.log('🔁 Post-login UI not detected; navigating to /referrals to check session');
      await page.goto('https://dev-admin.wellityhealth.com/referrals', { waitUntil: 'networkidle' });
    }

    // Final verification: referral list visible
    await page.waitForSelector('text=/Referral List/i', { timeout: 30000 });
    console.log('✅ Logged in successfully.');
  } catch (e) {
    // Save debug HTML for inspection and rethrow a clear error
    try { fs.writeFileSync('debug-login-failure.html', await page.content()); } catch (err) { /* ignore */ }
    throw new Error('Login did not complete: Referral UI not visible after fallback restores. See debug-login-failure.html');
  }

  // Step 6: Save authenticated session for reuse
  await page.context().storageState({ path: 'auth.json' });
  console.log('💾 Session saved to auth.json');
});
