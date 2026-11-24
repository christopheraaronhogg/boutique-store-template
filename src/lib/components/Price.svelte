<script lang="ts">
  import { moneyShort } from '$lib/money';

  let { price, sale }: { price: number; sale: number | null } = $props();
  const onSale = $derived(sale !== null && sale < price);
</script>

{#if onSale && sale !== null}<s>{moneyShort(price)}</s><span class="sale">{moneyShort(sale)}</span>{:else}{moneyShort(price)}{/if}
