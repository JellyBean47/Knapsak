/**
 * Bootstrap (or revoke) a supplier custom claim.
 *
 * Usage:
 *   node set-supplier-role.js supplier@example.com
 *   node set-supplier-role.js supplier@example.com --revoke
 *
 * Requires scripts/service-account.json (same as seed.js).
 * After granting, the user must sign out and back in (or refresh the ID token)
 * before Firestore rules see the new claim.
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

initializeApp({
  credential: cert(require('./service-account.json')),
});

async function main() {
  const email = process.argv[2];
  const revoke = process.argv.includes('--revoke');

  if (!email || !email.includes('@')) {
    console.error('Usage: node set-supplier-role.js <email> [--revoke]');
    process.exit(1);
  }

  const auth = getAuth();
  const user = await auth.getUserByEmail(email.trim());
  const claims = { ...(user.customClaims || {}) };

  if (revoke) {
    delete claims.role;
  } else {
    claims.role = 'supplier';
  }

  await auth.setCustomUserClaims(user.uid, claims);

  console.log(
    revoke
      ? `Revoked supplier role for ${user.email} (${user.uid})`
      : `Granted supplier role to ${user.email} (${user.uid})`,
  );
  console.log('Have them sign out and back in so the ID token refreshes.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
