<script lang="ts">
  import type { Snippet } from 'svelte';
  import SvgDefs from '$lib/components/SvgDefs.svelte';
  import Lockup from '$lib/components/Lockup.svelte';
  import { fontsUrl, fullAddress, headerLockup, motif, telHref, themeCss } from '$lib/settings';
  import type { LayoutData } from './$types';

  let { data, children }: { data: LayoutData; children: Snippet } = $props();
  const s = $derived(data.settings);
  const lockup = $derived(headerLockup(s));
  const footLogo = $derived(s.store.logo_footer || s.store.logo_tall || s.store.logo);
  const themeTag = $derived(`<style>${themeCss(s)}</style>`);
</script>

<svelte:head>
  <title>{s.store.name}</title>
  <meta name="description" content={`${s.store.name} — ${fullAddress(s)}`} />
  {#if s.store.icon}<link rel="icon" type="image/png" href={s.store.icon} />{/if}
  <link rel="stylesheet" href={fontsUrl(s)} />
  {@html themeTag}
</svelte:head>

<SvgDefs />
{#if data.admin}
  {@render children()}
{:else}
<a class="visually-hidden" href="#main">Skip to content</a>
{#if data.testMode}
  <div class="testbar" role="note"><b>Preview / test mode.</b> No real payments are taken.{#if data.hasSamples}{' Sample purses shown.'}{/if}</div>
{/if}
<header class="top">
  <div class="wrap">
    {#if lockup}
      <a class="brand lockup" href="/" aria-label={s.store.name}><Lockup {lockup} /></a>
    {:else if s.store.logo}
      <a class="brand has-logo" href="/"><img class="brand-logo" class:wide={s.store.logo_wide} src={s.store.logo} alt={s.store.name} /></a>
    {:else}
      <a class="brand" href="/"
        ><svg class="bow" aria-hidden="true"><use href="#{motif(s)}" /></svg><span
          ><span class="script gold">{s.store.short_name || s.store.name}</span>{#if s.store.tagline}<small>{s.store.tagline}</small>{/if}</span
        ></a
      >
    {/if}
    <nav aria-label="Main">
      <a href="/#shop">Shop purses</a>
      {#if s.about.enabled}<a href="/#about">About</a>{:else}<a href="/#how">How it works</a>{/if}
      <a href="/#visit">Visit us</a>
      <a class="bagbtn" href="/bag" aria-label={`Your bag, ${data.bagCount} ${data.bagCount === 1 ? 'item' : 'items'}`}>Bag <span id="count">{data.bagCount}</span></a>
    </nav>
  </div>
</header>
<div class="leo strip" aria-hidden="true"></div>
<main id="main">
  {@render children()}
</main>
<div class="leo strip" aria-hidden="true"></div>
<footer>
  <div class="wrap">
    {#if lockup}<div class="lockup stacked"><Lockup {lockup} /></div>
    {:else if footLogo}<img class="foot-logo" src={footLogo} alt={s.store.name} loading="lazy" />
    {/if}{fullAddress(s)}{#if s.store.phone}<br /><a class="foot-phone" href={telHref(s)}>{s.store.phone}</a>{/if}<br />{#if s.store.facebook_url}<a
        href={s.store.facebook_url}
        target="_blank"
        rel="noopener">Facebook</a
      > · {/if}<a href="/policies">Store policies</a> · Website by HoggBuilt
  </div>
</footer>
{/if}
