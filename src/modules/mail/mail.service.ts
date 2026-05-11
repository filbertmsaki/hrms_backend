import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Send password reset email with link
   */
  async sendPasswordResetEmail(to: string, name: string, resetLink: string) {
    await this.mailerService.sendMail({
      to,
      subject: 'Reset Your Password',
      template: 'forgot-password',
      context: {
        name: name || 'User',
        resetLink,
        appName: this.configService.get<string>('APP_NAME') ?? 'Your App',
        year: new Date().getFullYear(),
      },
    });
  }

  /**
   * Send success notification after password change
   */
  async sendPasswordChangedSuccessEmail(to: string, name: string) {
    await this.mailerService.sendMail({
      to,
      subject: 'Your Password Has Been Changed',
      template: 'password-changed',
      context: {
        name: name || 'User',
        changedAt: new Date().toLocaleString(),
        appName: this.configService.get<string>('APP_NAME') ?? 'Your App',
        year: new Date().getFullYear(),
      },
    });
  }

  async sendEmailVerification(
    to: string,
    name: string,
    verificationLink: string,
  ): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to,
        subject: 'Verify Your Email Address',
        template: 'verification-email',
        context: {
          name: name || 'User',
          verificationLink,
          appName: this.configService.get<string>('APP_NAME') ?? 'Your App',
          supportEmail:
            this.configService.get<string>('SUPPORT_EMAIL') ??
            'support@yourapp.co.tz',
          year: new Date().getFullYear(),
        },
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Send welcome email after successful email verification
   */
  async sendWelcomeEmailAfterVerification(
    to: string,
    name: string,
  ): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to,
        subject: 'Welcome to Your App!',
        template: 'welcome-after-verification',
        context: {
          name: name || 'User',
          appName: this.configService.get<string>('APP_NAME') ?? 'Your App',
          year: new Date().getFullYear(),
          loginUrl: `${
            this.configService.get<string>('APP_FRONTEND_URL') ??
            'http://localhost:5173'
          }/login`,
          supportEmail:
            this.configService.get<string>('SUPPORT_EMAIL') ??
            'support@yourdomain.com',
        },
      });
    } catch (error) {
      console.error('Failed to send welcome email:', error);
    }
  }
}
