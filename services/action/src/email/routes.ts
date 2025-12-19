import { Router } from 'express';
import { EmailController } from './controllers/EmailController.js';
import { IEmailService } from './services/EmailService.interface.js';
import { createDigestRouter } from './routes/digest.routes.js';
import { EmailProcessingService } from './services/EmailProcessingService.js';

export function createEmailRouter(
  emailService: IEmailService,
  processingService: EmailProcessingService
): Router {
  const router = Router();
  const emailController = new EmailController(emailService);

  // Mount digest routes under /digest
  router.use('/digest', createDigestRouter(emailService, processingService));

  // Get pending email drafts awaiting approval
  router.get('/pending', async (req, res) => {
    try {
      // Get drafts from memory service via email service
      const drafts = await (emailService as any).getPendingDrafts?.() || [];

      // Transform drafts to pending action format
      const pendingActions = drafts.map((draft: any) => ({
        id: draft.id,
        type: 'email',
        title: `Email to ${draft.to?.map((t: any) => t.address || t.email || (typeof t === 'string' ? t : 'Unknown')).join(', ') || 'Unknown'}`,
        description: draft.subject || 'No subject',
        preview: draft.text?.substring(0, 150) || draft.html?.substring(0, 150) || '',
        status: 'pending_approval',
        created_at: draft.createdAt || new Date().toISOString(),
        metadata: {
          to: draft.to,
          subject: draft.subject,
          threadId: draft.threadId,
        }
      }));

      res.json({
        success: true,
        data: pendingActions,
        meta: {
          count: pendingActions.length,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error fetching pending emails:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'PENDING_FETCH_FAILED',
          message: 'Failed to fetch pending emails'
        }
      });
    }
  });

  // Email sweep endpoint
  router.post('/sweep', (req, res) => emailController.performSweep(req, res));

  // Get email summary
  router.get('/summary/:id', (req, res) => emailController.getEmailSummary(req, res));

  // Delete draft
  router.delete('/draft/:id', (req, res) => emailController.deleteDraft(req, res));

  // Draft response
  router.post('/draft', (req, res) => emailController.draftResponse(req, res));

  // Send email
  router.post('/send', (req, res) => emailController.sendEmail(req, res));

  // Get email by ID
  router.get('/:id', (req, res) => emailController.getEmail(req, res));

  return router;
}
