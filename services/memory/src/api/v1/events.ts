import { Router } from 'express';
import { EventModel } from '../../models/EventModel';
import { EntityModel } from '../../models/EntityModel';
import { TaskModel } from '../../models/TaskModel';

export function createEventsRouter(
  eventModel: EventModel,
  entityModel: EntityModel,
  taskModel: TaskModel
): Router {
  const router = Router();

  // List events with optional filtering
  router.get('/', async (req, res) => {
    try {
      const { type, limit } = req.query;

      // Build filter options
      const filterOptions: any = {};
      if (type) {
        filterOptions.type = type as string;
      }

      const events = await eventModel.findAll(filterOptions, {
        page: 1,
        pageSize: limit ? parseInt(limit as string, 10) : 50,
        sortBy: 'start_time',
        sortOrder: 'desc',
      });

      res.json({
        success: true,
        data: events.data || events,
        meta: {
          version: '1.0.0',
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: unknown) {
      console.error('Error listing events:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      res.status(500).json({
        success: false,
        error: {
          code: 'EVENT_LIST_FAILED',
          message: 'Failed to list events',
          details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
        },
        meta: {
          version: '1.0.0',
          timestamp: new Date().toISOString()
        }
      });
    }
  });

  // Store event from processor
  router.post('/', async (req, res) => {
    try {
      const eventData = req.body;

      // Validate and create event
      const event = await eventModel.create({
        ...eventData,
        start_time: new Date(eventData.start_time),
        end_time: eventData.end_time ? new Date(eventData.end_time) : undefined,
      });

      // Process participants - create entities first if they don't exist
      if (eventData.participants?.length) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        await Promise.all(
          eventData.participants.map(async (participant: any) => {
            // Skip if entity_id is not a valid UUID (e.g. "unknown_user" or "provider:gmail")
            if (!participant.entity_id || !uuidRegex.test(participant.entity_id)) {
              return;
            }

            const existingEntity = await entityModel.findById(participant.entity_id);

            if (!existingEntity) {
              await entityModel.create({
                name: participant.name || `Participant ${participant.entity_id}`,
                type: 'person',
                metadata: participant.metadata || {},
              });
            }
          })
        );
      }

      // Process tasks if any
      if (eventData.tasks?.length) {
        await Promise.all(
          eventData.tasks.map((task: any) =>
            taskModel.create({
              title: task.text || task.title || 'Untitled task',
              description: task.description,
              status: task.status || 'pending',
              priority: task.priority || 'medium',
              related_event_id: event.id,
              assignee_id: task.owner,
              due_date: task.due_ts,
              metadata: task.metadata || {},
              source: 'event_processor',
            })
          )
        );
      }

      // Emit WebSocket event
      req.app.get('io').emit('event:created', { eventId: event.id });

      res.status(201).json({
        success: true,
        data: {
          event_id: event.id
        },
        meta: {
          version: '1.0.0',
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: unknown) {
      console.error('Error creating event:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      res.status(500).json({
        success: false,
        error: {
          code: 'EVENT_CREATION_FAILED',
          message: 'Failed to create event',
          details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
        },
        meta: {
          version: '1.0.0',
          timestamp: new Date().toISOString()
        }
      });
    }
  });

  // Get event by ID
  router.get('/:id', async (req, res) => {
    try {
      const event = await eventModel.findById(req.params.id);
      if (!event) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Event not found'
          },
          meta: {
            version: '1.0.0',
            timestamp: new Date().toISOString()
          }
        });
      }

      res.json({
        success: true,
        data: event,
        meta: {
          version: '1.0.0',
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: unknown) {
      console.error('Error fetching event:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_EVENT_FAILED',
          message: 'Failed to fetch event',
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
