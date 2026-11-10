// @anchor mail-bez-podpisu
// Treść maila bez podpisu — heurystyka (ta sama co `bezPodpisu` w frontend realizacjaShared.js — zmieniaj obie):
// 1) separator „-- ”, „Sent from my…/Wysłane z…” albo początek klauzuli poufności → koniec treści;
// 2) linia będąca samą formułą pożegnalną (PL/EN/DE, też łączone „Mit freundlichen Grüßen / Kind Regards”,
//    także z literówką „Grüße”) → koniec treści (formuła też wypada). Samo „Dziękuję/Thanks” jako pierwsza
//    linia to treść, nie podpis;
// 3) bez formuły: z końca zdejmowany blok kontaktowy (telefony, adresy, mail, www, VAT/NIP/REGON, kod pocztowy)
//    i jedna krótka linia z nazwiskiem tuż nad nim.
// Linie porównywane bez wiodących „<https://…>” — Outlook wstawia tak linki obrazków w stopce.
// Mail z samym podpisem (cięcie od pierwszej linii) → „(brak treści)”; pusty wynik w innym wypadku → tekst wejściowy.
const ZAMKNIECIE = [
  '(z\\s+)?(serdecznymi\\s+|najlepszymi\\s+)?pozdrowieniami', '(serdecznie\\s+|ciepło\\s+)?pozdrawiam', 'pozdrowienia', 'pozdro',
  'z\\s+poważaniem', 'z\\s+wyrazami\\s+szacunku', 'łączę\\s+(wyrazy\\s+szacunku|pozdrowienia)', 'dziękuję', 'dzięki', 'dziekuje',
  '(best|kind|warm|warmest|many)\\s+(regards|wishes|thanks)', 'regards', 'best', 'cheers', 'thanks', 'thank\\s+you', 'br', 'sincerely', 'yours\\s+(sincerely|truly|faithfully)',
  'mit\\s+\\S+\\s+grü(ß|ss)en?', '(viele|beste|liebe|freundliche|herzliche)n?\\s+grü(ß|ss)en?', 'grü(ß|ss)en?', 'gruß', 'gruss', 'mfg', 'lg', 'vg',
].join('|');
const ZAMKNIECIE_RE = new RegExp(`^(?:${ZAMKNIECIE})(?:[\\s,.!;:/|–-]+(?:${ZAMKNIECIE}))*[\\s,.!;:]*$`, 'i');
const DZIEKI_RE = /^(dziękuję|dzięki|dziekuje|thanks|thank\s+you)[\s,.!]*$/i;
const KONIEC_RE = /^(--\s*|sent from\b.*|wysłane z\b.*|wysłano z\b.*|gesendet von\b.*|get outlook for\b.*|(uwaga|informacja|zastrzeżenie)\s*:\s*(niniejsza|ta|treść)\b.*|niniejsza wiadomość\b.*(poufn|zawiera|przeznaczona).*|confidentiality (notice|note|disclaimer)\b.*|disclaimer\s*:.*|this (e-?mail|message)\b.*\b(confidential|privileged|intended)\b.*|diese (e-?mail|nachricht)\b.*\b(vertraulich|bestimmt)\b.*)$/i;
const KONTAKT_RE = /(\+?\d[\d\s().\/-]{6,}\d|@|www\.|https?:|<mailto:|\b(tel|mob|mobile|phone|fax|e-?mail|nip|vat|ust|steuer|regon|krs|ul|street|str|iban|swift)\b\.?|\b\d{2}-\d{3}\b|\bsp\.\s*z\s*o\.?\s*o|\bgmbh\b|\bllc\b|\bs\.a\.|\bsp\.\s*k\.)/i;
const BEZ_LINKOW = (l: string) => l.trim().replace(/^(<[^<>]*>\s*)+/, '').trim();

export function bezPodpisu(t: string): string {
  const lines = String(t || '').replace(/\r/g, '').split('\n').map(l => l.replace(/\s+$/, ''));
  let koniec = lines.length;
  let tresci = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = BEZ_LINKOW(lines[i]);
    if (!l) continue;
    const formula = l.length <= 70 && ZAMKNIECIE_RE.test(l) && (tresci > 0 || !DZIEKI_RE.test(l));
    if (KONIEC_RE.test(l) || formula) { koniec = i; break; }
    tresci++;
  }
  if (koniec < lines.length && tresci === 0) return '(brak treści)';
  let out = lines.slice(0, koniec);
  if (koniec === lines.length) {
    // Bez formuły — zdejmij blok kontaktowy z końca (co najmniej 2 linie kontaktowe, inaczej nic nie ruszaj).
    let j = out.length;
    let kontakt = 0;
    while (j > 0 && (!out[j - 1].trim() || KONTAKT_RE.test(out[j - 1]))) { if (out[j - 1].trim()) kontakt++; j--; }
    if (kontakt >= 2) {
      out = out.slice(0, j);
      // Nazwisko / firma tuż nad blokiem: krótka linia bez kropki na końcu.
      while (out.length && !out[out.length - 1].trim()) out.pop();
      const ost = out[out.length - 1]?.trim() || '';
      if (out.length > 1 && ost.split(/\s+/).length <= 4 && !/[.?!:]$/.test(ost)) out.pop();
    }
  }
  const s = out.join('\n').replace(/\n[ \t]*(?=\n)/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return s || String(t || '').trim();
}

// Wymiary obrazka z nagłówka pliku (PNG, GIF, JPEG) — bez zależności. Nieznany format → null.
function wymiaryObrazka(b: Buffer): { w: number; h: number } | null {
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.length >= 10 && b.toString('ascii', 0, 3) === 'GIF') return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

// @anchor czy-logo-stopki
// Obrazek osadzony w treści (cid) wygląda na logo ze stopki: mniejszy niż 20 KB albo szeroki i niski baner
// (proporcje ≥ 2:1, wysokość ≤ 150 px). Wymiary z atrybutów <img src="cid:…" width height> w HTML maila
// (tak go widzi czytelnik — Outlook skaluje logo w wysokiej rozdzielczości), a bez nich z nagłówka pliku.
// Zrzut ekranu czy zdjęcie wklejone w treść są wyższe, więc zostają.
export function czyLogoStopki(buf: Buffer, mime: string, inline: boolean, cid: string | undefined, html: string): boolean {
  if (!inline || !/^image\//i.test(mime)) return false;
  if (buf.length < 20 * 1024) return true;
  let w = 0, h = 0;
  const id = String(cid || '').replace(/^<|>$/g, '');
  if (id && html) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tag = html.match(new RegExp(`<img\\b[^>]*cid:${esc}[^>]*>`, 'i'))?.[0] || '';
    w = Number(tag.match(/\bwidth\s*=\s*["']?(\d+)/i)?.[1] || tag.match(/width\s*:\s*(\d+)px/i)?.[1] || 0);
    h = Number(tag.match(/\bheight\s*=\s*["']?(\d+)/i)?.[1] || tag.match(/height\s*:\s*(\d+)px/i)?.[1] || 0);
  }
  if (!w || !h) { const d = wymiaryObrazka(buf); if (d) { w = d.w; h = d.h; } }
  return w > 0 && h > 0 && h <= 150 && w / h >= 2;
}
