<script lang="ts">
  import { money } from '$lib/money';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const o = $derived(data.order);
</script>

<svelte:head>
  <title>TEST payment</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="page">
  <div class="wrap paytest">
    <div class="panel" style="text-align:center">
      <span class="stamp">Test payment page</span>
      <h2 style="margin-top:12px">This is <span class="script pk">not real</span></h2>
      <p>The store is in preview / test mode. No card is needed and no money will move. At launch, shoppers pay on Square's secure page through the shop's own Square account.</p>
      <div class="card-mock">
        <div class="sumrow"><span>Order</span><span>{o.number}</span></div>
        {#each o.items as item}<div class="sumrow"><span>{item.name}{#if item.quantity > 1}&nbsp;× {item.quantity}{/if}</span><span>{money(item.line_total_cents)}</span></div>{/each}
        <div class="sumrow total"><span>Total</span><span>{money(o.total_cents)}</span></div>
      </div>
      <form method="post" action="?/pay">
        <input type="hidden" name="key" value={o.access_key} />
        <button class="btn btn-hot" style="width:100%;min-height:56px;font-size:18px" type="submit">Pay {money(o.total_cents)} (test)</button>
      </form>
      <form method="post" action="?/cancel" style="margin-top:10px">
        <input type="hidden" name="key" value={o.access_key} />
        <button class="btn btn-line" style="width:100%" type="submit">Go back to my bag</button>
      </form>
    </div>
  </div>
</div>
