import express from 'express';
import cors from 'cors';
import { Knex } from 'knex';
import { Driver, Session } from 'neo4j-driver';
import { Server } from 'http';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createApiRouter } from './api';
import { RetrievalService } from './services/RetrievalService';
import { EventModel } from './models/EventModel';
import { EntityModel } from './models/EntityModel';
import { TaskModel } from './models/TaskModel';
import { DraftModel } from './models/DraftModel';
import { WebSocketService } from './services/WebSocketService';
import { EventProcessingService } from './services/EventProcessingService';
import { initializeDatabases, closeConnections } from './db/init';
import { logger } from './utils/logger';
import { getChromaClient } from './db/vector/chroma';
import { getDriver, getSession } from './db/graph/connection';
import { getConnection, getKnexClient } from './db/relational/connection';
import { PromptServiceClient } from './services/PromptServiceClient';
import { TranscriptionService } from './services/TranscriptionService';
import { MemoryRetrievalService } from './services/MemoryRetrievalService';
import { ContextInjector } from './services/ContextInjector';
import { MemoryConsolidator } from './services/MemoryConsolidator';
import config from './config';

// Extend the Socket.IO types with our custom properties
declare module 'socket.io' {
  // Augment the base Socket interface with our methods
  interface Socket {
    // These methods are already properly typed in @types/socket.io
    join(room: string | string[]): Promise<string[]>;
    leave(room: string): void;
    // Use the existing type definitions for on/emit to avoid conflicts
  }
}

// Default configuration
const DEFAULT_PORT = 4001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Main application class
class MemoryServer {
  private app: express.Application;
  private server: Server;
  private io: SocketIOServer;
  private knex!: Knex;
  private neo4jDriver!: Driver;
  private neo4jSession: Session | any;
  private chromaCollections: { events: any; entities: any } | any;
  private eventModel!: EventModel;
  private entityModel!: EntityModel;
  private taskModel!: TaskModel;
  private draftModel!: DraftModel;
  private retrievalService!: RetrievalService;
  private webSocketService!: WebSocketService;
  private eventProcessingService!: EventProcessingService;

  private port: number;

