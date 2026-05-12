# SPEC — SecretMoji v5 Mobile Popup Capsule

## One-line product

A mobile-first secret message capsule: a quiet teaser opens into a glass popup, asks the recipient to draw a personal sign, reveals a read-only message, and lets them reply secretly.

## Core shift from v3

v3 was a pattern capsule. v5 is a viral first-capsule onboarding loop.

The first recipient may not know SecretMoji. Therefore the first capsule must onboard them immediately instead of asking for a pre-shared secret.

## UX loop

1. Sender writes a short message.
2. SecretMoji generates:
   - visible Emoji Password
   - quiet teaser text
   - encrypted capsule link
3. Recipient taps link on mobile.
4. Page opens directly as a glass popup, not a normal site page.
5. Recipient draws their Secret Sign.
6. Message reveals read-only.
7. Recipient can reply or send one to another friend.

## Emoji Password

The Emoji Password is visible. It is a curiosity/tone/game marker, not the full security boundary.

Example:

```text
קיבלת SecretMoji קטן.
סיסמת האימוג׳ים: 🐱 ⭐ 🍋
cat-star-lemon
פתח/י וצייר/י סימן כדי לראות:
https://...
```

## Source of truth

`config.js` owns:

- version
- public base URL
- copy text
- emoji set
- forbidden new emojis
- message length limits
- PBKDF2 iteration value

Do not duplicate these in `app.js`.

## Mobile popup contract

Web/PWA cannot render on top of another app's pixels. The product imitation is:

```text
messenger tap → mobile browser/PWA foreground → immediate glass popup → reply/share back
```

The user should never land on a desktop-like page when opening a capsule.

## Future GIF layer

Funny color-coded GIF stickers can become a later skin layer. Do not add GIF files into the first MVP; document the direction in `future-gifs/README.md`.
