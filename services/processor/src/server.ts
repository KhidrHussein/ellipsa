// Load environment variables first
import * as dotenv from 'dotenv';
import * as path from 'path';

// For CommonJS compatibility
declare const __filename: string;
declare const __dirname: string;

// Load environment variables from the root .env file
const envPath = path.resolve(process.cwd(), '../../.env');
console.log(`[server] Current working directory: ${process.cwd()}`);
console.log(`[server] Loading environment variables from: ${envPath}`);

try {
  dotenv.config({ path: envPath, override: true });
  console.log('[server] Environment variables loaded successfully');
} catch (error) {
  console.error('[server] Error loading .env file:', error);
}

// Debug: Log if required environment variables are loaded
console.log('[server] OPENAI_API_KEY loaded:', process.env.OPENAI_API_KEY ? 'Yes' : 'No');
console.log('[server] PROMPT_SERVICE_URL:', process.env.PROMPT_SERVICE_URL || 'Not set');

import express, { type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import axios, { type AxiosError } from "axios";
// Import schemas from the shared package
import { 
  EventSchema, 
  TaskSchema, 
  EntitySchema 
} from "@ellipsa/shared";
import { processAudio } from "./audioProcessor.js";
import { MemoryService } from "./services/MemoryService.js";
import { logger } from "./utils/logger.js";

// Define IngestSchema locally since it's not in the shared package
export const IngestSchema = z.object({
  id: z.string(),
  type: z.enum(['audio', 'screenshot', 'clipboard', 'window']),
  content: z.string(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.any()).optional(),
  audio_ref: z.string().optional(),
  screenshot_ref: z.string().optional(),
  active_window: z.string().optional(),
  segment_ts: z.number(),
  meta: z.record(z.any()).optional()
});

export type Ingest = z.infer<typeof IngestSchema>;
// Load environment variables
dotenv.config();

// Log environment variables status
const requiredEnvVars = ['PROMPT_SERVICE_URL'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

// Configuration
const CONFIG = {
  PROMPT_SERVICE_URL: process.env.PROMPT_SERVICE_URL || "http://localhost:4003",
  PORT: process.env.PORT || 4002,
  LOG_LEVEL: process.env.LOG_LEVEL || "info"
};

// Types
type InputType = 'audio' | 'screenshot' | 'clipboard' | 'window';

// Define the ProcessResult type
type ProcessResult = {
  event: z.infer<typeof EventSchema>;
  tasks: z.infer<typeof TaskSchema>[];
  entities: z.infer<typeof EntitySchema>[];
};

// Initialize Express
const app = express();
app.use(express.json({ limit: "10mb" }));

// In-memory storage for events (replace with a database in production)
const events = new Map<string, any>();

// Initialize MemoryService
const memoryService = new MemoryService(process.env.MEMORY_SERVICE_URL);

// Enhanced logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  // Log request start
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - Request started`);
  
  // Log request body (safely)
  if (Object.keys(req.body).length > 0) {
    console.log(`[${new Date().toISOString()}] Request body: ${JSON.stringify(req.body, null, 2)}`);
  }
  
  // Log response finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });
  
  next();
});

/**
 * Detect the type of input based on the ingest data
 */
function detectInputType(ingest: z.infer<typeof IngestSchema>): InputType {
  if (ingest.audio_ref) return 'audio';
  if (ingest.screenshot_ref) return 'screenshot';
  if (ingest.meta?.clipboard_content) return 'clipboard';
  return 'window';
}

/**
 * Process different types of input and generate structured events
 */
async function processInput(ingest: z.infer<typeof IngestSchema>): Promise<ProcessResult> {
  try {
    const inputType = detectInputType(ingest);
    let context: any = {
      inputType,
      activeWindow: ingest.active_window,
      timestamp: new Date(ingest.segment_ts).toISOString(),
      metadata: ingest.meta || {}
    };

    console.log(`[${new Date().toISOString()}] Processing ${inputType} input`);

    // Handle audio input
    if (inputType === 'audio' && ingest.audio_ref) {
      const audioData = await processAudio(ingest);
      context = {
        ...context,
        transcription: audioData.text,
        duration: audioData.duration,
        language: audioData.language
      };
    }

    // Call the prompt service to process the input
    const response = await axios.post(
      `${CONFIG.PROMPT_SERVICE_URL}/prompt/v1/complete`,
      {
        messages: [
          {
            role: "system" as const,
            content: `You are a context processor. Analyze the ${inputType} input and extract structured information.
            Context: ${JSON.stringify(context, null, 2)}`
          },
          {
            role: "user" as const,
            content: `Process this ${inputType} input and extract structured information.`
          }
        ],
        response_format: { type: "json_object" as const }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 seconds timeout
      }
    );

    // Parse and validate the LLM response
    if (!response.data.choices?.[0]?.message?.content) {
      throw new Error('Invalid response from prompt service');
    }

    const result = response.data.choices[0].message.content;
    const parsed = JSON.parse(result);
    const eventId = `evt_${Date.now()}`;
    
    // Create event with proper typing
    const event: z.infer<typeof EventSchema> = {
      id: eventId,
      type: inputType,
      start_ts: new Date().toISOString(),
      participants: Array.isArray(parsed.participants) ? parsed.participants : ["ent_you"],
      source_app: typeof ingest.active_window === 'string' ? ingest.active_window : "unknown",
      summary_text: typeof parsed.summary === 'string' ? parsed.summary : `Processed ${inputType} input`,
      action_items: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      tone_summary: parsed.tone || { valence: "neutral", confidence: 0.8 },
      confidence_score: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
      provenance: [`processor:${inputType}`]
    };

    // Extract tasks with proper typing
    const tasks: z.infer<typeof TaskSchema>[] = (Array.isArray(parsed.tasks) ? parsed.tasks : []).map((task: any, index: number) => ({
      id: `task_${Date.now()}_${index}`,
      text: typeof task.text === 'string' ? task.text : 'Untitled task',
      owner: "user",
      status: "open",
      origin_event_id: eventId,
      ...(typeof task === 'object' && task !== null ? task : {})
    }));

    // Extract entities with proper typing
    const entities: z.infer<typeof EntitySchema>[] = (Array.isArray(parsed.entities) ? parsed.entities : []).map((entity: any, index: number) => ({
      id: `ent_${Date.now()}_${index}`,
      canonical_name: typeof entity.name === 'string' ? entity.name : 'Unnamed Entity',
      ...(typeof entity === 'object' && entity !== null ? entity : {})
    }));

    return { event, tasks, entities };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in processInput:`, error);
    throw error;
  }
}

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'processor',
    version: process.env.npm_package_version || '0.1.0',
    timestamp: new Date().toISOString()
  });
});

