<script lang="ts">
  import { enhance } from '$app/forms';
  import { photoSrc } from '$lib/photos';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  const p = $derived(data.product);
  let sending = $state(false);
</script>

<svelte:head>
  <title>Add photos: {p.name}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
  <div class="wrap addphotos">
    <div class="panel">
      <p class="eyebrow">Add photos</p>
      <h2>{p.name}</h2>
      {#if form?.added}<p class="notice" role="status">Added {form.added} {form.added === 1 ? 'photo' : 'photos'}.{#if p.status === 'live'}{' '}It’s on the site. <a href="/p/{p.slug}">See the purse</a>{/if}</p>{/if}
      {#if form?.problems?.length}<div class="notice sorry" role="alert">{#each form.problems as problem}<p>{problem}</p>{/each}</div>{/if}
      <form
        method="post"
        enctype="multipart/form-data"
        use:enhance={() => {
          sending = true;
          return async ({ update }) => {
            await update();
            sending = false;
          };
        }}
      >
        <div class="field">
          <label for="photos">Choose photos (up to 10)</label>
          <input id="photos" name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple required />
          <span class="hint">The first photo you pick shows first if the purse has none yet.{#if data.publish && p.status !== 'live'}{' '}The purse goes on the site once photos are added.{/if}</span>
        </div>
        <button class="btn btn-hot" type="submit" disabled={sending}>{sending ? 'Adding…' : 'Add photos'}</button>
      </form>
      {#if p.photos.length}
        <h3>On the purse now</h3>
        <ul class="nowphotos">
          {#each p.photos as ph (ph.id)}<li><img src={photoSrc(ph.key, 'thumb', false)} alt="" /></li>{/each}
        </ul>
      {/if}
    </div>
  </div>
</div>

<style>
  .addphotos {
    max-width: 560px;
    padding-top: 28px;
    padding-bottom: 40px;
  }
  form {
    display: grid;
    gap: 16px;
    margin-top: 12px;
  }
  .nowphotos {
    list-style: none;
    padding: 0;
    margin: 8px 0 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .nowphotos img {
    width: 96px;
    height: 120px;
    object-fit: cover;
    border-radius: 10px;
  }
</style>
