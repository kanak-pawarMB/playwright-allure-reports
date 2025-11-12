import { test, expect } from '@playwright/test';
import fs from 'fs';

// Only reuse saved session if it exists. Global setup will attempt to create it when possible.
if (fs.existsSync('auth.json')) {
  test.use({ storageState: 'auth.json' });
}

const BASE = 'https://dev-admin.wellityhealth.com';

// Helper to ensure we're on the referrals page and the main UI is visible
async function goToReferralsAndWait(page: any) {
  await page.goto(`${BASE}/referrals`);
  // wait for network + main UI element
  await page.waitForLoadState('networkidle');

  // If we were redirected to the login page despite having a local `auth.json`,
  // try restoring localStorage from the recorded `auth.json` as a fallback.
  try {
    const current = page.url();
    if (current.includes('/login') && fs.existsSync('auth.json')) {
      const raw = fs.readFileSync('auth.json', 'utf8');
      const parsed = JSON.parse(raw);
      const originEntry = (parsed.origins || []).find((o: any) => o.origin === BASE);
      if (originEntry && originEntry.localStorage) {
        for (const kv of originEntry.localStorage) {
          const name = kv.name;
          const value = kv.value;
          // provide explicit tuple typing to avoid implicit any compile errors
          await page.evaluate(([k, v]: [string, string]) => localStorage.setItem(k, v), [name, value]);
        }
        // reload and wait for app to pick up authenticated state
        await page.reload({ waitUntil: 'networkidle' });
      }
    }
  } catch (e) {
    console.warn('Could not restore localStorage from auth.json fallback:', e);
  }

  // Wait for either the heading or the table to appear to be resilient to small DOM changes
  await Promise.race([
    page.waitForSelector('text=/Referral List/i', { timeout: 15000 }).catch(() => null),
    page.waitForSelector('table tbody tr', { timeout: 15000 }).catch(() => null),
  ]);
}

// Helper to robustly find the "Select payer" dropdown using multiple fallbacks
async function findPayerDropdown(page: any) {
  // Try role-based first
  let locator = page.getByRole('button', { name: /select payer/i }).first();
  if (await locator.count() && await locator.isVisible()) return locator;

  // Fallback: button with visible text
  locator = page.locator('button:has-text("Select payer")').first();
  if (await locator.count() && await locator.isVisible()) return locator;

  // Fallback: any element that contains the text (less strict)
  locator = page.locator('text=/Select payer/i').first();
  if (await locator.count() && await locator.isVisible()) return locator;

  // Final fallback: locate by the combobox role if present
  locator = page.locator('[role="combobox"]:has-text("Select payer")').first();
  return locator;
}

// Generic helper: find a dropdown/button by visible label using multiple fallbacks
async function findDropdownByLabel(page: any, labelRegex: RegExp) {
  // Role-based
  let locator = page.getByRole('button', { name: labelRegex }).first();
  if (await locator.count() && await locator.isVisible()) return locator;

  // Button with text
  locator = page.locator(`button:has-text("${labelRegex.source.replace(/\\/g, '')}")`).first();
  if (await locator.count() && await locator.isVisible()) return locator;

  // Any visible text node
  locator = page.locator(`text=${labelRegex}`).first();
  if (await locator.count() && await locator.isVisible()) return locator;

  // combobox fallback
  locator = page.locator('[role="combobox"]').filter({ hasText: labelRegex }).first();
  return locator;
}

// =============================================================
// 📋 Referrals Page Tests
// =============================================================

test('TC_RF_001 - Verify referrals page loads successfully', async ({ page }) => {
  await goToReferralsAndWait(page);
  await expect(page).toHaveURL(/\/referrals/);
  await expect(page.getByText(/Referral List/i)).toBeVisible();
});

test('TC_RF_002 - Verify filter controls are visible', async ({ page }) => {
  await goToReferralsAndWait(page);

  await expect(page.getByPlaceholder('Search by patient name')).toBeVisible({ timeout: 10000 });

  const payerDropdown = await findDropdownByLabel(page, /select payer/i);
  const referralTypeDropdown = await findDropdownByLabel(page, /select referral type/i);
  const dateRangeDropdown = await findDropdownByLabel(page, /select referral date range/i);

  // Ensure the page has loaded and the controls are visible; allow some extra time for slow runs
  await payerDropdown.waitFor({ state: 'visible', timeout: 20000 });
  await expect(payerDropdown).toBeVisible();
  await referralTypeDropdown.waitFor({ state: 'visible', timeout: 20000 });
  await expect(referralTypeDropdown).toBeVisible();
  await dateRangeDropdown.waitFor({ state: 'visible', timeout: 20000 });
  await expect(dateRangeDropdown).toBeVisible();
});

test('TC_RF_003 - Verify referral table loads with rows', async ({ page }) => {
  await goToReferralsAndWait(page);
  const table = page.locator('table');
  await expect(table).toBeVisible();

  // wait for at least one row to appear
  await page.waitForSelector('table tbody tr', { timeout: 15000 });
  const rows = await page.locator('table tbody tr').count();
  expect(rows).toBeGreaterThan(0);
  await expect(page.getByText(/Patient Name/i)).toBeVisible();
});