// API Endpoints

/**
 * @openapi
 * /processor/v1/ingest:
 *   post:
 *     summary: Process incoming data and generate structured events
 *     tags: [Processor]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/IngestSchema'
 *     responses:
 *       200:
 *         description: Successfully processed the input
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 event_id:
 *                   type: string
 *                 task_count:
 *                   type: number
 *                 entity_count:
 *                   type: number
 *       400:
 *         description: Invalid input data
 *       429:
 *         description: Too many requests
 *       500:
 *         description: Internal server error
 */

// Input validation middleware
const validateIngestRequest = (req: Request, res: Response, next: NextFunction) => {
  const parsed = IngestSchema.safeParse(req.body);
  if (!parsed.success) {
    const error = {
      error: "invalid_input",
      message: "Invalid input data",
      details: parsed.error.flatten(),
      timestamp: new Date().toISOString()
    };
    
    console.warn(`[${new Date().toISOString()}] Validation failed:`, error);
    return res.status(400).json(error);
  }
  
  // Attach parsed data to request object
  (req as any).parsedIngest = parsed;
  next();
};

// Rate limiting middleware (in-memory, use Redis in production)
const rateLimit = (windowMs = 60000, max = 100) => {
  const requests = new Map<string, { count: number; resetTime: number }>();
  
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    
    if (!requests.has(ip)) {
      requests.set(ip, { count: 0, resetTime: now + windowMs });
    }
    
    const client = requests.get(ip)!;
    
    // Reset counter if window has passed
    if (now > client.resetTime) {
      client.count = 0;
      client.resetTime = now + windowMs;
    }
    
    // Check if rate limit exceeded
    if (client.count >= max) {
      const retryAfter = Math.ceil((client.resetTime - now) / 1000);
      res.set('Retry-After', retryAfter.toString());
      return res.status(429).json({
        error: "rate_limit_exceeded",
        message: `Too many requests, please try again in ${retryAfter} seconds`,
        retry_after: retryAfter,
        timestamp: new Date().toISOString()
      });
    }
    
    // Increment counter and continue
    client.count++;
    next();
  };
};

