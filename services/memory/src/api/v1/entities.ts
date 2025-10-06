import { Router, Request, Response, NextFunction } from 'express';
import { EntityModel } from '../../models/EntityModel';
import { EventModel } from '../../models/EventModel';

interface CustomError extends Error {
  code?: string;
  status?: number;
  details?: any;
}

declare global {
  namespace Express {
    interface Request {
      apiVersion?: string;
    }
  }
}

export function createEntitiesRouter(
  entityModel: EntityModel,
  eventModel: EventModel
): Router {
  const router = Router();

  // Get entity by ID
  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entity = await entityModel.findById(req.params.id);
      if (!entity) {
        return res.status(404).json({ 
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Entity not found'
          },
          meta: {
            version: '1.0.0',
            timestamp: new Date().toISOString()
          }
        });
      }
      
      // Get related events using the event model
      const events = await eventModel.findAll(
        { 'participants.entity_id': entity.id },
        {
          page: 1,
          pageSize: 50,
          sortBy: 'created_at',
          sortOrder: 'desc' as const
        }
      );

      res.json({ 
        success: true,
        data: {
          ...entity,
          recent_events: events
        },
        meta: {
          version: '1.0.0',
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: unknown) {
      console.error('Error fetching entity:', error);
      
      const errorResponse: {
        success: boolean;
        error: {
          code: string;
          message: string;
          details?: string;
        };
        meta: {
          version: string;
          timestamp: string;
        };
      } = {
        success: false,
        error: {
          code: 'FETCH_ENTITY_FAILED',
          message: 'Failed to fetch entity',
        },
        meta: {
          version: req.apiVersion || '1.0.0',
          timestamp: new Date().toISOString()
        }
      };

      if (error instanceof Error) {
        errorResponse.error.details = process.env.NODE_ENV === 'development' 
          ? error.message 
          : undefined;
      }

      res.status(500).json(errorResponse);
    }
  });

  // Create or update entity
  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entityData = req.body;
      
      // Check if entity exists
      let entity = await entityModel.findById(entityData.id);
      
      if (entity) {
        // Update existing entity
        entity = await entityModel.update(entityData.id, entityData);
      } else {
        // Create new entity
        entity = await entityModel.create({
          name: entityData.name || `Entity ${entityData.id}`,
          type: entityData.type || 'unknown',
          metadata: entityData.metadata || {},
        });
      }
      
      res.status(201).json({ 
        success: true,
        data: entity,
        meta: {
          version: '1.0.0',
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: unknown) {
      console.error('Error saving entity:', error);
      
      const errorResponse: {
        success: boolean;
        error: {
          code: string;
          message: string;
          details?: string;
        };
        meta: {
          version: string;
          timestamp: string;
        };
      } = {
        success: false,
        error: {
          code: 'SAVE_ENTITY_FAILED',
          message: 'Failed to save entity',
        },
        meta: {
          version: req.apiVersion || '1.0.0',
          timestamp: new Date().toISOString()
        }
      };

      if (error instanceof Error) {
        errorResponse.error.details = process.env.NODE_ENV === 'development' 
          ? error.message 
          : undefined;
      }

      res.status(500).json(errorResponse);
    }
  });

  return router;
}
