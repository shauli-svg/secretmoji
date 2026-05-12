import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const root = process.cwd();
function read(rel) { return readFileSync(join(root, rel), "utf8"); }
function fail(message) { console.error(message); process.exit(1); }
const required = ["index.html", "styles.css", "config.js", "app.js", "manifest.webmanifest", "service-worker.js", "assets/icon.svg", "reset.html", "BUILD_ID.txt", "docs/SOURCE_OF_TRUTH_CM8.md", "docs/IMPLEMENTATION_CM8P.md"];
for (const file of required) { if (!existsSync(join(root, file))) fail("Missing required file: " + file); }
const config = read("config.js");
const app = read("app.js");
const html = read("index.html");
const styles = read("styles.css");
const manifest = read("manifest.webmanifest");
const reset = read("reset.html");
const buildId = read("BUILD_ID.txt");
const impl = read("docs/IMPLEMENTATION_CM8P.md");
if (!config.includes("CodeMojiTruth")) fail("Missing CodeMojiTruth");
if (!config.includes("version: \"CM8P\"")) fail("Expected config version CM8P");
if (!config.includes("productMode: \"single-card-pattern-bound-loop\"")) fail("Expected pattern-bound productMode");
if (!config.includes("storagePrefix: \"codemoji.cm8p.\"")) fail("Expected cm8p storage prefix");
if (!config.includes("maxMessageChars: 120")) fail("Expected maxMessageChars 120");
if (!html.includes("CodeMoji")) fail("Missing CodeMoji in index.html");
if (!manifest.includes("CodeMoji")) fail("Missing CodeMoji in manifest");
if (!buildId.includes("cm8p-")) fail("Expected CM8P build id");
for (const token of ["CM8P", "deriveMessageKeyFromPattern", "encryptWithPatternKey", "pattern-bound-capsule"]) { if (!app.includes(token)) fail("Missing CM8P implementation token: " + token); }
if (app.includes("encryptWithRandomCapsuleKey")) fail("Forbidden random-key-in-URL function still present");
if (!app.includes("decryptCapsule(state.currentCapsule, state.pattern)")) fail("Decrypt must receive drawn pattern");
if (!app.includes("const cm8p = hash.match")) fail("Missing CM8P parser");
if (app.includes("CM8P\\\\.")) fail("CM8P parser has double-escaped CM8P dot");
if (!app.includes("CM8P\\.")) fail("CM8P parser missing normal escaped CM8P dot");
if (!app.includes("capsule.salt")) fail("Pattern-bound capsule must use salt");
if (!impl.includes("CM8P.skin.sign.salt.iv.cipher")) fail("Implementation note missing CM8P capsule model");
for (const bad of ["SM5:eyJ", "lemon-fish-lock", "4/240"]) { if ((html + app + config).includes(bad)) fail("Forbidden legacy token found: " + bad); }
for (const bad of ["SecretMoji"]) { if ((html + manifest).includes(bad)) fail("Forbidden visible legacy brand found: " + bad); }
const scanned = [["index.html", html], ["app.js", app], ["config.js", config], ["reset.html", reset], ["manifest.webmanifest", manifest], ["styles.css", styles]];
const mojibakeMarkers = [new RegExp("\\u00D7"), new RegExp("\\u00C3"), new RegExp("\\u00C2"), new RegExp("\\u00F0\\u0178"), new RegExp("\\u0393\\u00C7"), new RegExp("[\\u0080-\\u009F]"), new RegExp("\\uFFFD")];
for (const [file, content] of scanned) { for (const marker of mojibakeMarkers) { if (marker.test(content)) fail("Mojibake marker found in " + file + ": " + marker); } }
console.log("static-check: PASS CM8P");
