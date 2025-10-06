import { Router } from 'express';
import { EventModel } from '../../models/EventModel';
import { EntityModel } from '../../models/EntityModel';
import { TaskModel } from '../../models/TaskModel';
import { RetrievalService } from '../../services/RetrievalService';
import { createEventsRouter } from './events';
import { createEntitiesRouter } from './entities';
import { createTasksRouter } from './tasks';

export function createV1Router(
  eventModel: EventModel,
  entityModel: EntityModel,
  taskModel: TaskModel,
  retrievalService: RetrievalService
): Router {
  const router = Router();

  // Health check endpoint
  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      services: {
        database: 'ok',
        vector_store: 'ok',
        graph_db: 'ok'
      }
    });
  });

  // Mount versioned routes
  router.use('/events', createEventsRouter(eventModel, entityModel, taskModel));
  router.use('/entities', createEntitiesRouter(entityModel, eventModel));
  router.use('/tasks', createTasksRouter(taskModel));

  // Search endpoint
  router.post('/search', async (req, res) => {
    try {
      const { query, limit = 10, context = {} } = req.body;
      
      if (!query) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_QUERY',
            message: 'Query parameter is required'
          },
          meta: {
            version: '1.0.0',
            timestamp: new Date().toISOString()
          }
        });
      }

      const results = await retrievalService.retrieve(query, { 
        limit, 
        entityContext: context.entityContext || [],
        timeWindow: context.timeWindow 
      });
      
      res.json({
        success: true,
        data: {
          results,
          count: results.length
        },
        meta: {
          version: '1.0.0',
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: unknown) {
      console.error('Search error:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      res.status(500).json({
        success: false,
        error: {
          code: 'SEARCH_FAILED',
          message: 'Failed to perform search',
          details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
        },
        meta: {
          version: '1.0.0',
          timestamp: new Date().toISOString()
        }
      });
    }
  });

  return router;
}
