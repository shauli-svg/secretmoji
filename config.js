/* CodeMoji Source of Truth - CM8P pattern-bound single card loop.
   ASCII-only source file. Hebrew UI lives in app/html.
*/
window.CodeMojiTruth = {
  version: "CM8P",
  productMode: "single-card-pattern-bound-loop",
  publicBaseUrl: "https://shauli-svg.github.io/secretmoji/",
  storagePrefix: "codemoji.cm8p.",
  limits: {
    maxMessageChars: 120,
    minPatternPoints: 4,
    pbkdf2Iterations: 110000
  },
  safeSymbolSet: [
    { code: "A", emoji: "\u2B50", word: "star" },
    { code: "B", emoji: "\u2600\uFE0F", word: "sun" },
    { code: "C", emoji: "\u2601\uFE0F", word: "cloud" },
    { code: "D", emoji: "\u26A1", word: "bolt" },
    { code: "E", emoji: "\u2764\uFE0F", word: "heart" },
    { code: "F", emoji: "\u2615", word: "coffee" },
    { code: "G", emoji: "\u263A\uFE0F", word: "smile" },
    { code: "H", emoji: "\u2602\uFE0F", word: "umbrella" },
    { code: "I", emoji: "\u266B", word: "music" },
    { code: "J", emoji: "\u273F", word: "flower" },
    { code: "K", emoji: "\u25C6", word: "diamond" },
    { code: "L", emoji: "\u25CF", word: "circle" }
  ],
  skins: [
    { code: "candy", label: "Candy" },
    { code: "lemon", label: "Lemon" },
    { code: "ocean", label: "Ocean" },
    { code: "arcade", label: "Arcade" },
    { code: "sunset", label: "Sunset" },
    { code: "mint", label: "Mint" },
    { code: "bubblegum", label: "Bubblegum" }
  ],
  forbiddenEmojiSmokeList: [
    "\uD83E\uDEA9", "\uD83E\uDEE0", "\uD83E\uDD72", "\uD83E\uDEF6",
    "\uD83E\uDDCC", "\uD83E\uDEE5", "\uD83E\uDDCB", "\uD83E\uDDE9",
    "\uD83D\uDE00", "\uD83C\uDF19", "\uD83D\uDD12", "\uD83D\uDC36"
  ],
  teaserTemplates: {
    he: "\u2728 CodeMoji\n\u05e1\u05d9\u05de\u05df: {emojiPassword}  {emojiWords}\n\u05e4\u05ea\u05d7/\u05d9:\n{link}",
    en: "\u2728 CodeMoji\nsign: {emojiPassword}  {emojiWords}\nopen:\n{link}"
  }
};