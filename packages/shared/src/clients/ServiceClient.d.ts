import { AxiosRequestConfig } from 'axios';
export declare class ServiceClient {
    private client;
    private serviceName;
    private retryAttempts;
    private circuitBreaker;
    constructor(serviceName: string, baseURL: string, timeout?: number);
    private setupInterceptors;
    private shouldRetry;
    private updateCircuitBreakerState;
    request<T = any>(config: AxiosRequestConfig): Promise<T>;
}
//# sourceMappingURL=ServiceClient.d.ts.map