// Apply rate limiting to ingest endpoint (500 requests per minute per IP)
app.post("/processor/v1/ingest", rateLimit(60000, 500), validateIngestRequest, async (req: Request, res: Response) => {
  try {
    const ingest = (req as any).parsedIngest;
    
    const { event, tasks, entities } = await processInput(ingest.data);
    
    // Prepare the event data for storage
    const eventMetadata = {
      ...(event as any).metadata || {},
      // Include original event data
      ...event,
      // Remove properties that are already mapped to top-level fields
      summary_text: undefined,
      action_items: undefined,
      id: undefined,
      type: undefined,
      participants: undefined,
      start_ts: undefined,
      end_ts: undefined
    };
    
    // Remove undefined values from metadata
    Object.keys(eventMetadata).forEach(key => 
      eventMetadata[key] === undefined && delete eventMetadata[key]
    );

    const eventData = {
      id: event.id || `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: event.type || 'conversation',
      content: event.summary_text || 'No content',
      metadata: eventMetadata,
      start_time: new Date(event.start_ts || Date.now()),
      end_time: event.end_ts ? new Date(event.end_ts) : undefined,
      participants: (event.participants || []).map((p: any) => ({
        entity_id: typeof p === 'string' ? p : p.id || p.entity_id || `ent_${Math.random().toString(36).substr(2, 9)}`,
        name: typeof p === 'string' ? p : p.name || p.entity_id || 'Unknown',
        metadata: typeof p === 'string' ? {} : p.metadata || {}
      })),
      tasks: (event.action_items || []).map((t: any) => ({
        text: t.text || t.description || '',
        owner: t.owner || 'system',
        status: (t.status ? t.status.toLowerCase() : 'pending'),
        priority: (t.priority ? t.priority.toLowerCase() : 'medium'),
        due_ts: t.due_ts,
        ...(t.metadata || {})
      }))
    };

    // Store the event in the memory service and local map
    const storedEvent = await memoryService.storeEvent({
      ...eventData,
      // Convert tasks to the correct format
      tasks: eventData.tasks.map((t: z.infer<typeof TaskSchema>) => ({
        ...t,
        // Ensure required fields are present
        text: t.text || '',
        owner: t.owner || 'system',
        status: t.status || 'pending',
        priority: t.priority || 'medium'
      }))
    });
    
    // Store in local map
    events.set(eventData.id, eventData);

    logger.info(`Stored event ${storedEvent} with ${tasks.length} tasks and ${entities.length} entities`);
    
    // Store entities in the knowledge graph through the memory service
    await Promise.all(entities.map(async (entity) => {
      if (!entity) {
        logger.warn('Skipping null/undefined entity');
        return;
      }
      
      const entityId = entity.id || `ent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      if (!entityId) {
        logger.warn('Skipping entity with no ID:', entity);
        return;
      }

      try {
        // This would be more sophisticated in a real implementation
        const entityEvent = {
          id: `evt_entity_${entityId}_${Date.now()}`,
          type: 'entity_update',
          content: `Entity ${entity.canonical_name || entityId} updated`,
          metadata: {
            ...(entity.metadata || {}),
            entity_id: entityId,
            entity_type: entity.type || 'unknown',
            canonical_name: entity.canonical_name
          },
          start_time: new Date(),
          participants: [{
            entity_id: entityId,
            name: entity.canonical_name || entityId,
            metadata: entity.metadata || {}
          }],
          tasks: []
        };
        
        await memoryService.storeEvent(entityEvent);
      } catch (error) {
        logger.error(`Failed to store entity ${entity.id}:`, error);
      }
    }));
    
    // Return the results
    res.json({
      success: true,
      ingest_id: `ing_${Date.now()}`,
      event_id: event.id,
      task_count: tasks.length,
      entity_count: entities.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[${new Date().toISOString()}] Error processing input:`, errorMessage);
    
    // Handle axios errors specifically
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      const data = error.response?.data || { error: 'Unknown error from prompt service' };
      return res.status(status).json({
        error: "prompt_service_error",
        message: `Error from prompt service: ${error.message}`,
        details: data
      });
    }
    
    res.status(500).json({
      error: "processing_failed",
      message: errorMessage,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @openapi
 * /processor/v1/events:
 *   get:
 *     summary: Get all processed events (for debugging)
 *     tags: [Processor]
 *     responses:
 *       200:
 *         description: List of all processed events
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 events:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/EventSchema'
 *                 count:
 *                   type: number
 *       500:
 *         description: Internal server error
 */
app.get("/processor/v1/events", (req: Request, res: Response) => {
  try {
    const allEvents = Array.from(events.values());
    res.json({ 
      success: true,
      events: allEvents,
      count: allEvents.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error retrieving events:`, error);
    res.status(500).json({
      error: "retrieval_failed",
      message: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @openapi
 * /processor/v1/health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                 event_count:
 *                   type: number
 *                 version:
 *                   type: string
 *                 services:
 *                   type: object
 *                   properties:
 *                     prompt_service:
 *                       type: object
 *                       properties:
 *                         url:
 *                           type: string
 *                         status:
 *                           type: string
 *       503:
 *         description: Service is unhealthy
 */
app.get("/processor/v1/health", async (req: Request, res: Response) => {
  const health: any = {
    status: "ok",
    timestamp: new Date().toISOString(),
    event_count: events.size,
    version: process.env.npm_package_version || "unknown",
    services: {
      prompt_service: {
        url: CONFIG.PROMPT_SERVICE_URL,
        status: "unknown"
      }
    }
  };

  try {
    // Check prompt service health
    const promptHealth = await axios.get(`${CONFIG.PROMPT_SERVICE_URL}/prompt/v1/health`, {
      timeout: 5000
    });
    
    health.services.prompt_service.status = "healthy";
    health.services.prompt_service.details = promptHealth.data;
    
    // Check if we have any recent errors
    const recentErrorCount = 0; // In production, track recent errors
    if (recentErrorCount > 0) {
      health.status = "degraded";
      health.warning = `Experiencing ${recentErrorCount} recent errors`;
    }
    
    res.json(health);
  } catch (error) {
    health.status = "unhealthy";
    health.services.prompt_service.status = "unavailable";
    
    if (axios.isAxiosError(error)) {
      health.services.prompt_service.error = {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText
      };
    } else {
      health.services.prompt_service.error = {
        message: error instanceof Error ? error.message : "Unknown error"
      };
    }
    
    res.status(503).json(health);
  }
});

// Error handling for async routes
const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(`[${new Date().toISOString()}] Unhandled error:`, err);
  res.status(500).json({
    error: "internal_server_error",
    message: "An unexpected error occurred",
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  const error = {
    error: "not_found",
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method
  };
  
  console.warn(`[${new Date().toISOString()}] 404 Not Found: ${req.method} ${req.path}`);
  res.status(404).json(error);
});

// Create the server
const server = app.listen(parseInt(CONFIG.PORT as string, 10), () => {
  console.log(`[${new Date().toISOString()}] [processor] Server started on port ${CONFIG.PORT}`);
  console.log(`[${new Date().toISOString()}] [processor] Prompt service: ${CONFIG.PROMPT_SERVICE_URL}`);
  console.log(`[${new Date().toISOString()}] [processor] Log level: ${CONFIG.LOG_LEVEL}`);
});

// Export for testing
export { app, server, processInput };
export type { ProcessResult };

// Handle graceful shutdown
const shutdown = () => {
  console.log(`[${new Date().toISOString()}] Shutting down gracefully...`);
  
  // Close the server
  server.close((err) => {
    if (err) {
      console.error(`[${new Date().toISOString()}] Error during shutdown:`, err);
      process.exit(1);
    }
    
    console.log(`[${new Date().toISOString()}] Server closed`);
    process.exit(0);
  });
  
  // Force shutdown after timeout
  setTimeout(() => {
    console.error(`[${new Date().toISOString()}] Forcing shutdown after timeout`);
    process.exit(1);
  }, 10000);
};

// Handle termination signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
