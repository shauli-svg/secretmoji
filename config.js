/* SecretMoji Source of Truth - v7 simple mobile capsule
   ASCII-only source file: Hebrew and symbols are encoded with Unicode escapes.
   Goal: simple, playful, light mobile experience with compact links.
*/
window.SecretMojiTruth = {
  version: "SM7",
  productMode: "simple-mobile-popup-capsule",
  publicBaseUrl: "https://shauli-svg.github.io/secretmoji/",
  limits: {
    maxMessageChars: 120,
    minPatternPoints: 4,
    pbkdf2Iterations: 90000
  },
  safeEmojiSet: [
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
  forbiddenEmojiSmokeList: [
    "\uD83E\uDEA9", "\uD83E\uDEE0", "\uD83E\uDD72", "\uD83E\uDEF6",
    "\uD83E\uDDCC", "\uD83E\uDEE5", "\uD83E\uDDCB", "\uD83E\uDDE9",
    "\uD83D\uDE00", "\uD83C\uDF19", "\uD83D\uDD12", "\uD83D\uDC36"
  ],
  teaserTemplates: {
    he: "\u2728 SecretMoji\n\u05e1\u05d9\u05de\u05df: {emojiPassword}  {emojiWords}\n\u05e4\u05ea\u05d7/\u05d9:\n{link}",
    en: "\u2728 SecretMoji\nsign: {emojiPassword}  {emojiWords}\nopen:\n{link}"
  },
  onboardingCopy: {
    firstTitle: "\u05e7\u05d9\u05d1\u05dc\u05ea SecretMoji",
    firstLead: "\u05de\u05d9\u05e9\u05d4\u05d5 \u05e9\u05dc\u05d7 \u05dc\u05da \u05e1\u05d5\u05d3 \u05e7\u05d8\u05df. \u05e6\u05d9\u05d9\u05e8/\u05d9 \u05e1\u05d9\u05de\u05df \u05d5\u05e4\u05ea\u05d7/\u05d9.",
    patternHint: "\u05d4\u05e1\u05d9\u05de\u05df \u05e0\u05e9\u05de\u05e8 \u05d1\u05de\u05db\u05e9\u05d9\u05e8 \u05d4\u05d6\u05d4. \u05d1\u05dc\u05d9 \u05d7\u05e9\u05d1\u05d5\u05df, \u05d1\u05dc\u05d9 \u05d4\u05ea\u05e7\u05e0\u05d4."
  }
};
