import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { MailService } from '../mail/mail.service';

const SUPPORT_ESCALATION_RECIPIENTS = [
  'filbert@alliance.co.tz',
  'inocent@alliance.co.tz',
];

@Injectable()
export class SupportService {
  constructor(private readonly mailService: MailService) {}

  async escalate(
    actor: AuthenticatedUser,
    body: {
      summary?: string;
      transcript?: Array<{ role?: string; content?: string }>;
    },
  ) {
    const summary = body.summary?.trim() ?? '';
    const transcript = (body.transcript ?? [])
      .map((entry) => {
        const content = entry.content?.trim() ?? '';
        if (!content) return '';
        const who = entry.role === 'assistant' ? 'Assistant' : 'User';
        return `${who}: ${content}`;
      })
      .filter(Boolean)
      .join('\n');

    if (!summary && !transcript) {
      throw new BadRequestException('Add a short note or chat first.');
    }

    const ticketId = `IT-${Date.now().toString(36).toUpperCase()}`;
    const requesterName = [actor.email].filter(Boolean).join(' ');

    await this.mailService.sendSupportEscalationEmail({
      to: SUPPORT_ESCALATION_RECIPIENTS,
      ticketId,
      summary,
      transcript,
      requesterEmail: actor.email,
      requesterName,
    });

    return {
      ticketId,
      message:
        'IT support has this chat. Filbert and Innocent will follow up by email.',
    };
  }
}
