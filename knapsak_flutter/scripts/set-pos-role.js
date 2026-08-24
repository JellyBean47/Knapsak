/**
 * Bootstrap (or revoke) a POS custom claim (`posRole`).
 *
 * Usage:
 *   node set-pos-role.js owner@example.com owner
 *   node set-pos-role.js cashier@example.com cashier
 *   node set-pos-role.js user@example.com --revoke
 *
 * Roles: owner | manager | cashier | accountant
 * Requires scripts/service-account.json
 * User must sign out/in after grant so the ID token refreshes.
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const ROLES = new Set(['owner', 'manager', 'cashier', 'accountant']);

initializeApp({
  credential: cert(require('./service-account.json')),
});

async function main() {
  const email = process.argv[2];
  const revoke = process.argv.includes('--revoke');
  const roleArg = process.argv[3];

  if (!email || !email.includes('@')) {
    console.error(
      'Usage: node set-pos-role.js <email> <owner|manager|cashier|accountant>\n'
        + '       node set-pos-role.js <email> --revoke',
    );
    process.exit(1);
  }

  if (!revoke && !ROLES.has(roleArg)) {
    console.error('Role must be owner | manager | cashier | accountant');
    process.exit(1);
  }

  const auth = getAuth();
  const user = await auth.getUserByEmail(email.trim());
  const claims = { ...(user.customClaims || {}) };

  if (revoke) {
    delete claims.posRole;
  } else {
    claims.posRole = roleArg;
  }

  await auth.setCustomUserClaims(user.uid, claims);

  console.log(
    revoke
      ? `Revoked posRole for ${user.email} (${user.uid})`
      : `Granted posRole=${roleArg} to ${user.email} (${user.uid})`,
  );
  console.log('Have them sign out and back in so the ID token refreshes.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
