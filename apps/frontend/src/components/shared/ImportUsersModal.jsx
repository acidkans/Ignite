import React, { useRef, useState } from 'react';
import { API_URL } from '../../config';
import { parseUsersWorkbook, USERS_EXCEL_COLUMNS } from '../../utils/usersExcel';

// @anchor import-users-modal
// Import pracowników z pliku XLSX o strukturze z „Eksport tabeli użytkowników".
// Rozpoznajemy po emailu: konto istnieje — aktualizujemy, nie istnieje — zakładamy.
// Import idzie dwoma przebiegami, bo przełożony może być zakładany w tym samym pliku:
// najpierw konta, potem powiązania (przełożony, zespoły, staż).
export default function ImportUsersModal({ isOpen, onClose, users = [], teams = [], onSuccess }) {
    const fileRef = useRef(null);
    const [fileName, setFileName] = useState(null);
    const [rows, setRows] = useState([]);
    const [warnings, setWarnings] = useState([]);
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState(null);
    const [report, setReport] = useState(null);
    const [error, setError] = useState(null);

    if (!isOpen) return null;

    const reset = () => {
        setFileName(null); setRows([]); setWarnings([]); setReport(null); setError(null); setProgress(null);
        if (fileRef.current) fileRef.current.value = '';
    };

    const handleClose = () => { if (!running) { reset(); onClose(); } };

    const handleFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setError(null); setReport(null);
        try {
            const { rows: parsed, errors } = await parseUsersWorkbook(file);
            setFileName(file.name);
            setRows(parsed);
            setWarnings(errors);
            if (!parsed.length && !errors.length) setError('W pliku nie ma żadnego wiersza z danymi.');
        } catch (err) {
            setError(`Nie udało się otworzyć pliku: ${err.message}`);
        }
    };

    // @anchor run-users-import
    const runImport = async () => {
        setRunning(true);
        setError(null);
        const token = sessionStorage.getItem('token');
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

        const byEmail = new Map(users.map(u => [String(u.email || '').toLowerCase(), u]));
        const teamIdByName = new Map(teams.map(t => [t.name.trim().toLowerCase(), t.id]));
        const created = [];
        const updated = [];
        const failed = [];
        const notes = [];

        // PRZEBIEG 1 — konta, których jeszcze nie ma
        const toCreate = rows.filter(r => !byEmail.has(r.email));
        for (let i = 0; i < toCreate.length; i++) {
            const row = toCreate[i];
            setProgress({ phase: 'Zakładam konta', done: i, total: toCreate.length });
            try {
                const res = await fetch(`${API_URL}/users`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        email: row.email,
                        firstName: row.firstName,
                        lastName: row.lastName,
                        phone: row.phone,
                        company: row.company,
                        roleName: row.roleName || 'USER',
                        ...(row.password ? { password: row.password } : {}),
                    }),
                });
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.message || `status ${res.status}`);
                }
                const user = await res.json();
                byEmail.set(row.email, user);
                created.push(row.email);
                if (!row.password) notes.push(`${row.email}: hasło zostało wylosowane — ustaw je ręcznie albo poproś o reset.`);
            } catch (err) {
                failed.push(`${row.email} (wiersz ${row.rowNumber}): ${err.message}`);
            }
        }

        // PRZEBIEG 2 — dane i powiązania; przełożony może pochodzić z przebiegu 1
        const toUpdate = rows.filter(r => byEmail.has(r.email));
        for (let i = 0; i < toUpdate.length; i++) {
            const row = toUpdate[i];
            setProgress({ phase: 'Uzupełniam dane', done: i, total: toUpdate.length });
            const user = byEmail.get(row.email);
            const payload = {
                firstName: row.firstName,
                lastName: row.lastName,
                phone: row.phone,
                company: row.company,
                workStartYear: row.workStartYear,
                workStartMonth: row.workStartMonth,
            };
            if (row.roleName) payload.roleName = row.roleName;
            // staż wpisujemy ręcznie tylko wtedy, gdy nie znamy daty rozpoczęcia pracy —
            // przy znanej dacie backend i tak przeliczy staż sam i nadpisze tę wartość
            if (!row.workStartYear && row.workExperienceYears !== null) {
                payload.workExperienceYears = row.workExperienceYears;
            }
            if (row.supervisorEmail) {
                const supervisor = byEmail.get(row.supervisorEmail);
                if (supervisor) payload.supervisorId = supervisor.id;
                else notes.push(`${row.email}: nie znalazłem przełożonego ${row.supervisorEmail} — zostawiam bez zmian.`);
            }
            if (row.teamNames.length) {
                const ids = [];
                row.teamNames.forEach(name => {
                    const id = teamIdByName.get(name.toLowerCase());
                    if (id) ids.push(id);
                    else notes.push(`${row.email}: zespołu „${name}" nie ma w systemie — pomijam go.`);
                });
                if (ids.length) payload.teamIds = ids;
            }

            try {
                const res = await fetch(`${API_URL}/users/${user.id}`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify(payload),
                });
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.message || `status ${res.status}`);
                }
                if (!created.includes(row.email)) updated.push(row.email);
            } catch (err) {
                failed.push(`${row.email} (wiersz ${row.rowNumber}): ${err.message}`);
            }
        }

        setProgress(null);
        setRunning(false);
        setReport({ created: created.length, updated: updated.length, failed, notes });
        onSuccess?.();
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
            <div className="bg-[#1a1c1e] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-gradient-to-r from-emerald-600/10 to-transparent">
                    <h3 className="text-xl font-bold text-white">Import użytkowników z Excela</h3>
                    <button onClick={handleClose} className="text-gray-400 hover:text-white transition-colors text-2xl">&times;</button>
                </div>

                <div className="p-6 space-y-4 overflow-y-auto">
                    <p className="text-sm text-gray-400">
                        Wgraj plik o strukturze z przycisku „Eksport tabeli użytkowników”. Rozpoznajemy ludzi po emailu:
                        kto już ma konto — temu zaktualizujemy dane, kogo nie ma — temu je założymy.
                    </p>

                    <div className="text-xs text-gray-500 bg-white/5 border border-white/10 rounded-lg p-3">
                        Kolumny, które czytamy: {USERS_EXCEL_COLUMNS.filter(c => !c.readOnly).map(c => c.header).join(' · ')}
                    </div>

                    <input
                        ref={fileRef}
                        type="file"
                        accept=".xlsx"
                        onChange={handleFile}
                        disabled={running}
                        className="block w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-emerald-600 file:text-white hover:file:bg-emerald-500 file:cursor-pointer"
                    />

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm">{error}</div>
                    )}

                    {fileName && !report && (
                        <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-gray-300">
                            <div className="font-semibold text-white mb-1">{fileName}</div>
                            <div>Wierszy gotowych do wczytania: <span className="text-emerald-400 font-bold">{rows.length}</span></div>
                            <div className="text-xs text-gray-500 mt-1">
                                Nowych kont: {rows.filter(r => !users.some(u => String(u.email || '').toLowerCase() === r.email)).length}
                                {' · '}
                                Do aktualizacji: {rows.filter(r => users.some(u => String(u.email || '').toLowerCase() === r.email)).length}
                            </div>
                        </div>
                    )}

                    {warnings.length > 0 && (
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-300 space-y-1 max-h-40 overflow-y-auto">
                            <div className="font-semibold">Na te wiersze zerknij jeszcze raz:</div>
                            {warnings.map((w, i) => <div key={i}>• {w}</div>)}
                        </div>
                    )}

                    {progress && (
                        <div className="text-sm text-gray-300">
                            {progress.phase}… {progress.done}/{progress.total}
                        </div>
                    )}

                    {report && (
                        <div className="space-y-2">
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-sm text-emerald-300">
                                Gotowe. Nowych kont: <b>{report.created}</b>, zaktualizowanych: <b>{report.updated}</b>
                                {report.failed.length > 0 && <>, nieudanych: <b>{report.failed.length}</b></>}.
                            </div>
                            {report.notes.length > 0 && (
                                <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-xs text-gray-400 space-y-1 max-h-40 overflow-y-auto">
                                    {report.notes.map((n, i) => <div key={i}>• {n}</div>)}
                                </div>
                            )}
                            {report.failed.length > 0 && (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-300 space-y-1 max-h-40 overflow-y-auto">
                                    <div className="font-semibold">Tych osób nie udało się zapisać:</div>
                                    {report.failed.map((f, i) => <div key={i}>• {f}</div>)}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-white/5 flex gap-3">
                    <button
                        type="button"
                        onClick={handleClose}
                        disabled={running}
                        className="flex-1 px-4 py-2 rounded-lg border border-white/10 text-white hover:bg-white/5 transition-colors disabled:opacity-50"
                    >
                        {report ? 'Zamknij' : 'Anuluj'}
                    </button>
                    {!report && (
                        <button
                            type="button"
                            onClick={runImport}
                            disabled={running || !rows.length}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold py-2 px-4 rounded-lg transition-all shadow-lg shadow-emerald-600/20"
                        >
                            {running ? 'Wczytuję…' : `Wczytaj ${rows.length || ''} ${rows.length === 1 ? 'wiersz' : 'wierszy'}`.trim()}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
