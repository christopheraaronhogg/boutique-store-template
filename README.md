# Boutique store on Cloudflare

A made-to-order purse store that runs entirely on the shop owner's own Cloudflare account and her own GitHub. It has no server to keep updated. Three Times a Lady Boutique was the first store built from it.

- **Pages:** SvelteKit on Cloudflare Workers (`@sveltejs/adapter-cloudflare`).
- **Data:** purses, orders and settings live in D1, Cloudflare's SQLite. The schema is in `migrations/`.
- **Photos:** stored in R2 and served from `/photos/<key>`. With `IMAGE_RESIZING=on`, pages ask Cloudflare Image Transformations for the size they need. Leave it `off` until transformations are turned on for her domain.
- **Brand:** a new store starts from `src/lib/brand/starter.json`, a neutral brand with no name, address or logo. Everything the owner sets is saved in the `settings` table and wins over the file. `src/lib/brand/three-times-a-lady.json` is a full example; `npm run seed -- --brand three-times-a-lady` loads it with its 11 sample purses.
- **Address:** the store uses the address it is visited at. Set `PUBLIC_URL` only to force one address, for example the custom domain. Muse connections made at any other address stop working then, so reconnect Muse at the new address.
- **Muse connection:** `/mcp` is a remote MCP server (streamable HTTP) that Muse adds as a custom connector. Muse signs in with OAuth: the store password on `/authorize` approves it. A long `STORE_KEY` also works as a bearer token, for assistants that only take an API key. Tools add and change purses and photos, move orders along, and edit hours, closures, the banner and other text. When photos can't come through the connector, `photo_upload_link` gives the owner a two-hour page to pick them on her phone. Every change to purses, photos and settings is saved in a change history (`change_history`), so "undo that" is one `undo_change` call; `recent_changes` lists what changed. Removed and replaced photos stay in R2 so an undo can bring them back. Code changes are undone with `git revert` (see AGENTS.md).
- **Payments:** Until Square is connected, checkout is a clearly marked test payment page. Adding the Square keys as Cloudflare secrets turns on card checkout: shoppers pay on a Square payment link and Square's webhook marks orders paid. See [SQUARE.md](SQUARE.md).
- **Order emails:** each paid order is emailed to `notify_emails` through the `EMAIL` send-email binding, from `order_email_from` (set with `setup_store`; an `ORDER_EMAIL_FROM` secret wins). It needs Email Routing on that domain with each address verified there (free plan); until then it stays off and `/admin` says why. `test_order_email` sends a sample and reports Cloudflare's error code if it fails. Shoppers get Square's receipt; emails to shoppers would need the Workers Paid plan.

Scope is a made-to-order purse store with store pickup. It drops the Laravel app's custom printing, Stripe, shipping, coupons and stock art.

## Run it locally

```bash
npm ci
npm run db:migrate          # local D1
npm run seed                # starter brand (add -- --brand three-times-a-lady for the example with 11 sample purses)
printf 'OWNER_PASSWORD=pick-a-local-password\nSTORE_KEY=%s\n' "$(openssl rand -hex 24)" > .dev.vars
npm run preview             # build, then wrangler dev on http://127.0.0.1:8787
npm test                    # Vitest inside the Workers runtime, against a real local D1
npm run check               # svelte-check
```

## Set up a new store

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/christopheraaronhogg/boutique-store-template)

The button needs this store in a public repo of its own, with `cloudflare/`'s contents at the top. It:

1. Copies the store into the owner's own GitHub account (she signs in to GitHub and Cloudflare and taps Allow).
2. Creates her D1 database, R2 bucket and KV namespace and writes their ids into her copy of `wrangler.jsonc`.
3. Asks for `OWNER_PASSWORD` and `STORE_KEY` (listed in `.dev.vars.example`, described in `package.json` under `cloudflare.bindings`).
4. Builds with `npm run build` and deploys with `npm run deploy`, which runs svelte-check and the tests, applies the migrations and only then deploys. A change that fails the checks never goes live. Every push to `main` of her copy does the same, and Cloudflare keeps earlier versions under Deployments for a one-click rollback.

Then:

5. Connect Muse: Settings, then Connectors, then add a custom connector with the store's address plus `/mcp`. Muse opens the store's Connect page; she types the store password and taps Allow.
6. Muse fills in the store with one `setup_store` call, from what is already known about it (name, address, phone, hours, colors, logos, photos), and asks only for what is missing.

`SETUP-PASTE.md` is the one message to hand the owner's Muse: fill in its profile with what you already know, and Muse walks her through every step above.
7. Her domain: in her Cloudflare dashboard, register it, then add it under Workers, her store, Domains.

`AGENTS.md` tells Muse and any other agent how to work in her copy.

`wrangler.site.jsonc` only tells the SvelteKit adapter where to write its build. `wrangler.jsonc` is the real config: its `main` is `src/worker.ts`, which puts the OAuth and MCP layer in front of the site.
