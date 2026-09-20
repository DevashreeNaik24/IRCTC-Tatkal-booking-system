import CircuitBreaker from 'opossum';
import { logger } from '../config/logger';

interface BreakerOptions {
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
  volumeThreshold?: number;
}

const defaultOptions: BreakerOptions = {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  volumeThreshold: 10,
};

/**
 * Create a named circuit breaker around an async function.
 * State transitions are logged so outages are visible in structured logs.
 */
export function createCircuitBreaker<T extends unknown[], R>(
  name: string,
  fn: (...args: T) => Promise<R>,
  options: BreakerOptions = {}
): CircuitBreaker<T, R> {
  const breaker = new CircuitBreaker(fn, { ...defaultOptions, ...options });

  breaker.on('open', () => logger.error({ name }, 'Circuit breaker OPEN — failing fast'));
  breaker.on('halfOpen', () => logger.warn({ name }, 'Circuit breaker HALF-OPEN — probing'));
  breaker.on('close', () => logger.info({ name }, 'Circuit breaker CLOSED — healthy'));
  breaker.on('fallback', (result) => logger.warn({ name, result }, 'Circuit breaker fallback used'));
  breaker.on('failure', (err) => logger.error({ err, name }, 'Circuit breaker failure'));

  return breaker;
}

/**
 * Fallback used when the payment gateway circuit is open:
 * returns a deterministic gateway-declined outcome so the booking
 * fails gracefully instead of hanging.
 */
export const paymentGatewayFallback = async (): Promise<{ declined: boolean }> => ({
  declined: true,
});

export const paymentGatewayBreaker = createCircuitBreaker(
  'payment-gateway',
  async (input: { paymentId: string; outcome: 'success' | 'failure' }) => {
    // Simulated external gateway call — replace with a real HTTP call in production.
    await new Promise((resolve) => setTimeout(resolve, 150 + Math.random() * 200));
    return { declined: input.outcome === 'failure' };
  },
  { timeout: 2000, errorThresholdPercentage: 30 }
);

/**
 * Circuit breaker around the PostgreSQL write path. Individual queries run
 * through the pool; the breaker guards the *call site* so a failing database
 * doesn't cascade into unbounded connection churn.
 */
export const dbWriteBreaker = createCircuitBreaker(
  'db-write',
  async (fn: () => Promise<unknown>) => fn(),
  { timeout: 5000, errorThresholdPercentage: 60, volumeThreshold: 5 }
);