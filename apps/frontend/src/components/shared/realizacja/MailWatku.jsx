// Maile z wątku gałęzi / pozycji Realizacji — osobny twór obok pytań Q&A (`QaMailModal`), backend
// `watek-mail` (wysyłka ze skrzynki firmowej użytkownika w domenie zamówienia, odbiór odpowiedzi IMAP).
// Wysłany mail i każda odpowiedź lądują w wątku jako wpisy rodzaju „mail” (`Comment` MAIL_OUT / MAIL_IN).
import React, { useEffect, useState } from 'react';
import { API_URL } from '../../../config';
import AutoResizeTextarea from '../wbs/AutoResizeTextarea';

const naglowki = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token')}`, 'Content-Type': 'application/json' });
const json = async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`); return j; };

// @anchor mail-ctx — zamówienie i odświeżenie wątku dla formularzy maila (wpis „mail” odpowiada z miejsca).
export const MailCtx = React.createContext(null);

// @anchor mail-form — formularz maila z wątku: adresaci do zaznaczenia (klient z „Informacji o zamówieniu”
// i zespół zamówienia), inne adresy, DW, temat, treść. `odpowiedz` = { replyId, fromEmail, temat } —
// odpowiedź na mail klienta (nagłówki In-Reply-To, temat „Re: …”, adresat zaznaczony z góry).
export function MailForm({ wbsNodeId, odpowiedz = null, onWyslano, onAnuluj }) {
    const ctxMail = React.useContext(MailCtx);
    const orderId = ctxMail?.orderId;
    const [ctx, setCtx] = useState(null);
    const [blad, setBlad] = useState(null);
    const [wybrani, setWybrani] = useState(() => new Set());
    const [inne, setInne] = useState('');
    const [dw, setDw] = useState('');
    const [temat, setTemat] = useState('');
    const [tresc, setTresc] = useState('');
    const [wysylam, setWysylam] = useState(false);

    useEffect(() => {
        if (!orderId || !wbsNodeId) return;
        let zywy = true;
        fetch(`${API_URL}/watek-mail/order/${orderId}/context?wbsNodeId=${encodeURIComponent(wbsNodeId)}`, { headers: naglowki() })
            .then(json)
            .then(j => {
                if (!zywy) return;
                setCtx(j);
                const znane = new Set((j.recipients || []).map(r => r.email));
                // Odpowiedź → nadawca maila klienta; nowy mail → adresaci ostatniego maila tego wątku.
                const start = odpowiedz?.fromEmail ? [odpowiedz.fromEmail.toLowerCase()] : (j.lastTo || []);
                setWybrani(new Set(start.filter(e => znane.has(e))));
                setInne(start.filter(e => !znane.has(e)).join(', '));
                if (!odpowiedz) setDw((j.lastCc || []).join(', '));
                setTemat(odpowiedz?.temat ? (/^(re|odp|aw)\s*:/i.test(odpowiedz.temat) ? odpowiedz.temat : `Re: ${odpowiedz.temat}`) : j.defaultSubject || '');
            })
            .catch(e => zywy && setBlad(e.message));
        return () => { zywy = false; };
    }, [orderId, wbsNodeId, odpowiedz]);

    const przelacz = (email) => setWybrani(prev => { const n = new Set(prev); n.has(email) ? n.delete(email) : n.add(email); return n; });
    const wyslij = async () => {
        if (wysylam) return;
        const to = [...wybrani, ...inne.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean)];
        if (!to.length) { setBlad('Zaznacz albo wpisz co najmniej jednego adresata.'); return; }
        if (!tresc.trim()) { setBlad('Mail nie ma treści.'); return; }
        setBlad(null);
        setWysylam(true);
        try {
            await fetch(`${API_URL}/watek-mail/send`, {
                method: 'POST', headers: naglowki(),
                body: JSON.stringify({ processNodeId: orderId, wbsNodeId, to, cc: dw, subject: temat, body: tresc, replyToReplyId: odpowiedz?.replyId || undefined }),
            }).then(json);
            await ctxMail?.odswiez?.();
            onWyslano?.();
        } catch (e) { setBlad(e.message); }
        finally { setWysylam(false); }
    };

    if (!orderId) return null;
    const grupy = [['klient', 'Klient'], ['zespol', 'Zespół zamówienia']];
    return (
        <div className="mailform">
            {!ctx && !blad && <div className="muted">Wczytuję adresatów…</div>}
            {ctx && (
                <>
                    <div className="lab">Od</div>
                    {ctx.sender
                        ? <div>{ctx.sender.name} &lt;{ctx.sender.email}&gt;{!ctx.sender.sentFolder && <span className="dpos"> · skrzynka nieprzetestowana — bez kopii w „Wysłanych”</span>}</div>
                        : <div className="dpos">{ctx.senderError}</div>}
                    <div className="lab">Do — zaznacz adresatów</div>
                    {grupy.map(([g, l]) => {
                        const lista = ctx.recipients.filter(r => r.group === g);
                        if (!lista.length) return null;
                        return (
                            <div key={g} className="adresaci">
                                <span className="grp">{l}</span>
                                {lista.map(r => (
                                    <label key={r.email} className={`adr${wybrani.has(r.email) ? ' on' : ''}`} title={[r.email, r.role, r.company].filter(Boolean).join(' · ')}>
                                        <input type="checkbox" checked={wybrani.has(r.email)} onChange={() => przelacz(r.email)} />
                                        {r.name || r.email}
                                    </label>
                                ))}
                            </div>
                        );
                    })}
                    <input className="in" value={inne} onChange={e => setInne(e.target.value)} placeholder="Inne adresy (po przecinku)…" />
                    <input className="in" value={dw} onChange={e => setDw(e.target.value)} placeholder="DW (po przecinku)…" />
                    <div className="lab">Temat</div>
                    <input className="in" value={temat} onChange={e => setTemat(e.target.value)} />
                    <div className="lab">Treść</div>
                    <AutoResizeTextarea className="in" value={tresc} onChange={e => setTresc(e.target.value)} placeholder="Dzień dobry, …" />
                    <div className="muted" style={{ fontSize: 11 }}>Do tematu dojdzie „Ref number [IGW-…]” — po nim odpowiedź wróci do tego wątku.{ctx.sender?.hasSignature ? ' Podpis skrzynki zostanie doklejony.' : ''}</div>
                </>
            )}
            {blad && <div className="dpos">{blad}</div>}
            <div className="row2">
                <button className="btn acc" onClick={wyslij} disabled={wysylam || !ctx?.sender || !tresc.trim()}>{wysylam ? 'Wysyłam…' : 'Wyślij mail'}</button>
                {onAnuluj && <button className="btn" onClick={onAnuluj}>Anuluj</button>}
            </div>
        </div>
    );
}

// @anchor nowy-mail — dół wątku przy filtrze „Maile”: formularz nowego maila (po wysyłce czysty, gotowy
// na kolejny) i „sprawdź pocztę” — ręczny odbiór odpowiedzi (automat co 5 min robi to samo na serwerze).
export function NowyMail({ wbsNodeId }) {
    const ctxMail = React.useContext(MailCtx);
    const [wersja, setWersja] = useState(0);
    const [sprawdzam, setSprawdzam] = useState(false);
    const [info, setInfo] = useState(null);
    if (!wbsNodeId || !ctxMail?.orderId) return null;
    const sprawdz = async () => {
        if (sprawdzam) return;
        setSprawdzam(true); setInfo(null);
        try {
            const r = await fetch(`${API_URL}/watek-mail/check`, { method: 'POST', headers: naglowki(), body: JSON.stringify({ processNodeId: ctxMail.orderId }) }).then(json);
            // Zawsze odśwież — odpowiedź mógł już wcześniej zaimportować cron (wtedy found = 0, a wątku na ekranie brak).
            await ctxMail.odswiez?.();
            setInfo(r.errors?.length ? `Błąd: ${r.errors[0]}` : r.found ? `Nowe odpowiedzi: ${r.found}` : 'Brak nowych odpowiedzi');
        } catch (e) { setInfo(`Błąd: ${e.message}`); }
        finally { setSprawdzam(false); }
    };
    return (
        <>
            <MailForm key={`${wbsNodeId}-${wersja}`} wbsNodeId={wbsNodeId} onWyslano={() => { setWersja(v => v + 1); setInfo('Mail wysłany — odpowiedź wróci do tego wątku.'); }} />
            <div className="nowy-wpis" style={{ paddingTop: 0 }}>
                <button className="mini-btn" onClick={sprawdz} disabled={sprawdzam} title="Pobierz odpowiedzi na maile z wątków tego zamówienia">{sprawdzam ? 'sprawdzam…' : 'sprawdź pocztę'}</button>
                {info && <span className="muted" style={{ fontSize: 11 }}>{info}</span>}
            </div>
        </>
    );
}
