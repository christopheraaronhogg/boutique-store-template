<script lang="ts">
  import { onMount } from 'svelte';
  import { shrinkPhoto } from '$lib/shrinkPhoto';

  const MAX = 10;
  let { label, hint, isNew, working = $bindable(0) }: { label: string; hint: string; isNew: boolean; working?: number } = $props();

  let collecting = $state(false);
  let picked = $state<{ file: File; url: string }[]>([]);
  let carrier = $state<HTMLInputElement>();
  const room = $derived(MAX - picked.length - working);

  onMount(() => {
    try {
      new DataTransfer();
      collecting = true;
    } catch {
      collecting = false;
    }
    return () => picked.forEach((p) => URL.revokeObjectURL(p.url));
  });

  function sync() {
    if (!carrier) return;
    const dt = new DataTransfer();
    for (const p of picked) dt.items.add(p.file);
    carrier.files = dt.files;
  }

  async function take(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])].slice(0, Math.max(room, 0));
    input.value = '';
    working += files.length;
    for (const f of files) {
      const file = await shrinkPhoto(f);
      picked.push({ file, url: URL.createObjectURL(file) });
      working--;
      sync();
    }
  }

  function drop(i: number) {
    URL.revokeObjectURL(picked[i].url);
    picked.splice(i, 1);
    sync();
  }

  function first(i: number) {
    const [p] = picked.splice(i, 1);
    picked.unshift(p);
    sync();
  }
</script>

<div class="field picker">
  <span class="picker-label">{label} <span class="hint">{hint}</span></span>
  {#if collecting}
    <div class="picker-buttons">
      <label class="bigbtn hot">
        <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onchange={take} disabled={room <= 0} />
        Take a photo
      </label>
      <label class="bigbtn">
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple onchange={take} disabled={room <= 0} />
        Choose from my photos
      </label>
    </div>
    <input class="carrier" type="file" name="photos" multiple tabindex="-1" aria-hidden="true" bind:this={carrier} />
    {#if working > 0}<p class="hint" role="status">Getting {working === 1 ? 'the photo' : `${working} photos`} ready…</p>{/if}
    {#if picked.length}
      <ul class="picked">
        {#each picked as p, i (p.url)}
          <li>
            <img src={p.url} alt="Photo {i + 1}" />
            <span class="grow">{isNew ? (i === 0 ? 'Cover photo' : `Photo ${i + 1}`) : `New photo ${i + 1}`}</span>
            {#if isNew && i > 0}<button class="sbtn" type="button" onclick={() => first(i)}>Make first</button>{/if}
            <button class="sbtn warn" type="button" onclick={() => drop(i)}>Remove</button>
          </li>
        {/each}
      </ul>
    {/if}
  {:else}
    <input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label={label} />
  {/if}
</div>
