const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { getSessionState, saveSessionState, logEvent, getConfig, DATA_DIR, SESSION_FILE } = require('./storage');

const USER_DATA_DIR = path.join(DATA_DIR, 'user_browser_data');

// Ensure browser data directory exists
if (!fs.existsSync(USER_DATA_DIR)) {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}

let activeBrowserContext = null;
let activeBrowser = null;

/**
 * Creates or gets an authenticated Playwright browser context
 */
async function getAuthenticatedContext(options = {}) {
  const config = getConfig();
  const headless = options.headless !== undefined ? options.headless : (config.headless !== false);

  const launchArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process'
  ];

  try {
    // Check if we have persistent storage or saved session state
    const savedState = getSessionState();
    
    // Launch persistent context
    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: headless,
      args: launchArgs,
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York'
    });

    // If we have exported session cookies/state that aren't yet in persistent context, add them
    if (savedState && savedState.cookies && savedState.cookies.length > 0) {
      await context.addCookies(savedState.cookies);
    }

    return context;
  } catch (error) {
    logEvent('error', `Failed to launch browser context: ${error.message}`);
    throw error;
  }
}

/**
 * Checks if the current session is logged into Facebook
 */
async function checkLoginStatus() {
  let context = null;
  let page = null;
  try {
    context = await getAuthenticatedContext({ headless: true });
    page = await context.newPage();
    
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    const hasLoginForm = await page.$('input[name="email"], input[id="email"], button[name="login"]');
    const hasUserFeed = await page.$('div[role="feed"], div[role="main"], a[aria-label="Facebook"], div[aria-label="Account controls and settings"]');

    const isLoggedIn = !hasLoginForm && (hasUserFeed !== null || !currentUrl.includes('login'));

    if (isLoggedIn) {
      // Save updated state
      const state = await context.storageState();
      saveSessionState(state);
      logEvent('info', 'Facebook login verified successfully.');
    } else {
      logEvent('warn', 'Not logged into Facebook or session expired.');
    }

    await context.close();
    return { isLoggedIn, url: currentUrl };
  } catch (error) {
    if (context) await context.close().catch(() => {});
    logEvent('error', `Error checking login status: ${error.message}`);
    return { isLoggedIn: false, error: error.message };
  }
}

/**
 * Launches an interactive browser window for the user to log in manually (Local mode)
 */
async function launchLoginAssistant() {
  try {
    logEvent('info', 'Launching interactive Facebook login assistant...');
    const context = await getAuthenticatedContext({ headless: false });
    const page = await context.newPage();
    
    await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded' });
    
    // Poll for successful login for up to 3 minutes
    const startTime = Date.now();
    const maxWait = 3 * 60 * 1000;
    
    let loggedIn = false;
    while (Date.now() - startTime < maxWait) {
      await page.waitForTimeout(3000);
      const url = page.url();
      const hasFeed = await page.$('div[role="feed"], div[role="main"], a[aria-label="Facebook"], div[aria-label="Account controls and settings"]');
      
      if (hasFeed || (!url.includes('login') && !url.includes('checkpoint') && (url.includes('facebook.com') && url !== 'https://www.facebook.com/'))) {
        loggedIn = true;
        const state = await context.storageState();
        saveSessionState(state);
        logEvent('success', 'Successfully authenticated and saved Facebook session cookies!');
        break;
      }
    }

    // Auto-close after 5s or leave open
    await page.waitForTimeout(3000);
    await context.close();
    return { success: loggedIn, message: loggedIn ? 'Session saved successfully' : 'Login timed out or incomplete' };
  } catch (err) {
    logEvent('error', `Login assistant error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Import cookies from JSON format (Useful for Render/Cloud deployment)
 */
function importSessionCookies(cookiesJsonOrString) {
  try {
    let cookies;
    if (typeof cookiesJsonOrString === 'string') {
      cookies = JSON.parse(cookiesJsonOrString);
    } else {
      cookies = cookiesJsonOrString;
    }

    // Format cookies if they are standard browser cookie export
    const normalizedCookies = (Array.isArray(cookies) ? cookies : (cookies.cookies || [])).map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain || '.facebook.com',
      path: c.path || '/',
      httpOnly: c.httpOnly ?? true,
      secure: c.secure ?? true,
      sameSite: c.sameSite || 'Lax'
    }));

    const sessionData = {
      cookies: normalizedCookies,
      origins: []
    };

    saveSessionState(sessionData);
    logEvent('success', `Imported ${normalizedCookies.length} Facebook session cookies successfully.`);
    return { success: true, count: normalizedCookies.length };
  } catch (err) {
    logEvent('error', `Failed to import cookies: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Human-like natural typing with randomized jitter
 */
async function humanType(page, selectorOrElement, text) {
  const element = typeof selectorOrElement === 'string' ? await page.$(selectorOrElement) : selectorOrElement;
  if (!element) throw new Error('Target typing element not found');

  await element.click();
  await page.waitForTimeout(Math.floor(Math.random() * 300) + 200);

  for (const char of text) {
    await element.type(char, { delay: Math.floor(Math.random() * 80) + 40 });
    // Random pause between sentences / words
    if (char === ' ' && Math.random() > 0.85) {
      await page.waitForTimeout(Math.floor(Math.random() * 250) + 100);
    }
  }
}

/**
 * Random human-like mouse movement and scroll
 */
async function humanSimulateBrowsing(page) {
  try {
    const scrolls = Math.floor(Math.random() * 3) + 2;
    for (let i = 0; i < scrolls; i++) {
      const scrollDistance = Math.floor(Math.random() * 400) + 200;
      await page.evaluate((y) => window.scrollBy({ top: y, behavior: 'smooth' }), scrollDistance);
      await page.waitForTimeout(Math.floor(Math.random() * 1500) + 800);
    }
  } catch (e) {
    // Non-critical
  }
}

module.exports = {
  getAuthenticatedContext,
  checkLoginStatus,
  launchLoginAssistant,
  importSessionCookies,
  humanType,
  humanSimulateBrowsing
};
