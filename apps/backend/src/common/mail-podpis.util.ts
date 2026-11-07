// @anchor mail-bez-podpisu
// Treść maila bez podpisu — heurystyka (ta sama co `bezPodpisu` w frontend realizacjaShared.js — zmieniaj obie):
// 1) separator „-- ” albo „Sent from my…/Wysłane z…” → koniec treści;
// 2) linia będąca samą formułą pożegnalną (PL/EN/DE, też łączone „Mit freundlichen Grüßen / Kind Regards”)
//    po co najmniej jednej linii treści → koniec treści (formuła też wypada);
// 3) bez formuły: z końca zdejmowany blok kontaktowy (telefony, adresy, mail, www, VAT/NIP/REGON, kod pocztowy)
//    i jedna krótka linia z nazwiskiem tuż nad nim.
// Nic nie zostało → zwraca tekst wejściowy (lepiej z podpisem niż pusto).
const ZAMKNIECIE = [
  '(z\\s+)?(serdecznymi\\s+|najlepszymi\\s+)?pozdrowieniami', '(serdecznie\\s+|ciepło\\s+)?pozdrawiam', 'pozdrowienia', 'pozdro',
  'z\\s+poważaniem', 'z\\s+wyrazami\\s+szacunku', 'łączę\\s+(wyrazy\\s+szacunku|pozdrowienia)', 'dziękuję', 'dzięki', 'dziekuje',
  '(best|kind|warm|warmest|many)\\s+(regards|wishes|thanks)', 'regards', 'best', 'cheers', 'thanks', 'thank\\s+you', 'br', 'sincerely', 'yours\\s+(sincerely|truly|faithfully)',
  'mit\\s+\\S+\\s+grü(ß|ss)en', '(viele|beste|liebe|freundliche|herzliche)\\s+grü(ß|ss)e', 'grü(ß|ss)e', 'gruß', 'gruss', 'mfg', 'lg', 'vg',
].join('|');
const ZAMKNIECIE_RE = new RegExp(`^(?:${ZAMKNIECIE})(?:[\\s,.!;:/|–-]+(?:${ZAMKNIECIE}))*[\\s,.!;:]*$`, 'i');
const KONIEC_RE = /^(--\s*|sent from\b.*|wysłane z\b.*|wysłano z\b.*|gesendet von\b.*|get outlook for\b.*)$/i;
const KONTAKT_RE = /(\+?\d[\d\s().\/-]{6,}\d|@|www\.|https?:|<mailto:|\b(tel|mob|mobile|phone|fax|e-?mail|nip|vat|ust|steuer|regon|krs|ul|street|str|iban|swift)\b\.?|\b\d{2}-\d{3}\b|\bsp\.\s*z\s*o\.?\s*o|\bgmbh\b|\bllc\b|\bs\.a\.|\bsp\.\s*k\.)/i;

export function bezPodpisu(t: string): string {
  const lines = String(t || '').replace(/\r/g, '').split('\n').map(l => l.replace(/\s+$/, ''));
  let koniec = lines.length;
  let tresci = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    if (KONIEC_RE.test(l) || (tresci > 0 && l.length <= 70 && ZAMKNIECIE_RE.test(l))) { koniec = i; break; }
    tresci++;
  }
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
