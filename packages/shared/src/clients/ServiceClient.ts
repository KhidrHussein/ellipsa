import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { logger } from '../utils/logger.js';

declare const process: {
  env: {
    NODE_ENV?: string;
  };
};

export class ServiceClient {
  private client: AxiosInstance;
  private serviceName: string;
  private retryAttempts: number;
  private circuitBreaker: {
    isOpen: boolean;
    failureCount: number;
    lastFailure: number;
  };

  constructor(serviceName: string, baseURL: string, timeout = 5000) {
    this.serviceName = serviceName;
    this.retryAttempts = 3;
    this.circuitBreaker = {
      isOpen: false,
      failureCount: 0,
      lastFailure: 0,
    };

    this.client = axios.create({
      baseURL,
      timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.info(`[${this.serviceName}] Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error(`[${this.serviceName}] Request Error:`, error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const { config, response } = error;
        
        // Update circuit breaker state
        this.updateCircuitBreakerState(true);
        
        // If circuit is open, reject immediately
        if (this.circuitBreaker.isOpen) {
          return Promise.reject(new Error('Service unavailable: Circuit breaker open'));
        }

        // Retry logic
        if (config && this.shouldRetry(error)) {
          config.retryCount = config.retryCount || 0;
          
          if (config.retryCount < this.retryAttempts) {
            config.retryCount += 1;
            const delay = Math.pow(2, config.retryCount) * 1000; // Exponential backoff
            
            logger.warn(`[${this.serviceName}] Retry ${config.retryCount}/${this.retryAttempts} for ${config.url}`);
            
            return new Promise((resolve) => 
              setTimeout(() => resolve(this.client(config)), delay)
            );
          }
        }

        return Promise.reject(error);
      }
    );
  }

  private shouldRetry(error: any): boolean {
    // Only retry on network errors or 5xx responses
    return !error.response || (error.response.status >= 500 && error.response.status < 600);
  }

  private updateCircuitBreakerState(failed: boolean) {
    const now = Date.now();
    const resetTimeout = 60000; // 1 minute

    if (failed) {
      this.circuitBreaker.failureCount += 1;
      this.circuitBreaker.lastFailure = now;

      // Open circuit if too many failures
      if (this.circuitBreaker.failureCount >= 5) {
        this.circuitBreaker.isOpen = true;
        logger.error(`[${this.serviceName}] Circuit breaker opened`);
        
        // Schedule reset
        setTimeout(() => {
          this.circuitBreaker.isOpen = false;
          this.circuitBreaker.failureCount = 0;
          logger.info(`[${this.serviceName}] Circuit breaker reset`);
        }, resetTimeout);
      }
    } else {
      // Reset on successful request
      this.circuitBreaker.failureCount = 0;
      if (this.circuitBreaker.isOpen) {
        this.circuitBreaker.isOpen = false;
        logger.info(`[${this.serviceName}] Circuit breaker closed`);
      }
    }
  }

  async request<T = any>(config: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.client.request<T>(config);
      this.updateCircuitBreakerState(false);
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError;
      logger.error(`[${this.serviceName}] Request failed:`, {
        url: config.url,
        method: config.method,
        status: axiosError.response?.status,
        statusText: axiosError.response?.statusText,
        data: axiosError.response?.data,
      });
      throw error;
    }
  }
}
