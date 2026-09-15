const fs = require('fs');
const path = require('path');
const { isSupabaseConfigured, fetchSupabaseDoc, saveSupabaseDoc } = require('./supabase');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const CONFIG_FILE = path.join(__dirname, '..', 'config.json');
const SESSION_FILE = path.join(DATA_DIR, 'session.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const defaultDB = {
  niches: [
    {
      id: "niche-hvac-ny",
      name: "HVAC Company New York",
      keyword: "hvac company new york",
      industry: "HVAC & Climate Control",
      location: "New York, NY",
      specificAngle: "Emergency 24/7 heating/cooling call capture and mobile booking page speed",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: "niche-dentist-fl",
      name: "Dental Clinic Florida",
      keyword: "dentist clinic florida",
      industry: "Dental & Healthcare",
      location: "Florida",
      specificAngle: "Online patient appointment booking and modern clean trust-building UI",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: "niche-roofing-tx",
      name: "Roofing Contractors Texas",
      keyword: "roofing contractors texas",
      industry: "Roofing & Construction",
      location: "Texas",
      specificAngle: "Free instant roof estimate calculators and storm-damage lead funnels",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ],
  groups: [],
  postQueue: [],
  postHistory: [],
  logs: []
};

// In-memory cache
let cachedDB = null;
let cachedConfig = null;
let cachedSession = null;

// Initialize DB locally if not present
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify(defaultDB, null, 2), 'utf-8');
}

/**
 * Sync from Supabase on startup if configured
 */
async function syncFromSupabase() {
  if (!isSupabaseConfigured()) return;

  try {
    console.log('[SUPABASE] Checking remote cloud database...');
    const remoteDB = await fetchSupabaseDoc('database');
    if (remoteDB && typeof remoteDB === 'object') {
      cachedDB = remoteDB;
      fs.writeFileSync(DB_FILE, JSON.stringify(remoteDB, null, 2), 'utf-8');
      console.log('[SUPABASE] Synced database successfully from Supabase!');
    }

    const remoteConfig = await fetchSupabaseDoc('config');
    if (remoteConfig && typeof remoteConfig === 'object') {
      cachedConfig = remoteConfig;
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(remoteConfig, null, 2), 'utf-8');
    }

    const remoteSession = await fetchSupabaseDoc('session');
    if (remoteSession && typeof remoteSession === 'object') {
      cachedSession = remoteSession;
      fs.writeFileSync(SESSION_FILE, JSON.stringify(remoteSession, null, 2), 'utf-8');
    }
  } catch (err) {
    console.error('[SUPABASE] Startup sync error:', err.message);
  }
}

// Initial async sync
syncFromSupabase();

function getDatabase() {
  if (cachedDB) return cachedDB;

  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    cachedDB = JSON.parse(raw);
    return cachedDB;
  } catch (err) {
    console.error('Error reading database file:', err);
    return defaultDB;
  }
}

function saveDatabase(data) {
  cachedDB = data;
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    
    // Asynchronously sync to Supabase if configured
    if (isSupabaseConfigured()) {
      saveSupabaseDoc('database', data).catch(err => {
        console.error('[SUPABASE] Background save error:', err.message);
      });
    }

    return true;
  } catch (err) {
    console.error('Error writing database file:', err);
    return false;
  }
}

function getConfig() {
  if (cachedConfig) return cachedConfig;

  try {
    if (fs.existsSync(CONFIG_FILE)) {
      cachedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      return cachedConfig;
    }
  } catch (e) {
    console.error('Error reading config:', e);
  }
  return {};
}

function saveConfig(config) {
  cachedConfig = config;
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    
    if (isSupabaseConfigured()) {
      saveSupabaseDoc('config', config).catch(err => {
        console.error('[SUPABASE] Config save error:', err.message);
      });
    }

    return true;
  } catch (e) {
    console.error('Error saving config:', e);
    return false;
  }
}

function getSessionState() {
  if (cachedSession) return cachedSession;

  try {
    if (fs.existsSync(SESSION_FILE)) {
      cachedSession = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
      return cachedSession;
    }
  } catch (e) {
    console.error('Error reading session file:', e);
  }
  return null;
}

function saveSessionState(sessionData) {
  cachedSession = sessionData;
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData, null, 2), 'utf-8');

    if (isSupabaseConfigured()) {
      saveSupabaseDoc('session', sessionData).catch(err => {
        console.error('[SUPABASE] Session save error:', err.message);
      });
    }

    return true;
  } catch (e) {
    console.error('Error writing session file:', e);
    return false;
  }
}

function deleteSessionState() {
  cachedSession = null;
  try {
    if (fs.existsSync(SESSION_FILE)) {
      fs.unlinkSync(SESSION_FILE);
    }
    if (isSupabaseConfigured()) {
      saveSupabaseDoc('session', null).catch(() => {});
    }
    return true;
  } catch (e) {
    return false;
  }
}

function logEvent(type, message, details = {}) {
  const db = getDatabase();
  const logItem = {
    id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    timestamp: new Date().toISOString(),
    type,
    message,
    details
  };
  
  if (!db.logs) db.logs = [];
  db.logs.unshift(logItem);
  if (db.logs.length > 500) {
    db.logs = db.logs.slice(0, 500);
  }
  saveDatabase(db);
  console.log(`[${type.toUpperCase()}] ${message}`);
  return logItem;
}

module.exports = {
  getDatabase,
  saveDatabase,
  getConfig,
  saveConfig,
  getSessionState,
  saveSessionState,
  deleteSessionState,
  logEvent,
  syncFromSupabase,
  DATA_DIR,
  SESSION_FILE
};
