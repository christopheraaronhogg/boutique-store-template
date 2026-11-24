<script lang="ts">
  import { enhance } from '$app/forms';
  import PurseForm from '$lib/components/admin/PurseForm.svelte';
  import Toast from '$lib/components/admin/Toast.svelte';
  import { photoSrc } from '$lib/photos';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  const p = $derived(data.product);
  const values = $derived(
    form && 'fields' in form && form.fields
      ? form.fields
      : {
          name: p.name,
          price: String(p.price_cents / 100),
          sale_price: p.sale_price_cents ? String(p.sale_price_cents / 100) : '',
          description: p.description,
          style: p.category_slug ?? '',
          status: p.status,
          sold: p.sold_out,
        },
  );
  const added = $derived(data.added ? { done: `Added. ${p.status === 'live' ? 'It’s on the site.' : 'It shows on the site once you choose to show it.'}`, change_id: data.addedChange } : null);
  const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });
</script>

<p><a href="/admin/purses">← All purses</a></p>
<h1>{p.name}</h1>
<p><a href="/p/{p.slug}" target="_blank" rel="noopener">See it on the site</a></p>

<h2>Photos</h2>
{#if p.photos.length === 0}
  <p class="empty">No photos yet. Add some below.</p>
{:else}
  <p class="meta">The top photo is the cover. Use the arrows to change the order.</p>
  <ul class="photos">
    {#each p.photos as ph, i (ph.id)}
      <li>
        <img src={photoSrc(ph.key, 'thumb', false)} alt="" loading="lazy" />
        <span class="grow">{i === 0 ? 'Cover' : `Photo ${i + 1}`}</span>
        <form method="post" action="?/movePhoto" class="mover" use:enhance={keep}>
          <input type="hidden" name="photo_id" value={ph.id} />
          <button class="arrow" name="to" value={p.photos[i - 1]?.id ?? ''} type="submit" disabled={i === 0} aria-label="Move photo {i + 1} up">▲</button>
          <button class="arrow" name="to" value={p.photos[i + 1]?.id ?? ''} type="submit" disabled={i === p.photos.length - 1} aria-label="Move photo {i + 1} down">▼</button>
        </form>
        <form
          method="post"
          action="?/removePhoto"
          use:enhance={({ cancel }) => {
            if (!confirm('Remove this photo?')) cancel();
            return keep();
          }}
        >
          <input type="hidden" name="photo_id" value={ph.id} /><button class="sbtn warn" type="submit">Remove</button>
        </form>
      </li>
    {/each}
  </ul>
{/if}

<h2>Details</h2>
{#key [p.name, p.price_cents, p.sale_price_cents, p.description, p.category_slug, p.status, p.sold_out].join('|')}
  <PurseForm {values} styles={data.styles} submit="Save changes" isNew={false} />
{/key}

<Toast result={form ?? added} back="/admin/purses/{p.id}" />
