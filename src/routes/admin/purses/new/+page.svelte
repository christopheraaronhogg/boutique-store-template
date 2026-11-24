<script lang="ts">
  import PurseForm from '$lib/components/admin/PurseForm.svelte';
  import Toast from '$lib/components/admin/Toast.svelte';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  const blank = { name: '', price: '', sale_price: '', description: '', style: '', status: 'live', sold: false };
</script>

<p><a href="/admin/purses">← All purses</a></p>
<h1>Add a purse</h1>
<p class="meta">Snap a photo, type a name and a price, and tap Add. You can change anything later.</p>
<PurseForm values={form?.fields ?? blank} styles={data.styles} submit="Add the purse" isNew={true} />
<Toast result={form} back="/admin/purses" />
