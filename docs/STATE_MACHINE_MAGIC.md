# CodeMoji Magic Edition — State Machine Contract

## Purpose

This implementation rebuilds the one-card product flow around the Magic Edition contract:

- incoming capsule links must never fall into Compose
- the receiver must land directly in `incomingLocked`
- the gesture is the open action
- no primary "open" button exists in incoming mode
- CM8P remains the active protocol

## States

```text
boot
compose
composeDrawing
incomingLocked
incomingTrying
incomingOpen
reply
settings
fallback
```

## Boot contract

```js
bootFromLocation() {
  capsule = extractCapsuleFromText(location.hash)

  if (capsule) {
    state.currentCapsule = capsule
    transition(INCOMING_LOCKED)
    return
  }

  transition(COMPOSE)
}
```

## Incoming flow

```text
open link with #CM8P.skin.sign.salt.iv.cipher
→ parse capsule
→ state.currentCapsule exists
→ route = incomingLocked
→ show card + sign + 3x3 grid + ghost trace
→ user draws pattern
→ pointerup triggers decrypt attempt
→ route = incomingTrying
→ success: route = incomingOpen, message visible
→ failure: route = incomingLocked, soft shake, "נסה שוב"
```

## Compose flow

```text
compose
→ write message
→ draw pattern
→ primary button enabled only when text + min pattern exist
→ tap WhatsApp
→ encrypt CM8P
→ build link
→ open WhatsApp / fallback copy
```

No separate `ready` screen is used in the main flow.

## Debug hook

The implementation exposes this readback:

```js
window.CodeMojiDebug = {
  version,
  hasHash,
  capsuleVersion,
  parseOk,
  route,
  currentCapsuleExists,
  lastDecryptStatus
}
```

This is not rendered in the UI.

## Guardrails enforced by static check

- no `renderOnboarding`
- no incoming primary open button
- no visible numeric pattern dots
- no raw link box in main flow
- no `encryptWithRandomCapsuleKey`
- no CM8P parser double escaping
- no mojibake markers in served files
- required Magic state-machine tokens exist
