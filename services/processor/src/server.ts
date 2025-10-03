import express, { type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { EventSchema, TaskSchema, EntitySchema, IngestSchema } from "@ellipsa/shared";
import type { Ingest } from "@ellipsa/shared";
import axios, { type AxiosError } from "axios";
import * as dotenv from "dotenv";
import { processAudio } from "./audioProcessor";
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

// In-memory storage (would be database in production)
const events = new Map<string, z.infer<typeof EventSchema>>();

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

// Apply rate limiting to ingest endpoint (100 requests per minute per IP)
app.post("/processor/v1/ingest", rateLimit(), validateIngestRequest, async (req: Request, res: Response) => {
  try {
    const ingest = (req as any).parsedIngest;
    
    const { event, tasks, entities } = await processInput(ingest.data);
    
    // Store the event in memory (in production, this would be in a database)
    events.set(event.id, event);
    
    console.log(`[${new Date().toISOString()}] Processed event ${event.id} with ${tasks.length} tasks and ${entities.length} entities`);
    
    // In a production environment, we would:
    // 1. Store the event in the memory service
    // 2. Create any tasks in the task service
    // 3. Update entities in the knowledge graph
    
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
    const all = Array.from(events.values());
    res.json({ 
      success: true,
      events: all,
      count: all.length,
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
