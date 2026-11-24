<script lang="ts">
  import { money } from '$lib/money';
  import { photoSrc } from '$lib/photos';

  type Line = { name: string; photo: string | null; qty: number; line: number };
  let { lines, total, resizing }: { lines: Line[]; total: number; resizing: boolean } = $props();
</script>

<div class="panel">
  <h2 style="font-size:26px">Your order</h2>
  <ul class="oitems">
    {#each lines as l}
      <li>
        {#if l.photo}<img src={photoSrc(l.photo, 'thumb', resizing)} alt="" />{:else}<span></span>{/if}<span>{l.name}{#if l.qty > 1}&nbsp;× {l.qty}{/if}</span><span
          >{money(l.line)}</span
        >
      </li>
    {/each}
  </ul>
  <div class="sumrow"><span>Store pickup</span><span>Free</span></div>
  <div class="sumrow total"><span>Total</span><span>{money(total)}</span></div>
</div>
