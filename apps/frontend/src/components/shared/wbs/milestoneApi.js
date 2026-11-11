import { API_URL } from '../../../config';

// @anchor dodaj-milestone-api — `POST /wbs-nodes/milestone` (`wbs-nodes-create-milestone`): milestone pod gałęzią
// `parentId` na dzień `dzien` (Date albo 'YYYY-MM-DD'), jednodniowy (koniec wyłączny = dzień + 1). `beforeId`
// = miejsce w kolejności (`miejsce-milestona`), bez niego backend decyduje po zapisanych datach.
// Każda zakładka wysyła SWOJĄ wersję: Planowanie roboczą, Realizacja baseline (jak przy zmianie dat).
// Zwraca { node, zaleznych }; błąd serwera wraca jako Error z jego komunikatem.
export async function dodajMilestoneApi({ nodeId, versionId = null, parentId, name, dzien, beforeId = null }) {
    const s = typeof dzien === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dzien) ? new Date(`${dzien}T00:00:00`) : new Date(dzien);
    s.setHours(0, 0, 0, 0);
    const e = new Date(s); e.setDate(e.getDate() + 1);
    const res = await fetch(`${API_URL}/wbs-nodes/milestone`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${sessionStorage.getItem('token') || localStorage.getItem('token')}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            nodeId, parentId, name,
            ganttStart: s.toISOString(), ganttEnd: e.toISOString(),
            ...(versionId ? { versionId } : {}),
            ...(beforeId ? { beforeId } : {}),
        }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(Array.isArray(d?.message) ? d.message.join(', ') : (d?.message || `Błąd zapisu (${res.status})`));
    return d;
}

// @anchor data-iso-lokalna — 'YYYY-MM-DD' dnia w czasie lokalnym (pole <input type="date">).
export const dataIsoLokalna = (d) => {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
