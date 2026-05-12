# TEST PLAN — SecretMoji v5

## Static checks

```powershell
node --check config.js
node --check app.js
node tests/static-check.mjs
```

## Create capsule

1. Open the app.
2. Write: `בדיקת SecretMoji`.
3. Confirm Emoji Password appears.
4. Click `Make SecretMoji`.
5. Confirm share text starts with a human teaser, not raw code.
6. Confirm the link includes `#SM5:`.

## Incoming popup

1. Copy the generated link.
2. Open in a new mobile browser tab or desktop narrow viewport.
3. Confirm app opens directly into popup layer.
4. Confirm Emoji Password is visible in popup.
5. Draw at least 4 pattern points.
6. Open secret.
7. Confirm message appears read-only.

## Reply

1. From unlocked message, click Reply.
2. Write reply.
3. Generate reply capsule.
4. Test Copy / Share / WhatsApp buttons.

## Mojibake smoke

1. Search all files for forbidden emoji list: 🪩 🫠 🥲 🫶 🧌 🫥 🧋 🧩.
2. Confirm none appear outside docs explaining they are forbidden.
3. Confirm `config.js` safeEmojiSet contains only old/no-ZWJ emoji.
