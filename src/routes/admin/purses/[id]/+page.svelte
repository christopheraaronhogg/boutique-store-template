<script lang="ts">
  import PurseForm from '$lib/components/admin/PurseForm.svelte';
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
</script>

<p><a href="/admin/purses">← All purses</a></p>
<h1>{p.name}</h1>
<p><a href="/p/{p.slug}" target="_blank" rel="noopener">See it on the site</a></p>
{#if data.added}<p class="flash" role="status">Added. It’s on the site{p.status === 'live' ? '' : ' once you choose to show it'}.</p>{/if}
{#if form && 'done' in form}<p class="flash" role="status">{form.done}</p>{/if}
{#if form && 'problems' in form && form.problems}<div class="oops" role="alert">{#each form.problems as problem}<p>{problem}</p>{/each}</div>{/if}

{#key p}
  <PurseForm {values} styles={data.styles} submit="Save changes" isNew={false} />
{/key}

<h2>Photos</h2>
{#if p.photos.length === 0}
  <p class="empty">No photos yet. Add some above.</p>
{:else}
  <ul class="photos">
    {#each p.photos as ph, i (ph.id)}
      <li>
        <img src={photoSrc(ph.key, 'thumb', false)} alt="" loading="lazy" />
        <span class="grow">{i === 0 ? 'Cover photo' : `Photo ${i + 1}`}</span>
        {#if i > 0}
          <form method="post" action="?/cover"><input type="hidden" name="photo_id" value={ph.id} /><button class="sbtn" type="submit">Make cover</button></form>
        {/if}
        <form
          method="post"
          action="?/removePhoto"
          onsubmit={(e) => {
            if (!confirm('Remove this photo?')) e.preventDefault();
          }}
        >
          <input type="hidden" name="photo_id" value={ph.id} /><button class="sbtn warn" type="submit">Remove</button>
        </form>
      </li>
    {/each}
  </ul>
{/if}
