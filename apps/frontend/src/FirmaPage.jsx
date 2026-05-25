import { useState, useEffect } from 'react';
import { API_URL } from './config';
import { Save, CheckCircle, Building2, Phone, Mail, User, Info, Navigation } from 'lucide-react';

// @anchor firma-page
// Singleton — dane „mojej firmy". Wszystkie pola 1:1 z `SiteInfoTab` (oprócz tych,
// które są specyficzne dla lokalizacji terenowej). Endpoint: GET/PATCH /company.
// Wyliczenia bazujące na tych danych podpinaj przez fetch `/company` — backend
// gwarantuje że wiersz istnieje (auto-create przy pierwszym GET).
export default function FirmaPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        number: '',
        addressStreet: '',
        addressCity: '',
        addressZipCode: '',
        addressCountry: '',
        contactFirstName: '',
        contactLastName: '',
        contactPhone: '',
        contactEmail: '',
    });
    const [geoCoords, setGeoCoords] = useState('');

    useEffect(() => {
        fetchCompany();
    }, []);

    const fetchCompany = async () => {
        setLoading(true);
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/company`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setFormData({
                    name: data.name || '',
                    number: data.number || '',
                    addressStreet: data.addressStreet || '',
                    addressCity: data.addressCity || '',
                    addressZipCode: data.addressZipCode || '',
                    addressCountry: data.addressCountry || '',
                    contactFirstName: data.contactFirstName || '',
                    contactLastName: data.contactLastName || '',
                    contactPhone: data.contactPhone || '',
                    contactEmail: data.contactEmail || '',
                });
                if (data.addressLatitude != null && data.addressLongitude != null) {
                    setGeoCoords(`${data.addressLatitude}, ${data.addressLongitude}`);
                } else {
                    setGeoCoords('');
                }
            }
        } catch (err) {
            console.error('Error fetching company:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const token = sessionStorage.getItem('token');
            let lat = null;
            let lng = null;
            if (geoCoords.trim()) {
                const parts = geoCoords.split(',').map(p => p.trim());
                if (parts.length >= 2) {
                    lat = parseFloat(parts[0]);
                    lng = parseFloat(parts[1]);
                }
            }
            const payload = {
                ...formData,
                addressLatitude: Number.isFinite(lat) ? lat : null,
                addressLongitude: Number.isFinite(lng) ? lng : null,
            };
            const res = await fetch(`${API_URL}/company`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                setSaved(true);
                setTimeout(() => setSaved(false), 3000);
            } else {
                alert('Błąd zapisu danych firmy');
            }
        } catch (err) {
            console.error('Save error:', err);
            alert('Błąd połączenia');
        } finally {
            setSaving(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    if (loading) return (
        <div className="flex items-center justify-center p-20 text-gray-400">
            <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mr-3" />
            Ładowanie danych firmy...
        </div>
    );

    const inputCls = "w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-all text-sm";
    const labelCls = "block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1";

    return (
        <div className="p-6 overflow-auto custom-scrollbar h-full">
            <div className="animate-fade-in flex flex-col gap-6 w-full max-w-4xl mx-auto">
                <div className="glass-panel p-6 rounded-2xl border border-white/5 bg-gradient-to-br from-blue-600/10 to-purple-600/10 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center border border-blue-500/30">
                            <Building2 className="text-blue-400" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white">{formData.name || 'Moja Firma'}</h3>
                            <p className="text-xs text-blue-300 opacity-60">Dane firmy używane do wyliczeń (singleton)</p>
                        </div>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] text-gray-500 uppercase font-bold">Status Geo</span>
                        <span className={`text-xs font-mono ${geoCoords ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {geoCoords ? '✓ Zlokalizowano' : '⚠ Brak Współrzędnych'}
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <section className="glass-panel p-6 rounded-2xl border border-white/5 bg-white/[0.02] flex flex-col gap-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Info size={16} className="text-blue-400" />
                            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-300">Podstawowe Informacje</h4>
                        </div>
                        <div>
                            <label className={labelCls}>Nazwa Firmy</label>
                            <input name="name" value={formData.name} onChange={handleChange} className={inputCls} placeholder="np. Gigatel sp. z o.o." />
                        </div>
                        <div>
                            <label className={labelCls}>Numer / Identyfikator</label>
                            <input name="number" value={formData.number} onChange={handleChange} className={inputCls} placeholder="np. NIP, REGON, kod" />
                        </div>
                        <div>
                            <label className={labelCls}>Współrzędne Geo (Lat, Long)</label>
                            <div className="relative">
                                <Navigation size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input
                                    value={geoCoords}
                                    onChange={(e) => setGeoCoords(e.target.value)}
                                    className={`${inputCls} pl-9 font-mono`}
                                    placeholder="52.2297, 21.0122"
                                    title="Wklej współrzędne w formacie: szerokość, długość"
                                />
                            </div>
                            <p className="text-[9px] text-gray-500 mt-1 ml-1">Format: szerokość, długość (np. z Google Maps)</p>
                        </div>
                    </section>

                    <section className="glass-panel p-6 rounded-2xl border border-white/5 bg-white/[0.02] flex flex-col gap-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Navigation size={16} className="text-purple-400" />
                            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-300">Adres</h4>
                        </div>
                        <div>
                            <label className={labelCls}>Ulica i numer</label>
                            <input name="addressStreet" value={formData.addressStreet} onChange={handleChange} className={inputCls} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className={labelCls}>Kod pocztowy</label>
                                <input name="addressZipCode" value={formData.addressZipCode} onChange={handleChange} className={inputCls} />
                            </div>
                            <div>
                                <label className={labelCls}>Miejscowość</label>
                                <input name="addressCity" value={formData.addressCity} onChange={handleChange} className={inputCls} />
                            </div>
                        </div>
                        <div>
                            <label className={labelCls}>Kraj</label>
                            <input name="addressCountry" value={formData.addressCountry} onChange={handleChange} className={inputCls} />
                        </div>
                    </section>

                    <section className="glass-panel p-6 rounded-2xl border border-white/5 bg-white/[0.02] md:col-span-2 flex flex-col gap-4">
                        <div className="flex items-center gap-2 mb-2">
                            <User size={16} className="text-emerald-400" />
                            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-300">Osoba Kontaktowa</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                                <label className={labelCls}>Imię</label>
                                <input name="contactFirstName" value={formData.contactFirstName} onChange={handleChange} className={inputCls} />
                            </div>
                            <div>
                                <label className={labelCls}>Nazwisko</label>
                                <input name="contactLastName" value={formData.contactLastName} onChange={handleChange} className={inputCls} />
                            </div>
                            <div>
                                <label className={labelCls}>Telefon</label>
                                <div className="relative">
                                    <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <input name="contactPhone" value={formData.contactPhone} onChange={handleChange} className={`${inputCls} pl-9`} placeholder="+48 ..." />
                                </div>
                            </div>
                            <div>
                                <label className={labelCls}>E-mail</label>
                                <div className="relative">
                                    <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <input name="contactEmail" value={formData.contactEmail} onChange={handleChange} className={`${inputCls} pl-9`} placeholder="example@..." />
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                <div className="flex justify-end pt-4 border-t border-white/5">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 active:scale-95 group"
                    >
                        {saving ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : saved ? (
                            <CheckCircle size={18} className="text-emerald-300" />
                        ) : (
                            <Save size={18} className="group-hover:scale-110 transition-transform" />
                        )}
                        <span>{saving ? 'Zapisywanie...' : saved ? 'Zapisano pomyślnie!' : 'Zapisz dane firmy'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
