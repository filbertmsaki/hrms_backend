import {
  UnsafeEmailDeliveryError,
  applyMailRecipientSafety,
  resolveMailRecipientSafetyConfig,
  type SafeSendMailOptions,
} from './mail-recipient-safety.util';

describe('mail-recipient-safety.util', () => {
  function createOptions(): SafeSendMailOptions {
    return {
      to: ['real.user@example.com', 'second.user@example.com'],
      cc: 'cc.one@example.com, cc.two@example.com',
      bcc: ['hidden.one@example.com', 'hidden.two@example.com'],
      subject: 'Test Subject',
      html: '<html><body><p>Hello world</p></body></html>',
      text: 'Hello world',
      attachments: [
        {
          filename: 'report.txt',
          content: Buffer.from('report'),
        },
      ],
      mailSafetyContext: {
        sourceModule: 'MailService.sendLeaveApprovedNotification',
      },
    };
  }

  it('overrides all recipients in development and appends debug metadata', () => {
    const options = createOptions();
    const config = resolveMailRecipientSafetyConfig({
      appEnv: 'development',
      nodeEnv: 'development',
      overrideEnabled: true,
      testTo: 'test@example.com',
      testCc: 'developer@example.com',
      testBcc: 'qa@example.com',
    });

    const result = applyMailRecipientSafety(options, config);

    expect(result.recipientsOverridden).toBe(true);
    expect(options.to).toEqual(['test@example.com']);
    expect(options.cc).toEqual(['developer@example.com']);
    expect(options.bcc).toEqual(['qa@example.com']);
    expect(options.html).toContain('Development Mail Override Applied');
    expect(options.html).toContain('Original To');
    expect(options.html).toContain('Original CC');
    expect(options.html).toContain('Original BCC');
    expect(options.html).toContain('Current Environment');
    expect(options.html).toContain('Source Module');
    expect(options.text).toContain('Original BCC: hidden.one@example.com');
  });

  it('overrides all recipients in local', () => {
    const options = createOptions();
    const config = resolveMailRecipientSafetyConfig({
      appEnv: 'local',
      nodeEnv: 'development',
      overrideEnabled: true,
      testTo: 'local-safe@example.com',
    });

    applyMailRecipientSafety(options, config);

    expect(options.to).toEqual(['local-safe@example.com']);
    expect(options.cc).toBeUndefined();
    expect(options.bcc).toBeUndefined();
  });

  it('overrides all recipients in uat', () => {
    const options = createOptions();
    const config = resolveMailRecipientSafetyConfig({
      appEnv: 'uat',
      nodeEnv: 'uat',
      overrideEnabled: true,
      testTo: 'uat-safe@example.com',
      testCc: 'uat-cc@example.com',
    });

    applyMailRecipientSafety(options, config);

    expect(options.to).toEqual(['uat-safe@example.com']);
    expect(options.cc).toEqual(['uat-cc@example.com']);
    expect(options.bcc).toBeUndefined();
  });

  it('preserves original recipients in production', () => {
    const options = createOptions();
    const config = resolveMailRecipientSafetyConfig({
      appEnv: 'production',
      nodeEnv: 'production',
      overrideEnabled: true,
      testTo: 'should-not-be-used@example.com',
    });

    const result = applyMailRecipientSafety(options, config);

    expect(result.recipientsOverridden).toBe(false);
    expect(options.to).toEqual([
      'real.user@example.com',
      'second.user@example.com',
    ]);
    expect(options.cc).toBe('cc.one@example.com, cc.two@example.com');
    expect(options.bcc).toEqual([
      'hidden.one@example.com',
      'hidden.two@example.com',
    ]);
  });

  it('treats live as production and preserves original recipients', () => {
    const options = createOptions();
    const config = resolveMailRecipientSafetyConfig({
      appEnv: 'live',
      nodeEnv: 'production',
      overrideEnabled: true,
      testTo: 'should-not-be-used@example.com',
    });

    const result = applyMailRecipientSafety(options, config);

    expect(result.environment).toBe('production');
    expect(result.recipientsOverridden).toBe(false);
    expect(options.to).toEqual([
      'real.user@example.com',
      'second.user@example.com',
    ]);
  });

  it('supports multiple configured test recipients', () => {
    const options = createOptions();
    const config = resolveMailRecipientSafetyConfig({
      appEnv: 'development',
      nodeEnv: 'development',
      overrideEnabled: true,
      testTo: 'one@example.com;two@example.com',
      testCc: 'cc.one@example.com,cc.two@example.com',
      testBcc: 'bcc.one@example.com\nbcc.two@example.com',
    });

    applyMailRecipientSafety(options, config);

    expect(options.to).toEqual(['one@example.com', 'two@example.com']);
    expect(options.cc).toEqual(['cc.one@example.com', 'cc.two@example.com']);
    expect(options.bcc).toEqual(['bcc.one@example.com', 'bcc.two@example.com']);
  });

  it('blocks unsafe delivery when override is enabled without a valid test to recipient', () => {
    const options = createOptions();
    const config = resolveMailRecipientSafetyConfig({
      appEnv: 'development',
      nodeEnv: 'development',
      overrideEnabled: true,
      testTo: 'not-an-email',
    });

    expect(() => applyMailRecipientSafety(options, config)).toThrow(
      UnsafeEmailDeliveryError,
    );
  });

  it('blocks unsafe delivery in development when override is disabled', () => {
    const options = createOptions();
    const config = resolveMailRecipientSafetyConfig({
      appEnv: 'development',
      nodeEnv: 'development',
      overrideEnabled: false,
      testTo: 'test@example.com',
    });

    expect(() => applyMailRecipientSafety(options, config)).toThrow(
      'Email delivery is blocked in development',
    );
  });

  it('preserves attachments while overriding recipients', () => {
    const options = createOptions();
    const originalAttachments = options.attachments;
    const config = resolveMailRecipientSafetyConfig({
      appEnv: 'development',
      nodeEnv: 'development',
      overrideEnabled: true,
      testTo: 'attachment-safe@example.com',
    });

    applyMailRecipientSafety(options, config);

    expect(options.attachments).toBe(originalAttachments);
    expect(options.attachments).toHaveLength(1);
    const attachment = options.attachments?.[0] as
      | { filename?: string }
      | undefined;
    expect(attachment).toBeDefined();
    expect(attachment?.filename).toBe('report.txt');
  });
});
