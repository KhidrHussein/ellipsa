import { ExtractionResult, IPromptService } from './interfaces/IPromptService';
import { EventModel } from '../models/EventModel';
import { EntityModel, EntityType } from '../models/EntityModel';
import { TaskModel } from '../models/TaskModel';
import { Session } from 'neo4j-driver';
import { TranscriptionService } from './TranscriptionService';

// Define valid types to prevent validation errors
const VALID_ENTITY_TYPES = [
  'person', 'organization', 'location', 'date', 'event',
  'product', 'tool', 'file', 'concept', 'service', 'other'
];

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

  async processEvent(content: string, metadata: Record<string, any> = {}) {
    return new Promise((resolve, reject) => {
      this.processingQueue.push(async () => {
        try {
          let extraction: ExtractionResult;

          if (metadata.source === 'audio') {
            if (this.transcriptionService) {
              try {
                const transcript = await this.transcriptionService.transcribe(content);
                const truncatedTranscript = transcript.length > 30000
                  ? transcript.substring(0, 30000) + '... [truncated]'
                  : transcript;

                extraction = await this.promptService.extractStructuredData(truncatedTranscript);
                extraction.summary = `[Audio Transcript] ${transcript}\n\n${extraction.summary}`;
              } catch (error) {
                console.error('Transcription failed:', error);
                extraction = {
                  summary: 'Audio captured (transcription failed)',
                  entities: [],
                  action_items: [],
                  suggestions: [],
                  confidence: 0,
                  sentiment: 'neutral'
                };
              }
            } else {
              extraction = {
                summary: 'Audio captured (transcription not available)',
                entities: [],
                action_items: [],
                suggestions: []
              };
            }
          } else {
            const truncatedContent = content.length > 30000
              ? content.substring(0, 30000) + '... [truncated]'
              : content;

            extraction = await this.promptService.extractStructuredData(truncatedContent);
          }

          const event = await this.createEvent(extraction, metadata);

          if (extraction.entities?.length > 0) {
            await this.processEntities(extraction.entities, event.id);
          }

          if (extraction.action_items?.length && extraction.action_items.length > 0) {
            await this.processActionItems(extraction.action_items, event.id);
          }

          if (extraction.entities?.length > 1) {
            await this.updateGraphRelationships(event.id, extraction);
          }

          resolve({ event, extraction });
        } catch (error) {
          console.error('Error processing event:', error);
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  private async createEvent(extraction: ExtractionResult, metadata: any) {
    return this.eventModel.create({
      type: 'other',
      title: extraction.summary?.substring(0, 100) || 'Untitled Event',
      description: extraction.summary || '',
      start_time: new Date(),
      participants: [],
      metadata: {
        ...metadata,
        confidence: extraction.confidence,
        sentiment: extraction.sentiment,
        topics: extraction.topics || [],
      },
    });
  }

  private sanitizeEntityType(rawType: string): string {
    const normalized = rawType.toLowerCase().trim();
    if (VALID_ENTITY_TYPES.includes(normalized)) return normalized;
    if (['text', 'string'].includes(normalized)) return 'concept';
    if (['audio', 'sound'].includes(normalized)) return 'file';
    return 'other';
  }

  private async processEntities(entities: any[], eventId: string) {
    if (!entities) return;

    for (const entity of entities) {
      try {
        const safeType = this.sanitizeEntityType(entity.type);

        // CRITICAL FIX: Ensure context is never undefined or empty.
        // ChromaDB crashes if both embedding and document are missing.
        let safeContext = entity.context;
        if (!safeContext || typeof safeContext !== 'string' || safeContext.trim() === '') {
          safeContext = `${entity.label || 'Entity'}: ${entity.value}`;
        }

        await this.entityModel.create({
          type: safeType as EntityType,
          name: entity.value,
          metadata: {
            label: entity.label || 'Entity',
            context: safeContext,
          },
        });

        if (this.neo4jSession) {
          // ... (Neo4j logic unchanged, omitting for brevity in this specific fix block)
          await this.neo4jSession.writeTransaction(tx =>
            tx.run(
              `MATCH (e:Event {id: $eventId})
                 MERGE (ent:Entity {name: $name, type: $type})
                 MERGE (e)-[r:MENTIONS]->(ent)
                 SET r.context = $context`,
              {
                eventId,
                name: entity.value,
                type: safeType,
                context: safeContext
              }
            )
          );
        }
      } catch (error) {
        // Log error but CONTINUE the loop so one bad entity doesn't kill the whole process
        console.error(`Failed to process entity "${entity.value}":`, error);
      }
    }
  }

  private async processActionItems(actionItems: any[] = [], eventId: string) {
    for (const item of actionItems) {
      try {
        await this.taskModel.create({
          title: item.text?.substring(0, 100) || 'Untitled Task',
          description: item.text || '',
          due_date: item.due_date ? new Date(item.due_date) : undefined,
          priority: (item.priority || 'medium') as any,
          status: 'pending',
          metadata: {},
          related_event_id: eventId,
        });
      } catch (err) {
        console.error(`Failed to create task for event ${eventId}:`, err);
      }
    }
  }

  private async updateGraphRelationships(eventId: string, extraction: ExtractionResult) {
    const entities = extraction.entities.map(e => e.value);
    const maxEntities = 20;
    const entitiesToProcess = entities.slice(0, maxEntities);

    for (let i = 0; i < entitiesToProcess.length; i++) {
      for (let j = i + 1; j < entitiesToProcess.length; j++) {
        try {
          await this.neo4jSession.writeTransaction(tx =>
            tx.run(
              `MATCH (e1:Entity {name: $name1}), (e2:Entity {name: $name2})
               MERGE (e1)-[r:RELATED_TO]-(e2)
               ON CREATE SET r.weight = 1, r.last_updated = datetime()
               ON MATCH SET r.weight = r.weight + 1, r.last_updated = datetime()`,
              { name1: entitiesToProcess[i], name2: entitiesToProcess[j] }
            )
          );
        } catch (err) {
          console.error('Error updating graph relationships:', err);
        }
      }
    }
  }

  private async processQueue() {
    if (this.isProcessing || !this.processingQueue.length) return;

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
      setImmediate(processNext);
    };
    await processNext();
  }
}