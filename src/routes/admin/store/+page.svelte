<script lang="ts">
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  let moreHours = $state(0);
  let moreClosures = $state(0);
  const banner = $derived(form?.banner ?? data.banner);
  const hours = $derived([...(form?.hours ?? data.hours), ...Array.from({ length: moreHours }, () => ({ label: '', value: '' }))]);
  const closures = $derived([...(form?.closures ?? data.closures), ...Array.from({ length: moreClosures }, () => ({ date: '', note: '' }))]);
</script>

<h1>Store info</h1>
{#if form && 'done' in form}<p class="flash" role="status">{form.done}</p>{/if}
{#if form && 'problem' in form}<p class="oops" role="alert">{form.problem}</p>{/if}

<h2>Photos</h2>
{#snippet photoSpot(spot: string, title: string, hint: string, key: string | null)}
  <form method="post" action="?/photo" enctype="multipart/form-data" class="stack">
    <input type="hidden" name="spot" value={spot} />
    <div class="field">
      <label for="photo-{spot}">{title}</label>
      <span class="hint">{hint}</span>
      {#if key}<img class="store-photo" src="/photos/{key}" alt="" />{/if}
      <input id="photo-{spot}" name="photo" type="file" accept="image/jpeg,image/png,image/webp" />
    </div>
    <p><button class="btn btn-hot" type="submit">{key ? 'Replace photo' : 'Add photo'}</button></p>
  </form>
  {#if key}
    <form method="post" action="?/clearPhoto"><input type="hidden" name="spot" value={spot} /><button class="sbtn" type="submit">Remove this photo</button></form>
  {/if}
{/snippet}
{@render photoSpot('about', 'Your photo', 'Shows in the "Meet" section about you.', data.aboutPhoto)}
{@render photoSpot('home', 'Top of the store', 'The big photo at the top of the home page.', data.homePhoto)}

<h2>Announcement banner</h2>
<form method="post" action="?/banner" class="stack">
  <label class="check"><input type="checkbox" name="enabled" checked={banner.enabled} /> Show the banner</label>
  <div class="field"><label for="headline">Headline</label><input id="headline" name="headline" value={banner.headline} maxlength="200" /></div>
  <div class="field"><label for="btext">Text</label><input id="btext" name="text" value={banner.text} maxlength="400" /></div>
  <div class="field"><label for="starts">Starts <span class="hint">(optional)</span></label><input id="starts" name="starts_on" type="date" value={banner.starts_on ?? ''} /></div>
  <div class="field"><label for="ends">Ends <span class="hint">(optional)</span></label><input id="ends" name="ends_on" type="date" value={banner.ends_on ?? ''} /></div>
  <button class="btn btn-hot" type="submit">Save banner</button>
</form>

<h2>Hours</h2>
<form method="post" action="?/hours" class="stack">
  {#each hours as h, i}
    <div class="hours-row field">
      <input name="label" aria-label="Days" value={h.label} placeholder="Monday – Friday" />
      <input name="value" aria-label="Hours for row {i + 1}" value={h.value} placeholder="10 AM – 5 PM" />
    </div>
  {/each}
  <p><button class="sbtn" type="button" onclick={() => moreHours++}>Add a row</button> <span class="hint">Empty rows are dropped.</span></p>
  <button class="btn btn-hot" type="submit">Save hours</button>
</form>

<h2>Colors</h2>
<p class="empty">These change the colors and the script font across the whole site.</p>
<form method="post" action="?/theme" class="stack">
  {#each data.colors as c (c.key)}
    <div class="field color-row">
      <input id="color-{c.key}" name={c.key} type="color" value={data.theme[c.key]} />
      <label for="color-{c.key}">{c.label}</label>
    </div>
  {/each}
  <div class="field">
    <label for="font-script">Script font</label>
    <select id="font-script" name="font_script">
      {#each data.fonts as f (f)}<option value={f} selected={f === data.theme.font_script}>{f}</option>{/each}
    </select>
  </div>
  <button class="btn btn-hot" type="submit">Save colors</button>
</form>

<h2>Closed days</h2>
<p class="empty">These show on the site as "Coming up: Closed …" for the next 60 days.</p>
<form method="post" action="?/closures" class="stack">
  {#each closures as c, i}
    <div class="hours-row field">
      <input name="date" type="date" aria-label="Closed day {i + 1}" value={c.date} />
      <input name="note" aria-label="Why, for day {i + 1}" value={c.note} placeholder="Christmas" maxlength="60" />
    </div>
  {/each}
  <p><button class="sbtn" type="button" onclick={() => moreClosures++}>Add a closed day</button></p>
  <button class="btn btn-hot" type="submit">Save closed days</button>
</form>
