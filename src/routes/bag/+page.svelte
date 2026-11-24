<script lang="ts">
  import { money } from '$lib/money';
  import { photoSrc } from '$lib/photos';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Your bag | {data.settings.store.name}</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="page">
  <div class="wrap">
    <div class="head" style="margin-bottom:18px"><h2>Your <span class="script pk">bag</span></h2></div>
    {#each data.notes as n}<div class="notice" role="status">{n}</div>{/each}
    {#if data.lines.length === 0}
      <div class="panel" style="text-align:center">
        <p class="empty" style="padding:20px 0">Your bag is empty.</p>
        <a class="btn btn-hot" href="/#shop">Shop purses</a>
      </div>
    {:else}
      <div class="bagpage">
        <div class="panel">
          {#each data.lines as l (l.product.id)}
            <div class="it">
              <a class="th" href="/p/{l.product.slug}">{#if l.product.photos[0]}<img src={photoSrc(l.product.photos[0].key, 'thumb', data.resizing)} alt="" />{/if}</a>
              <div>
                <b>{l.product.name}</b>
                <small>{money(l.unit)} each</small>
                <form method="post" action="?/update" class="qty" aria-label={`Quantity for ${l.product.name}`}>
                  <input type="hidden" name="product_id" value={l.product.id} />
                  <button name="qty" value={l.qty - 1} aria-label="Remove one">−</button><span>{l.qty}</span><button
                    name="qty"
                    value={l.qty + 1}
                    aria-label="Add one"
                    disabled={l.qty >= l.max}>+</button
                  >
                </form>
                <form method="post" action="?/update">
                  <input type="hidden" name="product_id" value={l.product.id} /><button class="linkbtn" name="qty" value="0">Remove</button>
                </form>
              </div>
              <div class="price">{money(l.line)}</div>
            </div>
          {/each}
        </div>
        <div class="panel">
          <div class="sumrow total" style="border:0;margin:0;padding-top:0"><span>Subtotal</span><span>{money(data.subtotal)}</span></div>
          <p class="smallnote">Free pickup at the store. You'll add your details on the next step.</p>
          <a class="btn btn-hot" style="display:block;margin-top:14px" href="/checkout">Check out</a>
          <a class="btn btn-line" style="display:block;margin-top:10px" href="/#shop">Keep shopping</a>
        </div>
      </div>
    {/if}
  </div>
</div>
