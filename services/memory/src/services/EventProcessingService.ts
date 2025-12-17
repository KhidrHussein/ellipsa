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

import { ContextInjector } from './ContextInjector';

export interface EventProcessingServiceOptions {
  promptService: IPromptService;
  eventModel: EventModel;
  entityModel: EntityModel;
  taskModel: TaskModel;
  neo4jSession: Session;
  memoryRetrievalService?: MemoryRetrievalService;
  contextInjector?: ContextInjector;
}

export class EventProcessingService {
  private promptService: IPromptService;
  private eventModel: EventModel;
  private entityModel: EntityModel;
  private taskModel: TaskModel;
  private neo4jSession: Session;
  private transcriptionService?: TranscriptionService;
  private memoryRetrievalService?: MemoryRetrievalService;
  private contextInjector?: ContextInjector;
  private processingQueue: (() => Promise<void>)[] = [];
  private isProcessing = false;

  // Cache for screen context to avoid re-reading for every event
  private screenContextCache: { content: string, timestamp: number } | null = null;
  private readonly SCREEN_CONTEXT_TTL = 5000; // 5 seconds

  // History for chat context
  private recentHistory: Array<{ role: 'user' | 'assistant', content: string }> = [];
  private readonly MAX_HISTORY_LENGTH = 10;

