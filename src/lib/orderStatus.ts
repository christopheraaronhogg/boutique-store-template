export type OrderStatus = 'pending_payment' | 'paid' | 'ordered' | 'ready' | 'picked_up' | 'cancelled';

const NEXT: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ['cancelled'],
  paid: ['ordered', 'ready', 'picked_up', 'cancelled'],
  ordered: ['ready', 'picked_up', 'cancelled'],
  ready: ['picked_up', 'cancelled'],
  picked_up: [],
  cancelled: [],
};

export function nextStatuses(status: OrderStatus): OrderStatus[] {
  return NEXT[status];
}
