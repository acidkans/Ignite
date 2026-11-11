import { API_URL } from './config';
import { APP_VERSION } from './version';

import { useState } from 'react';

// @anchor login-page — tylko logowanie. Samodzielna rejestracja usunięta (audyt 2026-11-10):
// każdy z internetu zakładał konto z dostępem do danych firmy. Konta zakłada ADMIN w „Użytkownicy".
export default function LoginPage({ onLogin }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showPassword, setShowPassword] = useState(false);

    // Form Data
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const baseUrl = API_URL;
            console.log('Attempting login to:', `${baseUrl}/auth/login`);

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
                    Zaloguj się do systemu
                </p>

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
                        ) : 'Zaloguj się'}
                    </button>
                </form>

                <p className="mt-6 text-center text-xs text-gray-500">
                    Nie masz konta albo nie pamiętasz hasła? Skontaktuj się z administratorem.
                </p>

					<p className="mt-6 text-[10px] text-gray-600 tracking-widest">{APP_VERSION}</p>
            </div>
        </div>
    );
}
