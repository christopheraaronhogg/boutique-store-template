<script lang="ts">
  import { fullAddress, leadTime, telHref } from '$lib/settings';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const s = $derived(data.settings);
  const returns = $derived(s.policies.returns.trim());
  const lead = $derived(leadTime(s));
</script>

<svelte:head>
  <title>Store policies | {s.store.name}</title>
</svelte:head>

<div class="page">
  <div class="wrap">
    <div class="head" style="margin-bottom:18px"><h2>Store <span class="script pk">policies</span></h2></div>
    <div class="panel policy">
      <h3>Returns and exchanges</h3>
      {#if returns}
        {#each returns.split(/\n+/) as para}<p>{para}</p>{/each}
      {:else}
        <p>
          Have a question about a return or an exchange? {#if s.store.phone}Call the store at <a href={telHref(s)}>{s.store.phone}</a> and we will help.{:else}Ask at the store
            and we will help.{/if}
        </p>
      {/if}
    </div>
    {#if s.catalog.made_to_order}
      <div class="panel policy">
        <h3>When your order is ready</h3>
        <p>Each purse is ordered just for you.{lead ? ` It is ready in about ${lead}.` : ''} We email you as soon as it is in.</p>
      </div>
    {/if}
    <div class="panel policy">
      <h3>Getting your order</h3>
      <p><b>Store pickup, free.</b> Pick it up at {fullAddress(s)}. We email you when it is ready.{s.fulfillment.pickup_instructions ? ` ${s.fulfillment.pickup_instructions}` : ''}</p>
    </div>
    <div class="panel policy">
      <h3>Paying</h3>
      <p>You pay by card on a secure payment page. The store never sees or keeps your card number.</p>
    </div>
    <div class="panel policy">
      <h3>Your privacy</h3>
      <ul>
        <li>When you order, we ask for your name, email and phone.</li>
        <li>We use them to fill your order and to email you about it. Nothing else.</li>
        <li>We do not sell your details. We share them only where your order needs it: the payment company gets what it needs to take your payment.</li>
        <li>This site uses only the cookies it needs to remember your bag. No advertising or tracking cookies.</li>
        <li>To see or remove your details, {#if s.store.phone}call the store at <a href={telHref(s)}>{s.store.phone}</a>.{:else}ask at the store.{/if}</li>
      </ul>
    </div>
    <p style="text-align:center;margin-top:18px"><a class="btn btn-hot" href="/#shop">Shop purses</a></p>
  </div>
</div>

<style>
  .policy {
    margin-bottom: 14px;
  }
  .policy h3 {
    margin: 0 0 8px;
    font-size: 19px;
  }
  .policy p {
    margin: 0 0 8px;
  }
  .policy ul {
    margin: 0;
    padding-left: 20px;
  }
  .policy li {
    margin: 6px 0;
  }
  .policy a {
    color: var(--deep);
    text-decoration: underline;
  }
</style>
