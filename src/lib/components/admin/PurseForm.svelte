<script lang="ts">
  import { untrack } from 'svelte';
  import type { StyleChoice } from '$lib/server/owner/purses';
  import PhotoPicker from './PhotoPicker.svelte';

  type Values = { name: string; price: string; sale_price: string; description: string; style: string; status: string; sold: boolean };
  let { values: given, styles, submit, isNew }: { values: Values; styles: StyleChoice[]; submit: string; isNew: boolean } = $props();
  const values = untrack(() => given);
  let working = $state(0);

  function busy(e: SubmitEvent) {
    const button = (e.currentTarget as HTMLFormElement).querySelector<HTMLButtonElement>('button[type=submit]');
    if (!button) return;
    setTimeout(() => {
      button.disabled = true;
      button.textContent = 'Saving…';
    });
  }
</script>

{#snippet photos()}
  <PhotoPicker label={isNew ? 'Photos' : 'Add photos'} hint={isNew ? '(up to 10; the first is the cover)' : '(up to 10; they go after the photos above)'} {isNew} bind:working />
{/snippet}

<form method="post" action={isNew ? undefined : '?/save'} enctype="multipart/form-data" class="stack" onsubmit={busy}>
  {#if isNew}{@render photos()}{/if}
  <div class="field">
    <label for="name">Name</label>
    <input id="name" name="name" value={values.name} required minlength="2" maxlength="120" placeholder="Camel Pebbled Leather Tote" autocapitalize="words" />
  </div>
  <div class="two">
    <div class="field">
      <label for="price">Price</label>
      <input id="price" name="price" value={values.price} required inputmode="decimal" placeholder="58" />
    </div>
    <div class="field">
      <label for="sale_price">Sale price <span class="hint">(optional)</span></label>
      <input id="sale_price" name="sale_price" value={values.sale_price} inputmode="decimal" />
    </div>
  </div>
  <div class="field">
    <label for="style">Style</label>
    <select id="style" name="style">
      <option value="" selected={!values.style}>No style</option>
      {#each styles as st}<option value={st.slug} selected={values.style === st.slug}>{st.name}</option>{/each}
    </select>
  </div>
  <div class="field">
    <label for="description">Description</label>
    <textarea id="description" name="description" rows="5" maxlength="4000">{values.description}</textarea>
  </div>
  <div class="field">
    <label for="status">Show on the website?</label>
    <select id="status" name="status">
      <option value="live" selected={values.status === 'live'}>Yes, show it</option>
      <option value="draft" selected={values.status === 'draft'}>Not yet (draft)</option>
      <option value="hidden" selected={values.status === 'hidden'}>No, hide it</option>
    </select>
  </div>
  {#if !isNew}
    <label class="check"><input type="checkbox" name="sold" checked={values.sold} /> Sold (one of a kind, can't be ordered)</label>
    {@render photos()}
  {/if}
  <div class="savebar">
    <button class="btn btn-hot" type="submit" disabled={working > 0}>{working > 0 ? 'Getting photos ready…' : submit}</button>
  </div>
</form>
