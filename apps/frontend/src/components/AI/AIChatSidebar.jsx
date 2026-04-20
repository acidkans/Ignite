import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { API_URL } from '../../config';

export default function AIChatSidebar({ nodeId, nodes, onClose }) {
    const [messages, setMessages] = useState([
        { role: 'assistant', content: 'Cześć! Jestem Twoim asystentem ERP. O czym chcesz dzisiaj porozmawiać?' }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const chatEndRef = useRef(null);

    const [aiConfig, setAiConfig] = useState({ aiModel: '...', embeddingModel: '...' });

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const response = await fetch(`${API_URL}/ai/config`);
                const data = await response.json();
                setAiConfig(data);
            } catch (err) {
                console.error('[AI Chat] Failed to fetch AI config:', err);
            }
        };
        fetchConfig();
    }, []);

    // Znajdź nazwę aktualnego węzła dla kontekstu
    const findNodeName = (id, tree) => {
        for (const node of tree) {
            if (node.id === id) return node.name;
            if (node.children) {
                const found = findNodeName(id, node.children);
                if (found) return found;
            }
        }
        return null;
    };

    const activeNodeName = nodeId ? findNodeName(nodeId, nodes) : 'Wszystkie projekty';

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSyncDb = async () => {
        setSyncing(true);
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/ai/sync-db`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `✓ ${data.message || 'Synchronizacja zakończona.'}`
            }]);
        } catch (err) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `✗ Błąd synchronizacji: ${err.message}`
            }]);
        } finally {
            setSyncing(false);
        }
    };

    const handleSend = async (e) => {
        e.preventDefault();
        if (!input.trim() || loading) return;

        const userMsg = input;
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setLoading(true);

        try {
            const token = sessionStorage.getItem('token');
            const response = await fetch(`${API_URL}/ai/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    question: userMsg,
                    nodeId: nodeId === 'administracja' ? undefined : nodeId, // Filtracja tylko jeśli nie jesteśmy w adminie
                    conversationHistory: messages.map(m => ({ role: m.role, content: m.content }))
                })
            });

            const data = await response.json();

            console.log('[AI Chat] Response:', data);

            // Sprawdź czy odpowiedź nie jest pusta
            if (!data.answer || data.answer.trim().length === 0) {
                console.error('[AI Chat] Empty answer from backend');
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: 'Przepraszam, nie otrzymałem odpowiedzi od serwera. Spróbuj ponownie.',
                    sources: []
                }]);
                return;
            }

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: data.answer,
                sources: data.sources || []
            }]);
        } catch (err) {
            console.error('[AI Chat] Error:', err);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Przepraszam, wystąpił błąd podczas komunikacji z serwerem.',
                sources: []
            }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-black/40 backdrop-blur-xl border-l border-white/5 shadow-2xl overflow-hidden">
            {/* Header with Context */}
            <div className="p-4 border-b border-white/5 bg-white/5 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Asystent AI</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleSyncDb}
                            disabled={syncing}
                            title="Zsynchronizuj dane z bazy"
                            className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-400 hover:text-blue-300 hover:bg-blue-500/10 border border-white/10 hover:border-blue-500/30 rounded-md transition-all"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                            </svg>
                            {syncing ? 'Sync...' : 'Sync'}
                        </button>
                        {onClose && (
                            <button
                                onClick={onClose}
                                className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                                title="Zwiń"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>
                <div className="text-sm font-medium text-blue-400 flex items-center gap-2">
                    <span className="text-gray-500">Kontekst:</span>
                    <span className="truncate" title={activeNodeName}>{activeNodeName}</span>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-white/10">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[90%] rounded-2xl p-3 text-sm shadow-sm transition-all duration-300 ${msg.role === 'user'
                            ? 'bg-blue-600/20 text-blue-100 border border-blue-500/30 ml-4'
                            : 'bg-white/5 text-gray-200 border border-white/10 mr-4'
                            }`}>
                            <div className="prose prose-invert prose-sm max-w-none">
                                {/* Tymczasowo wyłączony markdown - pokazujemy surowy tekst */}
                                <pre className="whitespace-pre-wrap font-sans text-sm">
                                    {msg.content}
                                </pre>
                                {/* 
                                <ReactMarkdown
                                    components={{
                                        p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                                        ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
                                        ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-2 space-y-1" {...props} />,
                                        li: ({ node, ...props }) => <li className="text-gray-200" {...props} />,
                                        code: ({ node, inline, ...props }) =>
                                            inline
                                                ? <code className="bg-white/10 px-1.5 py-0.5 rounded text-blue-300 font-mono text-xs" {...props} />
                                                : <code className="block bg-black/30 p-3 rounded-lg my-2 overflow-x-auto font-mono text-xs border border-white/10" {...props} />,
                                        pre: ({ node, ...props }) => <pre className="my-2" {...props} />,
                                        strong: ({ node, ...props }) => <strong className="font-bold text-white" {...props} />,
                                        em: ({ node, ...props }) => <em className="italic text-blue-200" {...props} />,
                                        h1: ({ node, ...props }) => <h1 className="text-xl font-bold text-white mb-2 mt-3" {...props} />,
                                        h2: ({ node, ...props }) => <h2 className="text-lg font-bold text-white mb-2 mt-2" {...props} />,
                                        h3: ({ node, ...props }) => <h3 className="text-base font-bold text-white mb-1 mt-2" {...props} />,
                                        blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-blue-500/50 pl-3 italic text-gray-300 my-2" {...props} />,
                                    }}
                                >
                                    {msg.content}
                                </ReactMarkdown>
                                */}
                            </div>

                            {msg.sources && msg.sources.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-white/5">
                                    <details className="group">
                                        <summary className="text-[10px] text-gray-500 cursor-pointer hover:text-blue-400 transition-colors list-none flex items-center gap-1 select-none">
                                            <span className="group-open:rotate-90 transition-transform duration-200 inline-block text-[8px]">▶</span>
                                            <span>Pokaż źródła ({new Set(msg.sources.map(s => s.fileName)).size})</span>
                                        </summary>
                                        <div className="mt-1 pl-3 text-[10px] text-gray-400 flex flex-col gap-0.5 animate-fade-in">
                                            {[...new Set(msg.sources.map(s => s.fileName))].map((fileName, idx) => (
                                                <div key={idx} className="truncate hover:text-white transition-colors" title={fileName}>
                                                    - {fileName}
                                                </div>
                                            ))}
                                        </div>
                                    </details>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-white/5 text-gray-400 border border-white/10 rounded-2xl p-3 text-sm flex items-center gap-2">
                            <div className="flex gap-1">
                                <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce"></div>
                                <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                            </div>
                            Myślę...
                        </div>
                    </div>
                )}
                <div ref={chatEndRef} />
            </div>

            {/* Input Field */}
            <div className="p-4 bg-white/5 border-t border-white/5">
                <form onSubmit={handleSend} className="relative">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Zadaj pytanie o dokumentację..."
                        className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all"
                        disabled={loading}
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || loading}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-blue-400 hover:text-blue-300 disabled:text-gray-600 transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                        </svg>
                    </button>
                </form>
                <p className="text-[10px] text-gray-600 text-center mt-2 lowercase">
                    {aiConfig.aiModel} & {aiConfig.embeddingModel} • Odpowiada na podstawie dokumentacji projektu
                </p>
            </div>
        </div>
    );
}
