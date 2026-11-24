<script lang="ts">
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
</script>

<h1>Purses</h1>
<p><a class="btn btn-hot" href="/admin/purses/new">Add a purse</a></p>
<nav class="tabs" aria-label="Which purses">
  {#each tabs as [key, name]}<a href="/admin/purses?show={key}" aria-current={data.show === key ? 'true' : 'false'}>{name}</a>{/each}
</nav>
<form method="get" class="field" style="max-width:420px;margin-bottom:14px">
  <input type="hidden" name="show" value={data.show} />
  <label for="q">Find a purse</label>
  <input id="q" name="q" type="search" value={data.search} placeholder="Name or words in the description" />
</form>
{#if form?.done}<p class="flash" role="status">{form.done}</p>{/if}
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
  <ul class="rows">
    {#each data.purses as p (p.id)}
      <li>
        {#if p.photos[0]}<img class="thumb" src={photoSrc(p.photos[0].key, 'thumb', false)} alt="" loading="lazy" />{:else}<span class="thumb"></span>{/if}
        <div class="grow">
          <a class="title" href="/admin/purses/{p.id}">{p.name}</a>
          {#if p.status !== 'live'}<span class="pill">{p.status}</span>{:else}<span class="pill live">On the site</span>{/if}{#if p.sold_out}<span class="pill sold">Sold</span>{/if}{#if p.is_sample}<span class="pill">Sample</span>{/if}
          <div class="meta">
            {#if p.sale_price_cents}<s>{moneyShort(p.price_cents)}</s> {moneyShort(p.sale_price_cents)}{:else}{moneyShort(p.price_cents)}{/if}{#if p.category_name}{' · '}{p.category_name}{/if} · {p.photos.length}
            {p.photos.length === 1 ? 'photo' : 'photos'}
          </div>
        </div>
      </li>
    {/each}
  </ul>
{/if}
