const crypto = require('crypto');

const AUTH_SECRET = process.env.ADMIN_SECRET || process.env.SUPABASE_KEY || 'fb-marketer-secure-auth-secret-key';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

/**
 * Creates a signed session token
 */
function createAuthToken(username) {
  const payload = {
    username,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(data).digest('base64url');
  return `${data}.${signature}`;
}

/**
 * Verifies a signed session token
 */
function verifyAuthToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [data, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', AUTH_SECRET).update(data).digest('base64url');

  if (signature !== expectedSignature) return null;

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

/**
 * Express middleware to guard protected API routes
 */
function requireAdminAuth(req, res, next) {
  // Allow public endpoints
  if (
    req.path === '/api/auth/admin-login' ||
    req.path === '/api/auth/admin-status' ||
    !req.path.startsWith('/api/')
  ) {
    return next();
  }

  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers['x-admin-token']) {
    token = req.headers['x-admin-token'];
  }

  const session = verifyAuthToken(token);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized: Admin login required' });
  }

  req.adminUser = session;
  next();
}

module.exports = {
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  createAuthToken,
  verifyAuthToken,
  requireAdminAuth
};
