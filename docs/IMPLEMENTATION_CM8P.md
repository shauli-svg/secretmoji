# CodeMoji CM8P implementation note

CM8P replaces random-key-in-link generation with pattern-bound encryption.

Old new-generation model:
CM8.skin.sign.key.iv.cipher

New model:
CM8P.skin.sign.salt.iv.cipher

The AES-GCM key is derived from the drawn 3x3 pattern plus salt using PBKDF2.
The raw pattern is not stored in the capsule.
The encryption key is not placed in the URL.
Wrong pattern should fail decryption.
