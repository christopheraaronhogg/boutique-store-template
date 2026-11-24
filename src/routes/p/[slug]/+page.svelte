<script lang="ts">
  import Price from '$lib/components/Price.svelte';
  import ProductCard from '$lib/components/ProductCard.svelte';
  import { moneyShort } from '$lib/money';
  import { photoSrc } from '$lib/photos';
  import { effectivePriceOf } from '$lib/price';
  import { leadTime, streetLine, telHref } from '$lib/settings';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const s = $derived(data.settings);
  const p = $derived(data.product);
  let current = $state(0);
  const cover = $derived(p.photos[current] ?? p.photos[0]);
  const price = $derived(moneyShort(effectivePriceOf(p)));
  const lead = $derived(leadTime(s));
  const ogDesc = $derived(
    `${price} · ${p.sold_out ? 'Sold. ' : ''}${p.description.replace(/\s+/g, ' ').slice(0, 150)} Order online, pick up at ${s.store.name}.`.trim(),
  );
</script>

<svelte:head>
  <title>{p.name} — {price} | {s.store.name}</title>
  <meta name="description" content={ogDesc} />
  <meta property="og:type" content="product" />
  <meta property="og:site_name" content={s.store.name} />
  <meta property="og:title" content={`${p.name} — ${price}`} />
  <meta property="og:description" content={ogDesc} />
  <meta property="og:url" content={data.url} />
  {#if p.photos[0]}<meta property="og:image" content={new URL(photoSrc(p.photos[0].key, 'large', data.resizing), data.url).href} />{/if}
  <meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<div class="page">
  <div class="wrap">
    <p class="crumbs"><a href="/#shop">Shop</a>{#if p.category_name}{" / "}<a href="/?cat={p.category_slug}#shop">{p.category_name}</a>{/if}</p>
    <div class="pd">
      <div class="gallery">
        <div class="main ph" class:sold={p.sold_out} id="mainphoto">
          {#if cover}<img src={photoSrc(cover.key, 'large', data.resizing)} alt={p.name} width={cover.width || undefined} height={cover.height || undefined} />{/if}
          {#if p.is_sample}<span class="tag">Sample</span>{/if}
          {#if p.sold_out}<span class="soldtag">Sold</span>{/if}
        </div>
        {#if p.photos.length > 1}
          <div class="thumbs" id="thumbs">
            {#each p.photos as ph, i}
              <a
                href={photoSrc(ph.key, 'large', data.resizing)}
                aria-current={i === current ? 'true' : 'false'}
                aria-label={`Photo ${i + 1} of ${p.photos.length}`}
                onclick={(e) => {
                  e.preventDefault();
                  current = i;
                }}><img src={photoSrc(ph.key, 'thumb', data.resizing)} alt="" loading="lazy" /></a
              >
            {/each}
          </div>
        {/if}
      </div>
      <div class="pinfo">
        {#if p.category_name}<p class="eyebrow">{p.category_name}</p>{/if}
        <h1>{p.name}</h1>
        <p class="bigprice"><Price price={p.price_cents} sale={p.sale_price_cents} /></p>
        {#if p.description}<p class="desc">{p.description}</p>{/if}
        {#if p.sold_out}
          <div class="soldbox" role="status"><b>This one sold</b>New things come in all the time. Take a look at what's still available.</div>
          <a class="btn btn-line" href="/#shop">See more purses</a>
        {:else}
          <form method="post" action="/bag?/add">
            <input type="hidden" name="product_id" value={p.id} />
            <button class="btn btn-hot" type="submit">Add to bag</button>
          </form>
          {#if s.catalog.made_to_order}
            <p class="leadbox">
              <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-clock" /></svg><span
                ><b>Ordered just for you</b>{lead ? `Ready in about ${lead}. ` : ''}We'll email you when it's in.</span
              >
            </p>
          {/if}
        {/if}
        <ul class="perks">
          <li>
            <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-bag" /></svg><span
              ><b>Free store pickup</b> at {streetLine(s)}{#if s.store.city}, {s.store.city}{/if}</span
            >
          </li>
          {#if s.store.phone}
            <li><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-phone" /></svg><span>Questions? Call <a href={telHref(s)}>{s.store.phone}</a></span></li>
          {/if}
        </ul>
      </div>
    </div>
    {#if data.more.length}
      <div class="head" style="margin-top:56px"><h2>More to <span class="script pk">love</span></h2></div>
      <div class="grid">{#each data.more as product (product.id)}<ProductCard {product} resizing={data.resizing} />{/each}</div>
    {/if}
  </div>
</div>