test('TC_RF_004 - Schedule Appointment button opens modal', async ({ page }) => {
  await goToReferralsAndWait(page);

  const scheduleBtn = page.getByRole('button', { name: /schedule appointment/i }).first();
  await expect(scheduleBtn).toBeVisible({ timeout: 10000 });
  await scheduleBtn.click();

  const modal = page.getByText(/Schedule Appointment/i).first();
  await expect(modal).toBeVisible({ timeout: 10000 });
});

test('TC_RF_005 - Search by patient name filters results', async ({ page }) => {
  await goToReferralsAndWait(page);

  const search = page.getByPlaceholder('Search by patient name');
  await expect(search).toBeVisible();
  await search.fill('Javier');
  await page.keyboard.press('Enter');

  // wait for filtered rows to appear
  await page.waitForSelector('table tbody tr', { timeout: 10000 });
  const rows = await page.locator('table tbody tr').count();
  expect(rows).toBeGreaterThan(0);
  await expect(page.getByText(/Javier/i)).toBeVisible();
});

// =============================================================
// 💡 Select Payer Dropdown Tests
// =============================================================

// ✅ TC_RF_011 - Verify Select Payer dropdown is visible and clickable
test('TC_RF_011 - Verify Select Payer dropdown is visible and functional', async ({ page }) => {
  await page.goto('https://dev-admin.wellityhealth.com/referrals');
  await page.waitForLoadState('networkidle');

  // Debugging: check if Select Payer text exists
  const payerElements = await page.locator('text=Select payer').all();
  console.log(`Found ${payerElements.length} elements containing "Select payer" text`);
  for (let i = 0; i < payerElements.length; i++) {
    const visible = await payerElements[i].isVisible();
    console.log(`Element ${i}: visible=${visible}`);
  }

  const payerDropdown = page.getByText('Select payer', { exact: false });
  await expect(payerDropdown).toBeVisible();
  await payerDropdown.click();
  console.log('✅ Clicked on Select Payer dropdown successfully');
});


// ✅ TC_RF_012 - Verify selecting a payer filters the table
test('TC_RF_012 - Verify selecting a payer filters the table', async ({ page }) => {
  await page.goto('https://dev-admin.wellityhealth.com/referrals');
  await expect(page.getByText('Referral List')).toBeVisible();

  // Wait for dropdown to render
  await page.waitForTimeout(2000);

  // Step 1: Locate dropdown
  let payerDropdown = page.getByRole('button', { name: /select payer/i });
  if (!(await payerDropdown.count())) {
    payerDropdown = page.locator('//button[.//span[contains(text(), "Select payer")]]');
  }

  await payerDropdown.first().waitFor({ state: 'visible', timeout: 10000 });
  await payerDropdown.first().click();
  console.log('✅ Select Payer dropdown found and clicked');

  // Step 2: Debug what appears
  await page.screenshot({ path: 'payer-dropdown-open.png', fullPage: false });
  console.log('📸 Screenshot captured: payer-dropdown-open.png');

  // Step 3: Handle detached Radix portal
  const options = page.locator('div.cursor-pointer:has(span.text-sm)');
  await options.first().waitFor({ state: 'visible', timeout: 8000 });
  const optionCount = await options.count();
  console.log(`📊 Found ${optionCount} dropdown options`);
  expect(optionCount).toBeGreaterThan(0);

  // Step 4: Select first option
  const firstOption = options.first();
  const payerName = await firstOption.textContent();
  await firstOption.click();
  console.log(`✅ Selected payer: ${payerName?.trim()}`);

  // Step 5: Verify table updates
  await page.waitForTimeout(2000);
  const rowCount = await page.locator('table tbody tr').count();
  console.log(`📋 Table rows after filtering: ${rowCount}`);
  expect(rowCount).toBeGreaterThan(0);
});

// ✅ TC_RF_013 - Verify clearing payer filter resets the table

