# GitHub Pages deployment

Repository target:

```text
https://github.com/shauli-svg/secretmoji
```

## Simple deploy

Copy all files from this ZIP into the repository root, then:

```powershell
git add .
git commit -m "feat: SecretMoji v5 mobile popup capsule"
git push
```

In GitHub:

```text
Settings → Pages → Deploy from branch → main → /root
```

After deployment, set in `config.js`:

```js
publicBaseUrl: "https://shauli-svg.github.io/secretmoji/"
```

## Why this matters

`localhost` links do not work on phones. GitHub Pages gives a free HTTPS URL so WhatsApp/Telegram links can be tapped on mobile.
