import express from 'express';
import cors from 'cors';
import { Knex } from 'knex';
import { Server } from 'http';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createApiRouter } from './api';
import { RetrievalService } from './services/RetrievalService';
import { EventModel } from './models/EventModel';
import { EntityModel } from './models/EntityModel';
import { TaskModel } from './models/TaskModel';
import { initializeDatabases, closeConnections } from './db/init';
import { getChromaClient } from './db/vector/chroma';
import { getDriver, getSession } from './db/graph/connection';
import { getConnection, getKnexClient } from './db/relational/connection';
import { logger } from './utils/logger';

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

// Configuration
const PORT = process.env.PORT || 4001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Main application class
class MemoryServer {
  private app: express.Application;
  private server: Server;
  private io: SocketIOServer;
  private knex!: Knex;
  private neo4jSession: any;
  private chromaCollection: any;
  private eventModel!: EventModel;
  private entityModel!: EntityModel;
  private taskModel!: TaskModel;
  private retrievalService!: RetrievalService;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });
  }

  async initialize() {
    try {
      // Initialize database connections
      await this.initializeDatabases();
      
      // Initialize models
      this.initializeModels();
      
      // Initialize services
      this.initializeServices();
      
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
      this.neo4jSession = getSession();
      this.chromaCollection = chromaCollections.events; // Using events collection for now
      
      logger.info('All database connections established');
    } catch (error) {
      logger.error('Failed to initialize databases:', error);
      throw error;
    }
  }

  private initializeModels() {
    this.eventModel = new EventModel(this.knex, this.neo4jSession, this.chromaCollection);
    this.entityModel = new EntityModel(this.knex, this.neo4jSession, this.chromaCollection);
    this.taskModel = new TaskModel(this.knex, this.neo4jSession);
  }

  private initializeServices() {
    this.retrievalService = new RetrievalService(
      this.eventModel,
      this.entityModel,
      this.taskModel
    );
  }

  private configureMiddleware() {
    // CORS
    this.app.use(cors({
      origin: NODE_ENV === 'production' 
        ? process.env.ALLOWED_ORIGINS?.split(',') || []
        : '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Version'],
    }));

    // JSON parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`);
      next();
    });
  }

  private configureRoutes() {
    // Health check (not versioned)
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        service: 'memory',
        version: process.env.npm_package_version || '0.1.0',
        timestamp: new Date().toISOString() 
      });
    });

    // Create versioned API router
    const apiRouter = createApiRouter(
      this.eventModel, 
      this.entityModel, 
      this.taskModel, 
      this.retrievalService
    );
    
    // Mount the versioned API under /api
    this.app.use('/api', apiRouter);

    // 404 handler for non-API routes
    this.app.use((req, res) => {
      res.status(404).json({ 
        error: 'Not Found',
        message: 'The requested resource was not found',
        path: req.path,
        method: req.method
      });
    });

    // Global error handler
    this.app.use((err: any, req: any, res: any, next: any) => {
      logger.error('Unhandled error:', err);
      
      // Default error status and message
      const status = err.status || 500;
      const message = err.message || 'Internal Server Error';
      
      // Prepare error response
      const errorResponse: any = {
        success: false,
        error: {
          code: err.code || 'INTERNAL_SERVER_ERROR',
          message: message,
        },
        meta: {
          version: (req as any).apiVersion || '1.0',
          timestamp: new Date().toISOString()
        }
      };
      
      // Add stack trace in development
      if (NODE_ENV === 'development') {
        errorResponse.error.stack = err.stack;
      }
      
      res.status(status).json(errorResponse);
    });
  }

  private configureWebSocket() {
    this.io.on('connection', (socket: any) => {
      logger.info(`New WebSocket connection: ${socket.id}`);

      socket.on('subscribe', (data: { channel: string }) => {
        if (data?.channel) {
          socket.join(data.channel);
          logger.info(`Client ${socket.id} subscribed to ${data.channel}`);
        }
      });

      socket.on('unsubscribe', (data: { channel: string }) => {
        if (data?.channel) {
          socket.leave(data.channel);
          logger.info(`Client ${socket.id} unsubscribed from ${data.channel}`);
        }
      });

      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
      });

      // Handle errors
      socket.on('error', (error: Error) => {
        logger.error(`WebSocket error from ${socket.id}:`, error);
      });
    });
  }

  private async start() {
    return new Promise<void>((resolve) => {
      this.server.listen(PORT, () => {
        logger.info(`Memory Service listening on port ${PORT}`);
        resolve();
      });
    });
  }

  async close() {
    try {
      // Close HTTP server
      if (this.server) {
        await new Promise<void>((resolve, reject) => {
          this.server.close((err) => {
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

      // Close WebSocket server
      if (this.io) {
        this.io.close(() => {
          logger.info('WebSocket server closed');
        });
      }

      // Close all database connections
      await closeConnections();
      logger.info('All database connections closed');
    } catch (error) {
      logger.error('Error during server shutdown:', error);
      throw error;
    }
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
