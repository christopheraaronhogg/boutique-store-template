<script lang="ts">
  import Summary from '$lib/components/Summary.svelte';
  import { fullAddress, leadTime } from '$lib/settings';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  const s = $derived(data.settings);
  const lead = $derived(leadTime(s));
  const v = $derived(form?.customer);
  const e = $derived(form?.errors ?? {});
</script>

<svelte:head>
  <title>Check out | {s.store.name}</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="page">
  <div class="wrap">
    <div class="head" style="margin-bottom:18px"><h2>Check <span class="script pk">out</span></h2></div>
    {#each data.notes as n}<div class="notice" role="status">{n}</div>{/each}
    {#if form?.errors}<div class="notice sorry" role="alert">Please check the highlighted fields below.</div>{/if}
    <div class="bagpage">
      <form class="panel co" method="post" novalidate>
        <fieldset>
          <legend>How do you want to get it?</legend>
          <label class="opt"
            ><input type="radio" name="fulfillment" value="pickup" checked /><span><b>Pick up at the store</b><small>{fullAddress(s)} · Free</small></span></label
          >
        </fieldset>
        <div class="field">
          <label for="customer_name">Your name</label><input
            id="customer_name"
            name="customer_name"
            autocomplete="name"
            value={v?.customer_name ?? ''}
            required
            aria-invalid={e.customer_name ? 'true' : 'false'}
          />{#if e.customer_name}<span class="err">{e.customer_name}</span>{/if}
        </div>
        <div class="field">
          <label for="email">Email</label><input
            id="email"
            name="email"
            type="email"
            autocomplete="email"
            inputmode="email"
            value={v?.email ?? ''}
            required
            aria-invalid={e.email ? 'true' : 'false'}
          /><span class="hint">Your receipt and pickup email go here.</span>{#if e.email}<span class="err">{e.email}</span>{/if}
        </div>
        <div class="field">
          <label for="phone">Phone</label><input
            id="phone"
            name="phone"
            type="tel"
            autocomplete="tel"
            inputmode="tel"
            value={v?.phone ?? ''}
            required
            aria-invalid={e.phone ? 'true' : 'false'}
          />{#if e.phone}<span class="err">{e.phone}</span>{/if}
        </div>
        <div class="field">
          <label for="customer_note">Note for the shop (optional)</label><textarea id="customer_note" name="customer_note" rows="2">{v?.customer_note ?? ''}</textarea>
        </div>
        {#if s.catalog.made_to_order}
          <p class="leadbox">
            <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-clock" /></svg><span
              ><b>Ordered just for you</b>{lead ? `Ready in about ${lead}. ` : ''}We'll email you when it's in.</span
            >
          </p>
        {/if}
        <button class="btn btn-hot" type="submit" style="font-size:18px;min-height:56px">Continue to payment</button>
        <p class="smallnote">Returns, pickup and privacy: see our <a href="/policies" style="text-decoration:underline">store policies</a>.</p>
      </form>
      <Summary
        lines={data.lines.map((l) => ({ name: l.product.name, photo: l.product.photos[0]?.key ?? null, qty: l.qty, line: l.line }))}
        total={data.subtotal}
        resizing={data.resizing}
      />
    </div>
  </div>
</div>
