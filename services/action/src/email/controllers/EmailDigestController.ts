import { Request, Response } from 'express';
import { EmailDigestService } from '../services/EmailDigestService';

export class EmailDigestController {
  private digestService: EmailDigestService;
  private isRunning: boolean = false;

  constructor(digestService: EmailDigestService) {
    this.digestService = digestService;
  }

  async startDigest(req: Request, res: Response) {
    try {
      if (this.isRunning) {
        return res.status(400).json({
          success: false,
          message: 'Digest service is already running'
        });
      }

      const { schedule } = req.body;
      
      if (schedule) {
        // If a custom schedule is provided, create a new instance with it
        // Note: In a real app, you might want to handle this differently
        this.digestService = new EmailDigestService(
          this.digestService['emailService'],
          this.digestService['processingService'],
          schedule
        );
      }

      await this.digestService.start();
      this.isRunning = true;

      res.status(200).json({
        success: true,
        message: 'Email digest service started',
        schedule: schedule || 'default (9 AM daily)'
      });
    } catch (error) {
      console.error('Error starting digest service:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to start email digest service',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async stopDigest(_req: Request, res: Response) {
    try {
      if (!this.isRunning) {
        return res.status(400).json({
          success: false,
          message: 'Digest service is not running'
        });
      }

      this.digestService.stop();
      this.isRunning = false;

      res.status(200).json({
        success: true,
        message: 'Email digest service stopped'
      });
    } catch (error) {
      console.error('Error stopping digest service:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to stop email digest service',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  getStatus(_req: Request, res: Response) {
    res.status(200).json({
      success: true,
      isRunning: this.isRunning,
      lastRun: 'Not implemented', // You can track this if needed
      nextRun: 'Not implemented'   // You can track this if needed
    });
  }

  async runNow(_req: Request, res: Response) {
    try {
      if (!this.isRunning) {
        return res.status(400).json({
          success: false,
          message: 'Digest service is not running. Start it first.'
        });
      }

      // Run digest immediately
      await this.digestService['runDigest']();
      
      res.status(200).json({
        success: true,
        message: 'Email digest triggered successfully'
      });
    } catch (error) {
      console.error('Error running digest now:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to run email digest',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
