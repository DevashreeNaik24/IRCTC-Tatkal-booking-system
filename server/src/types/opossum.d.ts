/**
 * Minimal type declarations for `opossum` (circuit breaker).
 *
 * NOTE: `@types/opossum` is intentionally NOT installed — this project lives
 * on an exFAT drive where npm cannot create workspace symlinks/junctions, so
 * `npm install` at the repo root fails. If the project is moved to an NTFS
 * drive, prefer `npm i -D @types/opossum` and delete this file.
 */
declare module 'opossum' {
  export interface CircuitBreakerOptions {
    timeout?: number;
    errorThresholdPercentage?: number;
    resetTimeout?: number;
    volumeThreshold?: number;
    rollingCountTimeout?: number;
    rollingCountBuckets?: number;
    name?: string;
    group?: string;
    cache?: boolean;
    [key: string]: unknown;
  }

  class CircuitBreaker<T extends unknown[] = unknown[], R = unknown> {
    constructor(fn: (...args: T) => Promise<R>, options?: CircuitBreakerOptions);
    fire(...args: T): Promise<R>;
    fallback(fn: (...args: T) => Promise<R> | R): this;
    on(event: 'open' | 'halfOpen' | 'close', listener: () => void): this;
    on(event: 'fallback', listener: (result: unknown) => void): this;
    on(event: 'failure', listener: (err: Error) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
    once(event: 'open' | 'halfOpen' | 'close', listener: () => void): this;
    once(event: string, listener: (...args: unknown[]) => void): this;
    isOpen(): boolean;
    isHalfOpen(): boolean;
    stats: Record<string, unknown>;
  }

  export default CircuitBreaker;
}