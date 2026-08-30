import { useState, useEffect } from 'react';
import { X, Download, Mail, Send, Loader2, CheckCircle, ArrowLeft, Cloud } from 'lucide-react';
import RecipientInput from './RecipientInput';
import { resolveArtifact, downloadBlob, sendExport, uploadToOneDrive } from '../../utils/exportMail';
import { API_URL } from '../../config';

// @anchor export-choice-modal
// Wspólny modal eksportu: „Pobierz na urządzenie", „Wyślij mailem" albo „Zapisz na OneDrive".
// makeArtifact: async () => ({ blob, filename }) | ({ html, filename }) — generuje plik dopiero po wyborze.
// oneDriveFolderName: string|null — gdy podany, folder jest powiązany i przycisk OneDrive jest aktywny.
// oneDriveCategory: 'finanse'|'dokumentacja' — domyślnie 'finanse'.
// oneDriveSubfolder: string|null — podkatalog W ŚRODKU folderu kategorii, zakładany przy
//   pierwszym zapisie. Protokoły odbioru lądują w `pliki_finansowe/<nazwa gałęzi WBS>`.
// onExported: () => void | Promise — wołane po UDANYM eksporcie (pobranie, mail, OneDrive).
//   Używa go protokół odbioru: dopiero wyjście dokumentu z aplikacji zapisuje odbiór w rejestrze.
// defaultTo / defaultCc / defaultSubject / defaultMessage — podpowiedzi formularza maila. Tylko
//   wartości startowe: każde pole zostaje w pełni edytowalne, bo adresat i treść bywają inne niż
//   domyślne (protokół idzie czasem do inwestora, nie do wykonawcy zakresu).
export default function ExportChoiceModal({ open, onClose, title = 'Eksport', defaultFilename = 'plik', nodeId, makeArtifact, oneDriveFolderName, oneDriveCategory = 'finanse', oneDriveSubfolder = '', onExported, defaultTo, defaultCc, defaultSubject, defaultMessage }) {
  const [mode, setMode] = useState('choice'); // 'choice' | 'email'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [to, setTo] = useState([]);
  // @anchor export-choice-cc — „Do wiadomości". Osobne pole, a nie dopisek do `to`: adresaci
  // z kopii nie są stroną korespondencji, a rozdzielenie ich widać po stronie odbiorcy.
  const [cc, setCc] = useState([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  // Reset TYLKO na otwarciu modala. Świadomie bez podpowiedzi w zależnościach: domyślna
  // treść zmienia się przy każdym przeliczeniu zakresu, a wpadnięcie tu w trakcie pisania
  // skasowałoby użytkownikowi wpisany tekst.
  useEffect(() => {
    if (open) {
      setMode('choice'); setBusy(false); setError(''); setDone('');
      setTo(defaultTo?.length ? [...defaultTo] : []);
      setCc(defaultCc?.length ? [...defaultCc] : []);
      setSubject(defaultSubject || title || defaultFilename || 'Eksport');
      setMessage(defaultMessage || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const close = () => { if (!busy) onClose(); };

  const handleDownload = async () => {
    setBusy(true); setError('');
    try {
      const art = await resolveArtifact(await makeArtifact());
      downloadBlob(art.blob, art.filename);
      await onExported?.();
      onClose();
    } catch (e) {
      setError(e?.message || 'Błąd generowania pliku');
      setBusy(false);
    }
  };

  const handleUploadOneDrive = async () => {
    setBusy(true); setError('');
    try {
      const art = await resolveArtifact(await makeArtifact());
      const { webUrl } = await uploadToOneDrive({
        blob: art.blob, filename: art.filename, nodeId,
        category: oneDriveCategory, subfolder: oneDriveSubfolder,
      });
      await onExported?.();
      const sciezka = [oneDriveFolderName, oneDriveCategory === 'finanse' ? 'pliki_finansowe' : 'dokumentacja_projektowa', oneDriveSubfolder].filter(Boolean).join(' → ');
      setDone(`Zapisano na OneDrive${sciezka ? ` → ${sciezka}` : ''}`);
      setBusy(false);
      if (webUrl) setTimeout(() => window.open(webUrl, '_blank'), 400);
      setTimeout(onClose, 2000);
    } catch (e) {
      setError(e?.message || 'Błąd zapisu na OneDrive');
      setBusy(false);
    }
  };

  const handleSend = async () => {
    if (!to.length) { setError('Dodaj co najmniej jednego odbiorcę.'); return; }
    setBusy(true); setError('');
    try {
      const art = await resolveArtifact(await makeArtifact());
      await sendExport({ blob: art.blob, filename: art.filename, to, cc, subject: subject || title, message, nodeId });
      await onExported?.();
      setDone(`Wysłano do: ${to.join(', ')}${cc.length ? ` (DW: ${cc.join(', ')})` : ''}`);
      setBusy(false);
      setTimeout(onClose, 1600);
    } catch (e) {
      setError(e?.message || 'Błąd wysyłki maila');
      setBusy(false);
    }
  };

  const btnBase = 'flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-50 active:scale-95';

  return (
    <div className="fixed inset-0 z-[140] bg-[#05070bcc] backdrop-blur-sm flex items-center justify-center p-4" onClick={close}>
      <div className="w-full max-w-md max-h-[90vh] flex flex-col rounded-2xl border border-white/10 bg-[#0b0f17] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {mode === 'email' && !done && (
              <button onClick={() => { setMode('choice'); setError(''); }} disabled={busy} className="p-1 rounded-lg hover:bg-white/10 text-gray-300"><ArrowLeft size={15} /></button>
            )}
            <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-white truncate">{title}</h3>
          </div>
          <button onClick={close} disabled={busy} className="p-2 rounded-lg border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-all"><X size={14} /></button>
        </div>

        <div className="p-5 overflow-y-auto custom-scrollbar">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle size={40} className="text-emerald-400" />
              <p className="text-sm text-gray-200">{done}</p>
            </div>
          ) : mode === 'choice' ? (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-gray-400 mb-1">Co zrobić z plikiem <span className="text-gray-300 font-mono">{defaultFilename}</span>?</p>
              <button onClick={handleDownload} disabled={busy} className={`${btnBase} bg-white/5 hover:bg-white/10 border border-white/10 text-gray-100`}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Pobierz na urządzenie
              </button>
              <button onClick={() => { setMode('email'); setError(''); }} disabled={busy} className={`${btnBase} bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white`}>
                <Mail size={16} /> Wyślij mailem
              </button>
              <button
                onClick={handleUploadOneDrive}
                disabled={busy || !oneDriveFolderName}
                title={!oneDriveFolderName ? 'Najpierw powiąż folder OneDrive z tą gałęzią' : `Zapisz w: ${oneDriveFolderName}`}
                className={`${btnBase} border ${oneDriveFolderName ? 'bg-green-500/10 border-green-500/20 hover:bg-green-500/20 text-green-300' : 'bg-white/5 border-white/10 text-gray-600 cursor-not-allowed'}`}
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Cloud size={16} />}
                {oneDriveFolderName ? `OneDrive → ${oneDriveFolderName}` : 'OneDrive (brak folderu)'}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Do</label>
                <RecipientInput value={to} onChange={setTo} nodeId={nodeId} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">DW (do wiadomości)</label>
                <RecipientInput value={cc} onChange={setCc} nodeId={nodeId} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Temat</label>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                  Wiadomość {defaultMessage ? '(do edycji)' : '(opcjonalnie)'}
                </label>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={defaultMessage ? 10 : 3} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-y custom-scrollbar" placeholder="Treść wiadomości…" />
              </div>
              <button onClick={handleSend} disabled={busy} className={`${btnBase} bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white mt-1`}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {busy ? 'Wysyłanie…' : 'Wyślij załącznik'}
              </button>
              <p className="text-[10px] text-gray-500 text-center">Załącznik = ten sam plik, który zostałby pobrany.</p>
            </div>
          )}

          {error && <p className="mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
        </div>
      </div>
    </div>
  );
}
