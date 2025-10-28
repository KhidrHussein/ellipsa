import { Router } from 'express';
import { EmailController } from './controllers/EmailController';
import { IEmailService } from './services/EmailService.interface';
import { createDigestRouter } from './routes/digest.routes';
import { EmailProcessingService } from './services/EmailProcessingService';

export function createEmailRouter(
  emailService: IEmailService,
  processingService: EmailProcessingService
): Router {
  const router = Router();
  const emailController = new EmailController(emailService);

  // Mount digest routes under /digest
  router.use('/digest', createDigestRouter(emailService, processingService));

  // Email sweep endpoint
  router.post('/sweep', (req, res) => emailController.performSweep(req, res));

  // Get email summary
  router.get('/summary/:id', (req, res) => emailController.getEmailSummary(req, res));

  // Draft response
  router.post('/draft', (req, res) => emailController.draftResponse(req, res));

  // Send email
  router.post('/send', (req, res) => emailController.sendEmail(req, res));

  // Get email by ID
  router.get('/:id', (req, res) => emailController.getEmail(req, res));

  return router;
}