  constructor(options: EventProcessingServiceOptions & { transcriptionService?: TranscriptionService }) {
    this.promptService = options.promptService;
    this.eventModel = options.eventModel;
    this.entityModel = options.entityModel;
    this.taskModel = options.taskModel;
    this.neo4jSession = options.neo4jSession;
    this.transcriptionService = options.transcriptionService;
    this.memoryRetrievalService = options.memoryRetrievalService;
    this.contextInjector = options.contextInjector;
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

                // Fetch User Entity to get Strategic Focus
                let strategicFocusContext = '';
                try {
                  const userEntity = (await this.entityModel.search('User', { type: 'user', pageSize: 1 })).data[0];
                  if (userEntity && userEntity.metadata?.strategicFocus) {
                    strategicFocusContext = `User's Current Strategic Focus: ${userEntity.metadata.strategicFocus}`;
                    console.log(`[EventProcessing] Injected Strategic Focus: ${userEntity.metadata.strategicFocus}`);
                  }
                } catch (err) {
                  // Silently fail if user not found, strictly optional context
                  console.warn('[EventProcessing] Failed to fetch User context:', err);
                }

                let assistance: any;
                if (truncatedTranscript && truncatedTranscript.trim().length > 5) {
                  assistance = await this.promptService.generateAssistance({
                    transcript: truncatedTranscript,
                    screenContext: `${screenContext}\n\n${strategicFocusContext}`.trim(), // Inject focus into screen context as it's a strong context signal
                    activityType: metadata.activityType || 'general',
                    memoryBullets: [strategicFocusContext, ...memoryBullets].filter(Boolean), // Also add to memory bullets for redundancy
                    recentHistory: this.recentHistory.map(h => `${h.role}: ${h.content}`)
                  });
                } else {
                  // Skip assistance for empty/short transcripts
                  assistance = { message: '', confidence: 0, action_items: [] };
                }

                // Also extract structured data for entities and action items
                extraction = await this.promptService.extractStructuredData(truncatedTranscript);

                // Use intelligent assistance as the summary
                let shouldNotify = false;
                if (assistance.message && assistance.message.trim()) {
                  extraction.summary = assistance.message;

                  // Update history
                  this.recentHistory.push({ role: 'assistant', content: assistance.message });
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
            await this.processEntities(extraction.entities, event.id, metadata.user_id || 'user');
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
      user_id: metadata.user_id || 'user', // Default or extracted
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

  private async processEntities(entities: any[], eventId: string, userId: string) {
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
          user_id: userId,
          type: safeType as EntityType,
          name: entity.value,
          metadata: {
            label: entity.label || 'Entity',
            context: safeContext,
          },
        });

        if (this.neo4jSession) {
          await this.neo4jSession.executeWrite(tx =>
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
          priority: (['low', 'medium', 'high', 'urgent'].includes((item.priority || '').toLowerCase())
            ? (item.priority || '').toLowerCase()
            : 'medium') as any,
          status: 'pending',
          source: 'system',  // Mark as system-generated task
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
          await this.neo4jSession.executeWrite(tx =>
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

  async processUserMessage(text: string, metadata: any = {}): Promise<any> {
    try {
      console.log(`[EventProcessing] Processing user message: "${text}"`);

      // 1. Retrieve relevant memory context
      let memoryContext: string[] = [];
      if (this.memoryRetrievalService) {
        try {
          const memoryResults = await this.memoryRetrievalService.retrieveRelevantContext(text, 15);
          memoryContext = memoryResults.map(m => `[${m.timestamp.toISOString()}] ${m.text}`);
        } catch (error) {
          console.error('[EventProcessing] Error retrieving memory context:', error);
        }
      }

      // 2. Get screen context
      let screenContext = '';
      if (this.screenContextCache) {
        const age = Date.now() - this.screenContextCache.timestamp;
        if (age < this.SCREEN_CONTEXT_TTL) {
          screenContext = this.screenContextCache.content;
        }
      }

      // [NEW] Ghost Threading / Context Injection
      // If ContextInjector is available, we inject "active context" from the Graph
      let activeContext = '';
      if (this.contextInjector) {
        try {
          activeContext = await this.contextInjector.injectContext(text);
          if (activeContext) {
            console.log('[EventProcessing] Injected Ghost Context:', activeContext);
            // We can prepend this to the screenContext or memoryContext.
            // Since the prompt templates usually put screenContext prominently, let's append it there
            // marked clearly as Active Context.
            screenContext = `${screenContext}\n\n${activeContext}`;
          }
        } catch (ciError) {
          console.warn('[EventProcessing] Context injection failed:', ciError);
        }
      }

      // 3. Generate response using Prompt Service
      const chatContext = {
        message: text,
        history: this.recentHistory,
        memoryContext,
        screenContext
      };

      // Persist user message as an event
      const event = await this.eventModel.create({
        user_id: metadata.user_id || 'user',
        type: 'user_message',
        title: 'User Message',
        start_time: new Date(),
        source: 'chat',
        content: text,
        participants: [],
        metadata: { ...metadata, role: 'user' }
      });

      // Extract entities from user message asynchronously
      this.promptService.extractStructuredData(text).then(async (extraction) => {
        if (extraction.entities && extraction.entities.length > 0) {
          console.log(`[EventProcessing] Extracted ${extraction.entities.length} entities from user message`);
          for (const entity of extraction.entities) {
            await this.entityModel.create({
              user_id: metadata.user_id || 'user',
              name: entity.value,
              type: entity.type as EntityType,
              description: entity.context || text,
              metadata: {
                source: 'chat',
                confidence: 1.0,
                observations: [entity.context || text]
              }
            });
          }

          // Link entities if multiple are found (heuristic: co-occurrence)
          if (extraction.entities.length > 1) {
            await this.updateGraphRelationships(event.id, extraction);
          }
        }
      }).catch(err => {
        console.error('[EventProcessing] Entity extraction failed:', err);
        if (err.originalError && err.originalError.issues) {
          console.error('[EventProcessing] Validation issues:', JSON.stringify(err.originalError.issues, null, 2));
        }
      });

      // We need to cast promptService to any because we just added generateChatResponse to the interface
      // but TypeScript might not pick it up immediately in this file context if not recompiled
      const response = await (this.promptService as any).generateChatResponse(chatContext);

      // 4. Execute action plan if present and valid
      if (response.actionPlan && typeof response.actionPlan === 'object') {
        // Handle both single action (legacy) and multi-step formats
        const plan = response.actionPlan;
        const hasLegacyAction = !!plan.action;
        const hasSteps = Array.isArray(plan.steps) && plan.steps.length > 0;

        if (hasLegacyAction || hasSteps) {
          console.log('[EventProcessing] Executing action plan:', JSON.stringify(plan, null, 2));
          try {
            await this.executeActionPlan(plan);
            response.message += "\n\n(Actions executed successfully)";
          } catch (error) {
            console.error('[EventProcessing] Action execution failed:', error);
            response.message += `\n\n(Action failed: ${error instanceof Error ? error.message : String(error)})`;
          }
        }
      }

      // Update history
      this.recentHistory.push({ role: 'user', content: text });
      this.recentHistory.push({ role: 'assistant', content: response.message });

      while (this.recentHistory.length > this.MAX_HISTORY_LENGTH) {
        this.recentHistory.shift();
      }

      // Persist assistant response
      await this.eventModel.create({
        user_id: metadata.user_id || 'user',
        type: 'assistant_message',
        title: 'Assistant Message',
        start_time: new Date(),
        source: 'chat',
        content: response.message,
        participants: [],
        metadata: {
          role: 'assistant',
          actionPlan: response.actionPlan
        }
      });

      return response;

    } catch (error) {
      console.error('[EventProcessing] Error processing user message:', error);
      throw error;
    }
  }

  private mapActionToSchema(actionPlan: any): any {
    const { action, parameters } = actionPlan;

    if (!action) {
      throw new Error('Invalid action plan: "action" field is missing');
    }

    // Email Actions
    if (action === 'sendEmail' || action === 'send_email') {
      return {
        op: 'send_email',
        args: {
          to: Array.isArray(parameters.to) ? parameters.to : [parameters.recipient || parameters.to || parameters.recipient_email],
          subject: parameters.subject,
          body: parameters.message || parameters.body
        }
      };
    }

    if (action === 'draftEmail' || action === 'draft_email') {
      return {
        op: 'draft_email',
        args: {
          to: Array.isArray(parameters.to) ? parameters.to : [parameters.recipient || parameters.to || parameters.recipient_email],
          subject: parameters.subject,
          body: parameters.message || parameters.body
        }
      };
    }

    // Calendar Actions
    if (action === 'createCalendarEvent' || action === 'create_calendar_event') {
      // Parse time parameters - handle various formats from LLM
      const startTime = this.parseDateTime(parameters.start_time || parameters.start || parameters.startTime || parameters.event_time);
      const endTime = this.parseDateTime(parameters.end_time || parameters.end || parameters.endTime, startTime);

      // Ensure attendees is an array of valid email addresses
      // The LLM might return names instead of emails, so we filter those out
      let attendees: string[] | undefined;
      if (parameters.attendees) {
        const rawAttendees = Array.isArray(parameters.attendees)
          ? parameters.attendees
          : [parameters.attendees];

        // Filter to only valid email addresses
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const validEmails = rawAttendees.filter((a: string) => emailRegex.test(a));

        if (validEmails.length > 0) {
          attendees = validEmails;
        } else {
          // No valid emails found - calendar event will be created without invites
          console.log('[EventProcessing] No valid email addresses in attendees, creating event without invites');
        }
      }

      return {
        op: 'create_calendar_event',
        args: {
          summary: parameters.summary || parameters.title || parameters.event_title || parameters.description || 'Meeting',
          start: startTime,
          end: endTime,
          attendees,
          description: parameters.description || parameters.notes,
          location: parameters.location
        }
      };
    }

    if (action === 'listCalendarEvents' || action === 'list_calendar_events') {
      return {
        op: 'list_calendar_events',
        args: {
          timeMin: parameters.timeMin || parameters.start,
          timeMax: parameters.timeMax || parameters.end,
          maxResults: parameters.maxResults || parameters.limit
        }
      };
    }

    if (action === 'updateCalendarEvent' || action === 'update_calendar_event') {
      return {
        op: 'update_calendar_event',
        args: {
          eventId: parameters.eventId || parameters.event_id,
          summary: parameters.summary || parameters.title,
          start: parameters.start ? this.parseDateTime(parameters.start) : undefined,
          end: parameters.end ? this.parseDateTime(parameters.end) : undefined,
          description: parameters.description
        }
      };
    }

    if (action === 'deleteCalendarEvent' || action === 'delete_calendar_event') {
      return {
        op: 'delete_calendar_event',
        args: {
          eventId: parameters.eventId || parameters.event_id
        }
      };
    }

    // Slack Actions
    if (action === 'slackMessage' || action === 'slack_message') {
      return {
        op: 'slack_message',
        args: {
          channel: parameters.channel,
          text: parameters.text || parameters.message,
          threadTs: parameters.threadTs || parameters.thread_ts
        }
      };
    }

    if (action === 'slackReply' || action === 'slack_reply') {
      return {
        op: 'slack_reply',
        args: {
          channel: parameters.channel,
          text: parameters.text || parameters.message,
          threadTs: parameters.threadTs || parameters.thread_ts
        }
      };
    }

    if (action === 'slackDm' || action === 'slack_dm') {
      return {
        op: 'slack_dm',
        args: {
          userId: parameters.userId || parameters.user_id || parameters.user,
          text: parameters.text || parameters.message
        }
      };
    }

    // Notion Actions
    if (action === 'notionCreatePage' || action === 'notion_create_page') {
      return {
        op: 'notion_create_page',
        args: {
          parentId: parameters.parentId || parameters.parent_id,
          title: parameters.title,
          content: parameters.content
        }
      };
    }

    if (action === 'notionUpdatePage' || action === 'notion_update_page') {
      return {
        op: 'notion_update_page',
        args: {
          pageId: parameters.pageId || parameters.page_id,
          properties: parameters.properties
        }
      };
    }

    if (action === 'notionQueryDatabase' || action === 'notion_query_database') {
      return {
        op: 'notion_query_database',
        args: {
          databaseId: parameters.databaseId || parameters.database_id,
          filter: parameters.filter
        }
      };
    }

    if (action === 'notionCreateDatabaseEntry' || action === 'notion_create_database_entry') {
      return {
        op: 'notion_create_database_entry',
        args: {
          databaseId: parameters.databaseId || parameters.database_id,
          properties: parameters.properties
        }
      };
    }

    // GitHub Actions
    if (action === 'githubCreateIssue' || action === 'github_create_issue') {
      return {
        op: 'github_create_issue',
        args: {
          owner: parameters.owner,
          repo: parameters.repo || parameters.repository,
          title: parameters.title,
          body: parameters.body || parameters.description,
          labels: parameters.labels
        }
      };
    }

    if (action === 'githubCreatePr' || action === 'github_create_pr') {
      return {
        op: 'github_create_pr',
        args: {
          owner: parameters.owner,
          repo: parameters.repo || parameters.repository,
          title: parameters.title,
          head: parameters.head || parameters.sourceBranch,
          base: parameters.base || parameters.targetBranch,
          body: parameters.body || parameters.description
        }
      };
    }

    if (action === 'githubCommentIssue' || action === 'github_comment_issue') {
      return {
        op: 'github_comment_issue',
        args: {
          owner: parameters.owner,
          repo: parameters.repo || parameters.repository,
          issueNumber: parameters.issueNumber || parameters.issue_number,
          body: parameters.body || parameters.comment
        }
      };
    }

    if (action === 'githubCloseIssue' || action === 'github_close_issue') {
      return {
        op: 'github_close_issue',
        args: {
          owner: parameters.owner,
          repo: parameters.repo || parameters.repository,
          issueNumber: parameters.issueNumber || parameters.issue_number
        }
      };
    }

    // Browser Actions (mostly pass-through but with validation)
    if (action === 'openUrl' || action === 'open_url') {
      return {
        op: 'open_url',
        args: {
          url: parameters.url
        }
      };
    }

    // Default mapping for other actions (assuming simple snake_case conversion if needed)
    // This might need more specific mappings for other actions
    return {
      op: action.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, ''), // camelCase to snake_case
      args: parameters
    };
  }

  /**
   * Parse a datetime string to ISO 8601 format.
   * Handles various formats like "today 2pm", "tomorrow 3pm", "2024-01-15T14:00:00", etc.
   */
  private parseDateTime(input: string | undefined, referenceTime?: string): string {
    if (!input) {
      // If we have a reference time (for end_time), default to 1 hour after it
      if (referenceTime) {
        const endDate = new Date(referenceTime);
        endDate.setHours(endDate.getHours() + 1);
        return endDate.toISOString();
      }
      // Otherwise default to 1 hour from now
      const now = new Date();
      now.setHours(now.getHours() + 1);
      now.setMinutes(0, 0, 0);
      return now.toISOString();
    }

    // If already in ISO format, return as is
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(input)) {
      return input;
    }

    const now = new Date();
    let targetDate = new Date(now);
    let hours = 9; // default to 9am
    let minutes = 0;

    const inputLower = input.toLowerCase();

    // Parse day
    if (inputLower.includes('tomorrow')) {
      targetDate.setDate(targetDate.getDate() + 1);
    } else if (inputLower.includes('next week')) {
      targetDate.setDate(targetDate.getDate() + 7);
    }
    // "today" or no day specified keeps current date

    // Parse time
    const timeMatch = inputLower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (timeMatch) {
      hours = parseInt(timeMatch[1], 10);
      minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;

      if (timeMatch[3] === 'pm' && hours < 12) {
        hours += 12;
      } else if (timeMatch[3] === 'am' && hours === 12) {
        hours = 0;
      }
    }

    targetDate.setHours(hours, minutes, 0, 0);

    // If this is an end time and we have a reference, ensure it's after the start
    if (referenceTime) {
      const startDate = new Date(referenceTime);
      if (targetDate <= startDate) {
        // Default to 1 hour after start
        targetDate = new Date(startDate);
        targetDate.setHours(targetDate.getHours() + 1);
      }
    }

    return targetDate.toISOString();
  }

  private async executeActionPlan(actionPlan: any): Promise<void> {
    const actionServiceUrl = process.env.ACTION_SERVICE_URL || 'http://localhost:4004'; // Default to port 4004
    const url = `${actionServiceUrl}/action/v1/execute`;

    // Normalize to array of actions
    let mappedActions: any[] = [];

    if (Array.isArray(actionPlan.steps)) {
      // Multi-step format
      for (const step of actionPlan.steps) {
        mappedActions.push(this.mapActionToSchema(step));
      }
    } else if (actionPlan.action) {
      // Legacy single-action format
      mappedActions.push(this.mapActionToSchema(actionPlan));
    } else {
      throw new Error('Invalid action plan format: missing "steps" array or "action" field');
    }

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ plan: mappedActions })
      });
    } catch (error) {
      console.error('[EventProcessing] Failed to connect to Action Service:', error);
      throw new Error(`Failed to connect to Action Service at ${actionServiceUrl}. Is it running?`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Action Service returned ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    if (result.status === 'failed' || result.status === 'partial') {
      const errors = result.steps
        .filter((s: any) => s.status === 'failed')
        .map((s: any) => `${s.op}: ${s.error}`)
        .join(', ');

      let errorMessage = `Action execution failed: ${errors}`;
      if (errors.includes('Authentication required')) {
        errorMessage += ` Please visit ${actionServiceUrl}/auth/url to log in.`;
      }
      throw new Error(errorMessage);
    } else if (result.status === 'pending_approval') {
      throw new Error('Action requires approval (pending_approval). Please check the server logs.');
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