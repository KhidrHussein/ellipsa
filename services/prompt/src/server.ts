import express, { Request, Response } from "express";
import { z } from "zod";
import OpenAI from "openai";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ["OPENAI_API_KEY"];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingVars.join(", ")}`);
  process.exit(1);
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const CompletionSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string()
  })),
  model: z.string().optional().default("gpt-3.5-turbo"),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  max_tokens: z.number().min(1).max(4000).optional(),
  response_format: z.object({
    type: z.literal("json_object")
  }).optional()
});

const app = express();
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// In-memory template storage (would be database in production)
const templates = new Map<string, string>();

// Template management endpoints
app.post("/prompt/v1/templates", async (req, res) => {
  const { name, template } = req.body;
  if (!name || !template) {
    return res.status(400).json({ error: "name and template required" });
  }
  templates.set(name, template);
  res.json({ success: true });
});

app.get("/prompt/v1/templates", async (req, res) => {
  const all = Array.from(templates.entries()).map(([name, template]) => ({ name, template }));
  res.json({ templates: all });
});

// Main completion endpoint
app.post("/prompt/v1/complete", async (req, res) => {
  try {
    const parsed = CompletionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    }

    const { messages, model, temperature, max_tokens, response_format } = parsed.data;
    
    console.log(`[${new Date().toISOString()}] Starting completion with model: ${model}`);
    
    const startTime = Date.now();
    const completion = await openai.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens,
      response_format,
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`[${new Date().toISOString()}] Completion finished in ${duration}ms`);
    
    // Add usage and timing information
    const response = {
      ...completion,
      _timing: {
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
        duration_ms: duration
      }
    };
    
    res.json(response);
  } catch (error: any) {
    console.error(`[${new Date().toISOString()}] Completion error:`, error);
    
    const statusCode = error.status || 500;
    const errorResponse = {
      error: "completion_failed",
      message: error.message,
      ...(error.status && { status: error.status }),
      ...(error.code && { code: error.code }),
      ...(error.type && { type: error.type })
    };
    
    res.status(statusCode).json(errorResponse);
  }
});

// Health check endpoint
app.get("/prompt/v1/health", async (req, res) => {
  try {
    // Verify OpenAI API key is working
    await openai.models.list();
    
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      templates_count: templates.size,
      openai_status: "connected"
    });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(503).json({
      status: "unhealthy",
      error: "OpenAI API connection failed",
      timestamp: new Date().toISOString()
    });
  }
});

// Error handling middleware
app.use((err: any, req: any, res: any, next: any) => {
  console.error(`[${new Date().toISOString()}] Unhandled error:`, err);
  res.status(500).json({
    error: "internal_server_error",
    message: "An unexpected error occurred"
  });
});

const PORT = process.env.PORT || 4003;
const server = app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] [prompt] Server started on port ${PORT}`);
  console.log(`[${new Date().toISOString()}] [prompt] Using OpenAI model: ${process.env.OPENAI_MODEL || 'gpt-3.5-turbo'}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
