<script lang="ts">
  import ProductCard from '$lib/components/ProductCard.svelte';
  import Visit from '$lib/components/Visit.svelte';
  import { moneyShort } from '$lib/money';
  import { photoSrc } from '$lib/photos';
  import { activeBanner, leadTime, motif } from '$lib/settings';
  import { effectivePriceOf } from '$lib/price';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const s = $derived(data.settings);
  const home = $derived(s.home);
  const about = $derived(s.about);
  const banner = $derived(activeBanner(s, data.today));
  const scriptWords = $derived.by(() => {
    const [w1, ...rest] = home.hero_script.trim().split(' ');
    return [w1 ?? '', rest.join(' ')];
  });
  const shown = $derived(data.cat ? data.products.filter((p) => p.category_slug === data.cat) : data.products);
  const lead = $derived(leadTime(s));
  const trustIcon: Record<string, string> = { bag: 'i-bag', star: 'sp', heart: 'i-heart', phone: 'i-phone', clock: 'i-clock' };
  const catIcons: Record<string, string> = {
    bag: '<path d="M4 9h16l-1 11H5z"/><path d="M8 9a4 4 0 0 1 8 0"/>',
    shirt: '<path d="M8 3l4 3 4-3 5 4-3 3v11H6V10L3 7z"/>',
    ring: '<circle cx="12" cy="15" r="6"/><path d="M9 4h6l-3 5z"/>',
    shoe: '<path d="M3 17c4 0 6-2 8-7l3 4c2 2 7 1 7 4v1H3z"/>',
    sparkle: '<path d="M12 3c.8 4.6 3.4 7.2 8 8-4.6.8-7.2 3.4-8 8-.8-4.6-3.4-7.2-8-8 4.6-.8 7.2-3.4 8-8z"/>',
  };
</script>

<svelte:head>
  <link rel="canonical" href="/" />
</svelte:head>

