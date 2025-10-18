// Base service client implementation
type RequestOptions = {
  method: string;
  url: string;
  data?: any;
  headers?: Record<string, string>;
};

class ServiceClient {
  protected client: any; // Will be initialized in constructor
  protected serviceName: string;
  protected baseUrl: string;
  
  // Public method that can be called from anywhere
  public makeRequest(options: RequestOptions) {
    return this.request(options);
  }

  constructor(serviceName: string, baseUrl: string) {
    this.serviceName = serviceName;
    this.baseUrl = baseUrl;
    this.client = this.createHttpClient();
  }

  protected createHttpClient() {
    // Simple fetch-based client - replace with your preferred HTTP client
    return {
      request: async (options: { method: string; url: string; data?: any; headers?: Record<string, string> }) => {
        const { method, url, data, headers = {} } = options;
        const response = await fetch(`${this.baseUrl}${url}`, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: data ? JSON.stringify(data) : undefined,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        return response.json();
      },
    };
  }

  protected async request(options: { 
    method: string; 
    url: string; 
    data?: any;
    headers?: Record<string, string>;
  }) {
    const requestOptions = {
      ...options,
      headers: {
        'X-Service-Name': this.serviceName,
        ...(options.headers || {}),
      },
    };
    
    return this.client.request(requestOptions);
  }
}

// Memory client implementation
export class MemoryClient extends ServiceClient {
  constructor(baseUrl: string) {
    super('MemoryService', baseUrl);
  }

  async storeEvent(event: any) {
    return this.request({
      method: 'POST',
      url: '/events',
      data: event,
    });
  }

  async retrieveEvents(query: string) {
    return this.request({
      method: 'GET',
      url: `/events?query=${encodeURIComponent(query)}`,
    });
  }
}

// Service URLs - these should come from environment variables in production
const SERVICE_URLS = {
  memory: process.env.MEMORY_SERVICE_URL || 'http://localhost:4001',
  processor: process.env.PROCESSOR_SERVICE_URL || 'http://localhost:4002',
  prompt: process.env.PROMPT_SERVICE_URL || 'http://localhost:4003',
  action: process.env.ACTION_SERVICE_URL || 'http://localhost:4004',
};

// Initialize service clients
export const memoryClient = new MemoryClient(SERVICE_URLS.memory);

export class ProcessorClient extends ServiceClient {
  constructor() {
    super('ProcessorService', SERVICE_URLS.processor);
  }

  async processAudio(audioData: ArrayBuffer, metadata: any) {
    try {
      console.log(`Processing audio data (${audioData.byteLength} bytes)...`);
      
      // Convert ArrayBuffer to base64 for transmission
      const base64Audio = Buffer.from(audioData).toString('base64');
      
      // Create an ingest object matching the processor service's expected format
      const ingestData = {
        id: `audio_${Date.now()}`,
        type: 'audio' as const,
        content: '', // Optional field, can be empty for audio
        timestamp: new Date().toISOString(),
        metadata: {
          ...metadata,
          audio_format: 'wav',
          source: 'edge-agent',
          audio_length: audioData.byteLength,
        },
        audio_ref: `data:audio/wav;base64,${base64Audio}`, // Add data URL prefix
        segment_ts: Date.now(),
      };

      console.log('Sending audio to processor service...');
      const response = await this.request({
        method: 'POST',
        url: '/processor/v1/ingest',
        data: ingestData,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log('Audio processing successful:', response);
      return response;
    } catch (error: any) {
      console.error('Error in processAudio:', error);
      
      // Log additional error details if available
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      } else if (error.request) {
        console.error('No response received:', error.request);
      } else {
        console.error('Error setting up request:', error.message);
      }
      
      throw error;
    }
  }

  async processScreenshot(imageData: string, metadata: any) {
    return this.request({
      method: 'POST',
      url: '/process/image',
      data: {
        image: imageData.split('base64,')[1], // Remove data URL prefix
        format: 'png',
        metadata
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}

export const processorClient = new ProcessorClient();

export class ActionClient extends ServiceClient {
  constructor() {
    super('ActionService', SERVICE_URLS.action);
  }

  async executeAction(actionType: string, params: Record<string, any>) {
    console.log(`Executing action: ${actionType}`, params);
    return this.request({
      method: 'POST',
      url: '/actions/execute',
      data: {
        action: actionType,
        params,
        timestamp: new Date().toISOString(),
      },
    });
  }

  async getAvailableActions() {
    return this.request({
      method: 'GET',
      url: '/actions',
    });
  }
}

export const actionClient = new ActionClient();

// Helper function to initialize all services
export async function initializeServices() {
  const services = [
    { name: 'Memory', client: memoryClient, url: SERVICE_URLS.memory },
    { name: 'Processor', client: processorClient, url: SERVICE_URLS.processor },
    { name: 'Action', client: actionClient, url: SERVICE_URLS.action },
  ];

  const results = await Promise.allSettled(
    services.map(({ name, client, url }) => 
      client.makeRequest({ method: 'GET', url: '/health' })
        .then(() => ({ name, url, status: 'fulfilled' }))
        .catch(error => ({ name, url, status: 'rejected', error }))
    )
  );

  const failedServices = results.filter(
    (result): result is PromiseFulfilledResult<{ name: string; url: string; status: string; error?: Error }> => 
      result.status === 'fulfilled' && result.value.status === 'rejected'
  );

  if (failedServices.length > 0) {
    console.error('Failed to connect to the following services:');
    failedServices.forEach(({ value }) => {
      console.error(`- ${value.name} (${value.url}):`, value.error?.message || 'Unknown error');
    });
    
    // Don't block the app if some services are down
    console.warn('Some services are unavailable, but the application will continue to run with limited functionality.');
  }

  const successfulServices = results.filter(
    (result): result is PromiseFulfilledResult<{ name: string; url: string; status: string }> =>
      result.status === 'fulfilled' && result.value.status === 'fulfilled'
  );

  if (successfulServices.length > 0) {
    console.log('Successfully connected to:');
    successfulServices.forEach(({ value }) => {
      console.log(`- ${value.name} (${value.url})`);
    });
  }

  // Return true if at least one service is available
  return successfulServices.length > 0;
}
