import express, { Request, Response } from "express";
import { z } from "zod";
import OpenAI from "openai";
import dotenv from "dotenv";
import { MEETING_ASSISTANT_PROMPT, QUESTION_ANSWER_ASSISTANT_PROMPT, GENERAL_ASSISTANT_PROMPT } from "./lib/assistantPrompts";

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
  max_tokens: z.number().min(1).max(16000).optional(),
  response_format: z.object({
    type: z.literal("json_object")
  }).optional()
});

import { Express } from 'express';

const app: Express = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

// Memory Service Configuration
const MEMORY_SERVICE_URL = process.env.MEMORY_SERVICE_URL || 'http://localhost:4001';

async function fetchContext(query: string): Promise<string[]> {
  if (!query) return [];
  try {
    console.log(`[ContextInjector] Fetching context for: "${query.substring(0, 50)}..."`);
    const response = await fetch(`${MEMORY_SERVICE_URL}/api/v1/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: 5 })
    });

    if (!response.ok) {
      console.warn(`[ContextInjector] Failed to fetch context: ${response.statusText}`);
      return [];
    }

    const json = await response.json() as any;
    const results = json.data?.results || [];

    return results.map((r: any) => {
      const title = r.metadata?.title || r.metadata?.name || 'Unknown';
      const type = r.type ? r.type.toUpperCase() : 'INFO';
      // Format: [EVENT] Meeting with Alice: Summary...
      return `[${type}] ${title}: ${r.content.substring(0, 150).replace(/\n/g, ' ')}`;
    });
  } catch (error) {
    console.error(`[ContextInjector] Error fetching context:`, error);
    return [];
  }
}

// Intelligent Assistance Endpoint
app.post("/prompt/v1/assist", async (req, res) => {
  try {
    const { context, model = "gpt-3.5-turbo" } = req.body;

    if (!context || !context.transcript) {
      return res.status(400).json({ error: "Context with transcript is required" });
    }

    console.log(`[${new Date().toISOString()}] Generating assistance for activity: ${context.activityType || 'general'}`);

    // Inject Ghost Context
    const ghostContext = await fetchContext(context.transcript);
    const combinedMemory = [
      ...(context.memoryBullets || []),
      ...ghostContext
    ];
    // Deduplicate
    const uniqueMemory = Array.from(new Set(combinedMemory));

    let systemPrompt = GENERAL_ASSISTANT_PROMPT;
    if (context.activityType === 'meeting') {
      systemPrompt = MEETING_ASSISTANT_PROMPT;
    } else if (context.activityType === 'question_answering') {
      systemPrompt = QUESTION_ANSWER_ASSISTANT_PROMPT;
    }

    // Replace placeholders
    const filledPrompt = systemPrompt
      .replace('{transcript}', context.transcript)
      .replace('{screen_context}', context.screenContext || 'No screen context available')
      .replace('{activity_type}', context.activityType || 'general')
      .replace('{memory_bullets}', uniqueMemory.join('\n- ') || 'No relevant memory found')
      .replace('{question}', context.transcript) // For QA prompt
      .replace('{context}', context.screenContext || '') // For QA prompt
      .replace('{memory_context}', uniqueMemory.join('\n- ') || ''); // For QA prompt

    // Prepare User Message (Text or Multimodal)
    let userContent: any = "Analyze the current context and provide assistance.";
    let activeModel = model;

    if (context.image) {
      // Ensure we use a vision-capable model
      if (activeModel.includes('gpt-3.5')) {
        activeModel = 'gpt-4o';
      }

      const imageUrl = context.image.startsWith('data:')
        ? context.image
        : `data:image/jpeg;base64,${context.image}`;

      userContent = [
        { type: "text", text: "Analyze the current context and provide assistance." },
        { type: "image_url", image_url: { url: imageUrl } }
      ];

      console.log(`[${new Date().toISOString()}] Processing image with model: ${activeModel}`);
    }

    const completion = await openai.chat.completions.create({
      model: activeModel,
      messages: [
        { role: "system", content: filledPrompt },
        { role: "user", content: userContent }
      ],
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    const parsed = JSON.parse(content);
    res.json(parsed);

  } catch (error: any) {
    console.error(`[${new Date().toISOString()}] Assistance generation error:`, error);
    res.status(500).json({
      error: "assistance_failed",
      message: error.message
    });
  }
});


// Chat Endpoint
app.post("/prompt/v1/chat", async (req: Request, res: Response) => {
  try {
    const { context, model = "gpt-3.5-turbo" } = req.body;

    if (!context || !context.message) {
      return res.status(400).json({ error: "Chat context with message is required" });
    }

    console.log(`[${new Date().toISOString()}] Generating chat response`);

    // Import the template dynamically or ensure it's available
    const { CHAT_ASSISTANT_PROMPT } = require("./lib/assistantPrompts");

    // Inject Ghost Context
    const ghostContext = await fetchContext(context.message);
    const combinedMemory = [
      ...(context.memoryContext || []),
      ...ghostContext
    ];
    const uniqueMemory = Array.from(new Set(combinedMemory));

    // Replace placeholders
    const memoryContextStr = uniqueMemory.length > 0 ? `Memory:\n- ${uniqueMemory.join('\n- ')}` : '';
    const screenContextStr = context.screenContext ? `Screen:\n${context.screenContext}` : '';

    const systemPrompt = CHAT_ASSISTANT_PROMPT
      .replace('{memory_context}', memoryContextStr)
      .replace('{screen_context}', screenContextStr);

    const messages = [
      { role: "system", content: systemPrompt },
      ...(context.history || []).map((h: any) => ({ role: h.role, content: h.content })),
      { role: "user", content: context.message }
    ];

    const completion = await openai.chat.completions.create({
      model,
      messages,
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    const parsed = JSON.parse(content);
    res.json(parsed);

  } catch (error: any) {
    console.error(`[${new Date().toISOString()}] Chat generation error:`, error);
    res.status(500).json({
      error: "chat_failed",
      message: error.message
    });
  }
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: any) => {
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

// Export the Express app and server
export { app };
export default server;
