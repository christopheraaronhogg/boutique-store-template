<script lang="ts">
  import { enhance } from '$app/forms';
  type Result = { done?: string; problem?: string; problems?: string[]; change_id?: number | null; undo_label?: string } | null | undefined;
  let { result, back }: { result: Result; back: string } = $props();
  let closed = $state.raw<Result>(null);
  const undoAt = $derived(`${back}${back.includes('?') ? '&' : '?'}/undo`);
  const problems = $derived(result?.problems ?? (result?.problem ? [result.problem] : []));
</script>

{#if result && closed !== result && (result.done || problems.length)}
  <div class="adm-toast" class:bad={problems.length > 0} role={problems.length ? 'alert' : 'status'}>
    <div class="adm-toast-text">
      {#if result.done}<p>{result.done}</p>{/if}
      {#each problems as p}<p>{p}</p>{/each}
    </div>
    {#if result.done && result.change_id}
      <form method="post" action={undoAt} use:enhance={() => async ({ update }) => update({ reset: false })}>
        <input type="hidden" name="change_id" value={result.change_id} />
        <button class="sbtn" type="submit">{result.undo_label ?? 'Undo'}</button>
      </form>
    {/if}
    <button class="sbtn adm-toast-x" type="button" aria-label="Close" onclick={() => (closed = result)}>OK</button>
  </div>
{/if}
