# SOURCE OF TRUTH - CodeMoji CM8

Current active root:
C:\Users\Lior\Desktop\secretmoji_mvp\secretmoji_v7_simple_mobile_popup

Current known commit:
96b3fd1 feat: build CodeMoji CM8 single-card mobile loop

Product identity:
CodeMoji is not a website.
CodeMoji is not a landing page.
CodeMoji is a single-screen mobile-first encrypted message viewer and reply loop.

Core UX truth:
The product must feel like a single mobile card, not a site.

Required experience:
- one screen
- one card
- one primary button
- incoming message first when opening a received link
- 3x3 drawn pattern unlock
- decrypted message visible on the same card
- reply button
- encrypted reply shared through WhatsApp / Share / Copy

Forbidden UX:
- no long scroll
- no hero page
- no multi-section website
- no manual decode area open by default
- no raw URL visible by default
- no numeric code UXj- no fixed lemon-fish-lock demo feeling
- no SecretMoji visible brand leftovers
- no SM5 generation
- no 4/240 legacy counter

Pattern truth:
The user must not feel that they are entering a numeric code.
The user must draw a visual sign on a 3x3 pattern grid, like a mobile unlock pattern.

Internal grid model:
1 2 3
4 5 6
7 8 9

The numbers are internal only. The UI language is: draw your sign.

Cryptographic truth:
Current implementation contains Web Crypto primitives:
- AES-GCM
- PBKDF2
- random IV
- local profile salt/verifier

But current CM8 implementation is incomplete as a cryptographic product because the encryption key is generated randomly and embedded inside the URL capsule.

Current weak model:
CM8.skin.sign.key.iv.cipher

This means the message is encrypted, but the key travels with the message link.
The 3x3 pattern currently acts mainly as UI/local-profile friction, not as the real decryption key.

Required next crypto model:
The next version must become pattern-bound.

Target:
CM8P.skin.sign.salt.iv.cipher

Where:
- pattern is drawn on the 3x3 grid
- PBKDF2 derives an AES-GCM key from the pattern plus salt
- AES-GCM decrypts using derived key plus IV
- raw pattern is never stored
- encryption key is not placed in the URL
- wrong pattern fails decryption

Incoming flow:
Open received link.
Single card appears.
The card says: you received a CodeMoji.
User draws the 3x3 sign.
User taps open.
The message appears in the same card.
User can tap reply.

Reply flow:
Tap reply.
Write short message.
Tap send.
Reply is encrypted.
WhatsApp / Share / Copy opens.

Brand:
Visible brand: CodeMoji.
Repo may remain: secretmoji.

Acceptance test:
A mobile user opening an incoming link must understand within one second:
I received something.
I draw my sign.
I read the message.
I can reply.

If it feels like a website, the build failed.

Development rule:
Before changing product code:
1. Check git status.
2. Record active root.
3. Run node --check config.js.
4. Run node --check app.js.
5. Run tests/static-check.mjs.
6. Patch small.
7. Validate.
8. Commit.
9. Push main.
10. Push main:gh-pages.
11. Verify live with curl.

Next required patch:
Build CodeMoji v8.1:
- replace random-key-in-URL model
- implement pattern-derived AES-GCM key
- generate CM8P capsules
- read legacy CM8 only if needed
- make incoming link open directly into single-card unlock
- show decrypted message in the same card
- add reply button that encrypts the reply
- keep raw URL hidden unless fallback is needed
