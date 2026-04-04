import { API_URL } from './config';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { themeQuartz } from 'ag-grid-community';
import AddUserModal from './components/shared/AddUserModal';
import EditUserModal from './components/shared/EditUserModal';

export default function UsersPage() {
    const [activeTab, setActiveTab] = useState('users'); // 'users' | 'teams'
    const [rowData, setRowData] = useState([]);
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Ciemny motyw dla v33
    const myTheme = useMemo(() => themeQuartz.withParams({
        backgroundColor: 'rgba(0, 0, 0, 0)', // Całkowicie przezroczyste tło
        foregroundColor: '#EEE',
        headerBackgroundColor: 'rgba(30, 30, 30, 0.3)',
        rowHoverColor: 'rgba(255, 255, 255, 0.05)',
        borderColor: 'rgba(255, 255, 255, 0.05)', // Delikatne linie
    }), []);

    const [currentUser, setCurrentUser] = useState(null);
    const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);

    // Listy pomocnicze
    const usersList = useMemo(() => rowData.map(u => ({ label: `${u.firstName} ${u.lastName}`, id: u.id })), [rowData]);
    const supervisorNames = useMemo(() => ['Brak', ...usersList.map(u => u.label)], [usersList]);
    const teamNames = useMemo(() => ['Brak', ...teams.map(t => t.name)], [teams]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const token = sessionStorage.getItem('token');
            const headers = { 'Authorization': `Bearer ${token}` };

            // Fetch profile first to determine permissions
            const profileRes = await fetch(`${API_URL}/users/profile`, { headers });
            if (!profileRes.ok) throw new Error('Błąd pobierania profilu');
            const profile = await profileRes.json();
            setCurrentUser(profile);

            const isAdminOrManager = profile.roles?.some(r => ['ADMIN', 'MANAGER'].includes(r));

            const [usersRes, teamsRes] = await Promise.all([
                fetch(`${API_URL}/users`, { headers }),
                // Only fetch teams if admin/manager (optimization, though backend should protect it too)
                isAdminOrManager ? fetch(`${API_URL}/teams`, { headers }) : Promise.resolve({ ok: true, json: () => [] })
            ]);

            if (!usersRes.ok) throw new Error('Błąd pobierania danych');

            const usersData = await usersRes.json();
            const teamsData = isAdminOrManager ? await teamsRes.json() : [];

            setRowData(usersData);
            setTeams(teamsData);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    const isAdminOrManager = useMemo(() =>
        currentUser?.roles?.some(r => ['ADMIN', 'MANAGER'].includes(r)),
        [currentUser]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleCreateTeam = async () => {
        if (!isAdminOrManager) return;
        const name = prompt('Podaj nazwę nowego zespołu:');
        if (!name) return;

        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/teams`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name })
            });

            if (!res.ok) throw new Error('Nie udało się utworzyć zespołu');
            fetchData();
        } catch (err) {
            alert(err.message);
        }
    };

    const handleDeleteTeam = async (id, name) => {
        if (!window.confirm(`Czy na pewno chcesz usunąć zespół "${name}"? Użytkownicy zostaną odpięci.`)) return;
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/teams/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) throw new Error('Nie udało się usunąć zespołu');
            fetchData();
        } catch (err) {
            alert(err.message);
        }
    };

    const handleDeleteUser = async (id, name) => {
        if (!window.confirm(`Czy na pewno chcesz usunąć użytkownika ${name}?`)) return;

        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/users/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) throw new Error('Nie udało się usunąć użytkownika');
            fetchData();
        } catch (err) {
            alert(err.message);
        }
    };

    // Konfiguracja kolumn
    const colDefs = useMemo(() => [
        { field: 'id', headerName: 'ID', width: 80, editable: false, hide: true },
        { field: 'firstName', headerName: 'Imię', editable: isAdminOrManager, flex: 1 },
        { field: 'lastName', headerName: 'Nazwisko', editable: isAdminOrManager, flex: 1 },
        { field: 'email', headerName: 'Email', editable: false, flex: 1.5 },
        {
            headerName: 'Zespoły',
            field: 'teams',
            valueGetter: p => Array.isArray(p.data.teams) ? p.data.teams.map(t => t.name).join(', ') || 'Brak' : (p.data.teams || 'Brak'),
            editable: isAdminOrManager,
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: {
                values: teamNames
            },
            flex: 1.5,
            wrapText: true,
            autoHeight: true
        },
        {
            headerName: 'Uprawnienia',
            field: 'roleName', // Wirtualne pole
            valueGetter: p => p.data.userRoles?.map(r => r.role.name === 'USER' ? 'Pracownik' : r.role.name === 'ADMIN' ? 'Administrator' : r.role.name === 'MANAGER' ? 'Menadżer' : r.role.name === 'LOGISTYK' ? 'Logistyk' : r.role.name).join(', ') || 'Pracownik',
            editable: isAdminOrManager,
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: {
                values: ['Pracownik', 'Logistyk', 'Menadżer', 'Administrator']
            },
            flex: 1
        },
        {
            headerName: 'Przełożony',
            field: 'supervisorName', // Wirtualne pole
            valueGetter: p => p.data.supervisor ? `${p.data.supervisor.firstName} ${p.data.supervisor.lastName}` : 'Brak',
            editable: isAdminOrManager,
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: {
                values: supervisorNames
            },
            flex: 1
        },
        {
            headerName: 'Akcje',
            cellRenderer: (params) => isAdminOrManager ? (
                <button
                    onClick={() => handleDeleteUser(params.data.id, params.data.firstName)}
                    className="bg-red-500/10 hover:bg-red-500/30 text-red-400 p-1 px-3 rounded transition-colors"
                    title="Usuń użytkownika"
                >
                    🗑️
                </button>
            ) : null,
            width: 80,
            editable: false,
            sortable: false,
            filter: false
        },
        { field: 'createdAt', headerName: 'Utworzono', valueFormatter: p => new Date(p.value).toLocaleDateString(), width: 120 }
    ], [supervisorNames, teamNames, isAdminOrManager]);

    // Obsługa edycji komórki
    const onCellValueChanged = async (params) => {
        const { id } = params.data;
        const field = params.colDef.field; // Może być wirtualne
        const newValue = params.newValue;
        const colId = params.colDef.headerName; // Dla pewności

        // Jeśli wartość się nie zmieniła, ignoruj
        if (params.oldValue === newValue) return;

        let payload = {};

        if (colId === 'Uprawnienia') {
            const roleMap = { 'Pracownik': 'USER', 'Logistyk': 'LOGISTYK', 'Menadżer': 'MANAGER', 'Administrator': 'ADMIN' };
            payload = { roleName: roleMap[newValue] };
        } else if (colId === 'Przełożony') {
            if (newValue === 'Brak') {
                payload = { supervisorId: null };
            } else {
                const supervisor = usersList.find(u => u.label === newValue);
                if (supervisor) payload = { supervisorId: supervisor.id };
            }
        } else if (colId === 'Zespoły') {
            if (newValue === 'Brak') {
                payload = { teamIds: [] };
            } else {
                const team = teams.find(t => t.name === newValue);
                if (team) {
                    payload = { teamIds: [team.id] };
                    console.log(`[GRID_EDIT] Mapped team name "${newValue}" to ID: ${team.id}`);
                } else {
                    console.error(`[GRID_EDIT] Team not found for name: "${newValue}"`);
                    alert(`Błąd: Nie znaleziono zespołu o nazwie "${newValue}" w systemie. Zmiana zostanie cofnięta.`);
                    fetchData();
                    return;
                }
            }
        } else {
            // Standardowe pole
            payload = { [field]: newValue };
        }

        try {
            console.log(`[GRID_EDIT] Sending PATCH for user ${id}:`, payload);
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/users/${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.message || 'Błąd zapisu (Status: ' + res.status + ')');
            }

            console.log(`[GRID_EDIT] PATCH successful for user ${id}`);
            // Odśwież dane
            fetchData();

        } catch (err) {
            console.error('[GRID_EDIT] Error saving data:', err);
            alert(`Błąd zapisu danych: ${err.message}. Wartość zostanie przywrócona.`);
            fetchData(); // Revert by refresh
        }
    };

    // Obsługa zmiany zespołu z poziomu zakładki Zespoły
    // W relacji N:M, "przeniesienie" może oznaczać "dodanie do nowego" lub "zmianę".
    // Tutaj przyjmujemy logikę: D&D na zespół = Dodaj do zespołu.
    // Usunięcie z zespołu = Odrębna akcja.
    const handleAddUserToTeam = async (userId, teamId) => {
        try {
            const user = rowData.find(u => u.id === userId);
            if (!user) return;

            const currentTeamIds = Array.isArray(user.teams) ? user.teams.map(t => t.id) : [];
            if (currentTeamIds.includes(teamId)) return;

            // Logika: ADD - dodajemy do istniejących
            const newTeamIds = [...currentTeamIds, teamId];
            await updateUserTeams(userId, newTeamIds);
        } catch (err) {
            console.error(err);
            alert(err.message);
        }
    };

    const handleRemoveUserFromTeam = async (userId, teamId) => {
        try {
            const user = rowData.find(u => u.id === userId);
            if (!user) return;

            const currentTeamIds = Array.isArray(user.teams) ? user.teams.map(t => t.id) : [];
            const newTeamIds = currentTeamIds.filter(id => id !== teamId);
            await updateUserTeams(userId, newTeamIds);
        } catch (err) {
            console.error(err);
            alert(err.message);
        }
    };

    const updateUserTeams = async (userId, teamIds) => {
        const token = sessionStorage.getItem('token');
        const res = await fetch(`${API_URL}/users/${userId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ teamIds })
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error('Błąd aktualizacji zespołów');
        }
        fetchData();
    };

    const [dragOverTeamId, setDragOverTeamId] = useState(null); // null, 'no-team', or team.id

    const handleDragStart = (e, userId) => {
        e.dataTransfer.setData("userId", userId);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e, teamId) => {
        e.preventDefault(); // Necessary to allow dropping
        if (dragOverTeamId !== teamId) {
            setDragOverTeamId(teamId);
        }
    };

    const handleDragLeave = (e) => {
        // Prevent flickering
    };

    const handleDrop = (e, targetTeamId) => {
        e.preventDefault();
        setDragOverTeamId(null);
        const userId = e.dataTransfer.getData("userId");
        if (!userId) return;

        if (targetTeamId && targetTeamId !== 'all-users') {
            // Jeśli upuszczamy na kartę zespołu -> DODAJ (ADD)
            handleAddUserToTeam(userId, targetTeamId);
        }
        // Upuszczenie na "Lista Pracowników" nic nie robi (nie usuwamy stąd)
    };


    const defaultColDef = useMemo(() => ({
        sortable: true,
        filter: true,
        resizable: true,
        floatingFilter: true,
    }), []);

    if (loading && !rowData.length) return <div className="p-8 text-center text-gray-400">Ładowanie...</div>;
    if (error) return <div className="p-8 text-center text-red-400">Błąd: {error}</div>;

    return (
        <div className="p-8 w-full h-full animate-fade-in flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
                    Zarządzanie Organizacją
                </h2>
                <div className="flex bg-white/5 rounded-lg p-1">
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`px-4 py-2 rounded-md transition-all ${activeTab === 'users' ? 'bg-blue-600/50 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                        Użytkownicy
                    </button>
                    {isAdminOrManager && (
                        <button
                            onClick={() => setActiveTab('teams')}
                            className={`px-4 py-2 rounded-md transition-all ${activeTab === 'teams' ? 'bg-purple-600/50 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                        >
                            Zespoły
                        </button>
                    )}
                    {isAdminOrManager && (
                        <button
                            onClick={() => setIsAddUserModalOpen(true)}
                            className="ml-4 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-md transition-all shadow-lg flex items-center gap-2"
                        >
                            <span>+</span>
                            <span>Dodaj Użytkownika</span>
                        </button>
                    )}
                </div>
            </div>

            <AddUserModal
                isOpen={isAddUserModalOpen}
                onClose={() => setIsAddUserModalOpen(false)}
                onSuccess={fetchData}
            />

            {editingUser && (
                <EditUserModal
                    user={editingUser}
                    users={rowData}
                    teams={teams}
                    onClose={() => setEditingUser(null)}
                    onSuccess={fetchData}
                />
            )}

            {activeTab === 'users' ? (
                <div className="w-full flex-1 rounded-lg overflow-hidden shadow-2xl border border-white/10" style={{ minHeight: '500px' }}>
                    <AgGridReact
                        rowData={rowData}
                        columnDefs={colDefs}
                        defaultColDef={defaultColDef}
                        animateRows={true}
                        rowSelection={{ mode: 'multiRow' }}
                        onCellValueChanged={onCellValueChanged}
                        onRowDoubleClicked={(params) => isAdminOrManager && setEditingUser(params.data)}
                        pagination={true}
                        paginationPageSize={20}
                        theme={myTheme}
                        singleClickEdit={true}
                        stopEditingWhenCellsLoseFocus={true}
                    />
                </div>
            ) : (
                <div className="flex-1 overflow-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* Karta: Lista wszystkich pracowników */}
                        <div
                            className={`bg-white/5 border ${dragOverTeamId === 'all-users' ? 'border-blue-400 bg-blue-400/10' : 'border-white/10'} rounded-xl p-4 flex flex-col transition-all`}
                            onDragOver={(e) => handleDragOver(e, 'all-users')}
                            onDrop={(e) => handleDrop(e, 'all-users')}
                        >
                            <div className="flex justify-between items-center mb-4 pb-2 border-b border-white/5">
                                <h3 className="font-bold text-lg text-gray-300">Lista Pracowników</h3>
                                <span className="text-xs bg-white/10 px-2 py-1 rounded-full">{rowData.length}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto space-y-2 max-h-[400px] scrollbar-thin">
                                {rowData.map(user => (
                                    <div
                                        key={user.id}
                                        draggable="true"
                                        onDragStart={(e) => handleDragStart(e, user.id)}
                                        className="bg-black/20 p-2 rounded flex justify-between items-center group cursor-grab active:cursor-grabbing hover:bg-white/5 transition-colors border border-transparent hover:border-blue-500/30"
                                    >
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium">{user.firstName} {user.lastName}</span>
                                            <span className="text-[10px] text-gray-500">{user.email}</span>
                                        </div>
                                        <div className="flex gap-1">
                                            {(Array.isArray(user.teams) ? user.teams : []).map(t => (
                                                <span key={t.id} className="w-2 h-2 rounded-full bg-blue-500" title={t.name}></span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                {rowData.length === 0 && <div className="text-gray-500 text-sm text-center italic">Brak użytkowników</div>}
                            </div>
                            <div className="mt-4 pt-2 border-t border-white/5 text-[10px] text-gray-500 italic">
                                Przeciągnij pracownika na kartę zespołu, aby go przypisać.
                            </div>
                        </div>

                        {/* Karty Zespołów */}
                        {teams.map(team => (
                            <div
                                key={team.id}
                                className={`bg-white/5 border ${dragOverTeamId === team.id ? 'border-blue-400 bg-blue-400/10' : 'border-white/10'} rounded-xl p-4 flex flex-col transition-all`}
                                onDragOver={(e) => handleDragOver(e, team.id)}
                                onDrop={(e) => handleDrop(e, team.id)}
                            >
                                <div className="flex justify-between items-center mb-4 pb-2 border-b border-white/5">
                                    <h3 className="font-bold text-lg text-blue-300">{team.name}</h3>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs bg-white/10 px-2 py-1 rounded-full">
                                            {rowData.filter(u => Array.isArray(u.teams) && u.teams.some(t => t.id === team.id)).length}
                                        </span>
                                        <button
                                            onClick={() => handleDeleteTeam(team.id, team.name)}
                                            className="text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                                            title="Usuń zespół"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto space-y-2 max-h-[400px]">
                                    {rowData.filter(u => Array.isArray(u.teams) && u.teams.some(t => t.id === team.id)).map(user => (
                                        <div
                                            key={user.id}
                                            draggable="false"
                                            className="bg-black/20 p-2 rounded flex justify-between items-center group hover:bg-white/5 transition-colors border border-transparent hover:border-blue-500/10"
                                        >
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium">{user.firstName} {user.lastName}</span>
                                                <span className="text-[10px] text-gray-400">{user.email}</span>
                                            </div>
                                            <button
                                                className="text-xs text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-red-500/20 rounded-full"
                                                onClick={() => handleRemoveUserFromTeam(user.id, team.id)}
                                                title="Usuń z tego zespołu"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                    {rowData.filter(u => Array.isArray(u.teams) && u.teams.some(t => t.id === team.id)).length === 0 && (
                                        <div className="text-gray-500 text-sm text-center italic">Pusty zespół</div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* Przycisk Dodaj Zespół */}
                        <div
                            onClick={handleCreateTeam}
                            className="bg-white/5 border border-white/10 border-dashed rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-white/10 transition-all min-h-[200px]"
                        >
                            <span className="text-4xl text-gray-500 mb-2">+</span>
                            <span className="text-gray-400 font-medium">Utwórz Nowy Zespół</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
