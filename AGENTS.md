# Working in this store's repo

This is the owner's own copy of her store. Every push to `main` builds and deploys her live website through Cloudflare Workers Builds. Write as if every commit goes live, because it does.

## 1. Easy changes go through the store, not the code

Purses, photos, prices, sales, sold or hidden purses, her photo, the big top photo, hours, closed days, the announcement banner, her About story, the home page words, phone, address and links, pickup instructions, return policy, lead time, colors and the script font are all stored in the store's database. A brand new store is filled in with one `setup_store` call (see `SETUP-PASTE.md`). Change them with the store's own tools:

- `/mcp` on her website: the store's MCP server. Call `what_can_i_change` first; it lists every kind of change, the tool that does it and the exact field names.
- `/admin` on her website: the store manager she signs in to.

These changes show on the site at once, with no commit and no deploy. Never hardcode content in code or in `src/lib/brand/*.json` to change what the site shows: saved settings win over that file, so the edit would not show anyway.

## 2. Change code only for what the tools can't do

New kinds of pages, layout and new features are code. When something she asks for could be a setting, add it to the editable settings (`src/lib/server/owner/settings.ts`, the tools in `src/lib/server/mcp/tools.ts`, and `/admin/store`) rather than typing it into a page, so she can change it herself next time. Keep existing tool names and arguments as they are: Muse is connected to them.

## 3. Check before you push

```bash
npm ci
npm run ci    # svelte-check, then the tests (vitest), then the build
```

Fix anything that fails before pushing. Workers Builds runs the same `npm run ci`, so a change that fails never deploys.

## 4. Main is the live store, and every change can be undone

A push to `main` deploys. Make one change per commit, with a message that says what she will see ("Add a gift card page"), so it is easy to find and undo. After it deploys, open her website on a phone-sized screen and check the change.

When she says "undo that", "put it back" or "I liked it better before", first work out which kind of change she means:

- **A purse, photo or setting** (anything from section 1): call `undo_change` on `/mcp`. With no id it undoes her last change; call it again to step further back. `recent_changes` lists older changes with their `change_id` and what each one changed. No code, no deploy.
- **A code change you pushed**: revert the commit. This adds a new commit that undoes it, and the history is kept.

  ```bash
  git log --oneline -10                       # find the commit
  git revert --no-edit <sha>                  # one commit
  git revert --no-edit <oldest>^..<newest>    # several in a row
  npm run ci
  git push
  ```

  Workers Builds deploys the revert in a minute or two. Never `git reset` or force-push `main`: the history is how anything gets undone.
- **The site is broken right now** and can't wait for a build: put the last good version back at once with `npx wrangler deployments list` and `npx wrangler rollback <version-id> -y -m "<why>"` (add `--name <worker>` if her Worker has a different name from the one in `wrangler.jsonc`), or in the Cloudflare dashboard (Workers, the store, Deployments, Rollback). That is temporary: the next push to `main` deploys `main` again, so revert the commit straight after.

A revert never undoes a database migration. Keep migrations additive (new tables and columns only), so older code still runs on the newer database.

## 5. Secrets stay in Cloudflare

The store password, `STORE_KEY` and any payment keys are Worker secrets, set with `npx wrangler secret put` or in the dashboard. Never put them in the repo, `wrangler.jsonc`, tests, commit messages or chat. `.dev.vars` is for local use only and is never committed.
