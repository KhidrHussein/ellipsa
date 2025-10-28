import dotenv from 'dotenv';

dotenv.config();

export interface EmailConfig {
  // Gmail API configuration
  gmail: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    accessToken?: string;
    refreshToken?: string;
  };
  
  // Processing configuration
  processing: {
    checkInterval: number; // in milliseconds
    maxEmailsPerCheck: number;
    autoRespond: boolean;
    defaultCategories: string[];
  };
  
  // AI/LLM configuration
  ai: {
    model: string;
    temperature: number;
    maxTokens: number;
  };
  
  // Monitoring configuration
  monitoring: {
    enabled: boolean;
    logLevel: 'error' | 'warn' | 'info' | 'debug';
    metricsPort: number;
  };
}

// Default configuration
const defaultConfig: EmailConfig = {
  gmail: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback',
    accessToken: process.env.GOOGLE_ACCESS_TOKEN,
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
  },
  processing: {
    checkInterval: parseInt(process.env.EMAIL_CHECK_INTERVAL || '300000', 10), // 5 minutes
    maxEmailsPerCheck: parseInt(process.env.MAX_EMAILS_PER_CHECK || '10', 10),
    autoRespond: process.env.AUTO_RESPOND === 'true',
    defaultCategories: ['inbox', 'unread']
  },
  ai: {
    model: process.env.AI_MODEL || 'gpt-4',
    temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || '1000', 10)
  },
  monitoring: {
    enabled: process.env.MONITORING_ENABLED !== 'false',
    logLevel: (process.env.LOG_LEVEL as any) || 'info',
    metricsPort: parseInt(process.env.METRICS_PORT || '9090', 10)
  }
};

// Validate required configuration
const validateConfig = (config: EmailConfig) => {
  if (!config.gmail.clientId || !config.gmail.clientSecret) {
    throw new Error('Missing required Gmail API credentials');
  }
  
  if (!config.gmail.accessToken || !config.gmail.refreshToken) {
    console.warn('No access/refresh tokens provided. You may need to authenticate.');
  }
  
  return config;
};

export const getConfig = (): EmailConfig => {
  return validateConfig({
    ...defaultConfig,
    // Allow environment variables to override defaults
    gmail: {
      ...defaultConfig.gmail,
      clientId: process.env.GOOGLE_CLIENT_ID || defaultConfig.gmail.clientId,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || defaultConfig.gmail.clientSecret,
      redirectUri: process.env.GOOGLE_REDIRECT_URI || defaultConfig.gmail.redirectUri,
      accessToken: process.env.GOOGLE_ACCESS_TOKEN || defaultConfig.gmail.accessToken,
      refreshToken: process.env.GOOGLE_REFRESH_TOKEN || defaultConfig.gmail.refreshToken,
    },
    processing: {
      ...defaultConfig.processing,
      checkInterval: process.env.EMAIL_CHECK_INTERVAL 
        ? parseInt(process.env.EMAIL_CHECK_INTERVAL, 10) 
        : defaultConfig.processing.checkInterval,
      maxEmailsPerCheck: process.env.MAX_EMAILS_PER_CHECK
        ? parseInt(process.env.MAX_EMAILS_PER_CHECK, 10)
        : defaultConfig.processing.maxEmailsPerCheck,
      autoRespond: process.env.AUTO_RESPOND
        ? process.env.AUTO_RESPOND === 'true'
        : defaultConfig.processing.autoRespond,
    },
    ai: {
      ...defaultConfig.ai,
      model: process.env.AI_MODEL || defaultConfig.ai.model,
      temperature: process.env.AI_TEMPERATURE
        ? parseFloat(process.env.AI_TEMPERATURE)
        : defaultConfig.ai.temperature,
      maxTokens: process.env.AI_MAX_TOKENS
        ? parseInt(process.env.AI_MAX_TOKENS, 10)
        : defaultConfig.ai.maxTokens
    },
    monitoring: {
      ...defaultConfig.monitoring,
      enabled: process.env.MONITORING_ENABLED
        ? process.env.MONITORING_ENABLED === 'true'
        : defaultConfig.monitoring.enabled,
      logLevel: (process.env.LOG_LEVEL as any) || defaultConfig.monitoring.logLevel,
      metricsPort: process.env.METRICS_PORT
        ? parseInt(process.env.METRICS_PORT, 10)
        : defaultConfig.monitoring.metricsPort
    }
  });
};

// Export the validated configuration
export const config = getConfig();
