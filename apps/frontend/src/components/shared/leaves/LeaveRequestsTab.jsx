import { API_URL } from '../../../config';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import LeaveRequestModal from './LeaveRequestModal';
import { leavesGridTheme, leavesDefaultColDef, formatDateTime, statusMeta, warsawDayKey } from './leavesTheme';

// @anchor leave-requests-tab
// Zakładka „Wnioski" (mode='mine') i „Wnioski moich podwładnych" (mode='subordinates').
export default function LeaveRequestsTab({ mode, access, leaveTypes, employees, currentUserId }) {
    const [requests, setRequests] = useState([]);
    const [modalRequest, setModalRequest] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    const isSubordinates = mode === 'subordinates';
    const isAdmin = access?.canEdit;

    // @anchor fetch-leave-requests
    const fetchRequests = useCallback(async () => {
        setLoading(true);
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/leave-requests/${isSubordinates ? 'subordinates' : 'mine'}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || 'Błąd pobierania wniosków');
            }
            setRequests(await res.json());
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [isSubordinates]);

    useEffect(() => { fetchRequests(); }, [fetchRequests]);

    // @anchor decide-leave-request-front
    // Zatwierdzenie / odrzucenie / cofnięcie decyzji — jeden endpoint, on pilnuje puli dni.
    const setDecision = async (row, status) => {
        let decisionComment = null;
        if (status === 'REJECTED') {
            decisionComment = window.prompt('Powód odrzucenia wniosku (opcjonalnie):', '');
            if (decisionComment === null) return; // Anuluj
        }
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/leave-requests/${row.id}/decision`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ status, decisionComment: decisionComment || null }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || 'Błąd zapisu');
            }
            fetchRequests();
        } catch (err) {
            alert(err.message);
        }
    };

    const handleDelete = async (row) => {
        if (!window.confirm('Usunąć ten wniosek?')) return;
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/leave-requests/${row.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || 'Nie udało się usunąć wniosku');
            }
            fetchRequests();
        } catch (err) {
            alert(err.message);
        }
    };

    const canApprove = (row) => isAdmin || row.user?.supervisorId === currentUserId;
    const canEditRow = (row) => statusMeta(row).code === 'PENDING'
        && (isAdmin || row.user?.supervisorId === currentUserId || row.userId === currentUserId);

    // @anchor leave-requests-show-applicant
    // Dane wnioskującego pokazujemy zawsze, gdy w siatce może być więcej niż jedna osoba:
    // w zakładce podwładnych oraz w „Wnioskach" admina, który widzi wnioski wszystkich.
    const showApplicant = isSubordinates || isAdmin;

    const colDefs = useMemo(() => [
        ...(showApplicant ? [
            {
                headerName: 'Imię Nazwisko',
                colId: 'employee',
                valueGetter: p => `${p.data.user?.firstName || ''} ${p.data.user?.lastName || ''}`.trim() || '—',
                flex: 1.4,
            },
            {
                headerName: 'Email',
                colId: 'employeeEmail',
                valueGetter: p => p.data.user?.email || '—',
                flex: 1.4,
            },
            {
                headerName: 'Firma',
                colId: 'employeeCompany',
                valueGetter: p => p.data.user?.company || '—',
                flex: 1,
            },
        ] : []),
        {
            headerName: 'Rodzaj urlopu',
            colId: 'leaveType',
            valueGetter: p => p.data.leaveType?.name || '—',
            cellRenderer: p => p.data.leaveType ? (
                <span className="inline-flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.data.leaveType.color }} />
                    {p.data.leaveType.name}
                </span>
            ) : '—',
            flex: 1.3,
        },
        { headerName: 'Dni urlopu', field: 'daysCount', width: 110 },
        // daty urlopu jako dzień kalendarzowy Europe/Warsaw — te same wartości co w „Moje urlopy"
        { headerName: 'Data od', colId: 'dateStart', valueGetter: p => warsawDayKey(p.data.dateStart), flex: 1.2 },
        { headerName: 'Data do', colId: 'dateEnd', valueGetter: p => warsawDayKey(p.data.dateEnd), flex: 1.2 },
        { headerName: 'Komentarz', field: 'comment', valueGetter: p => p.data.comment || '—', flex: 1.5 },
        { headerName: 'Złożono', colId: 'submittedAt', valueGetter: p => formatDateTime(p.data.submittedAt), flex: 1.1 },
        {
            // @anchor leave-requests-status-column
            headerName: 'Status',
            colId: 'status',
            valueGetter: p => statusMeta(p.data).label,
            cellRenderer: p => {
                const meta = statusMeta(p.data);
                const stamp = meta.code === 'APPROVED' ? p.data.approvedAt : meta.code === 'REJECTED' ? p.data.rejectedAt : null;
                const decider = p.data.decidedBy
                    ? `${p.data.decidedBy.firstName || ''} ${p.data.decidedBy.lastName || ''}`.trim()
                    : '';
                const title = [
                    stamp ? `${meta.label}: ${formatDateTime(stamp)}` : null,
                    decider ? `przez ${decider}` : null,
                    p.data.decisionComment || null,
                ].filter(Boolean).join(' — ');
                return <span className={meta.color} title={title || undefined}>● {meta.label}</span>;
            },
            flex: 1.1,
        },
        {
            headerName: 'Akcje',
            colId: 'actions',
            cellRenderer: (p) => {
                const code = statusMeta(p.data).code;
                return (
                    <div className="flex gap-1 items-center h-full">
                        {canApprove(p.data) && code !== 'APPROVED' && (
                            <button onClick={() => setDecision(p.data, 'APPROVED')} title="Zatwierdź wniosek"
                                className="bg-green-500/10 hover:bg-green-500/30 text-green-400 px-2 rounded transition-colors">✓ Akceptuj</button>
                        )}
                        {canApprove(p.data) && code !== 'REJECTED' && (
                            <button onClick={() => setDecision(p.data, 'REJECTED')} title="Odrzuć wniosek"
                                className="bg-red-500/10 hover:bg-red-500/30 text-red-400 px-2 rounded transition-colors">✕</button>
                        )}
                        {canApprove(p.data) && code !== 'PENDING' && (
                            <button onClick={() => setDecision(p.data, 'PENDING')} title="Cofnij decyzję"
                                className="bg-amber-500/10 hover:bg-amber-500/30 text-amber-400 px-2 rounded transition-colors">↩</button>
                        )}
                        {canEditRow(p.data) && (
                            <button onClick={() => setModalRequest(p.data)} title="Edytuj wniosek"
                                className="bg-blue-500/10 hover:bg-blue-500/30 text-blue-400 px-2 rounded transition-colors">✎</button>
                        )}
                        {(isAdmin || (p.data.userId === currentUserId && code === 'PENDING')) && (
                            <button onClick={() => handleDelete(p.data)} title="Usuń wniosek"
                                className="bg-red-500/10 hover:bg-red-500/30 text-red-400 px-2 rounded transition-colors">🗑️</button>
                        )}
                    </div>
                );
            },
            width: 240, sortable: false, filter: false,
        },
    ], [isSubordinates, isAdmin, showApplicant, currentUserId]);

    const pending = requests.filter(r => statusMeta(r).code === 'PENDING').length;

    return (
        <div className="flex flex-col h-full">
            {error && <div className="mb-3 p-3 bg-red-600/20 border border-red-500/40 rounded text-red-300 text-sm">{error}</div>}

            <div className="flex items-center justify-between mb-3">
                <div className="text-xs text-gray-500">
                    {isSubordinates
                        ? (access?.scope === 'ALL' ? 'Wszystkie wnioski poza Twoimi' : 'Wnioski Twoich bezpośrednich podwładnych')
                        : (isAdmin ? 'Wnioski wszystkich pracowników — widok administratora' : 'Twoje wnioski urlopowe')}
                    {' — '}{requests.length} pozycji, oczekujących: <span className="text-amber-400 font-semibold">{pending}</span>
                </div>
                {!isSubordinates && (
                    <button
                        onClick={() => setModalRequest({})}
                        className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-md transition-all shadow-lg flex items-center gap-2 text-sm"
                    >
                        <span>+</span><span>Nowy wniosek</span>
                    </button>
                )}
            </div>

            {modalRequest && (
                <LeaveRequestModal
                    request={modalRequest.id ? modalRequest : null}
                    leaveTypes={leaveTypes}
                    employees={employees}
                    currentUserId={currentUserId}
                    canPickEmployee={isAdmin || access?.scope === 'SUBORDINATES'}
                    onClose={() => setModalRequest(null)}
                    onSuccess={fetchRequests}
                />
            )}

            <div className="w-full flex-1 rounded-lg overflow-hidden shadow-2xl border border-white/10" style={{ minHeight: '420px' }}>
                <AgGridReact
                    rowData={requests}
                    columnDefs={colDefs}
                    defaultColDef={leavesDefaultColDef}
                    animateRows={true}
                    pagination={true}
                    paginationPageSize={20}
                    theme={leavesGridTheme}
                    loading={loading}
                />
            </div>
        </div>
    );
}
