// Entries may contain alternative accepted answers separated by "|" (first one is displayed).
export const WORDS: Record<"en" | "th", string[]> = {
  en: [
    "cat", "dog", "house", "tree", "sun", "moon", "star", "car", "bicycle", "airplane", "boat", "train",
    "pizza", "banana", "apple", "ice cream", "hamburger", "coffee", "cake", "egg", "fish", "bird", "elephant",
    "giraffe", "monkey", "snake", "butterfly", "spider", "flower", "mountain", "beach", "rainbow", "umbrella",
    "guitar", "piano", "camera", "phone", "computer", "clock", "key", "glasses", "hat", "shoe", "shirt",
    "backpack", "book", "pencil", "scissors", "chair", "bed", "door", "window", "bridge", "castle", "robot",
    "ghost", "dragon", "pirate", "astronaut", "doctor", "wedding", "birthday", "fireworks", "snowman", "rain",
    "volcano", "rocket", "crown", "treasure", "bottle", "candle", "balloon", "football", "swimming", "dancing",
    "sleeping", "crying", "laughing", "fishing", "camping", "karaoke", "selfie", "traffic jam", "tuk tuk"
  ],
  th: [
    "แมว|cat", "หมา|สุนัข|dog", "บ้าน|house", "ต้นไม้|tree", "พระอาทิตย์|sun", "พระจันทร์|moon", "ดาว|star",
    "รถยนต์|รถ|car", "จักรยาน|bicycle", "เครื่องบิน|airplane", "เรือ|boat", "รถไฟ|train", "พิซซ่า|pizza",
    "กล้วย|banana", "แอปเปิ้ล|apple", "ไอศกรีม|ไอติม|ice cream", "แฮมเบอร์เกอร์|hamburger", "กาแฟ|coffee",
    "เค้ก|cake", "ไข่|egg", "ปลา|fish", "นก|bird", "ช้าง|elephant", "ยีราฟ|giraffe", "ลิง|monkey", "งู|snake",
    "ผีเสื้อ|butterfly", "แมงมุม|spider", "ดอกไม้|flower", "ภูเขา|mountain", "ชายหาด|beach", "สายรุ้ง|rainbow",
    "ร่ม|umbrella", "กีตาร์|guitar", "เปียโน|piano", "กล้อง|camera", "โทรศัพท์|มือถือ|phone", "คอมพิวเตอร์|computer",
    "นาฬิกา|clock", "กุญแจ|key", "แว่นตา|glasses", "หมวก|hat", "รองเท้า|shoe", "เสื้อ|shirt", "กระเป๋า|backpack",
    "หนังสือ|book", "ดินสอ|pencil", "กรรไกร|scissors", "เก้าอี้|chair", "เตียง|bed", "ประตู|door", "หน้าต่าง|window",
    "สะพาน|bridge", "ปราสาท|castle", "หุ่นยนต์|robot", "ผี|ghost", "มังกร|dragon", "โจรสลัด|pirate",
    "นักบินอวกาศ|astronaut", "หมอ|doctor", "งานแต่งงาน|wedding", "วันเกิด|birthday", "ดอกไม้ไฟ|fireworks",
    "ตุ๊กตาหิมะ|snowman", "ฝน|rain", "ภูเขาไฟ|volcano", "จรวด|rocket", "มงกุฎ|crown", "สมบัติ|treasure",
    "ขวดน้ำ|bottle", "เทียน|candle", "ลูกโป่ง|balloon", "ฟุตบอล|football", "ว่ายน้ำ|swimming", "เต้น|dancing",
    "นอนหลับ|sleeping", "ร้องไห้|crying", "หัวเราะ|laughing", "ตกปลา|fishing", "ตั้งแคมป์|camping",
    "คาราโอเกะ|karaoke", "เซลฟี่|selfie", "รถติด|traffic jam", "ตุ๊กตุ๊ก|tuk tuk"
  ]
};

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
