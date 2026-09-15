const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { getSessionState, saveSessionState, logEvent, getConfig, DATA_DIR, SESSION_FILE } = require('./storage');

const USER_DATA_DIR = path.join(DATA_DIR, 'user_browser_data');

// Ensure browser data directory exists
if (!fs.existsSync(USER_DATA_DIR)) {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}

// Global browser concurrency lock
let isBrowserLocked = false;
const lockWaitQueue = [];

async function acquireBrowserLock() {
  if (!isBrowserLocked) {
    isBrowserLocked = true;
    return;
  }
  await new Promise(resolve => lockWaitQueue.push(resolve));
  isBrowserLocked = true;
}

function releaseBrowserLock() {
  isBrowserLocked = false;
  if (lockWaitQueue.length > 0) {
    const next = lockWaitQueue.shift();
    next();
  }
}

/**
 * Executes a browser operation under single-instance lock and ensures cleanup
 */
async function withBrowserLock(taskFn) {
  await acquireBrowserLock();
  try {
    return await taskFn();
  } finally {
    releaseBrowserLock();
    if (global.gc) {
      try { global.gc(); } catch (e) {}
    }
  }
}

/**
 * Ultra-low-memory Chromium launch arguments for Render 512MB RAM tier
 */
const LOW_MEMORY_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-software-rasterizer',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-breakpad',
  '--disable-client-side-phishing-detection',
  '--disable-component-update',
  '--disable-default-apps',
  '--disable-domain-reliability',
  '--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process,TranslateUI',
  '--disable-hang-monitor',
  '--disable-ipc-flooding-protection',
  '--disable-popup-blocking',
  '--disable-prompt-on-repost',
  '--disable-renderer-backgrounding',
  '--disable-sync',
  '--disable-translate',
  '--metrics-recording-only',
  '--mute-audio',
  '--no-first-run',
  '--safebrowsing-disable-auto-update',
  '--js-flags=--max-old-space-size=128'
];

/**
 * Blocks images, fonts, media, and trackers to save 60-70% RAM
 */
async function setupLowMemoryRouteBlocking(page) {
  try {
    await page.route('**/*', (route) => {
      const request = route.request();
      const type = request.resourceType();
      const url = request.url().toLowerCase();

      // Block heavy assets
      if (['image', 'media', 'font'].includes(type)) {
        return route.abort();
      }

      // Block heavy third-party trackers & telemetry
      if (
        url.includes('google-analytics.com') ||
        url.includes('doubleclick.net') ||
        url.includes('facebook.com/tr/') ||
        url.includes('connect.facebook.net') ||
        url.includes('/ajax/bz') ||
        url.includes('telemetry')
      ) {
        return route.abort();
      }

      route.continue();
    });
  } catch (e) {
    // Route handler setting error
  }
}

/**
 * Creates an authenticated Playwright browser context tuned for extreme memory efficiency
 */
async function getAuthenticatedContext(options = {}) {
  const config = getConfig();
  const headless = options.headless !== undefined ? options.headless : (config.headless !== false);

  try {
    const savedState = getSessionState();
    
    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: headless,
      args: LOW_MEMORY_ARGS,
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York'
    });

    if (savedState && savedState.cookies && savedState.cookies.length > 0) {
      try {
        const cleanCookies = sanitizeCookies(savedState.cookies);
        if (cleanCookies.length > 0) {
          await context.addCookies(cleanCookies);
        }
      } catch (cookieErr) {
        logEvent('warn', `Warning adding cookies to context: ${cookieErr.message}`);
      }
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
  return withBrowserLock(async () => {
    let context = null;
    let page = null;
    try {
      context = await getAuthenticatedContext({ headless: true });
      page = await context.newPage();
      await setupLowMemoryRouteBlocking(page);
      
      await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(2000);

      const currentUrl = page.url();
      const hasLoginForm = await page.$('input[name="email"], input[id="email"], button[name="login"]');
      const hasUserFeed = await page.$('div[role="feed"], div[role="main"], a[aria-label="Facebook"], div[aria-label="Account controls and settings"]');

      const isLoggedIn = !hasLoginForm && (hasUserFeed !== null || !currentUrl.includes('login'));

      if (isLoggedIn) {
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
  });
}

/**
 * Launches an interactive browser window for manual local login
 */
async function launchLoginAssistant() {
  return withBrowserLock(async () => {
    try {
      logEvent('info', 'Launching interactive Facebook login assistant...');
      const context = await getAuthenticatedContext({ headless: false });
      const page = await context.newPage();
      
      await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded' });
      
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

      await page.waitForTimeout(2000);
      await context.close();
      return { success: loggedIn, message: loggedIn ? 'Session saved successfully' : 'Login timed out or incomplete' };
    } catch (err) {
      logEvent('error', `Login assistant error: ${err.message}`);
      return { success: false, error: err.message };
    }
  });
}

/**
 * Normalizes cookies exported from browser extensions to Playwright's strict schema
 */
function sanitizeCookies(cookiesList) {
  if (!Array.isArray(cookiesList)) return [];

  return cookiesList
    .filter(c => c && typeof c.name === 'string' && typeof c.value === 'string')
    .map(c => {
      let sameSite = 'Lax';
      const rawSameSite = String(c.sameSite || '').toLowerCase();
      if (rawSameSite === 'strict') {
        sameSite = 'Strict';
      } else if (rawSameSite === 'none' || rawSameSite === 'no_restriction') {
        sameSite = 'None';
      } else {
        sameSite = 'Lax';
      }

      const secure = sameSite === 'None' ? true : Boolean(c.secure);

      const cookieObj = {
        name: c.name,
        value: c.value,
        domain: c.domain ? (c.domain.startsWith('.') ? c.domain : `.${c.domain}`) : '.facebook.com',
        path: c.path || '/',
        httpOnly: Boolean(c.httpOnly),
        secure: secure,
        sameSite: sameSite
      };

      if (c.expirationDate && typeof c.expirationDate === 'number') {
        cookieObj.expires = Math.round(c.expirationDate);
      } else if (c.expires && typeof c.expires === 'number') {
        cookieObj.expires = Math.round(c.expires);
      }

      return cookieObj;
    });
}

/**
 * Import cookies from JSON format
 */
function importSessionCookies(cookiesJsonOrString) {
  try {
    let cookies;
    if (typeof cookiesJsonOrString === 'string') {
      cookies = JSON.parse(cookiesJsonOrString);
    } else {
      cookies = cookiesJsonOrString;
    }

    const rawList = Array.isArray(cookies) ? cookies : (cookies.cookies || []);
    const normalizedCookies = sanitizeCookies(rawList);

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
  await page.waitForTimeout(Math.floor(Math.random() * 200) + 150);

  for (const char of text) {
    await element.type(char, { delay: Math.floor(Math.random() * 60) + 30 });
    if (char === ' ' && Math.random() > 0.85) {
      await page.waitForTimeout(Math.floor(Math.random() * 200) + 80);
    }
  }
}

/**
 * Random human-like mouse movement and scroll
 */
async function humanSimulateBrowsing(page) {
  try {
    const scrolls = Math.floor(Math.random() * 2) + 1;
    for (let i = 0; i < scrolls; i++) {
      const scrollDistance = Math.floor(Math.random() * 300) + 150;
      await page.evaluate((y) => window.scrollBy({ top: y, behavior: 'smooth' }), scrollDistance);
      await page.waitForTimeout(Math.floor(Math.random() * 1000) + 500);
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
  setupLowMemoryRouteBlocking,
  withBrowserLock,
  humanType,
  humanSimulateBrowsing
};
