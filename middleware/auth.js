const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');

/**
 * Authentication middleware
 * Verifies JWT token from Authorization header or cookie
 */
const requireAuth = (req, res, next) => {
  const jwtSecret = process.env.JWT_SECRET || global.JWT_SECRET;
  
  if (!jwtSecret) {
    logger.error('JWT_SECRET is missing');
    return res.status(500).json({ error: 'Server misconfiguration: missing JWT_SECRET' });
  }

  const tokenFromCookie = req.cookies?.token;
  const tokenFromHeader = req.header("Authorization")?.split(" ")[1];
  const token = tokenFromCookie || tokenFromHeader;

  if (!token) {
    return res.status(401).json({ msg: "No token, authorization denied" });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded.user || decoded;
    
    // Check subdomain access permissions
    const hostname = req.get('host') || req.hostname;
    const userEmail = req.user?.email?.toLowerCase() || '';
    
    // Extract subdomain
    let subdomain = 'production';
    if (hostname) {
      const parts = hostname.split('.');
      if (parts.length >= 3 && parts[0] !== 'www' && parts[0] !== 'join') {
        subdomain = parts[0];
      } else if (parts[0] === 'join' || parts.length === 2) {
        subdomain = 'production';
      }
    }

    // Check for location-specific email restrictions
    const emailParts = userEmail.split('@');
    const emailLocal = emailParts[0]?.toLowerCase() || '';
    const emailDomain = emailParts[1]?.toLowerCase() || '';

    // Eastside users restricted to eastside subdomain
    if ((emailLocal.includes('eastside') || emailDomain.includes('eastside')) && subdomain !== 'eastside' && subdomain !== 'production') {
      return res.status(403).json({ msg: 'Access denied. This account is restricted to eastside.acmeops.com' });
    }

    // Westside users restricted to westside subdomain
    if ((emailLocal.includes('westside') || emailDomain.includes('westside')) && subdomain !== 'westside' && subdomain !== 'production') {
      return res.status(403).json({ msg: 'Access denied. This account is restricted to westside.acmeops.com' });
    }

    // Set branch_id based on subdomain
    if (subdomain === 'eastside') {
      req.user.branch_id = 'eastside';
    } else if (subdomain === 'westside') {
      req.user.branch_id = 'westside';
    } else {
      req.user.branch_id = 'main';
    }

    // Refresh token if from cookie and expiring soon
    const nowSec = Math.floor(Date.now() / 1000);
    const exp = decoded.exp || 0;
    const secondsLeft = exp - nowSec;

    if (tokenFromCookie && secondsLeft > 0 && secondsLeft < 24 * 60 * 60) {
      const fresh = jwt.sign({ user: req.user }, jwtSecret, { expiresIn: "7d" });
      res.cookie("token", fresh, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }

    next();
  } catch (error) {
    logger.error({ err: error }, 'Auth error:');
    return res.status(401).json({ msg: "Token invalid" });
  }
};

module.exports = { requireAuth };

