import { Request, Response } from 'express';
import { IEmailService } from '../services/EmailService.interface';
import { EmailMessage, EmailSweepOptions } from '../types';

export class EmailController {
  constructor(private readonly emailService: IEmailService) {}

  async performSweep(req: Request, res: Response) {
    try {
      const options: EmailSweepOptions = {
        maxResults: req.body.maxResults || 10,
        labelIds: req.body.labelIds || ['INBOX'],
        includeSpamTrash: !!req.body.includeSpamTrash,
        includeRead: !!req.body.includeRead,
        minImportance: req.body.minImportance || 'medium',
      };

      const result = await this.emailService.performSweep(options);
      
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error performing email sweep:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to perform email sweep',
        details: errorMessage,
      });
    }
  }

  async getEmailSummary(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Email ID is required',
        });
      }

      const email = await this.emailService.getMessage(id);
      const summary = await this.emailService.summarizeEmail(email);
      
      res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error getting email summary:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get email summary',
        details: errorMessage,
      });
    }
  }

  async draftResponse(req: Request, res: Response) {
    try {
      const { emailId, additionalContext } = req.body;
      
      if (!emailId) {
        return res.status(400).json({
          success: false,
          error: 'emailId is required',
        });
      }

      const email = await this.emailService.getMessage(emailId);
      
      // In a real implementation, you would fetch conversation history here
      const conversationHistory: EmailMessage[] = [];
      
      const draft = await this.emailService.draftResponse(email, {
        conversationHistory,
        additionalContext,
      });
      
      res.status(200).json({
        success: true,
        data: draft,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error drafting response:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to draft response',
        details: errorMessage,
      });
    }
  }

  async sendEmail(req: Request, res: Response) {
    try {
      const { to, subject, body, threadId, inReplyTo, references } = req.body;
      
      if (!to || !subject || !body) {
        return res.status(400).json({
          success: false,
          error: 'to, subject, and body are required',
        });
      }

      const result = await this.emailService.sendEmail({
        to: Array.isArray(to) ? to : [to],
        subject,
        body,
        threadId,
        inReplyTo,
        references,
      });
      
      res.status(200).json({
        success: result.success,
        messageId: result.messageId,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error sending email:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send email',
        details: errorMessage,
      });
    }
  }

  // Get email by ID
  async getEmail(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Email ID is required',
        });
      }

      const email = await this.emailService.getMessage(id);
      
      res.status(200).json({
        success: true,
        data: email,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error getting email:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get email',
        details: errorMessage,
      });
    }
  }
}
