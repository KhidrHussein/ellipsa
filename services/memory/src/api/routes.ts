import express from 'express';
import { z } from 'zod';
import { EventModel } from '../models/EventModel';
import { EntityModel } from '../models/EntityModel';
import { TaskModel } from '../models/TaskModel';
import { RetrievalService } from '../services/RetrievalService';

export function createRouter(
  eventModel: EventModel,
  entityModel: EntityModel,
  taskModel: TaskModel,
  retrievalService: RetrievalService
): express.Router {
  const router = express.Router();

  // Store event from processor
  router.post('/events', async (req, res) => {
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
            // Check if entity exists
            const existingEntity = await entityModel.findById(participant.entity_id);
            
            if (!existingEntity) {
              // Create new entity (without id in input)
              await entityModel.create({
                name: participant.name || `Participant ${participant.entity_id}`,
                type: 'person', // Default type, can be overridden
                metadata: participant.metadata || {},
              });
            }
          })
        );
      }
      
      // Create tasks if any
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
      
      res.status(201).json({ event_id: event.id });
    } catch (error) {
      console.error('Error processing event:', error);
      res.status(500).json({ 
        error: 'Failed to process event',
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Retrieve relevant memories
  router.post('/retrieve', async (req, res) => {
    try {
      const { query, context, weights } = req.body;
      
      if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
      }
      
      const results = await retrievalService.retrieve(query, {
        weights: weights || { semantic: 0.4, temporal: 0.3, relational: 0.3 },
        entityContext: context?.entities,
        timeWindow: context?.timeWindow,
      });
      
      res.json({ results });
    } catch (error) {
      console.error('Error retrieving memories:', error);
      res.status(500).json({ 
        error: 'Failed to retrieve memories',
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Get entity details
  router.get('/entities/:id', async (req, res) => {
    try {
      const entity = await entityModel.findById(req.params.id);
      if (!entity) {
        return res.status(404).json({ error: 'Entity not found' });
      }
      
      // Get related events - use proper pagination
      const events = await eventModel.findAll(
        {
          // Note: Direct participant filtering might need a custom query
          // depending on your schema structure
        }, 
        { 
          pageSize: 50,
          page: 1
        }
      );
      
      res.json({
        entity,
        recent_events: events.data,
      });
    } catch (error) {
      console.error('Error fetching entity:', error);
      res.status(500).json({ 
        error: 'Failed to fetch entity',
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Health check
  router.get('/health', async (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  });

  return router;
}