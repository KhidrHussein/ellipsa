import { Router } from 'express';
import { TaskModel } from '../../models/TaskModel';

export function createTasksRouter(taskModel: TaskModel): Router {
  const router = Router();

  // Create a new task
  router.post('/', async (req, res) => {
    try {
      const taskData = req.body;
      
      const task = await taskModel.create({
        title: taskData.title || taskData.text || 'Untitled task',
        description: taskData.description,
        status: taskData.status || 'pending',
        priority: taskData.priority || 'medium',
        related_event_id: taskData.related_event_id,
        assignee_id: taskData.owner || taskData.assignee_id,
        due_date: taskData.due_ts || taskData.due_date,
        metadata: taskData.metadata || {},
      });
      
      res.status(201).json({ 
        success: true,
        data: task,
        meta: {
          version: '1.0.0',
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: unknown) {
      console.error('Error creating task:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      res.status(500).json({ 
        success: false,
        error: {
          code: 'TASK_CREATION_FAILED',
          message: 'Failed to create task',
          details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
        },
        meta: {
          version: '1.0.0',
          timestamp: new Date().toISOString()
        }
      });
    }
  });

  // Update task status
  router.patch('/:id/status', async (req, res) => {
    try {
      const { status } = req.body;
      
      if (!['pending', 'in_progress', 'completed', 'failed'].includes(status)) {
        return res.status(400).json({ 
          success: false,
          error: {
            code: 'INVALID_STATUS',
            message: 'Invalid status value'
          },
          meta: {
            version: '1.0.0',
            timestamp: new Date().toISOString()
          }
        });
      }
      
      const task = await taskModel.update(req.params.id, { status });
      
      if (!task) {
        return res.status(404).json({ 
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Task not found'
          },
          meta: {
            version: '1.0.0',
            timestamp: new Date().toISOString()
          }
        });
      }
      
      res.json({ 
        success: true,
        data: task,
        meta: {
          version: '1.0.0',
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: unknown) {
      console.error('Error updating task status:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      res.status(500).json({ 
        success: false,
        error: {
          code: 'TASK_UPDATE_FAILED',
          message: 'Failed to update task status',
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
