import type { StoreEnv } from './mcp/env';
import type { Order } from './orders';
import { squareLive, squareMissing } from './square';

export type PaymentDriver = 'test' | 'square';

type DriverEnv = Pick<StoreEnv, 'PAYMENT_DRIVER' | 'SQUARE_ACCESS_TOKEN' | 'SQUARE_ENVIRONMENT' | 'SQUARE_LOCATION_ID' | 'SQUARE_WEBHOOK_SIGNATURE_KEY'>;

export function chosenDriver(env: Partial<DriverEnv> | undefined): string {
  return env?.PAYMENT_DRIVER?.trim() || (env?.SQUARE_ACCESS_TOKEN?.trim() ? 'square' : 'test');
}

export function testPaymentsOn(env: Partial<DriverEnv> | undefined): boolean {
  return chosenDriver(env) === 'test';
}

export function realPaymentsOn(env: Partial<DriverEnv> | undefined): boolean {
  return chosenDriver(env) === 'square' && squareLive({ SQUARE_ENVIRONMENT: env?.SQUARE_ENVIRONMENT }) && !squareMissing(env ?? {});
}

export function paymentDriver(env: StoreEnv): PaymentDriver {
  const driver = chosenDriver(env);
  if (driver === 'test') return 'test';
  if (driver === 'square') {
    const missing = squareMissing(env);
    if (missing) throw new Error(missing);
    return 'square';
  }
  throw new Error(`Payment driver "${driver}" is not set up yet.`);
}

export function paymentUrl(order: Order): string | null {
  if (order.payment_driver === 'square') return order.provider_pay_url;
  return `/pay/test/${encodeURIComponent(order.number)}?key=${order.access_key}`;
}

export function orderUrl(order: Pick<Order, 'number' | 'access_key'>): string {
  return `/order/${encodeURIComponent(order.number)}?key=${order.access_key}`;
}
