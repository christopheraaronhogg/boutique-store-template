<script lang="ts">
  import { directionsUrl, streetLine, telHref, upcomingClosures, type Settings } from '$lib/settings';

  let { s, today }: { s: Settings; today: string } = $props();
  const closures = $derived(upcomingClosures(s, today));
</script>

<section id="visit">
  <div class="wrap">
    <div class="head">
      <p class="eyebrow">Visit us</p>
      <h2>Come see us {#if s.store.city}in <span class="script pk">{s.store.city}</span>{/if}</h2>
      {#if s.store.legal_name}<p class="sub">{s.store.legal_name}</p>{/if}
    </div>
    <div class="visit">
      <div class="box">
        <h3>The store</h3>
        <p style="margin:0 0 16px;font-size:19px">
          {streetLine(s)}<br />{s.store.city}, {s.store.state} {s.store.zip}{#if s.store.address_note}<br /><span style="color:var(--mute);font-size:16px">{s.store.address_note}</span>{/if}
        </p>
        {#if s.store.phone}
          <p style="margin:0;color:var(--mute);font-size:13px;letter-spacing:.16em;text-transform:uppercase">Call the store</p>
          <a class="big" href={telHref(s)}>{s.store.phone}</a>
        {/if}
        <div class="row" style="margin-top:18px">
          <a class="btn btn-hot" href={directionsUrl(s)} target="_blank" rel="noopener">Get directions</a>
          {#if s.store.facebook_url}<a class="btn btn-line" href={s.store.facebook_url} target="_blank" rel="noopener">Find us on Facebook</a>{/if}
        </div>
      </div>
      <div class="box dark">
        <h3 class="gold">Hours</h3>
        <table class="hours">
          <tbody>
            {#each s.hours as h}<tr><td>{h.label}</td><td>{h.value}</td></tr>{/each}
          </tbody>
        </table>
        {#if closures.length}
          <div class="closures"><b>Coming up:</b>{#each closures as c}<br />Closed {c.label}{#if c.note}{' '}({c.note}){/if}{/each}</div>
        {/if}
      </div>
    </div>
  </div>
</section>
