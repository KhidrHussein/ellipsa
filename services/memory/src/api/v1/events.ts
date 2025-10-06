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
        await Promise.all(
          eventData.participants.map(async (participant: any) => {
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