{#if banner}
  <div class="promo">
    <div class="wrap">
      {#if banner.headline}<span class="script">{banner.headline}</span>{/if}
      {#if banner.text}<span>{banner.text}</span>{/if}
      {#if banner.is_sample}<em>Sample banner</em>{/if}
    </div>
  </div>
{/if}

<div class="hero" class:dark={home.hero_style === 'dark'}>
  <div class="glow g1"></div>
  <div class="glow g2"></div>
  <div class="wm script" aria-hidden="true">{home.watermark || 'Charm'}</div>
  <div class="wrap">
    <div class="hcopy">
      {#if s.store.award_text}<span class="badge"><svg width="14" height="14" aria-hidden="true"><use href="#sp" /></svg> {s.store.award_text}</span>{/if}
      <h1>
        <span class="l1">{home.hero_title}</span><span class="script two"
          ><span class="pinkfoil shim">{scriptWords[0]}</span>{#if scriptWords[1]}{' '}<span class="gold shim">{scriptWords[1]}</span>{/if}</span
        >
      </h1>
      {#if home.hero_text}<p>{home.hero_text}</p>{/if}
      <div class="row">
        <a class="btn btn-hot" href="#shop">Shop the purses</a>
        {#if about.enabled}<a class="btn btn-line" href="#about">{about.button || 'About us'}</a>{:else}<a class="btn btn-line" href="#visit">Hours &amp; directions</a>{/if}
      </div>
      {#if home.ticks.length}<ul class="ticks">
          {#each home.ticks as t}<li><svg width="16" height="16" aria-hidden="true"><use href="#sp" /></svg>{t}</li>{/each}
        </ul>{/if}
    </div>
    <div class="stage">
      <div class="frame leo">
        <div class="shot">
          {#if home.hero_photo_key}
            <picture class="shotpic"><img src={photoSrc(home.hero_photo_key, 'large', data.resizing)} alt="" fetchpriority="high" /></picture>
          {:else if home.hero_photo_note}<small>{home.hero_photo_note}</small>
          {/if}
        </div>
      </div>
      <svg class="bigbow" viewBox="0 0 120 70" aria-hidden="true"><use href="#{motif(s)}" /></svg>
      {#if s.store.award_text}
        <svg class="seal" viewBox="0 0 120 120" role="img" aria-label={s.store.award_text}
          ><defs><path id="ring" d="M60 60m-44 0a44 44 0 1 1 88 0a44 44 0 1 1-88 0" /></defs><circle cx="60" cy="60" r="58" fill="#1a1418" /><circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke="#ecd08a"
            stroke-width="1"
          /><text font-family="Jost,sans-serif" font-size="10.500" font-weight="600" letter-spacing="2.400" fill="#ecd08a"
            ><textPath href="#ring">{home.seal_text || s.store.award_text.toUpperCase()}</textPath></text
          ><path d="M60 40c1.700 11.700 8.300 18.300 20 20-11.700 1.700-18.300 8.300-20 20-1.700-11.700-8.300-18.300-20-20 11.700-1.700 18.300-8.300 20-20z" fill="#ecd08a" /></svg
        >
      {/if}
      {#if data.newest.length}
        <div class="justin">
          {#each data.newest as j}
            <a class="ji" href="/p/{j.slug}"
              ><span class="th" style="background:var(--blush);overflow:hidden"
                >{#if j.photos[0]}<img src={photoSrc(j.photos[0].key, 'thumb', data.resizing)} alt="" style="width:100%;height:100%;object-fit:cover" />{/if}</span
              ><span><em>Just in</em><b>{j.name}</b></span><span>{moneyShort(effectivePriceOf(j))}</span></a
            >
          {/each}
        </div>
      {/if}
      <svg class="spark s1" aria-hidden="true"><use href="#sp" /></svg><svg class="spark s2" aria-hidden="true"><use href="#sp" /></svg><svg
        class="spark s3"
        aria-hidden="true"><use href="#sp" /></svg
      >
    </div>
  </div>
  {#if home.ribbon.length}
    <div class="ribbon" aria-hidden="true">
      <div class="track">
        {#each [0, 1] as _}{#each home.ribbon as r}<span>{r}</span><i></i>{/each}{/each}
      </div>
    </div>
  {/if}
</div>

{#if home.trust.length}
  <div class="trust">
    <div class="wrap">
      {#each home.trust as t}
        <div><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#{trustIcon[t.icon] ?? 'sp'}" /></svg><span><b>{t.title}</b>{t.text}</span></div>
      {/each}
    </div>
  </div>
{/if}

<section id="shop">
  <div class="wrap">
    <div class="head">
      <p class="eyebrow">The collection</p>
      <h2>Shop <span class="script pk">purses</span></h2>
      {#if home.shop_note}<p class="sub">{home.shop_note}</p>{/if}
      <div class="div"><svg viewBox="0 0 120 70" aria-hidden="true"><use href="#{motif(s)}" /></svg></div>
    </div>
    {#if data.styles.length > 1}
      <nav class="filters" id="filters" aria-label="Filter purses">
        <a href="/#shop" aria-current={data.cat ? 'false' : 'true'}>All</a>
        {#each data.styles as c}<a href="/?cat={c.slug}#shop" aria-current={data.cat === c.slug ? 'true' : 'false'}>{c.name}</a>{/each}
      </nav>
    {/if}
    <div class="grid" id="grid">
      {#each shown as product (product.id)}<ProductCard {product} resizing={data.resizing} />{/each}
    </div>
    {#if shown.length === 0}<p class="empty-shop">New purses are on the way. Check back soon!</p>{/if}
  </div>
</section>

<section class="band" id="how">
  <div class="wrap">
    <div class="head">
      <p class="eyebrow" style="color:var(--gold2)">How it works</p>
      <h2>No more ordering <span class="script gold">in the comments</span></h2>
      <p class="sub">Pick what you love, pay online, and it's yours.</p>
    </div>
    <div class="steps">
      <div class="step"><b class="gold">1</b><h3>Pick your purse</h3><p>Browse the collection and add your favorites to your bag.</p></div>
      <div class="step"><b class="gold">2</b><h3>Check out online</h3><p>Pay from your phone. You get a confirmation by email.</p></div>
      <div class="step">
        <b class="gold">3</b><h3>Pick it up</h3>
        <p>{#if s.catalog.made_to_order}Ordered just for you{lead ? `, ready in about ${lead}` : ''}. {/if}We'll email you when it's ready. Come by during open hours.</p>
      </div>
    </div>
  </div>
</section>

{#if about.enabled}
  <section id="about" class="about">
    <div class="wrap">
      <div class="aphoto">
        <div class="aback leo"></div>
        <div class="apic">
          {#if about.photo_key}<picture class="apicimg"><img src={photoSrc(about.photo_key, 'large', data.resizing)} alt={`${about.title} ${about.title_script}`.trim()} loading="lazy" /></picture>
          {:else}<svg viewBox="0 0 120 120" fill="none" aria-hidden="true"><circle cx="60" cy="46" r="20" fill="#f3a7c1" /><path d="M22 110c2-24 18-36 38-36s36 12 38 36z" fill="#f3a7c1" /></svg>{#if about.photo_note}<small>{about.photo_note}</small>{/if}
          {/if}
        </div>
        <svg class="abow" viewBox="0 0 120 70" aria-hidden="true"><use href="#{motif(s)}" /></svg>
      </div>
      <div class="acopy">
        <p class="eyebrow">{about.eyebrow}</p>
        <h2>{about.title} <span class="script pk">{about.title_script}</span></h2>
        {#if about.lead}<p class="lead">{about.lead}</p>{/if}
        {#if about.quote}<blockquote>“{about.quote}”{#if about.quote_cite}<cite>{about.quote_cite}</cite>{/if}</blockquote>{/if}
        {#if about.story}
          {#if about.story_is_sample}<p class="ph-note"><em>Sample text.</em> {about.story}</p>
          {:else}<div class="story">{#each about.story.split(/\n+/).filter((p) => p.trim()) as para}<p>{para.trim()}</p>{/each}</div>
          {/if}
        {/if}
        {#if about.facts.length}<div class="facts">{#each about.facts as f}<div><b>{f.big}</b><span>{f.small}</span></div>{/each}</div>{/if}
      </div>
    </div>
  </section>
{/if}

{#if home.in_store_lines.length}
  <section class="more">
    <div class="wrap">
      <div class="head">
        <p class="eyebrow">In the store</p>
        <h2>More to <span class="script pk">love</span></h2>
        <p class="sub">Purses are online first. Come see the rest in person.</p>
      </div>
      <div class="cats">
        {#each home.in_store_lines as g}
          <div class="cat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">{@html catIcons[g.icon] ?? catIcons.sparkle}</svg><b>{g.name}</b><span>In store</span>
          </div>
        {/each}
      </div>
    </div>
  </section>
{/if}

<Visit {s} today={data.today} />
