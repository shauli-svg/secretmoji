import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const required = ['index.html','styles.css','config.js','app.js','manifest.webmanifest','service-worker.js','assets/icon.svg','docs/SPEC_V5.md','docs/TEST_PLAN_V5.md','future-gifs/README.md','reset.html'];
const missing = required.filter((file) => !existsSync(join(root, file)));
if (missing.length) { console.error('Missing files:', missing.join(', ')); process.exit(1); }
const config = readFileSync(join(root, 'config.js'), 'utf8');
const app = readFileSync(join(root, 'app.js'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const styles = readFileSync(join(root, 'styles.css'), 'utf8');
for (const token of ['SecretMojiTruth', 'safeEmojiSet', 'forbiddenEmojiSmokeList', 'teaserTemplates', 'SM7']) {
  if (!config.includes(token)) { console.error(`Missing source-of-truth token: ${token}`); process.exit(1); }
}
for (const token of ['SM7', 'extractCapsuleFromText', 'openPopupWithCapsule', 'Emoji Password', 'compactCapsule', 'emojiPasswordFromCodes']) {
  if (!(app + html).includes(token)) { console.error(`Missing product token: ${token}`); process.exit(1); }
}
for (const id of ['popupLayer', 'incomingEmojiPassword', 'unlockPattern', 'replyView', 'emojiPassword']) {
  if (!html.includes(`id="${id}"`)) { console.error(`Missing element id: ${id}`); process.exit(1); }
}
const forbidden = ['\u{1FAA9}','\u{1FAE0}','\u{1F972}','\u{1FAF6}','\u{1F9CC}','\u{1FAE5}','\u{1F9CB}','\u{1F9E9}','\u{1F600}','\u{1F319}','\u{1F512}','\u{1F436}'];
for (const [file, content] of [['app.js', app], ['index.html', html], ['styles.css', styles], ['config.js', config]]) {
  for (const emoji of forbidden) { if (content.includes(emoji)) { console.error(`Forbidden emoji ${emoji} found in ${file}`); process.exit(1); } }
}
for (const [file, content] of [['config.js', config], ['app.js', app], ['index.html', html]]) {
  if (content.includes('×§') || content.includes('×¡') || content.includes('×™') || content.includes('×ž') || content.includes('ðŸ') || content.includes('â˜')) { console.error(`Mojibake marker found in ${file}`); process.exit(1); }
}
if (app.includes('SM5:${jsonToB64') || app.includes('SM5:eyJ')) { console.error('Legacy JSON capsule marker found in app.js'); process.exit(1); }
console.log('static-check: PASS');
