<script lang="ts">
  import { money } from '$lib/money';
  import { photoSrc } from '$lib/photos';
  import { fullAddress, leadTime } from '$lib/settings';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const s = $derived(data.settings);
  const o = $derived(data.order);
  const paid = $derived(o.status !== 'pending_payment' && o.status !== 'cancelled');
  const lead = $derived(leadTime(s));
  const statusLabel: Record<string, string> = {
    paid: 'Paid. We’re ordering it for you.',
    ordered: 'Ordered. We’ll email you when it’s in.',
    ready: 'Ready for pickup',
    picked_up: 'Picked up',
  };
</script>

<svelte:head>
  <title>Order {o.number} | {s.store.name}</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="page">
  <div class="wrap paytest">
    <div class="panel done">
      {#if paid}
        <div class="check"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-check" /></svg></div>
        <h2>Thank <span class="script pk">you!</span></h2>
        <p>Your order <b>{o.number}</b> is in. We'll email you at {o.email}.</p>
        {#if o.is_test}<p class="notice">This was a <b>test</b> order. No money was taken.</p>{/if}
        <p><b>Status:</b> {statusLabel[o.status]}</p>
      {:else if o.status === 'cancelled'}
        <h2>Order <span class="script pk">cancelled</span></h2>
        <p>{o.cancel_reason}</p>
      {:else}
        <h2>Not finished <span class="script pk">yet</span></h2>
        <p>This checkout wasn't paid.</p>
        {#if data.payUrl}<a class="btn btn-hot" href={data.payUrl}>Finish paying</a>{/if}
      {/if}
      <ul class="oitems">
        {#each o.items as item}
          <li>
            {#if item.photo_key}<img src={photoSrc(item.photo_key, 'thumb', data.resizing)} alt="" />{:else}<span></span>{/if}<span
              >{item.name}{#if item.quantity > 1}&nbsp;× {item.quantity}{/if}</span
            ><span>{money(item.line_total_cents)}</span>
          </li>
        {/each}
      </ul>
      <div class="sumrow total"><span>Total</span><span>{money(o.total_cents)}</span></div>
      {#if paid}
        <div style="text-align:left;margin-top:16px">
          <p>
            <b>What's next:</b>
            {#if s.catalog.made_to_order}Ordered just for you{lead ? `, ready in about ${lead}` : ''}.{/if} We'll email you when it's ready. Then come by {fullAddress(s)}{#if s.store.address_note}
              ({s.store.address_note}){/if}.
          </p>
          {#if s.fulfillment.pickup_instructions}<p>{s.fulfillment.pickup_instructions}</p>{/if}
        </div>
      {/if}
      <a class="btn btn-line" style="margin-top:10px" href="/#shop">Keep shopping</a>
    </div>
  </div>
</div>
