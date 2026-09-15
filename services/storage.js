const fs = require('fs');
const path = require('path');

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

// Initialize DB if not present
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify(defaultDB, null, 2), 'utf-8');
}

function getDatabase() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading database file:', err);
    return defaultDB;
  }
}

function saveDatabase(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error writing database file:', err);
    return false;
  }
}

function getConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Error reading config:', e);
  }
  return {};
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Error saving config:', e);
    return false;
  }
}

function getSessionState() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Error reading session file:', e);
  }
  return null;
}

function saveSessionState(sessionData) {
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Error writing session file:', e);
    return false;
  }
}

function deleteSessionState() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      fs.unlinkSync(SESSION_FILE);
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
    type, // 'info' | 'success' | 'warn' | 'error' | 'post' | 'join'
    message,
    details
  };
  
  if (!db.logs) db.logs = [];
  db.logs.unshift(logItem);
  // Keep last 500 logs to prevent unbounded growth
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
  DATA_DIR,
  SESSION_FILE
};
