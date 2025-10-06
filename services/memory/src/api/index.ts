import { Router } from 'express';
import { EventModel } from '../models/EventModel';
import { EntityModel } from '../models/EntityModel';
import { TaskModel } from '../models/TaskModel';
import { RetrievalService } from '../services/RetrievalService';
import { createV1Router } from './v1';

export function createApiRouter(
  eventModel: EventModel,
  entityModel: EntityModel,
  taskModel: TaskModel,
  retrievalService: RetrievalService
): Router {
  const router = Router();

  // API version negotiation
  router.use((req, res, next) => {
    // Default to v1 if no version specified
    const version = req.headers['accept-version'] || '1.0';
    
    // Set the API version in the request object for downstream handlers
    (req as any).apiVersion = version;
    
    // Add version to response headers
    res.set('API-Version', version);
    
    next();
  });

  // Mount versioned API routers
  router.use('/v1', createV1Router(eventModel, entityModel, taskModel, retrievalService));

  // Handle 404 for API routes
  router.use((req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'ENDPOINT_NOT_FOUND',
        message: 'The requested API endpoint does not exist'
      },
      meta: {
        version: req.headers['accept-version'] || '1.0',
        timestamp: new Date().toISOString()
      }
    });
  });

  // Global error handler
  router.use((err: any, req: any, res: any, next: any) => {
    console.error('API Error:', err);
    
    res.status(err.status || 500).json({
      success: false,
      error: {
        code: err.code || 'INTERNAL_SERVER_ERROR',
        message: err.message || 'An unexpected error occurred',
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined
      },
      meta: {
        version: req.apiVersion || '1.0',
        timestamp: new Date().toISOString()
      }
    });
  });

  return router;
}