  constructor(port?: number) {
    this.port = port || parseInt(process.env.PORT || '', 10) || DEFAULT_PORT;
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });
    this.app.set('io', this.io);
  }

  async initialize() {
    try {
      // Initialize database connections
      await this.initializeDatabases();

      // Initialize models
      this.initializeModels();

      // Initialize services
      await this.initializeServices();

      // Configure middleware
      this.configureMiddleware();

      // Configure routes
      this.configureRoutes();

      // Configure WebSocket
      this.configureWebSocket();

      // Start the server
      await this.start();

      logger.info('Memory Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Memory Service:', error);
      process.exit(1);
    }
  }

  private async initializeDatabases() {
    try {
      // Initialize all databases
      const { knex, neo4jDriver, chromaCollections } = await initializeDatabases();

      // Store connections
      this.knex = knex;
      this.neo4jDriver = neo4jDriver;
      this.neo4jSession = getSession();
      this.chromaCollections = chromaCollections;

      logger.info('All database connections established');
      return { knex, neo4jDriver: this.neo4jDriver, neo4jSession: this.neo4jSession, chromaCollections: this.chromaCollections };
    } catch (error) {
      logger.error('Failed to initialize databases:', error);
      throw error;
    }
  }

  private initializeModels() {
    // Initialize models with proper types
    this.eventModel = new EventModel(
      this.knex,
      this.neo4jSession,
      this.chromaCollections.events
    );

    this.entityModel = new EntityModel(
      this.knex,
      this.neo4jDriver,
      this.chromaCollections.entities
    );

    this.taskModel = new TaskModel(
      this.knex,
      this.neo4jSession
    );

    this.draftModel = new DraftModel(this.knex);
  }

  private async initializeServices() {
    // Initialize RetrievalService with required models
    this.retrievalService = new RetrievalService(
      this.eventModel,
      this.entityModel,
      this.taskModel
    );

    // Initialize PromptServiceClient
    const promptServiceUrl = process.env.PROMPT_SERVICE_URL || 'http://localhost:4003';
    const promptService = new PromptServiceClient(promptServiceUrl);

    // Initialize TranscriptionService
    const transcriptionService = new TranscriptionService(config.openaiApiKey || '');

    // Initialize MemoryRetrievalService
    const chromaClient = getChromaClient();
    const neo4jDriver = await getDriver();
    const memoryRetrievalService = new MemoryRetrievalService(chromaClient, neo4jDriver);
    await memoryRetrievalService.initialize();

    // Initialize Context Injector
    const contextInjector = new ContextInjector(neo4jDriver, promptService as any, memoryRetrievalService);

    // Initialize Memory Consolidator
    const memoryConsolidator = new MemoryConsolidator(neo4jDriver, promptService as any);

    // Schedule daily consolidation (24 hours)
    logger.info('Scheduling daily memory consolidation...');
    setInterval(() => {
      memoryConsolidator.consolidateDailyMemories().catch(err => logger.error('Daily consolidation failed:', err));
    }, 24 * 60 * 60 * 1000);

    // Run once on startup for debugging/verification if needed (optional, maybe behind a flag or just log)
    // memoryConsolidator.consolidateDailyMemories().catch(console.error);

    // Initialize Event Processing Service
    this.eventProcessingService = new EventProcessingService({
      promptService: promptService as any,
      eventModel: this.eventModel,
      entityModel: this.entityModel,
      taskModel: this.taskModel,
      neo4jDriver: this.neo4jDriver,
      transcriptionService: transcriptionService,
      memoryRetrievalService: memoryRetrievalService,
      contextInjector: contextInjector
    });

    // Initialize WebSocket Service after HTTP server is started
    this.webSocketService = new WebSocketService(this.server, this.eventProcessingService);
    this.app.set('webSocketService', this.webSocketService);
  }

  public async close(): Promise<void> {
    try {
      // Close WebSocket connections
      if (this.webSocketService) {
        try {
          await this.webSocketService.close();
        } catch (error) {
          logger.error('Error closing WebSocket service:', error);
        }
      }

      // Close database connections
      await closeConnections();

      // Close HTTP server
      if (this.server) {
        return new Promise((resolve, reject) => {
          this.server?.close((err) => {
            if (err) {
              logger.error('Error closing HTTP server:', err);
              reject(err);
            } else {
              logger.info('HTTP server closed');
              resolve();
            }
          });
        });
      }
    } catch (error) {
      logger.error('Error during server shutdown:', error);
      throw error;
    }
  }

  private configureMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  private configureRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Mount API router
    this.app.use('/api', createApiRouter(
      this.eventModel,
      this.entityModel,
      this.taskModel,
      this.draftModel,
      this.retrievalService
    ));

    // Redirect /events to /api/v1/events for compatibility with Action Service
    this.app.use('/events', (req, res) => {
      // Use 307 Temporary Redirect to preserve the method (POST) and body
      res.redirect(307, '/api/v1/events');
    });
  }

  private configureWebSocket() {
    // WebSocket configuration is handled by WebSocketService
    logger.info('WebSocket server configured');
  }

  private async start() {
    return new Promise<void>((resolve, reject) => {
      this.server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          logger.error(`Port ${this.port} is already in use`);
          reject(new Error(`Port ${this.port} is already in use`));
        } else {
          logger.error('Failed to start server:', error);
          reject(error);
        }
      });

      this.server.listen(this.port, () => {
        logger.info(`Memory Service listening on port ${this.port}`);
        resolve();
      });
    });
  }

}

// Start the server if this file is run directly
if (require.main === module) {
  const server = new MemoryServer();

  const startServer = async () => {
    try {
      await server.initialize();
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  };

  startServer();

  // Handle shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    await server.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

export { MemoryServer };