declare module '@ellipsa/memory' {
  export class EntityModel {
    createIfNotExists(entity: {
      name: string;
      type: string;
      metadata: Record<string, unknown>;
    }): Promise<{ id: string }>;
    
    update(id: string, data: { metadata: Record<string, unknown> }): Promise<void>;
    
    createRelationship(
      sourceId: string,
      targetId: string,
      type: string,
      metadata?: Record<string, unknown>
    ): Promise<void>;
  }

  export class EventModel {
    create(event: {
      type: string;
      source: string;
      timestamp: Date;
      metadata: Record<string, unknown>;
      participants: string[];
    }): Promise<void>;
    
    updateByEmailId(emailId: string, updates: Record<string, unknown>): Promise<void>;
    
    findByThreadId(threadId: string): Promise<Array<{
      id: string;
      metadata: {
        emailId: string;
        threadId: string;
        subject: string;
        sender: string;
        recipients: string[];
        body: string;
        isRead: boolean;
        labels: string[];
        status?: string;
      };
      timestamp: string;
    }>>;
  }

  export class Neo4jService {
    constructor(config: any);
  }

  export class ChromaClient {
    constructor(config: any);
  }
}
