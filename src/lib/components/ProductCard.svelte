<script lang="ts">
  import type { Product } from '$lib/server/catalog';
  import { photoSrc } from '$lib/photos';
  import Price from './Price.svelte';

  let { product, resizing }: { product: Product; resizing: boolean } = $props();
  const photo = $derived(product.photos[0]);
  const onSale = $derived(product.sale_price_cents !== null && product.sale_price_cents < product.price_cents);
  const blurb = $derived.by(() => {
    const first = product.description.split('\n')[0] ?? '';
    return first.length > 60 ? `${first.slice(0, 60).trimEnd()}...` : first;
  });
</script>

<article class="card" data-cat={product.category_slug}>
  <a class="cardlink" href="/p/{product.slug}">
    <div class="ph" class:sold={product.sold_out} style="background:var(--blush)">
      {#if photo}<img src={photoSrc(photo.key, 'medium', resizing)} alt={product.name} loading="lazy" decoding="async" />{/if}
      {#if product.is_sample}<span class="tag">Sample</span>{/if}
      {#if product.sold_out}<span class="soldtag">Sold</span>{:else if onSale}<span class="soldtag">Sale</span>{/if}
    </div>
    <div class="cb">
      {#if product.category_name}<span class="k">{product.category_name}</span>{/if}
      <h3>{product.name}</h3>
      {#if blurb}<p>{blurb}</p>{/if}
      <div class="foot"><span class="price"><Price price={product.price_cents} sale={product.sale_price_cents} /></span></div>
    </div>
  </a>
  <div class="cb" style="padding-top:0;flex:0">
    {#if product.sold_out}
      <button class="add" type="button" disabled>Sold</button>
    {:else}
      <form method="post" action="/bag?/add">
        <input type="hidden" name="product_id" value={product.id} />
        <button class="add" type="submit" style="width:100%">Add to bag <span class="visually-hidden">: {product.name}</span></button>
      </form>
    {/if}
  </div>
</article>
