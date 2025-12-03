import { ExtractionResult, IPromptService, AssistanceContext, AssistanceResponse } from './interfaces/IPromptService';
import { EventModel } from '../models/EventModel';
import { EntityModel, EntityType } from '../models/EntityModel';
import { TaskModel } from '../models/TaskModel';
import { Session } from 'neo4j-driver';
import { TranscriptionService } from './TranscriptionService';
import { MemoryRetrievalService } from './MemoryRetrievalService';

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
  memoryRetrievalService?: MemoryRetrievalService;
}

export class EventProcessingService {
  private promptService: IPromptService;
  private eventModel: EventModel;
  private entityModel: EntityModel;
  private taskModel: TaskModel;
  private neo4jSession: Session;
  private transcriptionService?: TranscriptionService;
  private memoryRetrievalService?: MemoryRetrievalService;
  private processingQueue: Array<() => Promise<void>> = [];
  private isProcessing = false;

  // Screen context cache for OCR/ASR alignment
  private screenContextCache: { content: string; timestamp: number } | null = null;
  private readonly SCREEN_CONTEXT_TTL = 30000; // 30 seconds

  // Short-term history to prevent repetitive responses
  private recentHistory: string[] = [];
  private readonly MAX_HISTORY_LENGTH = 5;

  constructor(options: EventProcessingServiceOptions & { transcriptionService?: TranscriptionService }) {
    this.promptService = options.promptService;
    this.eventModel = options.eventModel;
    this.entityModel = options.entityModel;
    this.taskModel = options.taskModel;
    this.neo4jSession = options.neo4jSession;
    this.transcriptionService = options.transcriptionService;
    this.memoryRetrievalService = options.memoryRetrievalService;
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

                // Retrieve relevant memory context
                let memoryBullets: string[] = [];
                if (this.memoryRetrievalService) {
                  try {
                    const memoryResults = await this.memoryRetrievalService.retrieveRelevantContext(truncatedTranscript, 5);
                    memoryBullets = memoryResults.map(m => m.text);
                    if (memoryBullets.length > 0) {
                      console.log(`[EventProcessing] Retrieved ${memoryBullets.length} memory bullets for context`);
                    }
                  } catch (memError) {
                    console.error('[EventProcessing] Error retrieving memory:', memError);
                  }
                }

                // Get screen context from cache if available and not expired
                let screenContext = '';
                if (this.screenContextCache) {
                  const age = Date.now() - this.screenContextCache.timestamp;
                  if (age < this.SCREEN_CONTEXT_TTL) {
                    screenContext = this.screenContextCache.content;
                    console.log(`[EventProcessing] Using cached screen context (${Math.round(age / 1000)}s old)`);
                  } else {
                    console.log(`[EventProcessing] Screen context expired (${Math.round(age / 1000)}s old)`);
                    this.screenContextCache = null;
                  }
                }

                // Generate intelligent assistance using transcript + screen + memory + history
                console.log('[EventProcessing] Generating intelligent assistance...');
                const assistance = await this.promptService.generateAssistance({
                  transcript: truncatedTranscript,
                  screenContext,
                  activityType: metadata.activityType || 'general',
                  memoryBullets,
                  recentHistory: this.recentHistory
                });

                // Also extract structured data for entities and action items
                extraction = await this.promptService.extractStructuredData(truncatedTranscript);

                // Use intelligent assistance as the summary
                let shouldNotify = false;
                if (assistance.message && assistance.message.trim()) {
                  extraction.summary = assistance.message;

                  // Update history
                  this.recentHistory.push(assistance.message);
                  if (this.recentHistory.length > this.MAX_HISTORY_LENGTH) {
                    this.recentHistory.shift();
                  }

                  // Determine if we should notify the user
                  // 1. Check confidence
                  const isConfident = (assistance.confidence || 0) >= 0.7;

                  // 2. Check for generic "I don't know" responses
                  const isGeneric = /unable to analyze|not enough information|provide more context/i.test(assistance.message);

                  shouldNotify = isConfident && !isGeneric;

                  console.log(`[EventProcessing] Generated assistance (confidence: ${assistance.confidence}, notify: ${shouldNotify})`);
                } else {
                  // Fallback if no assistance generated
                  extraction.summary = extraction.summary || 'Audio processed';
                  shouldNotify = false;
                }

                // Store notification status in metadata
                metadata.shouldNotify = shouldNotify;

                // Merge action items from assistance with extracted action items
                if (assistance.action_items && assistance.action_items.length > 0) {
                  const assistanceActionItems = assistance.action_items.map((item: { text: string; priority?: 'low' | 'medium' | 'high' }) => ({
                    text: item.text,
                    priority: item.priority || 'medium'
                  }));
                  extraction.action_items = [...(extraction.action_items || []), ...assistanceActionItems];
                }

                // Store metadata (not shown to user)
                metadata.raw_transcript = transcript;
                metadata.memory_context_count = memoryBullets.length;
                metadata.screen_context_used = !!screenContext;
                metadata.assistance_confidence = assistance.confidence;

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
          } else if (metadata.source === 'screen') {
            // Cache screen content for use by audio processing
            this.screenContextCache = {
              content: content.substring(0, 2000), // Limit to 2000 chars
              timestamp: Date.now()
            };
            console.log('[EventProcessing] Cached screen context for audio processing');

            // Process screen content normally
            const truncatedContent = content.length > 30000
              ? content.substring(0, 30000) + '... [truncated]'
              : content;

            extraction = await this.promptService.extractStructuredData(truncatedContent);
          } else {
            // Other event types
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