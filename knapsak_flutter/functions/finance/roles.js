const POS_ROLES = new Set(['owner', 'manager', 'cashier', 'accountant']);

function getPosRole(auth) {
  const role = auth?.token?.posRole;
  return POS_ROLES.has(role) ? role : null;
}

function requirePosRole(auth, allowed) {
  const role = getPosRole(auth);
  if (!role || !allowed.includes(role)) {
    const err = new Error('POS permission denied.');
    err.code = 'permission-denied';
    throw err;
  }
  return role;
}

module.exports = { POS_ROLES, getPosRole, requirePosRole };
