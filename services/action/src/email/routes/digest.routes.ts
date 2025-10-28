import { Router } from 'express';
import { EmailDigestController } from '../controllers/EmailDigestController';
import { EmailDigestService } from '../services/EmailDigestService';
import { IEmailService } from '../services/EmailService.interface';
import { EmailProcessingService } from '../services/EmailProcessingService';

export const createDigestRouter = (
  emailService: IEmailService,
  processingService: EmailProcessingService
) => {
  const router = Router();
  const digestService = new EmailDigestService(emailService, processingService);
  const digestController = new EmailDigestController(digestService);

  // Start the email digest service
  router.post('/start', (req, res) => digestController.startDigest(req, res));
  
  // Stop the email digest service
  router.post('/stop', (req, res) => digestController.stopDigest(req, res));
  
  // Get the current status of the digest service
  router.get('/status', (req, res) => digestController.getStatus(req, res));
  
  // Trigger an immediate digest run
  router.post('/run-now', (req, res) => digestController.runNow(req, res));

  return router;
};

// For TypeScript type inference
export type EmailDigestRouter = ReturnType<typeof createDigestRouter>;
