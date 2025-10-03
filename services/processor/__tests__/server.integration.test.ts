import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import { Server } from 'http';
import { z } from 'zod';
import { EventSchema, TaskSchema, IngestSchema, EntitySchema } from '@ellipsa/shared';

// Mock axios before importing the server
jest.mock('axios');
const axios = require('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Import the server after setting up mocks
import * as server from '../src/server';

// Mock the server
let testServer: Server;

// Test data
const mockTask: z.infer<typeof TaskSchema> = {
  id: 'task_123',
  text: 'Test task',
  status: 'pending',
  owner: 'system',
  linked_entities: []
};

const mockEvent: z.infer<typeof EventSchema> = {
  id: 'evt_123',
  type: 'clipboard',
  start_ts: new Date().toISOString(),
  end_ts: new Date(Date.now() + 1000).toISOString(),
  participants: ['ent_you'],
  source_app: 'Test App',
  summary_text: 'Test summary',
  action_items: [mockTask],
  tone_summary: { valence: 'neutral', confidence: 0.8 },
  confidence_score: 0.9,
  provenance: ['processor:clipboard']
};

// Mock axios response for the prompt service
const mockAxiosResponse = {
  data: {
    choices: [
      {
        message: {
          content: JSON.stringify({
            summary: 'Test clipboard content processed',
            participants: ['ent_you'],
            tasks: [],
            entities: [],
            tone: { valence: 'neutral', confidence: 0.8 },
            confidence: 0.9
          })
        }
      }
    ]
  }
};

describe('Processor Service Integration Tests', () => {
  beforeAll((done) => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Start the test server
    testServer = server.app.listen(0, '127.0.0.1', () => {
      console.log(`Test server running on port ${(testServer.address() as any).port}`);
      done();
    });
  });

  afterAll((done) => {
    // Close the server
    testServer.close(done);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /processor/v1/ingest', () => {
    it('should process valid input and return success', async () => {
      // Mock axios.post for the prompt service call
      mockedAxios.post.mockResolvedValueOnce(mockAxiosResponse);

      // Setup mock data with all required fields
      const mockInput = {
        agent_id: 'test-agent',
        session_id: 'test-session',
        segment_ts: new Date().toISOString(),
        active_window: 'Test App',
        audio_ref: undefined,
        screenshot_ref: undefined,
        meta: {
          clipboard_content: 'Test content',
        },
      };

      // Make the request with valid input
      const response = await request(server.app)
        .post('/processor/v1/ingest')
        .send(mockInput)
        .expect('Content-Type', /json/)
        .expect(200);

      // Verify the response
      expect(response.body).toMatchObject({
        success: true,
        event_id: expect.any(String),
        task_count: 0,
        entity_count: 0
      });
      
      // Verify axios.post was called with the correct arguments
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:3000/prompt/v1/complete',
        expect.objectContaining({
          messages: expect.any(Array),
          response_format: { type: 'json_object' }
        }),
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 30000
        })
      );
    });

    it('should return 400 for invalid input', async () => {
      const response = await request(server.app)
        .post('/processor/v1/ingest')
        .send({ 
          agent_id: 'test-agent',
          session_id: 'test-session',
          invalid: 'input' 
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'invalid_input');
      expect(response.body).toHaveProperty('details');
    });
  });

  describe('GET /processor/v1/health', () => {
    it('should return service health status', async () => {
      // Mock the axios call to the prompt service
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'ok' }
      });

      const response = await request(server.app)
        .get('/processor/v1/health')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        timestamp: expect.any(String),
        event_count: expect.any(Number),
        version: expect.any(String),
        services: {
          prompt_service: {
            url: expect.any(String),
            status: 'healthy'
          }
        }
      });
    });
  });

  describe('GET /processor/v1/events', () => {
    it('should return list of processed events', async () => {
      const response = await request(server.app)
        .get('/processor/v1/events')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        events: expect.any(Array),
        count: expect.any(Number),
        timestamp: expect.any(String),
      });
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(server.app)
        .get('/nonexistent-route')
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body).toMatchObject({
        error: 'not_found',
        message: expect.stringContaining('not found'),
        timestamp: expect.any(String),
      });
    });
  });
});