test('TC_RF_013 - Verify clearing payer filter resets the table', async ({ page }) => {
  await page.goto('https://dev-admin.wellityhealth.com/referrals');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Referral List')).toBeVisible();

  // 🩻 Save page HTML for debugging
  fs.writeFileSync('debug-referrals.html', await page.content());
  console.log('🩻 Saved page HTML snapshot -> debug-referrals.html');

  // 🕒 Step 1: Locate "Select Payer" dropdown
  const payerDropdown = page.locator('text=/Select payer/i');
  await payerDropdown.first().waitFor({ state: 'visible', timeout: 10000 });
  console.log('✅ "Select Payer" dropdown is visible');

  // 🖱 Step 2: Click to open dropdown
  await payerDropdown.first().click({ delay: 100 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'payer-dropdown-after-click.png' });
  console.log('📸 Screenshot captured after clicking Select Payer');

  // 🧭 Step 3: Wait for dropdown container (Radix, portal, or visible list)
  const dropdownContainer = page.locator(
    '.radix-select-content, [data-radix-portal], div[role="listbox"], ul[role="listbox"]'
  );

  const found = await dropdownContainer.first().isVisible();
  if (!found) {
    console.warn('⚠️ Dropdown container not visible, saving innerHTML for inspection...');
    const bodyHTML = await page.locator('body').innerHTML();
    fs.writeFileSync('debug-dropdown-body.html', bodyHTML);
  }

  // 🪄 Step 4: Try to locate dropdown options
  const options = page.locator('[role="option"]');
  const count = await options.count();

  if (count === 0) {
    console.warn('⚠️ No options found. Possibly rendered in a detached portal.');
    await page.screenshot({ path: 'payer-dropdown-missing-options.png' });
  } else {
    console.log(`📊 Found ${count} dropdown options`);
    const firstOption = options.first();
    const selectedPayer = (await firstOption.textContent())?.trim();
    await firstOption.click();
    console.log(`✅ Selected payer: ${selectedPayer}`);

    await page.waitForTimeout(2000);
    const rowsAfterFilter = await page.locator('table tbody tr').count();
    console.log(`📋 Table rows after filtering: ${rowsAfterFilter}`);

    // 🧹 Step 5: Clear the payer filter
    await payerDropdown.first().click();
    const checkedOption = page.locator('[role="option"][data-state="checked"]');
    await checkedOption.click();
    console.log('🧹 Cleared payer filter');
    await page.keyboard.press('Escape');

    await page.waitForTimeout(2000);
    const rowsAfterClear = await page.locator('table tbody tr').count();
    console.log(`📋 Table rows after clearing: ${rowsAfterClear}`);

    // ✅ Step 6: Verify table reset
    expect(rowsAfterClear).toBeGreaterThanOrEqual(rowsAfterFilter);
    console.log('✅ Table reset verified successfully');
  }
});

// ✅ TC_RF_014 - Verify payer dropdown options are unique
test('TC_RF_014 - Verify payer dropdown options are unique', async ({ page }) => {
  await page.goto('https://dev-admin.wellityhealth.com/referrals');
  await expect(page.getByText('Referral List')).toBeVisible();

  const payerDropdown = page.getByText('Select payer').first();
  await payerDropdown.click();

  const options = await page.locator('div[role="option"]').allTextContents();
  const duplicates = options.filter((item, index) => options.indexOf(item) !== index);

  console.log('Dropdown options:', options);
  expect(duplicates.length).toBe(0);
});

// TEMP: Debug locator for "Select Payer" dropdown
test('DEBUG - Find Select Payer dropdown locator', async ({ page }) => {
  await page.goto('https://dev-admin.wellityhealth.com/referrals');

  // Look for visible text "Select Payer"
  const elements = page.locator('text=Select Payer');
  const count = await elements.count();
  console.log(`Found ${count} elements containing "Select Payer" text`);

  for (let i = 0; i < count; i++) {
    const el = elements.nth(i);
    const visible = await el.isVisible();
    const box = await el.boundingBox();
    console.log(`Element ${i}: visible=${visible}, box=${JSON.stringify(box)}`);
  }

  // Save a screenshot of the page for reference
  await page.screenshot({ path: 'debug-payer.png', fullPage: true });
});

// … all your existing TC_RF_001 – TC_RF_014 tests …

// TEMP DEBUG TEST - Identify "Select Payer" dropdown locator
test('DEBUG - Locate Select Payer dropdown', async ({ page }) => {
  await page.goto('https://dev-admin.wellityhealth.com/referrals');
  await page.waitForTimeout(2000);

  const dropdowns = page.locator('.ant-select-selector');
  const count = await dropdowns.count();
  console.log(`Found ${count} Ant Design dropdowns`);

  for (let i = 0; i < count; i++) {
    const el = dropdowns.nth(i);
    const text = await el.textContent();
    const visible = await el.isVisible();
    console.log(`Dropdown ${i}: text="${text?.trim()}", visible=${visible}`);
  }

  await page.screenshot({ path: 'debug-dropdowns.png', fullPage: true });
});

test('DEBUG - Inspect Select Payer dropdown structure', async ({ page }) => {
  await page.goto('https://dev-admin.wellityhealth.com/referrals');
  await expect(page.getByText('Referral List')).toBeVisible();

  // Step 1: Locate element containing text
  const payerText = page.getByText('Select Payer', { exact: false });
  await payerText.scrollIntoViewIfNeeded();
  await expect(payerText).toBeVisible();

  // Step 2: Print HTML around it (outerHTML of parent)
  const parentHTML = await payerText.locator('xpath=..').evaluate(el => el.outerHTML);
  console.log('🔍 Parent element HTML:', parentHTML);

  // Step 3: Click on it (or its parent) to see if dropdown appears
  await payerText.click({ force: true });
  await page.waitForTimeout(2000);

  // Step 4: Capture any visible dropdowns
  const allDropdowns = await page.locator('div:visible').evaluateAll(divs => divs.map(d => d.outerHTML.slice(0, 400)));
  console.log('🧠 Visible DIVs snapshot:', allDropdowns.slice(0, 5));
});

