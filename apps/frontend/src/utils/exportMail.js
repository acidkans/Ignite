// @anchor export-mail-util
// Wspólna warstwa eksportu: pobranie pliku lokalnie ALBO wysyłka tego samego pliku mailem.
// Raporty-wydruki HTML renderowane są na backendzie (Puppeteer) — pobranie i mail dają IDENTYCZNY PDF.
import { API_URL } from '../config';

const token = () => sessionStorage.getItem('token');

// @anchor download-blob
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'plik';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// @anchor render-html-to-pdf
// HTML → PDF przez backend (ten sam silnik Chromium co druk przeglądarki).
export async function renderHtmlToPdf(html, filename) {
  const res = await fetch(`${API_URL}/pdf/render`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, filename }),
  });
  if (!res.ok) throw new Error(`Generowanie PDF nieudane (${res.status})`);
  return await res.blob();
}

// @anchor inline-images
// Zamienia <img src="..."> na data URL przed renderem serwerowym — backend (Puppeteer)
// nie ma sesji ani originu, więc zdalne/auth-owane obrazy by się nie załadowały.
async function inlineImages(html) {
  const srcs = new Set();
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    if (!m[1].startsWith('data:')) srcs.add(m[1]);
  }
  if (!srcs.size) return html;
  const map = {};
  await Promise.all([...srcs].map(async (src) => {
    try {
      const url = /^https?:/i.test(src) ? src : window.location.origin + (src.startsWith('/') ? src : `/${src}`);
      const res = await fetch(url, src.includes('/api/') ? { headers: { Authorization: `Bearer ${token()}` } } : undefined);
      if (!res.ok) return;
      const blob = await res.blob();
      map[src] = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
    } catch { /* obraz pominięty — render i tak się powiedzie */ }
  }));
  let out = html;
  for (const [src, data] of Object.entries(map)) out = out.split(src).join(data);
  return out;
}

// @anchor resolve-artifact
// Normalizuje wynik generatora do { blob, filename }. Gdy generator zwrócił HTML — renderuje PDF
// (z wcześniejszym wstrzyknięciem obrazów), dzięki czemu plik = ten sam co przy „Zapisz jako PDF".
export async function resolveArtifact(artifact) {
  if (!artifact) throw new Error('Brak danych do eksportu');
  let { blob, html, filename } = artifact;
  if (!blob && html != null) {
    const pdfName = filename && /\.pdf$/i.test(filename) ? filename : `${filename || 'dokument'}.pdf`;
    blob = await renderHtmlToPdf(await inlineImages(html), pdfName);
    filename = pdfName;
  }
  if (!blob) throw new Error('Generator nie zwrócił pliku');
  return { blob, filename: filename || 'plik' };
}

// @anchor upload-to-onedrive
// Wrzuca gotowy plik do folderu OneDrive powiązanego z zamówieniem:
// `<folder zamówienia>/pliki_finansowe/<subfolder>` (albo `dokumentacja_projektowa`).
// Jedna implementacja dla modala eksportu i dla przycisku „Generuj" w protokole odbioru —
// przy dwóch kopiach jedna zawsze zostaje bez poprawki.
export async function uploadToOneDrive({ blob, filename, nodeId, category = 'finanse', subfolder = '' }) {
  const form = new FormData();
  form.append('file', blob, filename);
  form.append('nodeId', nodeId || '');
  form.append('category', category);
  if (subfolder) form.append('subfolder', subfolder);

  const res = await fetch(`${API_URL}/onedrive/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Błąd uploadu na OneDrive (${res.status})`);
  return res.json();
}

// @anchor fetch-recipients
// Podpowiedzi adresów: zespół + kontakty zamówienia (owner, uprawnieni, klient, lokalizacja, firma).
export async function fetchRecipients(nodeId) {
  if (!nodeId) return [];
  try {
    const res = await fetch(`${API_URL}/mail/recipients/${nodeId}`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// @anchor send-export
// Wysyła DOKŁADNIE ten sam plik (blob) jako załącznik maila.
export async function sendExport({ blob, filename, to, cc, subject, message, nodeId }) {
  const fd = new FormData();
  fd.append('file', blob, filename || 'eksport');
  fd.append('to', Array.isArray(to) ? to.join(',') : to || '');
  if (cc) fd.append('cc', Array.isArray(cc) ? cc.join(',') : cc);
  if (subject) fd.append('subject', subject);
  if (message) fd.append('message', message);
  if (nodeId) fd.append('nodeId', nodeId);
  // UWAGA: nie ustawiamy Content-Type — przeglądarka sama doda boundary multipart/form-data.
  const res = await fetch(`${API_URL}/mail/send-export`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}` },
    body: fd,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Wysyłka nieudana (${res.status})`);
  }
  return await res.json();
}
