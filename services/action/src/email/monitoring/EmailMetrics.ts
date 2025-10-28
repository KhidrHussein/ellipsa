import { EventEmitter } from 'events';

export interface MetricsData {
  processed: number;
  errors: number;
  processingTime: {
    total: number;
    count: number;
    average: number;
    min: number;
    max: number;
  };
  lastError: Error | null;
  lastProcessed: Date | null;
  startTime: Date;
  uptime: number;
}

export class EmailMetrics extends EventEmitter {
  private metrics: MetricsData;

  constructor() {
    super();
    this.metrics = this.getDefaultMetrics();
  }

  private getDefaultMetrics(): MetricsData {
    return {
      processed: 0,
      errors: 0,
      processingTime: {
        total: 0,
        count: 0,
        average: 0,
        min: Infinity,
        max: 0
      },
      lastError: null,
      lastProcessed: null,
      startTime: new Date(),
      uptime: 0
    };
  }

  /**
   * Record the start of email processing
   * @returns A function to call when processing is complete
   */
  recordProcessingStart() {
    const startTime = Date.now();
    
    return () => {
      const duration = Date.now() - startTime;
      this.recordProcessingTime(duration);
    };
  }

  /**
   * Record the processing time for an email
   * @param duration Processing time in milliseconds
   */
  recordProcessingTime(duration: number) {
    this.metrics.processed++;
    
    const time = this.metrics.processingTime;
    time.total += duration;
    time.count++;
    time.average = time.total / time.count;
    time.min = Math.min(time.min, duration);
    time.max = Math.max(time.max, duration);
    
    this.metrics.lastProcessed = new Date();
    this.metrics.uptime = Date.now() - this.metrics.startTime.getTime();
    
    this.emit('processed', { duration });
  }

  /**
   * Record an error that occurred during processing
   * @param error The error that occurred
   */
  recordError(error: Error) {
    this.metrics.errors++;
    this.metrics.lastError = error;
    this.metrics.uptime = Date.now() - this.metrics.startTime.getTime();
    
    this.emit('error', error);
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics = this.getDefaultMetrics();
    this.emit('reset');
  }

  /**
   * Get the current metrics
   * @returns A copy of the current metrics
   */
  getMetrics(): MetricsData {
    return {
      ...this.metrics,
      processingTime: { ...this.metrics.processingTime },
      lastError: this.metrics.lastError ? 
        new Error(this.metrics.lastError.message) : 
        null,
      lastProcessed: this.metrics.lastProcessed ? 
        new Date(this.metrics.lastProcessed) : 
        null,
      startTime: new Date(this.metrics.startTime),
      uptime: Date.now() - this.metrics.startTime.getTime()
    };
  }

  /**
   * Get a human-readable summary of the metrics
   */
  getSummary(): string {
    const m = this.metrics;
    const uptimeHours = (m.uptime / (1000 * 60 * 60)).toFixed(2);
    
    return `
Email Processing Metrics:
------------------------
Uptime:           ${uptimeHours} hours
Emails Processed: ${m.processed}
Errors:           ${m.errors}
Processing Time:
  - Average: ${m.processingTime.average.toFixed(2)}ms
  - Min:     ${m.processingTime.min === Infinity ? 0 : m.processingTime.min}ms
  - Max:     ${m.processingTime.max}ms
  - Total:   ${m.processingTime.total}ms
Last Processed:   ${m.lastProcessed?.toISOString() || 'Never'}
Last Error:       ${m.lastError?.message || 'None'}
`;
  }
}
