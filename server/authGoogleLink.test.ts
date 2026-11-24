import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findLinkedGoogleUser,
  googleAccountEmail,
  isVerifiedGoogleProfile,
} from './auth';

test('accepts only explicitly verified Google profiles', () => {
  assert.equal(isVerifiedGoogleProfile({ verified_email: true }), true);
  assert.equal(isVerifiedGoogleProfile({ verified_email: false }), false);
  assert.equal(isVerifiedGoogleProfile({}), false);
});

test('links an account already bound to the Google identity', () => {
  const byGoogleId = { id: 'user_1', googleId: 'g-123', email: 'a@example.com' };
  const byLegacyId = { id: 'google_g-456', email: 'b@example.com' };
  const candidates = [null, byGoogleId, byLegacyId];

  assert.equal(findLinkedGoogleUser(candidates, 'g-123'), byGoogleId);
  assert.equal(findLinkedGoogleUser(candidates, 'g-456'), byLegacyId);
  assert.equal(findLinkedGoogleUser(candidates, 'g-unknown'), null);
});

test('never links an account matched only by email (#64)', () => {
  const preRegistered = {
    id: 'user_attacker',
    googleId: undefined,
    email: 'victim@gmail.com',
  };
  assert.equal(findLinkedGoogleUser([preRegistered], 'g-victim'), null);
});

test('uses a local placeholder email when another account claims the address', () => {
  assert.equal(
    googleAccountEmail('victim@gmail.com', 'google_g-victim', true),
    'google_g-victim@google.local'
  );
});

test('keeps the real email when it is not claimed', () => {
  assert.equal(
    googleAccountEmail('victim@gmail.com', 'google_g-victim', false),
    'victim@gmail.com'
  );
  assert.equal(googleAccountEmail('', 'google_g-victim', false), 'google_g-victim@google.local');
});
