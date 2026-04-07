/**
 * Role-Based Access Control (RBAC) middleware
 * Provides role-based access control for routes
 */

/**
 * Check if user has required role(s)
 */
function hasRole(user, requiredRoles) {
  if (!user) return false;
  const userRole = user.role || user.roles?.[0] || 'staff';
  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
  return roles.includes(userRole);
}

/**
 * Check if user has required permission(s)
 */
function hasPermission(user, requiredPermissions) {
  if (!user) return false;
  const userPermissions = user.permissions || [];
  const permissions = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
  return permissions.some(perm => userPermissions.includes(perm));
}

/**
 * Middleware to require specific role(s)
 */
function requireRole(...roles) {
  return (req, res, next) => {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!hasRole(user, roles)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: roles,
        current: user.role || 'staff'
      });
    }

    next();
  };
}

/**
 * Middleware to require admin role
 */
function requireAdmin(req, res, next) {
  return requireRole('admin', 'super_admin')(req, res, next);
}

/**
 * Middleware to require staff or admin role
 */
function requireStaffOrAdmin(req, res, next) {
  return requireRole('admin', 'staff')(req, res, next);
}

/**
 * Middleware to require specific permission(s)
 */
function requirePermission(...permissions) {
  return (req, res, next) => {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!hasPermission(user, permissions)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: permissions,
        current: user.permissions || []
      });
    }

    next();
  };
}

/**
 * Middleware factory for custom role checks
 */
function requireRoleOrPermission(roles, permissions) {
  return (req, res, next) => {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const hasRequiredRole = roles ? hasRole(user, roles) : false;
    const hasRequiredPermission = permissions ? hasPermission(user, permissions) : false;

    if (!hasRequiredRole && !hasRequiredPermission) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: { roles, permissions },
        current: {
          role: user.role || 'staff',
          permissions: user.permissions || []
        }
      });
    }

    next();
  };
}

module.exports = {
  hasRole,
  hasPermission,
  requireRole,
  requireAdmin,
  requireStaffOrAdmin,
  requirePermission,
  requireRoleOrPermission,
};
