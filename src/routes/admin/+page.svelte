<script lang="ts">
  import { money } from '$lib/money';
  import { nextStatuses, type OrderStatus } from '$lib/orderStatus';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  const tabs = [
    ['open', 'To do'],
    ['pending_payment', 'Not paid'],
    ['picked_up', 'Picked up'],
    ['cancelled', 'Cancelled'],
    ['all', 'All'],
  ] as const;
  const label: Record<OrderStatus, string> = {
    pending_payment: 'Not paid',
    paid: 'Paid, order it',
    ordered: 'Ordered',
    ready: 'Ready',
    picked_up: 'Picked up',
    cancelled: 'Cancelled',
  };
  const button: Partial<Record<OrderStatus, string>> = { ordered: 'I ordered it', ready: 'It’s here, ready', picked_up: 'Picked up' };
</script>

<h1>Orders</h1>
<nav class="tabs" aria-label="Which orders">
  {#each tabs as [key, name]}<a href="/admin?show={key}" aria-current={data.show === key ? 'true' : 'false'}>{name}</a>{/each}
</nav>
{#if form && 'done' in form}<p class="flash" role="status">{form.done}</p>{/if}
{#if form && 'problem' in form}<p class="oops" role="alert">{form.problem}</p>{/if}

{#if data.orders.length === 0}
  <p class="empty">{data.show === 'open' ? 'Nothing to do right now.' : 'No orders here.'}</p>
{:else}
  <ul class="rows">
    {#each data.orders as o (o.number)}
      <li>
        <div class="grow">
          <div>
            <span class="title">{o.number}</span><span class="pill {o.status}">{label[o.status]}</span>{#if o.is_test}<span class="pill">Test</span>{/if}
          </div>
          <div class="meta">
            {o.customer_name} · <a href="tel:{o.phone.replace(/[^\d+]/g, '')}">{o.phone}</a> · <a href="mailto:{o.email}">{o.email}</a>
          </div>
          <div class="meta">
            {#each o.items as item, i}{i ? ', ' : ''}{item.name}{item.quantity > 1 ? ` × ${item.quantity}` : ''}{/each} · <b>{money(o.total_cents)}</b> · {o.created_at.slice(0, 10)}
          </div>
          {#if o.customer_note}<div class="meta">Note: {o.customer_note}</div>{/if}
          {#if o.cancel_reason}<div class="meta">Cancelled: {o.cancel_reason}</div>{/if}
          {#if nextStatuses(o.status).length}
            <div class="acts">
              {#each nextStatuses(o.status).filter((s) => s !== 'cancelled') as to}
                <form method="post" action="?/move">
                  <input type="hidden" name="number" value={o.number} /><input type="hidden" name="to" value={to} />
                  <button class="sbtn hot" type="submit">{button[to]}</button>
                </form>
              {/each}
              <form method="post" action="?/move" onsubmit={(e) => { if (!confirm(`Cancel ${o.number}? If it was paid, refund the payment too.`)) e.preventDefault(); }}>
                <input type="hidden" name="number" value={o.number} /><input type="hidden" name="to" value="cancelled" />
                <button class="sbtn warn" type="submit">Cancel order</button>
              </form>
            </div>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
{/if}

<section class="muse" aria-labelledby="muse-h">
  <h2 id="muse-h">Let Muse make changes for you</h2>
  <p>Muse can add purses, change prices, hours, your banner, your story and your photos. Changes show on your website right away.</p>
  <ol>
    <li>In Muse, add a connector and paste this link: <code>{data.muse.url}</code></li>
    <li>Muse opens your store's sign-in. Type your store manager password and tap <b>Allow</b>.</li>
    <li>Ask in your own words. Muse knows how to do all of these:</li>
  </ol>
  <ul>
    {#each data.muse.examples as e}<li>“{e}”</li>{/each}
  </ul>
  <p class="meta">Using an AI helper built into your browser? It can do the same things on these pages while you're signed in.</p>
</section>

