export interface ExtractionResult {
  summary: string;
  confidence?: number;
  sentiment?: string;
  topics?: string[];
  entities: Array<{
    type: string;
    value: string;
    label?: string;
    context?: string;
  }>;
  action_items?: Array<{
    text: string;
    priority: 'low' | 'medium' | 'high';
    due_date?: string;
  }>;
  suggestions?: string[];
}

export interface IPromptService {
  extractStructuredData(content: string): Promise<ExtractionResult>;
  generate(prompt: string, options?: any): Promise<string>;
}

import { EventModel } from '../models/EventModel';
import { EntityModel } from '../models/EntityModel';
import { TaskModel } from '../models/TaskModel';
import { Session } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';
import { TranscriptionService } from './TranscriptionService';

interface EventProcessingServiceOptions {
  promptService: IPromptService;
  eventModel: EventModel;
  entityModel: EntityModel;
  taskModel: TaskModel;
  neo4jSession: Session;
}

export class EventProcessingService {
  private promptService: IPromptService;
  private eventModel: EventModel;
  private entityModel: EntityModel;
  private taskModel: TaskModel;
  private neo4jSession: Session;
  private transcriptionService?: TranscriptionService;
  private processingQueue: Array<() => Promise<void>> = [];
  private isProcessing = false;

  constructor(options: EventProcessingServiceOptions & { transcriptionService?: TranscriptionService }) {
    this.promptService = options.promptService;
    this.eventModel = options.eventModel;
    this.entityModel = options.entityModel;
    this.taskModel = options.taskModel;
    this.neo4jSession = options.neo4jSession;
    this.transcriptionService = options.transcriptionService;
  }

  /**
   * Process a new event with LLM extraction
   */
  async processEvent(content: string, metadata: Record<string, any> = {}) {
    // Add to processing queue
    return new Promise((resolve, reject) => {
      this.processingQueue.push(async () => {
        try {
          let extraction: ExtractionResult;

          // Check if this is an audio event
          if (metadata.source === 'audio') {
            if (this.transcriptionService) {
              try {
                // Transcribe the audio
                const transcript = await this.transcriptionService.transcribe(content);

                // Use the transcript as content for LLM extraction
                // We update the content variable so it's used in createEvent too if needed, 
                // but better to keep original content (base64) in data if we want to save it?
                // Actually, EventModel expects 'description' which we usually put summary in.
                // Let's extract structured data from the transcript.
                const truncatedTranscript = transcript.length > 30000
                  ? transcript.substring(0, 30000) + '... [truncated]'
                  : transcript;

                extraction = await this.promptService.extractStructuredData(truncatedTranscript);

                // Add transcript to metadata or description
                extraction.summary = `[Audio Transcript] ${transcript}\n\n${extraction.summary}`;
              } catch (error) {
                console.error('Transcription failed:', error);
                extraction = {
                  summary: 'Audio captured (transcription failed)',
                  entities: [],
                  action_items: [],
                  suggestions: []
                };
              }
            } else {
              // Fallback if no transcription service available
              extraction = {
                summary: 'Audio captured (transcription not available)',
                entities: [],
                action_items: [],
                suggestions: []
              };
            }
          } else {
            // 1. Extract structured data using LLM
            // Truncate content to avoid context length limits (approx 8k tokens)
            const truncatedContent = content.length > 30000
              ? content.substring(0, 30000) + '... [truncated]'
              : content;

            extraction = await this.promptService.extractStructuredData(truncatedContent);
          }

          // 2. Create event
          const event = await this.createEvent(extraction, metadata);

          // 3. Process entities and relationships
          await this.processEntities(extraction.entities, event.id);

          // 4. Process action items
          await this.processActionItems(extraction.action_items, event.id);

          // 5. Update graph relationships
          await this.updateGraphRelationships(event.id, extraction);

          resolve({ event, extraction });
        } catch (error) {
          console.error('Error processing event:', error);
          reject(error);
        }
      });

      // Start processing if not already running
      this.processQueue();
    });
  }

  private async createEvent(extraction: ExtractionResult, metadata: any) {
    return this.eventModel.create({
      type: 'other',
      title: extraction.summary?.substring(0, 100) || 'Untitled Event',
      description: extraction.summary || '',
      start_time: new Date(),
      participants: [], // Add required participants array with default empty array
      metadata: {
        ...metadata,
        confidence: extraction.confidence,
        sentiment: extraction.sentiment,
        topics: extraction.topics || [],
      },
    });
  }

  private async processEntities(entities: any[], eventId: string) {
    if (!entities) return;

    for (const entity of entities) {
      try {
        // Create entity in the database
        await this.entityModel.create({
          type: entity.type,
          name: entity.value,
          metadata: {
            label: entity.label,
            context: entity.context,
          },
        });

        // Create relationship in Neo4j
        if (this.neo4jSession) {
          try {
            await this.neo4jSession.writeTransaction(tx =>
              tx.run(
                `MATCH (e:Event {id: $eventId})
                 MERGE (ent:Entity {name: $name, type: $type})
                 MERGE (e)-[r:MENTIONS]->(ent)
                 SET r.context = $context`,
                {
                  eventId,
                  name: entity.value,
                  type: entity.type,
                  context: entity.context || ''
                }
              )
            );
          } catch (error) {
            console.error('Error creating Neo4j relationship:', error);
          }
        }
      } catch (error) {
        console.error('Error processing entity:', error);
        const err = error as any;
        if (err.issues) {
          console.error('Validation issues:', JSON.stringify(err.issues, null, 2));
        } else if (err.originalError && err.originalError.issues) {
          console.error('Validation issues (nested):', JSON.stringify(err.originalError.issues, null, 2));
        }
        console.error('Failed entity data:', JSON.stringify(entity, null, 2));
      }
    }
  }

  private async processActionItems(actionItems: any[] = [], eventId: string) {
    for (const item of actionItems) {
      await this.taskModel.create({
        title: item.text?.substring(0, 100) || 'Untitled Task',
        description: item.text || '',
        due_date: item.due ? new Date(item.due) : undefined,
        priority: (item.priority || 'medium') as 'low' | 'medium' | 'high' | 'urgent',
        status: (item.status || 'pending') as 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled',
        metadata: {},
        related_event_id: eventId,
      });
    }
  }

  private async updateGraphRelationships(eventId: string, extraction: ExtractionResult) {
    // Create relationships between entities mentioned in the same event
    const entities = extraction.entities.map(e => e.value);

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        await this.neo4jSession.writeTransaction(tx =>
          tx.run(
            `MATCH (e1:Entity {name: $name1}), (e2:Entity {name: $name2})
             MERGE (e1)-[r:RELATED_TO]-(e2)
             ON CREATE SET r.weight = 1, r.last_updated = datetime()
             ON MATCH SET r.weight = r.weight + 1, r.last_updated = datetime()`,
            { name1: entities[i], name2: entities[j] }
          )
        );
      }
    }
  }

  private async processQueue() {
    if (this.isProcessing || !this.processingQueue.length) {
      return;
    }

    this.isProcessing = true;
    const processNext = async () => {
      const task = this.processingQueue.shift();
      if (!task) {
        this.isProcessing = false;
        return;
      }

      try {
        await task();
      } catch (error) {
        console.error('Error in processing queue:', error);
      }

      // Process next item in the queue
      setImmediate(processNext);
    };

    await processNext();
  }
}