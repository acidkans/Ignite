import { useState, useEffect } from 'react';
import { API_URL } from '../../config';

export default function NodePermissionsModal({ node, onClose, onSuccess }) {
    const [isPublic, setIsPublic] = useState(node.isPublic || false);
    const [visibility, setVisibility] = useState(node.visibility || 'private');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [allUsers, setAllUsers] = useState([]);
    const [allTeams, setAllTeams] = useState([]);
    const [nodePermissions, setNodePermissions] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');


    const [isTeamDropdownOpen, setIsTeamDropdownOpen] = useState(false);
    const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);

    const handleVisibilityChange = (newVisibility) => {
        setVisibility(newVisibility);
        if (newVisibility === 'private') {
            // Prywatne — usuń wszystkie uprawnienia zespołów
            setNodePermissions(prev => prev.filter(p => !p.teamId));
        }
        if (newVisibility === 'public') {
            // Publiczny — usuń uprawnienia zespołów i użytkowników (wszyscy mają dostęp)
            setNodePermissions([]);
        }
    };

    useEffect(() => {
        fetchInitialData();
    }, [node.id]);

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const token = sessionStorage.getItem('token');
            const [usersRes, teamsRes, nodeRes] = await Promise.all([
                fetch(`${API_URL}/users`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`${API_URL}/teams`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`${API_URL}/process-tree/${node.id}/permissions`, { headers: { 'Authorization': `Bearer ${token}` } })
            ]);

            if (!usersRes.ok || !teamsRes.ok || !nodeRes.ok) throw new Error('Błąd pobierania danych');

            const usersData = await usersRes.json();
            const teamsData = await teamsRes.json();
            const nodeData = await nodeRes.json();

            setAllUsers(usersData);
            setAllTeams(teamsData);
            setNodePermissions(nodeData.permissions || []);
            setIsPublic(nodeData.isPublic);
            setVisibility(nodeData.visibility);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);

        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/process-tree/${node.id}/permissions`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    isPublic,
                    visibility,
                    userPermissions: nodePermissions
                        .filter(p => p.userId)
                        .map(p => ({
                            userId: p.userId,
                            permission: p.permission || 'VIEW'
                        })),
                    rolePermissions: nodePermissions
                        .filter(p => p.roleType)
                        .map(p => ({
                            roleType: p.roleType,
                            permission: p.permission || 'VIEW'
                        })),
                    teamPermissions: nodePermissions
                        .filter(p => p.teamId)
                        .map(p => ({
                            teamId: p.teamId,
                            permission: p.permission || 'VIEW'
                        }))
                })
            });

            if (!res.ok) throw new Error('Błąd zapisu uprawnień');
            onSuccess();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const toggleUser = (user) => {
        const exists = nodePermissions.find(p => p.userId === user.id);
        if (exists) {
            setNodePermissions(nodePermissions.filter(p => p.userId !== user.id));
        } else {
            setNodePermissions([...nodePermissions, { userId: user.id, user, permission: 'VIEW' }]);
        }
    };

    const toggleTeam = (team) => {
        const exists = nodePermissions.find(p => p.teamId === team.id);
        if (exists) {
            setNodePermissions(nodePermissions.filter(p => p.teamId !== team.id));
        } else {
            setNodePermissions([...nodePermissions, { teamId: team.id, team, permission: 'VIEW' }]);
        }
    };

    const updateTeamPermissionLevel = (teamId, level) => {
        setNodePermissions(nodePermissions.map(p =>
            p.teamId === teamId ? { ...p, permission: level } : p
        ));
    };

    const updatePermissionLevel = (userId, level) => {
        setNodePermissions(nodePermissions.map(p =>
            p.userId === userId ? { ...p, permission: level } : p
        ));
    };

    const filteredUsers = allUsers.filter(u =>
        (u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.lastName?.toLowerCase().includes(searchQuery.toLowerCase())) &&
        !nodePermissions.some(p => p.userId === u.id)
    );



    if (loading) return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="glass-panel p-8 rounded-xl text-center">
                <div className="inline-block w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                <p className="mt-4 text-gray-400">Wczytywanie uprawnień...</p>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
            <div className="glass-panel p-6 rounded-xl max-w-3xl w-full mx-4 border border-white/10 shadow-2xl max-h-[95vh] flex flex-col">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            🛡️ Uprawnienia: {node.name}
                        </h3>
                        <p className="text-xs text-gray-500 mt-1 uppercase tracking-tighter">Typ: {node.type}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">✕</button>
                </div>

                {error && <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 text-red-400 rounded-lg text-sm">{error}</div>}

                <div className="flex-1 overflow-auto space-y-6 pr-2 custom-scrollbar">
                    {/* Public Toggle */}
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10">
                        <div>
                            <div className="text-sm font-semibold text-white">Publiczny</div>
                            <div className="text-xs text-gray-500">Widoczny dla wszystkich zalogowanych pracowników</div>
                        </div>
                        <input
                            type="checkbox"
                            checked={isPublic}
                            onChange={(e) => setIsPublic(e.target.checked)}
                            className="w-5 h-5 accent-blue-500 cursor-pointer"
                        />
                    </div>

                    {/* Visibility Multi-select Dropdown (Simplified) */}
                    <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Poziom Widoczności</label>
                        <select
                            value={visibility}
                            onChange={(e) => handleVisibilityChange(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                        >
                            <option value="public">🌍 Publiczny (Wszyscy)</option>
                            <option value="private">🔒 Prywatny (Tylko ja)</option>
                            <option value="team">👥 Zespół (Mój dział)</option>
                            <option value="custom">⚙️ Niestandardowy (Lista dostępu)</option>
                        </select>
                    </div>

                    {/* Team Access — only for 'team' visibility */}
                    {visibility === 'team' && (
                        <div>
                            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">Dostęp dla zespołów</label>
                            <div className="relative">
                                <button
                                    onClick={() => setIsTeamDropdownOpen(!isTeamDropdownOpen)}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-left text-sm text-white focus:outline-none focus:border-blue-500 transition-colors flex justify-between items-center"
                                >
                                    <span className={nodePermissions.filter(p => p.teamId).length ? 'text-white' : 'text-gray-500'}>
                                        {nodePermissions.filter(p => p.teamId).length > 0
                                            ? `Wybrano: ${nodePermissions.filter(p => p.teamId).map(p => p.team?.name).join(', ')}`
                                            : 'Wybierz zespoły...'}
                                    </span>
                                    <span>▼</span>
                                </button>

                                {isTeamDropdownOpen && (
                                    <div className="absolute top-full left-0 right-0 mt-2 bg-[#1e1e24] border border-white/10 rounded-lg shadow-xl z-10 overflow-hidden max-h-60 overflow-y-auto">
                                        {allTeams.length === 0 ? (
                                            <div className="p-3 text-sm text-gray-500 text-center">Brak zespołów</div>
                                        ) : (
                                            allTeams.map(team => {
                                                const perm = nodePermissions.find(p => p.teamId === team.id);
                                                const isSelected = !!perm;
                                                return (
                                                    <div key={team.id} className="flex items-center justify-between p-3 hover:bg-white/5 transition-colors">
                                                        <div className="flex items-center gap-3 cursor-pointer flex-1" onClick={() => toggleTeam(team)}>
                                                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-500'}`}>
                                                                {isSelected && <span className="text-white text-xs">✓</span>}
                                                            </div>
                                                            <span className="text-sm text-white">{team.name}</span>
                                                        </div>
                                                        {isSelected && (
                                                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                                <select
                                                                    value={perm.permission}
                                                                    onChange={(e) => updateTeamPermissionLevel(perm.teamId, e.target.value)}
                                                                    className="bg-black/20 border border-white/10 rounded px-2 py-1 text-xs text-blue-400 focus:outline-none"
                                                                >
                                                                    <option value="VIEW">Widok</option>
                                                                    <option value="EDIT">Edycja</option>
                                                                </select>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    {/* Users Access — only for 'custom' visibility */}
                    {visibility === 'custom' && (
                        <div className="space-y-4">
                            <label className="block text-xs text-gray-400 uppercase tracking-wider">Osoby z dostępem</label>

                            {/* Multi-select dropdown of all users */}
                            <div className="relative">
                                <button
                                    onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-left text-sm text-white focus:outline-none focus:border-blue-500 transition-colors flex justify-between items-center"
                                >
                                    <span className={nodePermissions.filter(p => p.userId).length ? 'text-white' : 'text-gray-500'}>
                                        {nodePermissions.filter(p => p.userId).length > 0
                                            ? `Wybrano: ${nodePermissions.filter(p => p.userId).map(p => p.user?.firstName ? `${p.user.firstName} ${p.user.lastName}` : p.user?.email).join(', ')}`
                                            : 'Wybierz osoby...'}
                                    </span>
                                    <span>▼</span>
                                </button>

                                {isUserDropdownOpen && (
                                    <div className="absolute top-full left-0 right-0 mt-2 bg-[#1e1e24] border border-white/10 rounded-lg shadow-xl z-10 max-h-60 overflow-y-auto">
                                        {/* Search filter */}
                                        <div className="p-2 border-b border-white/10 sticky top-0 bg-[#1e1e24]">
                                            <input
                                                type="text"
                                                placeholder="Szukaj..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                            />
                                        </div>
                                        {allUsers
                                            .filter(u =>
                                                !searchQuery ||
                                                u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                                u.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                                u.lastName?.toLowerCase().includes(searchQuery.toLowerCase())
                                            )
                                            .map(user => {
                                                const perm = nodePermissions.find(p => p.userId === user.id);
                                                const isSelected = !!perm;
                                                return (
                                                    <div key={user.id} className="flex items-center justify-between p-3 hover:bg-white/5 transition-colors">
                                                        <div className="flex items-center gap-3 cursor-pointer flex-1" onClick={() => toggleUser(user)}>
                                                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-500'}`}>
                                                                {isSelected && <span className="text-white text-xs">✓</span>}
                                                            </div>
                                                            <div className="flex-1 overflow-hidden">
                                                                <div className="text-sm text-white truncate">{user.firstName} {user.lastName}</div>
                                                                <div className="text-[10px] text-gray-500 truncate">{user.email}</div>
                                                            </div>
                                                        </div>
                                                        {isSelected && (
                                                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                                <select
                                                                    value={perm.permission}
                                                                    onChange={(e) => updatePermissionLevel(perm.userId, e.target.value)}
                                                                    className="bg-black/20 border border-white/10 rounded px-2 py-1 text-xs text-blue-400 focus:outline-none"
                                                                >
                                                                    <option value="VIEW">Widok</option>
                                                                    <option value="EDIT">Edycja</option>
                                                                    <option value="ADMIN">Admin</option>
                                                                </select>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        }
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                        <p className="text-xs text-yellow-500 leading-relaxed">
                            💡 Wskazówka: Użytkownicy z dostępem na tym poziomie dziedziczą go automatycznie do wszystkich elementów podrzędnych tego obszaru.
                        </p>
                    </div>
                </div>

                <div className="flex gap-3 pt-6 mt-4 border-t border-white/10">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg transition-colors"
                        disabled={saving}
                    >
                        Anuluj
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex-1 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold rounded-lg shadow-lg transform transition-all active:scale-95 disabled:opacity-50"
                        disabled={saving}
                    >
                        {saving ? 'Zapisywanie...' : 'Zapisz zmiany'}
                    </button>
                </div>
            </div>
        </div>
    );
}
