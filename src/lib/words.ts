// Built-in English words, each with an emoji that is shown to the drawer as a reference picture.
// Entries may contain alternative accepted answers separated by "|" (first one is displayed).
const CARDS: [string, string][] = [
  ["cat", "🐱"], ["dog", "🐶"], ["house", "🏠"], ["tree", "🌳"], ["sun", "☀️"], ["moon", "🌙"], ["star", "⭐"],
  ["car", "🚗"], ["bicycle|bike", "🚲"], ["airplane|plane", "✈️"], ["boat", "⛵"], ["train", "🚆"],
  ["pizza", "🍕"], ["banana", "🍌"], ["apple", "🍎"], ["ice cream", "🍦"], ["hamburger|burger", "🍔"],
  ["coffee", "☕"], ["cake", "🍰"], ["egg", "🥚"], ["fish", "🐟"], ["bird", "🐦"], ["elephant", "🐘"],
  ["giraffe", "🦒"], ["monkey", "🐵"], ["snake", "🐍"], ["butterfly", "🦋"], ["spider", "🕷️"],
  ["flower", "🌸"], ["mountain", "⛰️"], ["beach", "🏖️"], ["rainbow", "🌈"], ["umbrella", "☂️"],
  ["guitar", "🎸"], ["piano", "🎹"], ["camera", "📷"], ["phone", "📱"], ["computer|laptop", "💻"],
  ["clock", "🕒"], ["key", "🔑"], ["glasses", "👓"], ["hat", "🎩"], ["shoe", "👟"], ["shirt", "👕"],
  ["backpack", "🎒"], ["book", "📖"], ["pencil", "✏️"], ["scissors", "✂️"], ["chair", "🪑"], ["bed", "🛏️"],
  ["door", "🚪"], ["window", "🪟"], ["bridge", "🌉"], ["castle", "🏰"], ["robot", "🤖"], ["ghost", "👻"],
  ["dragon", "🐉"], ["pirate", "🏴‍☠️"], ["astronaut", "🧑‍🚀"], ["doctor", "🧑‍⚕️"], ["wedding", "💒"],
  ["birthday", "🎂"], ["fireworks", "🎆"], ["snowman", "⛄"], ["rain", "🌧️"], ["volcano", "🌋"],
  ["rocket", "🚀"], ["crown", "👑"], ["treasure", "💰"], ["bottle", "🍾"], ["candle", "🕯️"],
  ["balloon", "🎈"], ["football|soccer", "⚽"], ["swimming", "🏊"], ["dancing", "💃"], ["sleeping", "😴"],
  ["crying", "😭"], ["laughing", "😂"], ["fishing", "🎣"], ["camping", "⛺"], ["karaoke", "🎤"],
  ["selfie", "🤳"], ["traffic jam", "🚦"], ["tuk tuk", "🛺"],
  ["pineapple", "🍍"], ["watermelon", "🍉"], ["mushroom", "🍄"], ["penguin", "🐧"], ["octopus", "🐙"],
  ["turtle", "🐢"], ["whale", "🐳"], ["lion", "🦁"], ["rabbit|bunny", "🐰"], ["frog", "🐸"], ["shark", "🦈"],
  ["cactus", "🌵"], ["sunflower", "🌻"], ["trophy", "🏆"], ["headphones", "🎧"], ["light bulb|lightbulb", "💡"],
  ["heart", "❤️"], ["skull", "💀"], ["teeth|tooth", "🦷"]
];

/** built-in word entries ("word" or "word|alt|alt") */
export const WORDS: string[] = CARDS.map(([w]) => w);

const EMOJI = new Map<string, string>(CARDS.map(([w, e]) => [normalizeGuess(w.split("|")[0]), e]));

/** emoji reference picture for a built-in word, if it has one */
export function emojiFor(display: string): string | undefined {
  return EMOJI.get(normalizeGuess(display));
}

export function normalizeGuess(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

export function parseEntry(entry: string): { display: string; accepted: string[] } {
  const parts = entry.split("|");
  return { display: parts[0], accepted: parts.map(normalizeGuess) };
}

export function shuffle<T>(arr: T[], rnd: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Parse the host's custom word box: one word per line (or comma separated); "word|alternative" accepts alternatives. */
export function parseCustomWords(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\n,;]+/)) {
    const entry = raw
      .split("|")
      .map((x) => x.replace(/\s+/g, " ").trim().slice(0, 40))
      .filter(Boolean)
      .join("|");
    const key = normalizeGuess(entry.split("|")[0] ?? "");
    if (!entry || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
    if (out.length >= 300) break;
  }
  return out;
}
