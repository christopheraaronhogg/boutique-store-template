# Take real card payments with Square

Until this is done, checkout is a clearly marked test and no money moves.

How it works: at checkout the store makes a Square payment link for the order (itemized, with the order number) and sends the shopper to Square's secure payment page. Card details never touch the store. Square emails the shopper a receipt. When the payment goes through, Square tells the store (a signed webhook to `/square/webhook`) and the order turns Paid; if the shopper comes back first, the order page asks Square itself. Paid orders show up in the owner's Square app and reports. Refunds are made in the Square app, and the store notes them on the order. Square's Free plan charges 2.9% + 30¢ per online card payment, with no monthly fee.

Everything is in the owner's own Square account, set up in two websites with no terminal and no code change. Her keys go straight into Cloudflare as secrets: she copies them from Square and pastes them into Cloudflare herself, and never pastes them into a chat.

## Steps (Muse walks her through these, one at a time)

1. **Square app.** At developer.squareup.com/apps, sign in with her normal Square login. Tap Create an application (any name, like "My website"). Nothing to pay.
2. **Test keys.** In the app, keep the toggle at the top on **Sandbox**.
   - Credentials: copy the **Sandbox Access token**.
   - Locations: copy the sandbox **Location ID**.
   - Webhooks, then Subscriptions, then Add subscription. Name: "Store". URL: her store address plus `/square/webhook`, with no slash at the end (for example `https://my-shop.name.workers.dev/square/webhook`). Events: `payment.created`, `payment.updated`, `refund.created`, `refund.updated`. Save, open the subscription, tap Show next to Signature key and copy it.
3. **Put them in Cloudflare.** dash.cloudflare.com, Workers & Pages, her store, Settings, Variables and Secrets. For each one tap Add, pick type **Secret**, type the name, paste the value:
   - `SQUARE_ACCESS_TOKEN`: the access token
   - `SQUARE_LOCATION_ID`: the location ID
   - `SQUARE_WEBHOOK_SIGNATURE_KEY`: the signature key
   - `SQUARE_ENVIRONMENT`: `sandbox`

   Add all four, then tap Deploy. Card checkout turns on by itself once the access token is there; until the location ID and signature key are there too, checkout asks shoppers to call the store instead. The test banner stays up while it's on sandbox.
4. **Try it.** Buy a purse on the site and pay with Square's test card 4111 1111 1111 1111, any future date, CVV 111, any ZIP. The order should say Paid, and the store manager should show it with a Test tag.
5. **Go live** (only when she says so). Flip the toggle at the top of the Square app to **Production** and repeat step 2 there: Production access token, production Location ID, and a production webhook subscription with the same URL and events and its own signature key. In Cloudflare, edit the four secrets with the production values and set `SQUARE_ENVIRONMENT` to `production`. From then on, payments are real and the test banner goes away.

Back to test checkout any time: in Cloudflare, delete `SQUARE_ACCESS_TOKEN` (or add a secret `PAYMENT_DRIVER` set to `test`).

**New web address later?** Nothing to do: the `workers.dev` address keeps working for Square. If she does change the subscription's URL to the new address, copy its signature key again in case Square shows a new one.

**Cancelling an unpaid card order:** the shopper may still have Square's page open. If money comes in for an order she cancelled, Square shows the payment but the store keeps it cancelled: refund it in the Square app.

To disconnect Square for good: delete the app (or replace its token) at developer.squareup.com. The store then stops being able to start card checkouts.

## Notes

- Prices are charged as listed; the store doesn't add sales tax yet. If tax should be added online, set it up in Square (Items & Services, Taxes) and we'll pass it through.
- A token from an app under her own Square login is Square's supported way to connect her own account. A "Connect with Square" button (OAuth) for many stores is a later step.
- Secrets: `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_WEBHOOK_SIGNATURE_KEY`, `SQUARE_ENVIRONMENT` (`sandbox` or `production`; anything else is treated as sandbox). `PAYMENT_DRIVER` (`test` or `square`) is optional and only forces a choice.
