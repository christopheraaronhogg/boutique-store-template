<script lang="ts">
  import PurseForm from '$lib/components/admin/PurseForm.svelte';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  const blank = { name: '', price: '', sale_price: '', description: '', style: '', status: 'live', sold: false };
</script>

<p><a href="/admin/purses">← All purses</a></p>
<h1>Add a purse</h1>
{#if form?.problems}<div class="oops" role="alert">{#each form.problems as p}<p>{p}</p>{/each}</div>{/if}
<PurseForm values={form?.fields ?? blank} styles={data.styles} submit="Add the purse" isNew={true} />
