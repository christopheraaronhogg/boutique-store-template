<script lang="ts">
  import type { Lockup } from '$lib/settings';

  let { lockup }: { lockup: Lockup } = $props();
</script>

<img class="lockup-mark" src={lockup.mark} alt="" width="46" height="46" /><span class="lockup-text"
  ><span class="lockup-name"
    >{#each lockup.words as w, i}{#if w.small}<i>{w.text}</i>{:else}{w.text.toUpperCase()}{/if}{i < lockup.words.length - 1 ? ' ' : ''}{/each}</span
  >{#if lockup.sub}<span class="lockup-sub">{lockup.sub.toUpperCase()}</span>{/if}</span
>
