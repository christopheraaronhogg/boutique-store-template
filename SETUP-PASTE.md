# The setup paste

Copy everything below the line into the owner's Muse as one message. First replace each `{{…}}` and fill the profile with everything you already know about her store. Leave a value as `""` when you don't know it: Muse asks her for it. Delete an image line when you have no picture for it.

---

Hi Muse. You're going to help me set up my online store, one step at a time. I'm not technical, so give me one small step per message, tell me exactly what to tap, and wait for me to say "done" before the next step. Don't skip ahead.

**Step 1. Accounts.** Ask if I have a GitHub account and a Cloudflare account. If not, help me make free ones at github.com/signup and dash.cloudflare.com/sign-up with my email (each one sends a code to confirm it). I sign up myself.

**Step 2. Turn on photo storage.** In the Cloudflare dashboard, open Storage & databases, then R2 Object Storage, and turn it on. The free plan covers my store, but Cloudflare asks for a card to turn it on: I type it myself, and it stays at $0 unless the store grows far past the free limits. Don't pick any paid plan.

**Step 3. Make the store.** Send me this link: https://deploy.workers.cloudflare.com/?url={{TEMPLATE_REPO_URL}}

- It asks me to sign in to GitHub and Cloudflare and tap Allow.
- It asks for OWNER_PASSWORD. Help me pick a store password of 10 or more characters and remind me to write it down somewhere safe. Never repeat it back in chat.
- Leave STORE_KEY empty. If the page won't continue with it empty, help me type 48 random letters and numbers there instead (I don't need to keep them).
- I tap Create and Deploy. When it finishes, ask me to copy the address it shows (it ends in `.workers.dev`) and send it to you. That's my store address.

**Step 4. Connect you to the store.** Some apps only let me add a connector on a computer, not my phone; if I can't find it, tell me to do this step on a computer. Walk me through: Settings, then Connectors, then Add custom connector. The address is my store address plus `/mcp`. The store opens a Connect page: I type my store password and tap Allow. If the new connector has an on/off switch in our chat, turn it on. Then call `what_can_i_change` to make sure you're connected.

**Step 5. Fill in the store.** Below is everything we already know about my store. Read it back to me in plain words (not code), a few lines at a time, and ask me to fix anything wrong and fill in anything blank. When I say it looks right, call `setup_store` with it in one call. If it answers with an error, it saved nothing: fix the part it names and call it again. Then send me my store address so I can look.

```json
{
  "sections": {
    "store": {
      "name": "{{STORE_NAME}}",
      "short_name": "{{SHORT_NAME}}",
      "legal_name": "{{LEGAL_NAME}}",
      "tagline": "{{TAGLINE}}",
      "address_line1": "",
      "address_line2": "",
      "city": "",
      "state": "",
      "zip": "",
      "phone": "",
      "facebook_url": "",
      "award_text": "",
      "header_sub": ""
    },
    "hours": [
      { "label": "Monday – Friday", "value": "" },
      { "label": "Saturday", "value": "" },
      { "label": "Sunday", "value": "Closed" }
    ],
    "home": { "hero_title": "", "hero_script": "", "hero_text": "" },
    "about": { "title_script": "{{OWNER_FIRST_NAME}}", "button": "Meet {{OWNER_FIRST_NAME}}", "lead": "" },
    "theme": { "pink": "#f58cc0", "hot": "#e0177c", "deep": "#a10f58", "gold": "#c39a43", "font_script": "Allura" }
  },
  "store_setup": {
    "order_prefix": "{{ORDER_PREFIX}}",
    "header_name": "{{STORE_NAME}}",
    "email_from_name": "{{STORE_NAME}}",
    "notify_emails": ["{{OWNER_EMAIL}}"],
    "logo_wide": false
  },
  "brand_images": {
    "logo": { "url": "{{LOGO_URL}}" },
    "icon": { "url": "{{ICON_URL}}" }
  },
  "owner_photo": { "url": "{{OWNER_PHOTO_URL}}" }
}
```

Leave out every field that is still empty and every section where I didn't give you anything: an empty field would wipe the starter words on the site. Only use my own words for my story; if I haven't told you my story yet, leave `story` out and ask me for it another day.

**Step 6. Let {{HELPER_NAME}} help later.** {{HELPER_NAME}} built my store and may need to get in to help me. Walk me through two invites, using {{HELPER_EMAIL}}:

- Cloudflare: in the dashboard, Manage Account, then Members, then Invite. Role: Administrator.
- GitHub: open my store's repository, then Settings, then Collaborators, then Add people.

**Step 7. My own web address (optional).** If I want a name like `myshop.com`: in Cloudflare, Domain Registration, then Register Domains. I pay for the domain myself, so ask me before I buy. After it's mine, go to Workers & Pages, my store, Settings, Domains & Routes, Add, Custom domain, and type it in. Then turn on new-order emails:

- In Cloudflare, open the domain, then Email, then Email Routing, and turn it on (tap Add records if it asks).
- Under Destination addresses, add each address the store sends new orders to (the new-order email from step 5), and I tap the link Cloudflare emails me. If I want orders at a different address, call `setup_store` with `{"store_setup": {"notify_emails": ["..."]}}` first.
- If Cloudflare also shows Compute, then Email Service, then Email Sending, tap Onboard Domain and pick my domain.
- Call `setup_store` with `{"store_setup": {"order_email_from": "orders@"}}` plus my domain, like `orders@myshop.com`.
- Call `test_order_email` and ask me to check my inbox. If it says it failed, it says why; fix that and try again.

Until then, new orders show in my store manager and when I ask you.

**Step 8. Show me how to add a purse.** Ask me to send you a photo of one purse and its price. Write a name and a short description, show me, and add it when I say yes. Then give me the link to see it on my store.

From now on, when I ask you to change something on my store, call `what_can_i_change` if you're not sure which tool does it.
