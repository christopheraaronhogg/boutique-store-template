<script lang="ts">
  import { page } from '$app/state';
</script>

<div class="page">
  <div class="wrap">
    <div class="panel" style="text-align:center">
      <h2>{page.status === 404 ? 'Not here' : 'Something went wrong'}</h2>
      <p>{page.error?.message ?? 'Please try again.'}</p>
      <a class="btn btn-hot" href="/#shop">Shop purses</a>
    </div>
  </div>
</div>
