<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import type { LayoutData } from './$types';

  let { data, children }: { data: LayoutData; children: Snippet } = $props();
  const here = (href: string) => (href === '/admin' ? page.url.pathname === '/admin' : page.url.pathname.startsWith(href)) ? 'page' : undefined;
</script>

<svelte:head>
  <title>Store manager | {data.settings.store.name}</title>
  <meta name="robots" content="noindex" />
  <link rel="stylesheet" href="/admin.css" />
  {#if data.signedIn}<script src="/admin-webmcp.js" defer></script>{/if}
</svelte:head>

<div class="adm">
  {#if data.signedIn}
    <header class="adm-top">
      <div class="in">
        <b>{data.settings.store.short_name || data.settings.store.name}</b>
        <nav aria-label="Store manager">
          <a href="/admin" aria-current={here('/admin')}>Orders</a>
          <a href="/admin/purses" aria-current={here('/admin/purses')}>Purses</a>
          <a href="/admin/store" aria-current={here('/admin/store')}>Store info</a>
          <a href="/" target="_blank" rel="noopener">View site</a>
          <form method="post" action="/admin/sign-out"><button type="submit">Sign out</button></form>
        </nav>
      </div>
    </header>
  {/if}
  <main class="adm-main" id="main">
    {@render children()}
  </main>
</div>
