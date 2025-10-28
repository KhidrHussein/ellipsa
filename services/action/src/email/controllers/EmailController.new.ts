import { Request, Response } from 'express';
import { GmailEmailService } from '../services/GmailEmailService.new';
import { EmailProcessingService } from '../services/EmailProcessingService';
import { EmailMemoryService } from '../services/EmailMemoryService';
import { EmailSweepOptions } from '../types';

export class EmailController {
  constructor(
    private readonly emailService: GmailEmailService,
    private readonly processingService: EmailProcessingService,
    private readonly memoryService: EmailMemoryService
  ) {}

  async getEmail(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Email ID is required',
        });
      }

      const email = await this.emailService.getEmail(id);
      res.status(200).json({
        success: true,
        data: email,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error fetching email:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch email',
        details: errorMessage,
      });
    }
  }

  async performSweep(req: Request, res: Response) {
    try {
      const options: EmailSweepOptions = {
        label: req.body.label,
        unreadOnly: !!req.body.unreadOnly,
        sender: req.body.sender,
        subject: req.body.subject,
        after: req.body.after ? new Date(req.body.after) : undefined,
        limit: req.body.limit || 10,
      };

      const result = await this.emailService.performSweep(options);
      
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
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

      // Get the email first
      const email = await this.emailService.getEmail(id);
      
      // Process the email to generate a summary
      const summary = await this.processingService.processEmail(email);
      
      res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (error) {
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
      const { emailId, context } = req.body;
      
      if (!emailId) {
        return res.status(400).json({
          success: false,
          error: 'Email ID is required',
        });
      }

      // Get the email first
      const email = await this.emailService.getEmail(emailId);
      
      // Generate a draft response
      const draft = await this.emailService.draftResponse(email, context || {});
      
      res.status(200).json({
        success: true,
        data: draft,
      });
    } catch (error) {
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
      const { to, subject, body, threadId, inReplyTo } = req.body;
      
      if (!to || !subject || !body) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: to, subject, and body are required',
        });
      }

      const result = await this.emailService.sendEmail({
        to: Array.isArray(to) ? to : [to],
        subject,
        body,
        threadId,
        inReplyTo,
      });
      
      res.status(200).json({
        success: result.success,
        messageId: result.messageId,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error sending email:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send email',
        details: errorMessage,
      });
    }
  }
}
