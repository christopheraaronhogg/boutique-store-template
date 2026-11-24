<script lang="ts">
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<div class="stack" style="margin:40px auto 0">
  <h1>{data.settings.store.name}</h1>
  <p>Sign in to see orders and change purses.</p>
  {#if form?.problem}<p class="oops" role="alert">{form.problem}</p>{/if}
  <form method="post" class="stack">
    <div class="field">
      <label for="password">Store password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required />
    </div>
    <button class="btn btn-hot" type="submit">Sign in</button>
  </form>
</div>
