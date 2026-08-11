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
      appName: 'Alliance HRMS',
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
    expect(options.html).toContain('TEST EMAIL - RECIPIENT OVERRIDE ENABLED');
    expect(options.html).toContain('Alliance HRMS');
    expect(options.html).toContain('Original To');
    expect(options.html).toContain('Original Cc');
    expect(options.html).toContain('Original Bcc');
    expect(options.html).toContain('Environment');
    expect(options.html).toContain('Source Module');
    expect(options.text).toContain('Original Bcc: hidden.one@example.com');
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

  it('overrides all recipients in production', () => {
    const options = createOptions();
    const config = resolveMailRecipientSafetyConfig({
      appEnv: 'production',
      nodeEnv: 'production',
      overrideEnabled: true,
      testTo: 'safe-production@example.com',
      testCc: 'prod-cc@example.com',
      testBcc: 'prod-bcc@example.com',
    });

    const result = applyMailRecipientSafety(options, config);

    expect(result.recipientsOverridden).toBe(true);
    expect(options.to).toEqual(['safe-production@example.com']);
    expect(options.cc).toEqual(['prod-cc@example.com']);
    expect(options.bcc).toEqual(['prod-bcc@example.com']);
    expect(options.to).not.toContain('real.user@example.com');
    expect(options.cc).not.toContain('cc.one@example.com');
    expect(options.bcc).not.toContain('hidden.one@example.com');
  });

  it('treats live as production and still overrides recipients', () => {
    const options = createOptions();
    const config = resolveMailRecipientSafetyConfig({
      appEnv: 'live',
      nodeEnv: 'production',
      overrideEnabled: true,
      testTo: 'safe-live@example.com',
    });

    const result = applyMailRecipientSafety(options, config);

    expect(result.environment).toBe('production');
    expect(result.recipientsOverridden).toBe(true);
    expect(options.to).toEqual(['safe-live@example.com']);
  });

  it('supports multiple configured test recipients, ignores empty values, and removes duplicates case-insensitively', () => {
    const options = createOptions();
    const config = resolveMailRecipientSafetyConfig({
      appEnv: 'development',
      nodeEnv: 'development',
      overrideEnabled: true,
      testTo: 'one@example.com; two@example.com ; ONE@example.com ;;',
      testCc: 'cc.one@example.com, CC.one@example.com, cc.two@example.com',
      testBcc: 'bcc.one@example.com\nbcc.two@example.com\n',
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
      testTo: '',
    });

    expect(() => applyMailRecipientSafety(options, config)).toThrow(
      'MAIL_TEST_TO is not configured',
    );
  });

  it('blocks unsafe delivery when override is enabled with invalid configured recipients', () => {
    const options = createOptions();
    const config = resolveMailRecipientSafetyConfig({
      appEnv: 'development',
      nodeEnv: 'development',
      overrideEnabled: true,
      testTo: 'valid@example.com',
      testCc: 'not-an-email',
    });

    expect(() => applyMailRecipientSafety(options, config)).toThrow(
      UnsafeEmailDeliveryError,
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

  it('preserves original recipients when override is disabled in production', () => {
    const options = createOptions();
    const config = resolveMailRecipientSafetyConfig({
      appEnv: 'production',
      nodeEnv: 'production',
      overrideEnabled: false,
      testTo: 'unused@example.com',
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

  it('preserves original recipients when override is disabled in development', () => {
    const options = createOptions();
    const config = resolveMailRecipientSafetyConfig({
      appEnv: 'development',
      nodeEnv: 'development',
      overrideEnabled: false,
      testTo: 'unused@example.com',
    });

    const result = applyMailRecipientSafety(options, config);

    expect(result.recipientsOverridden).toBe(false);
    expect(options.to).toEqual([
      'real.user@example.com',
      'second.user@example.com',
    ]);
  });

  it('supports hiding original recipients from the test email body', () => {
    const options = createOptions();
    const config = resolveMailRecipientSafetyConfig({
      appEnv: 'production',
      nodeEnv: 'production',
      appName: 'Alliance HRMS',
      overrideEnabled: true,
      testTo: 'hidden-audit@example.com',
      addOriginalRecipientsToBody: false,
    });

    applyMailRecipientSafety(options, config);

    expect(options.html).toContain('TEST EMAIL - RECIPIENT OVERRIDE ENABLED');
    expect(options.html).toContain('Alliance HRMS');
    expect(options.html).not.toContain('Original To');
    expect(options.text).not.toContain('Original To:');
  });

  it('applies a configured subject prefix without changing attachments', () => {
    const options = createOptions();
    const config = resolveMailRecipientSafetyConfig({
      appEnv: 'production',
      nodeEnv: 'production',
      overrideEnabled: true,
      testTo: 'subject-safe@example.com',
      subjectPrefix: '[TEST]',
    });

    applyMailRecipientSafety(options, config);

    expect(options.subject).toBe('[TEST] Test Subject');
    expect(options.attachments).toHaveLength(1);
  });
});
