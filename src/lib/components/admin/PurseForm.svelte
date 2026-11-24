<script lang="ts">
  import type { StyleChoice } from '$lib/server/owner/purses';

  type Values = { name: string; price: string; sale_price: string; description: string; style: string; status: string; sold: boolean };
  let { values, styles, submit, isNew }: { values: Values; styles: StyleChoice[]; submit: string; isNew: boolean } = $props();

  function busy(e: SubmitEvent) {
    const button = (e.currentTarget as HTMLFormElement).querySelector<HTMLButtonElement>('button[type=submit]');
    if (!button) return;
    setTimeout(() => {
      button.disabled = true;
      button.textContent = 'Saving…';
    });
  }
</script>

<form method="post" action={isNew ? undefined : '?/save'} enctype="multipart/form-data" class="stack" onsubmit={busy}>
  <div class="field">
    <label for="name">Name</label>
    <input id="name" name="name" value={values.name} required minlength="2" maxlength="120" placeholder="Camel Pebbled Leather Tote" />
  </div>
  <div class="field">
    <label for="price">Price</label>
    <input id="price" name="price" value={values.price} required inputmode="decimal" placeholder="58" />
  </div>
  <div class="field">
    <label for="sale_price">Sale price <span class="hint">(leave empty for no sale)</span></label>
    <input id="sale_price" name="sale_price" value={values.sale_price} inputmode="decimal" />
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
    <textarea id="description" name="description" rows="6" maxlength="4000">{values.description}</textarea>
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
  {/if}
  <div class="field">
    <label for="photos">{isNew ? 'Photos' : 'Add photos'} <span class="hint">(up to 10; the first is the cover)</span></label>
    <input id="photos" name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple />
  </div>
  <button class="btn btn-hot" type="submit">{submit}</button>
</form>
