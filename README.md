# SecretMoji MVP v5 — Mobile Popup Capsule

Mobile-first Web/PWA MVP. No backend. No app store. No official WhatsApp integration.

## What v5 does

- Creates a short, quiet teaser message instead of an ugly random letter block.
- Shows a visible **Emoji Password** in the outgoing message.
- Uses an old/safe emoji set only. No new emoji such as 🪩 / 🫠 / 🥲 / 🫶.
- Incoming links open straight into a glass popup flow, not a normal website page.
- First-time recipient draws a local Secret Sign as onboarding.
- Message opens read-only inside the popup card.
- Reply is built in the same popup and can be sent back through WhatsApp / Share / Copy.
- Source of truth lives in `config.js`.

## Product truth

This is a mobile-first Web/PWA experience. A browser cannot draw a real translucent OS overlay above WhatsApp/iMessage/Telegram. v5 therefore implements the closest Web-only product behavior: tap link → browser/PWA foreground → immediate glass popup → read/reply → send back.

## Run locally

```powershell
cd "C:\Users\Lior\Desktop\secretmoji_mvp_v5_mobile_popup"
py -m http.server 8080
Start-Process "http://localhost:8080"
```

## Deploy free

Use GitHub Pages from the repo root. After deployment, edit `config.js`:

```js
publicBaseUrl: "https://shauli-svg.github.io/secretmoji/"
```

Then links sent to mobile will be live.
