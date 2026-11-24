<script lang="ts">
  import { enhance } from '$app/forms';
  import Toast from '$lib/components/admin/Toast.svelte';
  import { moneyShort } from '$lib/money';
  import { photoSrc } from '$lib/photos';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  const tabs = [
    ['all', 'All'],
    ['live', 'On the site'],
    ['draft', 'Drafts'],
    ['hidden', 'Hidden'],
    ['sold', 'Sold'],
  ] as const;
  const here = $derived(`/admin/purses?show=${data.show}${data.search ? `&q=${encodeURIComponent(data.search)}` : ''}`);
  const dollars = (cents: number | null) => (cents ? String(cents / 100) : '');
  const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });
</script>

<div class="headrow">
  <h1>Purses</h1>
  <a class="btn btn-hot addbtn" href="/admin/purses/new">+ Add a purse</a>
</div>
<nav class="tabs" aria-label="Which purses">
  {#each tabs as [key, name]}<a href="/admin/purses?show={key}" aria-current={data.show === key ? 'true' : 'false'}>{name}</a>{/each}
</nav>
<form method="get" class="field findbox">
  <input type="hidden" name="show" value={data.show} />
  <label for="q">Find a purse</label>
  <input id="q" name="q" type="search" value={data.search} placeholder="Name or words in the description" />
</form>
{#if data.samples > 0}
  <form
    method="post"
    action="?/clearSamples"
    class="oops"
    onsubmit={(e) => {
      if (!confirm('Remove all the sample purses? Your own purses stay.')) e.preventDefault();
    }}
  >
    {data.samples} sample {data.samples === 1 ? 'purse is' : 'purses are'} still on the site. <button class="sbtn warn" type="submit">Remove the samples</button>
  </form>
{/if}

{#if data.purses.length === 0}
  <p class="empty">No purses here.</p>
{:else}
  <p class="meta">Use the arrows to change the order shoppers see. The top purse shows first.</p>
  <ul class="rows purses">
    {#each data.purses as p, i (p.id)}
      <li>
        <a class="thumblink" href="/admin/purses/{p.id}" tabindex="-1" aria-hidden="true">
          {#if p.photos[0]}<img class="thumb" src={photoSrc(p.photos[0].key, 'thumb', false)} alt="" loading="lazy" />{:else}<span class="thumb"></span>{/if}
        </a>
        <div class="grow">
          <a class="title" href="/admin/purses/{p.id}">{p.name}</a>
          <div>
            {#if p.status !== 'live'}<span class="pill">{p.status}</span>{:else}<span class="pill live">On the site</span>{/if}{#if p.sold_out}<span class="pill sold">Sold</span>{/if}{#if p.is_sample}<span class="pill">Sample</span>{/if}
          </div>
          <div class="meta">
            {#if p.sale_price_cents}<s>{moneyShort(p.price_cents)}</s> {moneyShort(p.sale_price_cents)}{:else}{moneyShort(p.price_cents)}{/if}{#if p.category_name}{' · '}{p.category_name}{/if} · {p.photos.length}
            {p.photos.length === 1 ? 'photo' : 'photos'}
          </div>
          <div class="acts">
            <form method="post" action="?/quick" use:enhance={keep}>
              <input type="hidden" name="id" value={p.id} />
              {#if p.sold_out}
                <button class="sbtn" name="what" value="unsold" type="submit">For sale again</button>
              {:else}
                <button class="sbtn" name="what" value="sold" type="submit">Mark sold</button>
              {/if}
              {#if p.status === 'live'}
                <button class="sbtn" name="what" value="hide" type="submit">Hide</button>
              {:else}
                <button class="sbtn hot" name="what" value="show" type="submit">Show on site</button>
              {/if}
            </form>
            <details class="quickprice">
              <summary class="sbtn">Price</summary>
              <form method="post" action="?/quick" use:enhance={keep}>
                <input type="hidden" name="id" value={p.id} /><input type="hidden" name="what" value="price" />
                <label>Price <input name="price" inputmode="decimal" value={dollars(p.price_cents)} required /></label>
                <label>Sale <input name="sale_price" inputmode="decimal" value={dollars(p.sale_price_cents)} placeholder="none" /></label>
                <button class="sbtn hot" type="submit">Save</button>
              </form>
            </details>
          </div>
        </div>
        <form method="post" action="?/move" class="mover" use:enhance={keep}>
          <input type="hidden" name="id" value={p.id} />
          <button class="arrow" name="to" value={data.purses[i - 1]?.id ?? ''} type="submit" disabled={i === 0} aria-label="Move {p.name} up">▲</button>
          <button class="arrow" name="to" value={data.purses[i + 1]?.id ?? ''} type="submit" disabled={i === data.purses.length - 1} aria-label="Move {p.name} down">▼</button>
          {#if i > 0}<button class="arrow top" name="to" value="top" type="submit" aria-label="Move {p.name} to the front">Top</button>{/if}
        </form>
      </li>
    {/each}
  </ul>
{/if}

<Toast result={form} back={here} />
