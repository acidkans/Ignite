import { API_URL } from './config';

import { useState } from 'react';

export default function LoginPage({ onLogin }) {
    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState(null);
    const [showPassword, setShowPassword] = useState(false);

    // Form Data
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMsg(null);
        setLoading(true);

        try {
            const baseUrl = API_URL;
            console.log('Attempting login to:', `${baseUrl}/auth/login`);

            if (isLogin) {
                // LOGIN LOGIC
                const res = await fetch(`${baseUrl}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                if (!res.ok) {
                    const text = await res.text();
                    let msg = 'Błędne dane logowania';
                    try { msg = JSON.parse(text)?.message || msg; } catch {}
                    throw new Error(msg);
                }

                const data = await res.json();

                // Zapisz token
                localStorage.setItem('token', data.access_token);
                sessionStorage.setItem('token', data.access_token); // legacy compat
                onLogin(data);

            } else {
                // REGISTER LOGIC
                const res = await fetch(`${baseUrl}/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password, firstName, lastName })
                });

                if (!res.ok) {
                    const text = await res.text();
                    let msg = 'Błąd rejestracji';
                    try { msg = JSON.parse(text)?.message || msg; } catch {}
                    if (msg.includes('Unique constraint')) msg = 'Ten adres email jest już zajęty.';
                    throw new Error(msg);
                }

                const data = await res.json();

                setSuccessMsg('Konto utworzone! Sprawdź email, aby potwierdzić rejestrację.');
                setIsLogin(true); // Switch back to login

                // Opcjonalnie: wyczyść hasło
                setPassword('');
            }
        } catch (err) {
            // Czasami błąd jest obiektem
            const msg = err.message || JSON.stringify(err);
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full max-w-md p-8 glass-panel animate-fade-in relative overflow-hidden transition-all duration-500">
            {/* Dekoracyjne elementy tła */}
            <div className="absolute top-[-50%] left-[-50%] w-full h-full bg-blue-500/20 blur-[100px] rounded-full pointer-events-none"></div>
            <div className="absolute bottom-[-50%] right-[-50%] w-full h-full bg-purple-500/20 blur-[100px] rounded-full pointer-events-none"></div>

            <div className="relative z-10 flex flex-col items-center">
                <h1 className="text-3xl font-bold mb-1 tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
                    GIGATEL
                </h1>
                <p className="text-gray-400 mb-6 text-sm">
                    {isLogin ? 'Zaloguj się do systemu' : 'Utwórz nowe konto'}
                </p>

                {successMsg && (
                    <div className="mb-4 w-full p-3 bg-green-500/20 border border-green-500/40 rounded text-green-200 text-sm text-center animate-fade-in">
                        {successMsg}
                    </div>
                )}

                {error && (
                    <div className="mb-4 w-full animate-fade-in">
                        <div className="flex items-start gap-3 p-4 bg-red-600/25 border border-red-500/60 rounded-lg shadow-lg shadow-red-900/30">
                            <span className="text-red-400 text-xl mt-0.5 shrink-0">⚠</span>
                            <div>
                                <p className="text-red-300 font-semibold text-sm">Błąd logowania</p>
                                <p className="text-red-200 text-sm mt-0.5">{error}</p>
                            </div>
                        </div>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="w-full space-y-4">

                    {/* Rejestracja: Imię i Nazwisko */}
                    {!isLogin && (
                        <div className="flex gap-2">
                            <div className="space-y-1 w-1/2">
                                <label className="text-xs text-gray-400 uppercase tracking-widest ml-1">Imię</label>
                                <input
                                    type="text"
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all"
                                    placeholder="Jan"
                                    required={!isLogin}
                                />
                            </div>
                            <div className="space-y-1 w-1/2">
                                <label className="text-xs text-gray-400 uppercase tracking-widest ml-1">Nazwisko</label>
                                <input
                                    type="text"
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all"
                                    placeholder="Kowalski"
                                    required={!isLogin}
                                />
                            </div>
                        </div>
                    )}

                    <div className="space-y-1">
                        <label className="text-xs text-gray-400 uppercase tracking-widest ml-1">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all"
                            placeholder="name@company.com"
                            required
                        />
                    </div>

                    <div className="space-y-1 relative">
                        <label className="text-xs text-gray-400 uppercase tracking-widest ml-1">Hasło</label>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 focus:bg-white/10 transition-all pr-12"
                                placeholder="••••••••"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                            >
                                {showPassword ? '👁️‍🗨️' : '👁️'}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3.5 mt-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold rounded-lg shadow-lg shadow-blue-900/30 transform transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <div className="flex items-center justify-center gap-2">
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                <span>Przetwarzanie...</span>
                            </div>
                        ) : (isLogin ? 'Zaloguj się' : 'Zarejestruj się')}
                    </button>
                </form>

                <div className="mt-6 text-center space-y-2">
                    <button
                        onClick={() => { setIsLogin(!isLogin); setError(null); setSuccessMsg(null); }}
                        className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    >
                        {isLogin ? 'Nie masz konta? Utwórz tutaj' : 'Masz już konto? Zaloguj się'}
                    </button>

                    {isLogin && (
                        <div>
                            <a href="#" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
                                Zapomniałeś hasła?
                            </a>
                        </div>
                    )}
                </div>

					<p className="mt-6 text-[10px] text-gray-600 tracking-widest">v2026.04.29.314</p>
            </div>
        </div>
    );
}
