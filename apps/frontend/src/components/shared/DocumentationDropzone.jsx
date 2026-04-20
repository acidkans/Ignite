import { useState } from 'react';
import { API_URL } from '../../config';

export default function DocumentationDropzone({ nodeId }) {
    const [dragActive, setDragActive] = useState(false);
    const [files, setFiles] = useState([]);
    const [uploading, setUploading] = useState(false);

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            // Prevent flickering when dragging over children
            if (e.currentTarget.contains(e.relatedTarget)) return;
            setDragActive(false);
        }
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const newFiles = Array.from(e.dataTransfer.files);
            setFiles(prev => [...prev, ...newFiles]);
            await uploadFiles(newFiles);
        }
    };

    const uploadFiles = async (filesToUpload) => {
        setUploading(true);
        const token = sessionStorage.getItem('token');

        for (const file of filesToUpload) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('nodeId', nodeId);

            try {
                console.log(`Uploading ${file.name}...`);
                const res = await fetch(`${API_URL}/documents/upload`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    body: formData
                });

                if (res.ok) {
                    const data = await res.json();
                    console.log('Upload success:', data);
                    // Możesz tu zaktualizować status pliku na liście visualnie
                } else {
                    console.error('Upload failed');
                }
            } catch (err) {
                console.error('Upload error:', err);
            }
        }
        setUploading(false);
    };

    if (!nodeId) return (
        <div
            className="h-full w-full flex items-center justify-center text-gray-500 border-2 border-dashed border-white/5 m-2 rounded-xl bg-white/5"
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                alert('Proszę najpierw wybrać obszar (węzeł) z drzewa po lewej stronie.');
            }}
        >
            Proszę wybrać obszar z menu po lewej, aby aktywować strefę zrzutu.
        </div>
    );

    return (
        <div className="h-full w-full p-4 flex gap-4 bg-transparent">
            {/* Dropzone Area */}
            <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`flex-1 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer relative overflow-hidden
                    ${dragActive
                        ? 'border-blue-400 bg-blue-500/20'
                        : 'border-white/10 bg-black/40 hover:border-blue-500/50 hover:bg-black/60'
                    }`}
            >
                {uploading && (
                    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                        <span className="ml-3 text-blue-400 font-mono text-xs">Indeksowanie AI...</span>
                    </div>
                )}

                <div className="text-4xl mb-3 opacity-50 transition-transform group-hover:scale-110">📥</div>
                <h3 className="text-sm font-bold text-gray-300 mb-1">Upuść dokumenty tutaj</h3>
                <p className="text-[10px] text-gray-500 text-center max-w-xs">
                    Pliki zostaną automatycznie przeanalizowane przez AI <br />
                    i powiązane z obszarem <span className="text-blue-400 font-mono">{nodeId}</span>
                </p>
            </div>

            {/* File List Side Panel */}
            <div className="w-64 bg-black/40 rounded-xl border border-white/10 flex flex-col overflow-hidden">
                <div className="p-2 bg-black/40 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-white/5 flex justify-between">
                    <span>Ostatnio dodane</span>
                    <span>{files.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                    {files.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-4 opacity-20">
                            <span className="text-2xl mb-2">📄</span>
                            <span className="text-[10px]">Brak plików w sesji</span>
                        </div>
                    ) : (
                        files.map((f, i) => (
                            <div key={i} className="flex items-center gap-2 p-2 bg-white/5 rounded border border-white/5 text-xs group hover:bg-white/10 transition-colors">
                                <span className="text-blue-400 text-base">📄</span>
                                <div className="flex-1 min-w-0">
                                    <div className="truncate text-gray-300 font-medium">{f.name}</div>
                                    <div className="flex justify-between items-center mt-0.5">
                                        <span className="text-[9px] text-gray-600">{(f.size / 1024).toFixed(1)} KB</span>
                                        <span className="text-[9px] text-green-500">Zaindeksowano</span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
