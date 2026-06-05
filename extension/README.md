# TrailFlip Lister (Chrome/Edge extension)

Auto-fills your TrailFlip listing into the **Facebook Marketplace** create form —
title, price, and description. (Photos and the category/condition pickers stay
manual: browsers don't let scripts set file inputs, and the pickers are menus.)

Why an extension? A website **can't** type into another site's form (browser
security). An extension runs *on* Facebook's page, so it can.

## Install (one time, ~1 minute)
1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this `extension/` folder.
4. You'll see **TrailFlip Lister** appear.

## Use
1. In TrailFlip, open a **listed** item → **📨 Auto-fill Facebook**.
2. A new Facebook Marketplace "Create item" tab opens and the title, price, and
   description fill in automatically.
3. Add your photos, pick the category & condition, and post.

## Notes
- Works on `facebook.com/marketplace/create/*`. If Facebook changes their form,
  field-matching may need an update (it matches the Title/Price/Description
  field labels).
- Nothing is sent anywhere — the listing is passed locally from the TrailFlip
  tab to the extension's storage, then into the Facebook form.
