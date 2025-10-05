const { createServiceLogger } = require("../utils/logger");

const logger = createServiceLogger("admin-auth");

// Session store - tracks active sessions with metadata
const activeSessions = new Map();
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Create a new admin session
 */
function createAdminSession(sessionId, metadata = {}) {
  activeSessions.set(sessionId, {
    createdAt: Date.now(),
    lastActivity: Date.now(),
    ip: metadata.ip,
    userAgent: metadata.userAgent
  });
}

/**
 * Validate and update session
 */
function validateSession(sessionId, req) {
  const session = activeSessions.get(sessionId);

  if (!session) {
    return false;
  }

  // Check if session expired
  const now = Date.now();
  if (now - session.lastActivity > SESSION_TIMEOUT) {
    activeSessions.delete(sessionId);
    return false;
  }

  // Update last activity
  session.lastActivity = now;

  // Normalize IPs for comparison (::1 and ::ffff:127.0.0.1 are both localhost)
  const normalizeIp = (ip) => {
    if (ip === '::1' || ip === '::ffff:127.0.0.1' || ip === '127.0.0.1') {
      return 'localhost';
    }
    return ip;
  };

  const currentIp = normalizeIp(req.ip || req.connection.remoteAddress);
  const sessionIp = normalizeIp(session.ip);

  if (sessionIp && sessionIp !== currentIp) {
    // Only log for non-localhost IPs (production security)
    if (sessionIp !== 'localhost' && currentIp !== 'localhost') {
      logger.warn(`[ADMIN-AUTH] Session IP mismatch. Original: ${session.ip}, Current: ${req.ip || req.connection.remoteAddress}`);
    }
    // Uncomment to enforce IP validation in production:
    // activeSessions.delete(sessionId);
    // return false;
  }

  return true;
}

/**
 * Admin authentication middleware
 * Checks if admin session is valid
 */
const isAdmin = (req, res, next) => {
  const adminSession = req.cookies.adminSession;

  if (!adminSession) {
    logger.warn("Admin access attempt without session");
    return res.status(401).redirect('/admin/login');
  }

  const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET;

  if (!ADMIN_SESSION_SECRET) {
    logger.error("ADMIN_SESSION_SECRET not configured");
    return res.status(500).json({ success: false, message: "Server configuration error" });
  }

  if (adminSession !== ADMIN_SESSION_SECRET) {
    logger.warn("Admin access attempt with invalid session");
    return res.status(401).redirect('/admin/login');
  }

  // Validate session
  if (!validateSession(adminSession, req)) {
    logger.warn("Admin session expired or invalid");
    res.clearCookie('adminSession');
    return res.status(401).redirect('/admin/login');
  }

  // Don't log every access, only login/logout
  next();
};

module.exports = isAdmin;
module.exports.createAdminSession = createAdminSession;
module.exports.activeSessions = activeSessions;
