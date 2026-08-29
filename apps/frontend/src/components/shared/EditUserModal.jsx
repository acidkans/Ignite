import { API_URL } from '../../config';
import { useState, useEffect } from 'react';
import {
    LEAVE_COMPANIES,
    calculateLeaveEntitlement,
    calculateWorkExperienceMonths,
    calculateWorkExperienceYears,
    formatWorkExperience,
} from '../../utils/leaveCompanies';

// @anchor month-options
// Miesiace do selecta rozpoczecia pracy — indeks + 1 to numer miesiaca w bazie.
const MONTH_OPTIONS = [
    'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
    'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień',
];

// @anchor edit-user-role-options
// Etykieta DAK celowo pozostaje skrótem — pełna nazwa (dział administracyjno-księgowy)
// tylko w tooltipie, żeby pigułka roli nie rozpychała formularza.
const ROLE_OPTIONS = [
    { value: 'USER', label: 'Pracownik' },
    { value: 'LOGISTYK', label: 'Logistyk' },
    { value: 'MANAGER', label: 'Menadżer' },
    { value: 'DAK', label: 'DAK', title: 'Dział administracyjno-księgowy — podgląd urlopów wszystkich pracowników' },
    { value: 'ADMIN', label: 'Administrator' },
];

export default function EditUserModal({ user, users, teams, onClose, onSuccess }) {
    const [form, setForm] = useState({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        company: user.company || '',
        roles: user.userRoles?.map(r => r.role.name) || ['USER'],
        workStartYear: user.workStartYear ?? '',
        workStartMonth: user.workStartMonth ?? '',
        supervisorId: user.supervisor?.id || '',
        teamIds: Array.isArray(user.teams) ? user.teams.map(t => t.id) : [],
        newPassword: '',
        confirmPassword: '',
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

    const toggleRole = (role) => {
        setForm(f => {
            const has = f.roles.includes(role);
            let next;
            if (has) {
                next = f.roles.filter(r => r !== role);
                if (next.length === 0) next = ['USER'];
            } else if (role === 'USER') {
                // USER wyklucza inne role
                next = ['USER'];
            } else {
                // Inne role wykluczają USER
                next = [...f.roles.filter(r => r !== 'USER'), role];
            }
            return { ...f, roles: next };
        });
    };

    const toggleTeam = (teamId) => {
        setForm(f => ({
            ...f,
            teamIds: f.teamIds.includes(teamId) ? f.teamIds.filter(id => id !== teamId) : [...f.teamIds, teamId]
        }));
    };

    const handleSave = async () => {
        setError(null);
        if (form.newPassword && form.newPassword !== form.confirmPassword) {
            setError('Hasła nie są zgodne.');
            return;
        }

        const payload = {
            firstName: form.firstName,
            lastName: form.lastName,
            company: form.company || null,
            workStartYear: form.workStartYear === '' ? null : Number(form.workStartYear),
            workStartMonth: form.workStartMonth === '' ? null : Number(form.workStartMonth),
            roles: form.roles,
            supervisorId: form.supervisorId || null,
            teamIds: form.teamIds,
        };
        if (form.newPassword) payload.password = form.newPassword;

        setSaving(true);
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/users/${user.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || 'Błąd zapisu');
            }
            onSuccess();
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    // @anchor edit-user-experience-preview
    // Podglad stazu i wymiaru urlopu liczony na biezaco z wpisanego roku i miesiaca —
    // te same funkcje co backend, wiec zapis nie zmieni wyniku.
    const experienceMonths = calculateWorkExperienceMonths(form.workStartYear, form.workStartMonth);
    const experienceYears = calculateWorkExperienceYears(form.workStartYear, form.workStartMonth, user.workExperienceYears ?? null);
    const entitlementDays = calculateLeaveEntitlement(experienceYears);
    const experienceLabel = experienceMonths !== null
        ? formatWorkExperience(experienceMonths)
        : (experienceYears !== null ? `${experienceYears} lat` : null);

    // Close on backdrop click
    const handleBackdrop = (e) => {
        if (e.target === e.currentTarget) onClose();
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onMouseDown={handleBackdrop}
        >
            <div className="relative bg-gray-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-lg p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center">
                    <h2 className="text-lg font-bold text-white">Edycja użytkownika</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-xl leading-none">&times;</button>
                </div>

                {error && (
                    <div className="p-3 bg-red-600/20 border border-red-500/40 rounded text-red-300 text-sm">{error}</div>
                )}

                {/* Podstawowe dane */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-400 uppercase tracking-widest">Imię</label>
                        <input
                            type="text"
                            value={form.firstName}
                            onChange={e => set('firstName', e.target.value)}
                            className="bg-white/5 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500/50"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-400 uppercase tracking-widest">Nazwisko</label>
                        <input
                            type="text"
                            value={form.lastName}
                            onChange={e => set('lastName', e.target.value)}
                            className="bg-white/5 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500/50"
                        />
                    </div>
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400 uppercase tracking-widest">Email</label>
                    <input
                        type="email"
                        value={form.email}
                        readOnly
                        className="bg-white/5 border border-white/10 rounded px-3 py-2 text-gray-400 cursor-not-allowed"
                    />
                </div>

                {/* Firma */}
                {/* @anchor edit-user-company-field */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400 uppercase tracking-widest">Firma</label>
                    <input
                        type="text"
                        list="company-suggestions"
                        value={form.company}
                        onChange={e => set('company', e.target.value)}
                        placeholder="np. Airtel Services"
                        className="bg-white/5 border border-white/10 rounded px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
                    />
                    <datalist id="company-suggestions">
                        {LEAVE_COMPANIES.map(c => <option key={c} value={c} />)}
                    </datalist>
                    <span className="text-[10px] text-gray-500">
                        Firmy z modułem Urlopy: {LEAVE_COMPANIES.join(', ')}
                    </span>
                </div>

                {/* Rozpoczecie pracy — staz i wymiar urlopu system liczy sam, co miesiac */}
                {/* @anchor edit-user-work-start-field */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400 uppercase tracking-widest">Rozpoczęcie pracy</label>
                    <div className="grid grid-cols-2 gap-3">
                        <select
                            value={form.workStartMonth}
                            onChange={e => set('workStartMonth', e.target.value)}
                            className="bg-gray-800 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500/50"
                        >
                            <option value="">miesiąc</option>
                            {MONTH_OPTIONS.map((name, idx) => (
                                <option key={name} value={idx + 1}>{String(idx + 1).padStart(2, '0')} — {name}</option>
                            ))}
                        </select>
                        <input
                            type="number"
                            min="1950"
                            max={new Date().getFullYear()}
                            step="1"
                            value={form.workStartYear}
                            onChange={e => set('workStartYear', e.target.value)}
                            placeholder="rok, np. 2014"
                            className="bg-white/5 border border-white/10 rounded px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
                        />
                    </div>
                    <span className="text-[10px] text-gray-500">
                        {experienceLabel === null
                            ? 'Wliczaj zaliczone okresy nauki. Staż i wymiar urlopu system wyliczy sam.'
                            : `Staż pracy: ${experienceLabel} · wymiar urlopu: ${entitlementDays} dni (Kodeks pracy art. 154 §1)`}
                    </span>
                </div>

                {/* Role */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400 uppercase tracking-widest">Uprawnienia</label>
                    <div className="flex flex-wrap gap-2">
                        {ROLE_OPTIONS.map(r => (
                            <button
                                key={r.value}
                                type="button"
                                title={r.title || r.label}
                                onClick={() => toggleRole(r.value)}
                                className={`px-3 py-1 rounded-full text-sm border transition-all ${
                                    form.roles.includes(r.value)
                                        ? 'bg-blue-600/50 border-blue-500/60 text-white'
                                        : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30'
                                }`}
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Przełożony */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400 uppercase tracking-widest">Przełożony</label>
                    <select
                        value={form.supervisorId}
                        onChange={e => set('supervisorId', e.target.value)}
                        className="bg-gray-800 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500/50"
                    >
                        <option value="">Brak</option>
                        {/* @anchor supervisor-options */}
                        {/* Własnym przełożonym może być tylko konto z rolą ADMIN — pozwala
                            adminowi samodzielnie zatwierdzać swoje wnioski urlopowe.
                            Bierzemy role z formularza, więc opcja pojawia się od razu po nadaniu roli. */}
                        {users
                            .filter(u => u.id !== user.id || form.roles.includes('ADMIN'))
                            .map(u => (
                                <option key={u.id} value={u.id}>
                                    {u.firstName} {u.lastName}{u.id === user.id ? ' (ten sam użytkownik)' : ''}
                                </option>
                            ))}
                    </select>
                </div>

                {/* Zespoły */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400 uppercase tracking-widest">Zespoły</label>
                    <div className="flex flex-wrap gap-2">
                        {teams.map(t => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => toggleTeam(t.id)}
                                className={`px-3 py-1 rounded-full text-sm border transition-all ${
                                    form.teamIds.includes(t.id)
                                        ? 'bg-purple-600/50 border-purple-500/60 text-white'
                                        : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30'
                                }`}
                            >
                                {t.name}
                            </button>
                        ))}
                        {teams.length === 0 && <span className="text-gray-500 text-sm italic">Brak zespołów</span>}
                    </div>
                </div>

                {/* Zmiana hasła */}
                <div className="border-t border-white/10 pt-4 flex flex-col gap-3">
                    <p className="text-xs text-gray-400 uppercase tracking-widest">Zmiana hasła (opcjonalnie)</p>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-500">Nowe hasło</label>
                        <input
                            type="password"
                            value={form.newPassword}
                            onChange={e => set('newPassword', e.target.value)}
                            placeholder="Pozostaw puste, aby nie zmieniać"
                            className="bg-white/5 border border-white/10 rounded px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-500">Powtórz nowe hasło</label>
                        <input
                            type="password"
                            value={form.confirmPassword}
                            onChange={e => set('confirmPassword', e.target.value)}
                            placeholder="Powtórz nowe hasło"
                            className="bg-white/5 border border-white/10 rounded px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50"
                        />
                    </div>
                </div>

                {/* Akcje */}
                <div className="flex justify-end gap-3 pt-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded bg-white/5 hover:bg-white/10 text-gray-300 transition-all"
                    >
                        Anuluj
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-5 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all disabled:opacity-60"
                    >
                        {saving ? 'Zapisywanie...' : 'Zapisz'}
                    </button>
                </div>
            </div>
        </div>
    );
}
