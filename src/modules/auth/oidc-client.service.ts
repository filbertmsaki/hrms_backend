import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  decryptField,
  isEncryptedField,
} from '../../common/crypto/field-encryption';
import type { OidcProvider } from './entities/oidc.entity';
import type { OidcCallbackDto } from './dtos/oidc.dto';

@Injectable()
export class OidcClientService {
  constructor(private readonly config: ConfigService) {}

  get redirectUri() {
    return new URL(
      '/auth/sso/callback',
      this.config.getOrThrow<string>('APP_FRONTEND_URL'),
    ).href;
  }

  checkIssuer(value: string) {
    const allowed = (this.config.get<string>('OIDC_ALLOWED_ISSUERS') ?? '')
      .split(',')
      .map((s) => s.trim());
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException('Enter the registered HTTPS issuer URL.');
    }
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !allowed.includes(value)
    ) {
      throw new BadRequestException(
        'The issuer must match an HTTPS issuer approved for this installation.',
      );
    }
    return url;
  }

  private async connect(p: OidcProvider) {
    const redirect = new URL(this.redirectUri);
    if (
      redirect.protocol !== 'https:' &&
      !(
        redirect.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(redirect.hostname)
      )
    ) {
      throw new BadRequestException(
        'Configure an HTTPS public frontend URL for SSO.',
      );
    }
    const issuer = this.checkIssuer(p.issuer);
    const allowed = new Set([
      issuer.origin,
      ...(this.config.get<string>('OIDC_ENDPOINT_ORIGINS') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ]);
    const checkEndpoint = (value: string) => {
      const url = new URL(value);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        !allowed.has(url.origin)
      ) {
        throw new BadRequestException(
          'The provider advertised an unapproved endpoint.',
        );
      }
    };
    if (!isEncryptedField(p.secret_ciphertext))
      throw new ServiceUnavailableException(
        'Provider credentials are unavailable.',
      );
    const oidc = await import('openid-client');
    const configuration = await oidc.discovery(
      issuer,
      p.client_id,
      decryptField(p.secret_ciphertext, 'oidc:' + p.company_id),
      undefined,
      {
        timeout: 8,
        execute: [oidc.enableNonRepudiationChecks],
        [oidc.customFetch]: (url, options) => {
          checkEndpoint(url.toString());
          const body =
            options.body instanceof Uint8Array
              ? new Uint8Array(options.body).buffer
              : options.body;
          return fetch(url, { ...options, body, redirect: 'error' });
        },
      },
    );
    const metadata = configuration.serverMetadata();
    if (
      metadata.issuer !== p.issuer ||
      !metadata.authorization_endpoint ||
      !metadata.token_endpoint ||
      !metadata.jwks_uri
    ) {
      throw new BadRequestException(
        'Incomplete or mismatched identity-provider metadata.',
      );
    }
    [
      metadata.authorization_endpoint,
      metadata.token_endpoint,
      metadata.jwks_uri,
    ].forEach(checkEndpoint);
    return { oidc, configuration };
  }

  async authorize(p: OidcProvider, purpose: string) {
    const { oidc, configuration } = await this.connect(p);
    const verifier = oidc.randomPKCECodeVerifier();
    const nonce = oidc.randomNonce();
    const state = oidc.randomState();
    const url = oidc.buildAuthorizationUrl(configuration, {
      redirect_uri: this.redirectUri,
      scope: 'openid',
      response_type: 'code',
      state,
      nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
      ...(purpose === 'login' ? {} : { prompt: 'login' }),
    });
    return { url: url.href, state, nonce, verifier };
  }

  async identify(
    p: OidcProvider,
    input: OidcCallbackDto,
    request: { nonce: string; verifier: string },
  ) {
    const { oidc, configuration } = await this.connect(p);
    const callback = new URL(this.redirectUri);
    callback.searchParams.set('code', input.code);
    callback.searchParams.set('state', input.state);
    if (input.iss !== undefined) callback.searchParams.set('iss', input.iss);
    const tokens = await oidc.authorizationCodeGrant(configuration, callback, {
      expectedState: input.state,
      expectedNonce: request.nonce,
      pkceCodeVerifier: request.verifier,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    if (!claims?.sub || claims.iss !== p.issuer)
      throw new BadRequestException('Invalid identity assertion.');
    return claims.sub;
  }
}
