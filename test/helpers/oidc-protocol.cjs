// Run in Node's native ESM loader, as in the compiled backend. Only the
// provider's HTTPS transport is simulated; discovery, PKCE and JOSE use the real client.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { ConfigService } = require('@nestjs/config');
const {
  OidcClientService,
} = require('../../src/modules/auth/oidc-client.service');
const {
  encryptField,
  installFieldEncryptionKeys,
} = require('../../src/common/crypto/field-encryption');

async function main() {
  const issuer = 'https://idp.example.test/tenant';
  const clientId = 'hrms-uat-spec';
  installFieldEncryptionKeys({ fixture: crypto.randomBytes(32) }, 'fixture');
  const provider = {
    issuer,
    company_id: 1,
    client_id: clientId,
    secret_ciphertext: encryptField('fixture-secret', 'oidc:1'),
  };
  const gateway = new OidcClientService(
    new ConfigService({
      OIDC_ALLOWED_ISSUERS: issuer,
      APP_FRONTEND_URL: 'https://hrms.example.test',
    }),
  );
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  let claimOverride = {},
    challenge = '',
    nonce = '',
    discovered = false,
    signed = false;
  globalThis.fetch = async (input, options) => {
    const url = new URL(input);
    assert.equal(url.origin, new URL(issuer).origin);
    assert.equal(options.redirect, 'error');
    const json = (obj) =>
      new Response(JSON.stringify(obj), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    if (url.pathname.endsWith('/.well-known/openid-configuration')) {
      discovered = true;
      return json({
        issuer,
        authorization_endpoint: issuer + '/authorize',
        token_endpoint: issuer + '/token',
        jwks_uri: issuer + '/jwks',
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['client_secret_post'],
      });
    }
    if (url.pathname.endsWith('/jwks'))
      return json({
        keys: [
          {
            ...publicKey.export({ format: 'jwk' }),
            kid: 'test',
            use: 'sig',
            alg: 'RS256',
          },
        ],
      });
    assert.equal(url.href, issuer + '/token');
    const data = new URLSearchParams(options.body);
    assert.equal(data.get('client_id'), clientId);
    assert.equal(data.get('redirect_uri'), gateway.redirectUri);
    assert.equal(
      crypto
        .createHash('sha256')
        .update(data.get('code_verifier'))
        .digest('base64url'),
      challenge,
    );
    const now = Math.floor(Date.now() / 1000);
    const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const jwt =
      enc({ alg: 'RS256', kid: 'test' }) +
      '.' +
      enc({
        iss: issuer,
        sub: 'company-user',
        aud: clientId,
        iat: now,
        exp: now + 300,
        nonce,
        ...claimOverride,
      });
    const signature = crypto
      .sign('sha256', Buffer.from(jwt), privateKey)
      .toString('base64url');
    signed = true;
    return json({
      token_type: 'Bearer',
      access_token: 'fixture-access',
      id_token: jwt + '.' + signature,
    });
  };
  const flow = await gateway.authorize(provider, 'login');
  const auth = new URL(flow.url);
  assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(auth.searchParams.get('state'), flow.state);
  assert.equal(auth.searchParams.get('scope'), 'openid');
  nonce = auth.searchParams.get('nonce');
  challenge = auth.searchParams.get('code_challenge');
  const callback = { code: 'test-code', state: flow.state };
  assert.equal(
    await gateway.identify(provider, callback, flow),
    'company-user',
  );
  assert.ok(discovered && signed);
  for (const change of [
    { nonce: 'another-request' },
    { aud: 'another-registration' },
    { iss: 'https://other.example.test' },
    { exp: 1 },
  ]) {
    claimOverride = change;
    await assert.rejects(() => gateway.identify(provider, callback, flow));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
