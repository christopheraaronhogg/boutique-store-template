import type { Order } from './orders';

export type PaymentDriver = 'test';

export function testPaymentsOn(driver: string | undefined): boolean {
  return (driver || 'test') === 'test';
}

export function paymentDriver(env: App.Platform['env']): PaymentDriver {
  if (!testPaymentsOn(env.PAYMENT_DRIVER)) {
    throw new Error(`Payment driver "${env.PAYMENT_DRIVER}" is not set up yet.`);
  }
  return 'test';
}

export function paymentUrl(order: Order): string {
  return `/pay/test/${encodeURIComponent(order.number)}?key=${order.access_key}`;
}

export function orderUrl(order: Pick<Order, 'number' | 'access_key'>): string {
  return `/order/${encodeURIComponent(order.number)}?key=${order.access_key}`;
}
