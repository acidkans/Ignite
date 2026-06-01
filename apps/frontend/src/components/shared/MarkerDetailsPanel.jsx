import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, MapPin, Mic, Camera, FilePlus, Trash2, Save, ChevronDown, ChevronLeft, Download, Image as ImageIcon, CheckSquare, Square, Layers, Plus, Check, Video, Play } from 'lucide-react';
import { API_URL } from '../../config';
import { useNetwork } from '../../hooks/useNetwork';
import { enqueue, updateTempMarkerPayload } from '../../services/repos/outboxRepo';
import { db } from '../../services/db';

// Flatten all WBS nodes recursively with path label
function flattenWbsNodes(nodes, prefix = '') {
    const result = [];
    nodes.forEach((n, i) => {
        const label = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
        result.push({ id: n.id, name: n.name || '(bez nazwy)', path: label });
        if (n.children?.length) result.push(...flattenWbsNodes(n.children, label));
    });
    return result;
}

export default function MarkerDetailsPanel({ marker, onClose, onRefresh, nodeId, subtaskId, versionId, isNew = false }) {
    const { isOnline } = useNetwork();
    const [uploading, setUploading] = useState(false);
    const [editName, setEditName] = useState(marker.name || (marker.type === 'TEXT' ? marker.note || '' : ''));
    const [editComment, setEditComment] = useState('');
    const [editQuestion, setEditQuestion] = useState(marker.question || '');
    const [editingAttNote, setEditingAttNote] = useState(null);
    const [lightboxAtt, setLightboxAtt] = useState(null);
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [mediaRecorder, setMediaRecorder] = useState(null);
    // WBS multi-assign
    const [wbsNodes, setWbsNodes] = useState([]);
    const wbsItemsRef = useRef([]); // pełne obiekty z polem qa
    const prevQuestionRef = useRef(marker.question || '');
    const [wbsLinks, setWbsLinks] = useState([]); // [{id, wbsNodeId, markerId}]
    const wbsLinksRef = useRef([]);
    const [wbsToggling, setWbsToggling] = useState(null);
    const [addWbsMode, setAddWbsMode] = useState(null); // null | 'item' | 'requirement'
    const [addWbsParentId, setAddWbsParentId] = useState('');
    const [addWbsName, setAddWbsName] = useState('');
    const [addWbsSaving, setAddWbsSaving] = useState(false);
    // @anchor extra-questions
    const [extraQuestions, setExtraQuestions] = useState([]);
    const extraQsInitializedRef = useRef(false);
    // Pytania z przypisanych węzłów WBS (mobile — zawsze aktualne)
    const [linkedQuestions, setLinkedQuestions] = useState([]);
    // @anchor qa-refresh-tick
    const [qaRefreshTick, setQaRefreshTick] = useState(0);
    const addWbsInputRef = useRef(null);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const camInputRef = useRef(null);
    // Flaga: user aktywnie zmienił przypisanie WBS → wywołaj auto-nazewnictwo
    const shouldAutoNameRef = useRef(false);

    // Sync wbsLinksRef i inicjalizacja komentarza z pierwszego węzła WBS
    useEffect(() => { wbsLinksRef.current = wbsLinks; }, [wbsLinks]);

    // Auto-nazewnictwo znacznika na podstawie przypisanych przedmiotów WBS
    useEffect(() => {
        if (!shouldAutoNameRef.current) return;
        shouldAutoNameRef.current = false;
        if (wbsLinks.length === 0) return;

        const computeAndSaveName = async () => {
            const token = sessionStorage.getItem('token');
            const linkedNodes = wbsLinks
                .map(l => wbsNodes.find(n => n.id === l.wbsNodeId))
                .filter(Boolean);
            if (linkedNodes.length === 0) return;

            let newName;
            if (linkedNodes.length === 1) {
                const node = linkedNodes[0];
                // Pobierz ile innych markerów jest już przypisanych do tego węzła
                try {
                    const res = await fetch(`${API_URL}/schematics/wbs-node-markers/${node.id}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (res.ok) {
                        const allLinks = await res.json();
                        const otherCount = allLinks.filter(l => l.markerId !== marker.id).length;
                        newName = otherCount > 0 ? `${node.name} ${otherCount + 1}` : node.name;
                    } else {
                        newName = node.name;
                    }
                } catch {
                    newName = node.name;
                }
            } else {
                // Wiele przedmiotów → pierwsze 3 litery każdego, rozdzielone ", "
                newName = linkedNodes.map(n => n.name.trim().substring(0, 3)).join(', ');
            }

            if (!newName) return;
            setEditName(newName);

            if (marker.id?.toString().startsWith('temp_')) {
                await updateTempMarkerPayload(marker.id, { name: newName });
                window.dispatchEvent(new CustomEvent('temp-marker-updated', {
                    detail: { tempId: marker.id, updates: { name: newName } }
                }));
            } else {
                await fetch(`${API_URL}/schematics/markers/${marker.id}`, {
                    method: 'PATCH',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: newName })
                });
            }
        };

        computeAndSaveName();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wbsLinks]);

    // Wczytaj extra pytania z qa węzła WBS (jednorazowo — desktop)
    useEffect(() => {
        if (!wbsLinks.length || extraQsInitializedRef.current) return;
        extraQsInitializedRef.current = true;
        const firstNode = wbsItemsRef.current.find(n => n.id === wbsLinks[0].wbsNodeId);
        if (!firstNode) return;
        const qa = Array.isArray(firstNode.qa) ? firstNode.qa : [];
        const mainQ = (marker.question || '').trim();
        const extras = qa
            .filter(item => item.question && item.question.trim() !== mainQ)
            .map((item, i) => ({ id: Date.now() + i, text: item.question }));
        if (extras.length) setExtraQuestions(extras);
    }, [wbsLinks, marker.question]);

    // Pytania z przypisanych przedmiotów — mobile, zawsze aktualne przy zmianie WBS
    useEffect(() => {
        const seen = new Set();
        const questions = [];
        for (const link of wbsLinks) {
            const node = wbsItemsRef.current.find(n => n.id === link.wbsNodeId);
            if (!node) continue;
            const qa = Array.isArray(node.qa) ? node.qa : [];
            for (const item of qa) {
                const q = item.question?.trim();
                if (q && !seen.has(q)) {
                    seen.add(q);
                    questions.push({ question: q, answer: item.answer || '' });
                }
            }
        }
        setLinkedQuestions(questions);
    }, [wbsLinks, qaRefreshTick]);

    // Odświeżenie licznika pytań po zapisie qa (extra-question / edit question)
    useEffect(() => {
        const handler = () => setQaRefreshTick(t => t + 1);
        window.addEventListener('wbs-qa-imported', handler);
        return () => window.removeEventListener('wbs-qa-imported', handler);
    }, []);
    useEffect(() => {
        if (!wbsLinks.length) return;
        const node = wbsItemsRef.current.find(n => n.id === wbsLinks[0].wbsNodeId);
        if (node != null) setEditComment(node.comment || '');
    }, [wbsLinks]);

    // Sync komentarza z WBS tabeli → panel
    useEffect(() => {
        const handler = (e) => {
            const { wbsNodeIds, comment } = e.detail || {};
            if (wbsLinksRef.current.some(l => wbsNodeIds?.includes(l.wbsNodeId))) {
                setEditComment(comment || '');
            }
        };
        window.addEventListener('wbs-comment-changed', handler);
        return () => window.removeEventListener('wbs-comment-changed', handler);
    }, []);

    // Mechanizm kafelków na mobile — nowe markery od razu otwierają sekcję WBS
    const [expandedSection, setExpandedSection] = useState(null);

    // Responsive check
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Auto-otwieranie sekcji WBS dla nowych markerów na mobile
    useEffect(() => {
        if (isMobile && (isNew || marker.id?.toString().startsWith('temp_'))) {
            setExpandedSection('wbs');
        }
    }, [isMobile, isNew, marker.id]);


    const fetchWbsLinks = useCallback(async () => {
        const token = sessionStorage.getItem('token');
        const url = versionId
            ? `${API_URL}/schematics/marker-wbs-links/${marker.id}?versionId=${versionId}`
            : `${API_URL}/schematics/marker-wbs-links/${marker.id}`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) setWbsLinks(await res.json());
    }, [marker.id, versionId]);

    useEffect(() => {
        if (!nodeId) return;
        const token = sessionStorage.getItem('token');
        // Fetch WBS from relational table (same source as UnifiedWbsPanel)
        fetch(`${API_URL}/wbs-nodes/unified/${nodeId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.json()).then(async data => {
            try {
                const items = data.items || [];
                wbsItemsRef.current = items;
                const byId = new Map(items.map(n => [n.id, { ...n, children: [] }]));
                const roots = [];
                for (const n of byId.values()) {
                    if (n.parentId && byId.has(n.parentId)) {
                        byId.get(n.parentId).children.push(n);
                    } else {
                        roots.push(n);
                    }
                }
                setWbsNodes(flattenWbsNodes(roots));
            } catch { setWbsNodes([]); }
            await fetchWbsLinks();
        }).catch(() => {});
    }, [nodeId, fetchWbsLinks]);

    const toggleWbsLink = async (wbsNodeId) => {
        const token = sessionStorage.getItem('token');
        const existing = wbsLinks.find(l => l.wbsNodeId === wbsNodeId);
        shouldAutoNameRef.current = true; // uruchom auto-nazewnictwo po zmianie
        setWbsToggling(wbsNodeId);
        try {
            if (existing) {
                await fetch(`${API_URL}/schematics/wbs-node-markers/${existing.id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                setWbsLinks(prev => prev.filter(l => l.id !== existing.id));
            } else {
                const res = await fetch(`${API_URL}/schematics/wbs-node-markers`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ wbsNodeId, markerId: marker.id })
                });
                if (res.ok) {
                    const link = await res.json();
                    setWbsLinks(prev => [...prev, link]);
                }
            }
        } finally {
            setWbsToggling(null);
        }
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported(t)) || '';
            const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
            const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            const chunks = [];
            recorder.ondataavailable = (e) => chunks.push(e.data);
            recorder.onstop = async () => {
                const actualType = recorder.mimeType || mimeType || 'audio/webm';
                const blob = new Blob(chunks, { type: actualType });
                const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: actualType });
                await uploadFile(file);
                stream.getTracks().forEach(track => track.stop());
            };
            recorder.start();
            setMediaRecorder(recorder);
            setIsRecording(true);
        } catch (err) {
            alert('Błąd mikrofonu: ' + err.message);
        }
    };

    const stopRecording = () => {
        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
            setIsRecording(false);
        }
    };

    const startCamera = async () => {
        if (isMobile || !window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
            camInputRef.current?.click();
            return;
        }
        setIsCameraActive(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 4096 }, height: { ideal: 2160 } }
            });
            if (videoRef.current) videoRef.current.srcObject = stream;
        } catch (err) {
            setIsCameraActive(false);
            camInputRef.current?.click();
        }
    };

    const capturePhoto = async () => {
        if (!videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(async (blob) => {
            if (!blob) return;
            const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
            if (videoRef.current?.srcObject) {
                videoRef.current.srcObject.getTracks().forEach(track => track.stop());
            }
            setIsCameraActive(false);
            await uploadFile(file);
        }, 'image/jpeg', 0.95);
    };

    const handleCapture = async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        for (const file of files) {
            await uploadFile(file);
        }
    };

    const uploadFile = async (file) => {
        if (!isOnline || isTemp) {
            setUploading(true);
            try {
                const arrayBuffer = await file.arrayBuffer();
                const outboxId = crypto.randomUUID();
                await db.attachmentDrafts.add({
                    outboxId, arrayBuffer,
                    fileName: file.name, fileType: file.type,
                    createdAt: new Date().toISOString(),
                });
                await enqueue('ADD_ATTACHMENT', {
                    markerId: marker.id, outboxId,
                    fileName: file.name, fileType: file.type,
                    subtaskId, nodeId,
                });
                // Optimistyczny podgląd — blob URL jako tymczasowy preview
                const blobUrl = URL.createObjectURL(new Blob([arrayBuffer], { type: file.type }));
                window.dispatchEvent(new CustomEvent('temp-marker-updated', {
                    detail: {
                        tempId: marker.id,
                        updates: {
                            attachments: [...(marker.attachments || []), {
                                id: `pending_${outboxId}`,
                                isPending: true,
                                fileType: file.type.startsWith('image/') ? 'IMAGE' : file.type.startsWith('video/') ? 'VIDEO' : 'FILE',
                                fileUrl: blobUrl,
                                fileName: file.name,
                            }],
                        },
                    },
                }));
            } catch (err) {
                alert('Błąd zapisu lokalnego: ' + err.message);
            } finally {
                setUploading(false);
            }
            return;
        }

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/schematics/markers/${marker.id}/attachments`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            if (!res.ok) {
                let msg = `Błąd wgrywania (HTTP ${res.status})`;
                try { const body = await res.json(); msg += ': ' + (body.message || JSON.stringify(body)); } catch {}
                throw new Error(msg);
            }
            onRefresh(true);
        } catch (err) {
            alert(err.message);
        } finally {
            setUploading(false);
        }
    };

    const dispatchTempUpdate = (updates) => {
        window.dispatchEvent(new CustomEvent('temp-marker-updated', { detail: { tempId: marker.id, updates } }));
    };

    const handleUpdateName = async () => {
        if (isTemp) {
            await updateTempMarkerPayload(marker.id, { name: editName });
            dispatchTempUpdate({ name: editName });
            return;
        }
        try {
            const token = sessionStorage.getItem('token');
            await fetch(`${API_URL}/schematics/markers/${marker.id}`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: editName })
            });
            onRefresh(true);
        } catch(err) { console.error(err); }
    };

    const handleUpdateComment = async () => {
        const token = sessionStorage.getItem('token');
        for (const link of wbsLinks) {
            try {
                await fetch(`${API_URL}/wbs-nodes/${link.wbsNodeId}`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ comment: editComment })
                });
                const node = wbsItemsRef.current.find(n => n.id === link.wbsNodeId);
                if (node) node.comment = editComment;
            } catch(err) { console.error(err); }
        }
        window.dispatchEvent(new CustomEvent('wbs-comment-changed', {
            detail: { wbsNodeIds: wbsLinks.map(l => l.wbsNodeId), comment: editComment }
        }));
    };

    const handleUpdateQuestion = async () => {
        if (isTemp) {
            await updateTempMarkerPayload(marker.id, { question: editQuestion });
            dispatchTempUpdate({ question: editQuestion });
            return;
        }
        const token = sessionStorage.getItem('token');
        const prev = prevQuestionRef.current;
        const next = editQuestion.trim();
        prevQuestionRef.current = next;
        try {
            await fetch(`${API_URL}/schematics/markers/${marker.id}`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: next || null })
            });
        } catch(err) { console.error(err); }

        // Sync pytania do qa każdego powiązanego węzła WBS
        for (const link of wbsLinks) {
            const node = wbsItemsRef.current.find(n => n.id === link.wbsNodeId);
            if (!node) continue;
            const qa = Array.isArray(node.qa) ? [...node.qa] : [];
            // Usuń poprzednie pytanie tego znacznika (match po treści)
            const filtered = prev ? qa.filter(p => p.question !== prev) : qa;
            // Dodaj nowe (jeśli niepuste)
            const updated = next ? [...filtered, { question: next, answer: '' }] : filtered;
            // Aktualizuj lokalny cache
            node.qa = updated;
            try {
                await fetch(`${API_URL}/wbs-nodes/${link.wbsNodeId}`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ qa: updated })
                });
            } catch(err) { console.error('[qa sync]', err); }
        }
        window.dispatchEvent(new CustomEvent('wbs-qa-imported'));
        onRefresh(true);
    };

    // @anchor handle-add-extra-question
    const handleAddExtraQuestion = () => {
        setExtraQuestions(prev => [...prev, { id: Date.now(), text: '' }]);
    };

    // @anchor handle-extra-question-change
    const handleExtraQuestionChange = (id, text, el) => {
        setExtraQuestions(prev => prev.map(q => q.id === id ? { ...q, text } : q));
        if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
    };

    // @anchor handle-save-extra-question
    const handleSaveExtraQuestion = async (id) => {
        const q = extraQuestions.find(q => q.id === id);
        if (!q || !q.text.trim()) return;
        const trimmed = q.text.trim();
        const token = sessionStorage.getItem('token');
        for (const link of wbsLinksRef.current) {
            const node = wbsItemsRef.current.find(n => n.id === link.wbsNodeId);
            if (!node) continue;
            const qa = Array.isArray(node.qa) ? [...node.qa] : [];
            if (!qa.find(item => item.question === trimmed)) {
                const updated = [...qa, { question: trimmed, answer: '' }];
                node.qa = updated;
                try {
                    await fetch(`${API_URL}/wbs-nodes/${link.wbsNodeId}`, {
                        method: 'PATCH',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ qa: updated })
                    });
                } catch(err) { console.error('[extra qa]', err); }
            }
        }
        window.dispatchEvent(new CustomEvent('wbs-qa-imported'));
    };

    const handleDeleteMarker = async () => {
        if (!window.confirm('Usunąć znacznik?')) return;
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/schematics/markers/${marker.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Nie udało się usunąć znacznika');
            onClose();
            await onRefresh();
        } catch (err) { 
            alert(err.message);
            console.error(err); 
        }
    };

    const handleUpdateAttachmentNote = async (id, note) => {
        try {
            const token = sessionStorage.getItem('token');
            await fetch(`${API_URL}/schematics/attachments/${id}`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ note })
            });
            setEditingAttNote(null);
            onRefresh(true);
        } catch(err) { console.error(err); }
    };

    const handleDeleteAttachment = async (id) => {
        if (!window.confirm('Usunąć załącznik?')) return;
        try {
            const token = sessionStorage.getItem('token');
            await fetch(`${API_URL}/schematics/attachments/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            onRefresh(true);
        } catch(err) { console.error(err); }
    };

    const openAddWbs = (mode) => {
        setAddWbsMode(mode);
        setAddWbsName('');
        if (mode === 'requirement') {
            // Domyślnie: gałąź zaznaczona w drzewie (pierwszy linked węzeł).
            // Gdy brak zaznaczenia — pozostaw puste, aby wymusić wybór z dropdown.
            const linkedId = wbsLinks[0]?.wbsNodeId;
            const selected = linkedId && wbsNodes.find(n => n.id === linkedId);
            setAddWbsParentId(selected?.id || '');
        } else {
            setAddWbsParentId('');
        }
        setTimeout(() => addWbsInputRef.current?.focus(), 80);
    };

    const createWbsNode = async () => {
        if (!addWbsName.trim() || !nodeId) return;
        setAddWbsSaving(true);
        try {
            const token = sessionStorage.getItem('token');
            const body = { nodeId, name: addWbsName.trim() };
            if (addWbsMode === 'requirement' && addWbsParentId) body.parentId = addWbsParentId;
            const res = await fetch(`${API_URL}/wbs-nodes`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!res.ok) throw new Error('Błąd tworzenia');
            const newNode = await res.json();
            // Odśwież drzewo WBS
            const treeRes = await fetch(`${API_URL}/wbs-nodes/unified/${nodeId}`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (treeRes.ok) {
                const data = await treeRes.json();
                const items = data.items || [];
                const byId = new Map(items.map(n => [n.id, { ...n, children: [] }]));
                const roots = [];
                for (const n of byId.values()) {
                    if (n.parentId && byId.has(n.parentId)) byId.get(n.parentId).children.push(n);
                    else roots.push(n);
                }
                setWbsNodes(flattenWbsNodes(roots));
            }
            // Auto-linkuj nowy węzeł do znacznika
            const linkRes = await fetch(`${API_URL}/schematics/wbs-node-markers`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ wbsNodeId: newNode.id, markerId: marker.id })
            });
            if (linkRes.ok) { const link = await linkRes.json(); setWbsLinks(prev => [...prev, link]); window.dispatchEvent(new CustomEvent('wbs-link-changed')); }
            setAddWbsMode(null);
        } catch (err) {
            alert(err.message);
        } finally {
            setAddWbsSaving(false);
        }
    };

    const getFileUrl = (fileName) => `${API_URL}/schematics/file/${fileName}`;

    const downloadFile = async (att) => {
        const url = getFileUrl(att.fileUrl);
        const token = sessionStorage.getItem('token');
        try {
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            const blob = await res.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = att.fileName || att.fileUrl;
            a.click();
            URL.revokeObjectURL(a.href);
        } catch (err) { alert('Błąd pobierania: ' + err.message); }
    };

    const downloadAll = async () => {
        for (const att of marker.attachments || []) {
            await downloadFile(att);
        }
    };

    const isTemp = marker.id?.toString().startsWith('temp_');
    const isVideoAtt = (att) => att.fileType === 'VIDEO' || /\.(mp4|mov|webm|avi|mkv|m4v)$/i.test(att.fileName || '');

    // ─── Lightbox (wspólny dla mobile i desktop) ───────────────────────────────
    const LightboxEl = lightboxAtt ? (
        <div className="fixed inset-0 z-[9999] bg-black/95 flex flex-col items-center justify-center" onClick={() => setLightboxAtt(null)}>
            <button className="absolute top-4 right-4 p-2 bg-white/10 rounded-full text-white" onClick={() => setLightboxAtt(null)}><X size={24} /></button>
            <button className="absolute top-4 left-4 p-2 bg-white/10 rounded-full text-blue-400" onClick={(e) => { e.stopPropagation(); downloadFile(lightboxAtt); }}><Download size={24} /></button>
            <div style={{ display: 'grid', gridTemplateRows: '1fr', maxWidth: '90vw', maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
                {isVideoAtt(lightboxAtt) ? (
                    <video src={lightboxAtt.isPending ? lightboxAtt.fileUrl : getFileUrl(lightboxAtt.fileUrl)} controls autoPlay style={{ gridRow: 1, gridColumn: 1, maxWidth: '90vw', maxHeight: '85vh', display: 'block', background: '#000' }} />
                ) : (
                    <img src={lightboxAtt.isPending ? lightboxAtt.fileUrl : getFileUrl(lightboxAtt.fileUrl)} alt="podgląd" style={{ gridRow: 1, gridColumn: 1, maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', display: 'block' }} />
                )}
                {lightboxAtt.note && (
                    <div style={{ gridRow: 1, gridColumn: 1, alignSelf: 'end', background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)', color: '#fff', padding: '20px 16px 12px', fontSize: '13px', lineHeight: 1.4, pointerEvents: 'none' }}>
                        {lightboxAtt.note}
                    </div>
                )}
            </div>
        </div>
    ) : null;

    // ─── Sekcja: siatka załączników (reużywana na mobile i desktop) ────────────
    const AttachmentsGrid = (
        marker.attachments?.length > 0 ? (
            <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                    {marker.attachments.map(att => (
                        <div key={att.id} className={`relative rounded-2xl overflow-hidden bg-[#1e293b] border group shadow-xl ${att.isPending ? 'border-amber-500/40' : 'border-white/5'}`}>
                            {att.isPending && <div className="absolute top-2 left-2 z-10 px-1.5 py-0.5 bg-amber-500/80 rounded text-[9px] font-black text-white">⏳</div>}
                            <div className="aspect-square">
                                {att.fileType === 'IMAGE' ? (
                                    <img src={att.isPending ? att.fileUrl : getFileUrl(att.fileUrl)} className="w-full h-full object-cover cursor-zoom-in" alt="attachment" onClick={e => { e.stopPropagation(); setLightboxAtt(att); }} />
                                ) : isVideoAtt(att) ? (
                                    <div className="w-full h-full relative cursor-zoom-in bg-black" onClick={e => { e.stopPropagation(); setLightboxAtt(att); }}>
                                        <video src={att.isPending ? att.fileUrl : getFileUrl(att.fileUrl)} className="w-full h-full object-cover" preload="metadata" muted />
                                        <div className="absolute inset-0 flex items-center justify-center"><div className="bg-black/60 rounded-full p-2"><Play size={20} className="text-white" fill="white" /></div></div>
                                    </div>
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-2">
                                        {att.fileType === 'AUDIO' ? <Mic size={24} className="text-purple-400" /> : <Save size={24} className="text-gray-500" />}
                                        <span className="text-[10px] text-center text-gray-400 truncate w-full px-2">{att.fileName}</span>
                                    </div>
                                )}
                            </div>
                            {editingAttNote?.id === att.id ? (
                                <div className="bg-black/80 px-2 py-1.5 flex gap-1 items-center">
                                    <input autoFocus value={editingAttNote.note} onChange={e => setEditingAttNote({ ...editingAttNote, note: e.target.value })} onBlur={() => handleUpdateAttachmentNote(att.id, editingAttNote.note)} onKeyDown={e => { if (e.key === 'Enter') handleUpdateAttachmentNote(att.id, editingAttNote.note); if (e.key === 'Escape') setEditingAttNote(null); }} className="flex-1 bg-transparent text-white text-[11px] outline-none placeholder:text-gray-500 min-w-0" placeholder="Wpisz notatkę..." />
                                </div>
                            ) : (
                                <div className="bg-black/60 px-2 py-1 cursor-pointer min-h-[26px] flex items-center" onClick={() => setEditingAttNote({ id: att.id, note: att.note || '' })}>
                                    <span className="text-[11px] text-gray-300 truncate w-full">{att.note || <span className="text-gray-600 italic">+ notatka</span>}</span>
                                </div>
                            )}
                            <button onClick={() => handleDeleteAttachment(att.id)} className="absolute top-2 right-2 p-1.5 bg-black/60 text-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={12} /></button>
                            <button onClick={() => downloadFile(att)} className="absolute top-2 left-2 p-1.5 bg-black/60 text-blue-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><Download size={12} /></button>
                        </div>
                    ))}
                </div>
                <button onClick={downloadAll} className="w-full flex items-center justify-center gap-2 py-3 text-xs font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-2xl active:scale-[0.98] transition-all">
                    <Download size={14} /> Pobierz wszystko ({marker.attachments.length})
                </button>
            </div>
        ) : (
            <div className="flex flex-col items-center justify-center py-16 text-gray-600 space-y-3">
                <ImageIcon size={40} className="opacity-20" />
                <p className="text-sm">Brak załączników</p>
            </div>
        )
    );

    // ─── MOBILE — kafelki + expand ─────────────────────────────────────────────
    if (isMobile) {
        const isExpanded = expandedSection !== null;
        const SECTION_TITLES = {
            attachments: `Załączniki (${marker.attachments?.length || 0})`,
            add: 'Dodaj plik',
            wbs: 'Przedmiot projektu',
            comment: 'Komentarz',
            question: `Pytania (${linkedQuestions.length})`,
            name: 'Nazwa znacznika',
        };

        return (
            <>
                <div className="fixed inset-0 bg-black/80 z-[99]" onClick={isExpanded ? () => setExpandedSection(null) : onClose} />

                <div className={`fixed inset-x-0 bottom-0 bg-[#0f172a] border-t border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] flex flex-col z-[100] transition-all duration-300 ${isExpanded ? 'h-[100dvh] rounded-t-none' : 'max-h-[85vh] rounded-t-[32px]'}`}>

                    {/* Uchwyt */}
                    <div className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-pointer" onClick={isExpanded ? () => setExpandedSection(null) : onClose}>
                        <div className="w-12 h-1.5 bg-white/20 rounded-full" />
                    </div>

                    {/* Nagłówek */}
                    <div className="px-4 py-2.5 flex items-center gap-3 border-b border-white/5 flex-shrink-0">
                        {isExpanded ? (
                            <button onClick={() => setExpandedSection(null)} className="p-2 bg-white/10 rounded-full text-white active:scale-90 transition-all flex-shrink-0">
                                <ChevronLeft size={18} />
                            </button>
                        ) : (
                            <div className="p-2 bg-orange-500/20 rounded-xl flex-shrink-0">
                                <MapPin size={16} className="text-orange-500" />
                            </div>
                        )}
                        <h3 className="font-black text-sm text-white flex-1 truncate">
                            {isExpanded ? SECTION_TITLES[expandedSection] : (editName || 'Szczegóły znacznika')}
                        </h3>
                        {!isExpanded && (
                            <button onClick={onClose} className="p-2 bg-white/10 rounded-full text-white active:scale-90 transition-all flex-shrink-0">
                                <ChevronDown size={18} />
                            </button>
                        )}
                    </div>

                    {/* Zawartość */}
                    <div className="flex-1 min-h-0 overflow-y-auto">
                        {!isExpanded ? (
                            /* ── SIATKA KAFELKÓW ── */
                            <div className="p-4 grid grid-cols-2 gap-3 pb-6">

                                {isTemp && (
                                    <div className="col-span-2 flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl">
                                        <span className="text-amber-400 shrink-0">⏳</span>
                                        <p className="text-amber-400/70 text-[11px]">Oczekuje na synchronizację — edycja i załączniki niedostępne.</p>
                                    </div>
                                )}

                                {/* Załączniki */}
                                <button onClick={() => setExpandedSection('attachments')} className="relative flex flex-col items-start gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 active:bg-blue-500/10 active:border-blue-500/30 transition-all active:scale-95 text-left">
                                    <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
                                        <ImageIcon size={22} className="text-blue-400" />
                                    </div>
                                    <div>
                                        <div className="text-xs font-black text-gray-200">Załączniki</div>
                                        <div className="text-[10px] text-gray-500 mt-0.5">{marker.attachments?.length || 0} plików</div>
                                    </div>
                                    {(marker.attachments?.length || 0) > 0 && (
                                        <div className="absolute top-3 right-3 min-w-[20px] h-5 px-1 rounded-full bg-blue-500 text-white text-[9px] font-black flex items-center justify-center">
                                            {marker.attachments.length}
                                        </div>
                                    )}
                                </button>

                                {/* Dodaj plik */}
                                <button onClick={() => setExpandedSection('add')} className="flex flex-col items-start gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 active:bg-orange-500/10 active:border-orange-500/30 transition-all active:scale-95 text-left">
                                    <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20">
                                        <Camera size={22} className="text-orange-400" />
                                    </div>
                                    <div>
                                        <div className="text-xs font-black text-gray-200">Dodaj plik</div>
                                        <div className="text-[10px] text-gray-500 mt-0.5">Foto, głos, wideo…</div>
                                    </div>
                                </button>

                                {/* Przedmiot projektu */}
                                {nodeId && (
                                    <button onClick={() => setExpandedSection('wbs')} className="relative flex flex-col items-start gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 active:bg-indigo-500/10 active:border-indigo-500/30 transition-all active:scale-95 text-left">
                                        <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                                            <Layers size={22} className="text-indigo-400" />
                                        </div>
                                        <div>
                                            <div className="text-xs font-black text-gray-200">Przedmiot</div>
                                            <div className="text-[10px] text-gray-500 mt-0.5">{wbsLinks.length > 0 ? `${wbsLinks.length} przypisane` : 'brak przypisania'}</div>
                                        </div>
                                        {wbsLinks.length > 0 && (
                                            <div className="absolute top-3 right-3 min-w-[20px] h-5 px-1 rounded-full bg-indigo-500 text-white text-[9px] font-black flex items-center justify-center">
                                                {wbsLinks.length}
                                            </div>
                                        )}
                                    </button>
                                )}

                                {/* Komentarz */}
                                <button onClick={() => setExpandedSection('comment')} className="flex flex-col items-start gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 active:bg-teal-500/10 active:border-teal-500/30 transition-all active:scale-95 text-left">
                                    <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/20">
                                        <Save size={22} className="text-teal-400" />
                                    </div>
                                    <div>
                                        <div className="text-xs font-black text-gray-200">Komentarz</div>
                                        <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{editComment || 'brak komentarza'}</div>
                                    </div>
                                </button>

                                {/* Pytanie */}
                                <button onClick={() => setExpandedSection('question')} disabled={wbsLinks.length === 0} className="relative flex flex-col items-start gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 active:bg-amber-500/10 active:border-amber-500/30 transition-all active:scale-95 text-left disabled:opacity-40 disabled:cursor-not-allowed">
                                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                        <FilePlus size={22} className="text-amber-400" />
                                    </div>
                                    <div>
                                        <div className="text-xs font-black text-gray-200">Pytania</div>
                                        <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">
                                            {wbsLinks.length === 0 ? 'wymaga przedmiotu' : linkedQuestions.length > 0 ? `${linkedQuestions.length} pytań` : 'brak pytań'}
                                        </div>
                                    </div>
                                    {linkedQuestions.length > 0 && (
                                        <div className="absolute top-3 right-3 min-w-[20px] h-5 px-1 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center">
                                            {linkedQuestions.length}
                                        </div>
                                    )}
                                </button>

                                {/* Nazwa */}
                                <button onClick={() => setExpandedSection('name')} className="flex flex-col items-start gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 active:bg-gray-500/10 active:border-gray-500/30 transition-all active:scale-95 text-left">
                                    <div className="p-2.5 rounded-xl bg-gray-500/10 border border-gray-500/20">
                                        <MapPin size={22} className="text-gray-400" />
                                    </div>
                                    <div>
                                        <div className="text-xs font-black text-gray-200">Nazwa</div>
                                        <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{editName || 'brak nazwy'}</div>
                                    </div>
                                </button>

                                {/* Usuń — pełna szerokość */}
                                <button onClick={handleDeleteMarker} disabled={isTemp} className="col-span-2 flex items-center justify-center gap-2 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-black uppercase tracking-widest active:scale-[0.98] active:bg-red-500/20 transition-all disabled:opacity-30">
                                    <Trash2 size={16} /> Usuń znacznik
                                </button>
                            </div>
                        ) : (
                            /* ── ROZWINIĘTA SEKCJA ── */
                            <div className="p-5 space-y-4">

                                {/* Załączniki */}
                                {expandedSection === 'attachments' && AttachmentsGrid}

                                {/* Dodaj plik */}
                                {expandedSection === 'add' && (
                                    <div className="space-y-4">
                                        {uploading && (
                                            <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl animate-pulse">
                                                <div className="w-2 h-2 bg-blue-500 rounded-full" />
                                                <span className="text-xs font-bold text-blue-400 uppercase">Wysyłanie...</span>
                                            </div>
                                        )}
                                        {isCameraActive && (
                                            <div className="relative bg-black rounded-3xl overflow-hidden border-2 border-blue-500/40 shadow-2xl">
                                                <video ref={videoRef} autoPlay playsInline className="w-full h-auto aspect-square object-cover" />
                                                <div className="absolute inset-x-0 bottom-6 flex justify-center">
                                                    <button onClick={capturePhoto} className="bg-blue-600 text-white px-8 py-3 rounded-full text-xs font-black shadow-2xl active:scale-95 transition-all border border-blue-400/30">ZRÓB ZDJĘCIE</button>
                                                </div>
                                                <canvas ref={canvasRef} className="hidden" />
                                            </div>
                                        )}
                                        <div className="grid grid-cols-2 gap-3">
                                            <button onClick={isRecording ? stopRecording : startRecording} className={`flex items-center justify-center gap-2 px-4 py-4 w-full rounded-2xl text-sm font-bold transition-all active:scale-95 ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-[#1e293b] text-gray-300 border border-white/5'}`}>
                                                <Mic size={20} className={isRecording ? 'text-white' : 'text-orange-500'} />
                                                {isRecording ? 'Zatrzymaj' : 'Głos'}
                                            </button>
                                            <label className="flex items-center justify-center gap-2 px-4 py-4 w-full rounded-2xl text-sm font-bold transition-all active:scale-95 cursor-pointer bg-[#1e293b] text-gray-300 border border-white/5">
                                                <Camera size={20} className="text-orange-500" /> Foto
                                                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCapture} />
                                            </label>
                                            <label className="flex items-center justify-center gap-2 px-4 py-4 w-full bg-[#1e293b] border border-white/5 text-gray-300 rounded-2xl text-sm font-bold active:scale-95 cursor-pointer">
                                                <ImageIcon size={20} className="text-green-400" /> Galeria
                                                <input type="file" accept="image/*" multiple className="hidden" onChange={handleCapture} />
                                            </label>
                                            <label className="flex items-center justify-center gap-2 px-4 py-4 w-full bg-[#1e293b] border border-white/5 text-gray-300 rounded-2xl text-sm font-bold active:scale-95 cursor-pointer">
                                                <Video size={20} className="text-purple-400" /> Wideo
                                                <input type="file" accept="video/*" multiple className="hidden" onChange={handleCapture} />
                                            </label>
                                            <label className="col-span-2 flex items-center justify-center gap-2 px-4 py-4 w-full bg-[#1e293b] border border-white/5 text-gray-300 rounded-2xl text-sm font-bold active:scale-95 cursor-pointer">
                                                <FilePlus size={20} className="text-blue-400" /> + Plik
                                                <input type="file" multiple className="hidden" onChange={handleCapture} />
                                            </label>
                                        </div>
                                    </div>
                                )}

                                {/* Przedmiot projektu */}
                                {expandedSection === 'wbs' && nodeId && (
                                    <div className="space-y-3">
                                        {wbsNodes.filter(n => !n.path.includes('.')).map(node => {
                                            const linked = wbsLinks.some(l => l.wbsNodeId === node.id);
                                            const toggling = wbsToggling === node.id;
                                            return (
                                                <button key={node.id} onClick={() => toggleWbsLink(node.id)} disabled={toggling}
                                                    className={`w-full flex items-center gap-3 py-3.5 px-4 rounded-2xl text-left text-sm transition-all ${linked ? 'bg-blue-500/15 border border-blue-500/30 text-blue-300' : 'bg-[#1e293b]/40 border border-white/5 text-gray-400 active:bg-white/5'} ${toggling ? 'opacity-50' : ''}`}>
                                                    {linked ? <CheckSquare size={18} className="text-blue-400 flex-shrink-0" /> : <Square size={18} className="text-gray-600 flex-shrink-0" />}
                                                    <span className="font-mono text-xs text-gray-500 flex-shrink-0">{node.path}</span>
                                                    <span className="font-medium truncate">{node.name}</span>
                                                </button>
                                            );
                                        })}
                                        {addWbsMode ? (
                                            <div className="p-4 bg-black/40 border border-white/10 rounded-2xl space-y-3">
                                                <p className="text-[11px] text-gray-400 uppercase font-black tracking-widest">{addWbsMode === 'item' ? '+ Nowy przedmiot' : '+ Nowe wymaganie'}</p>
                                                {addWbsMode === 'requirement' && wbsNodes.filter(n => !n.path.includes('.')).length > 0 && (
                                                    <>
                                                        <select value={addWbsParentId} onChange={e => setAddWbsParentId(e.target.value)} className={`w-full bg-[#1e293b] border rounded-xl px-3 py-3 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 ${addWbsParentId ? 'border-white/10' : 'border-amber-500/50'}`}>
                                                            <option value="" disabled>— wybierz gałąź —</option>
                                                            {wbsNodes.filter(n => !n.path.includes('.')).map(n => <option key={n.id} value={n.id}>{n.path} {n.name}</option>)}
                                                        </select>
                                                        {!addWbsParentId && <p className="text-[11px] text-amber-400/80 px-1">Wybierz gałąź, do której dodać wymaganie.</p>}
                                                    </>
                                                )}
                                                <input ref={addWbsInputRef} value={addWbsName} onChange={e => setAddWbsName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createWbsNode(); if (e.key === 'Escape') setAddWbsMode(null); }} placeholder="Nazwa..." className="w-full bg-[#1e293b] border border-white/10 rounded-xl px-3 py-3 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 placeholder-gray-600" />
                                                <div className="flex gap-2">
                                                    <button onClick={createWbsNode} disabled={!addWbsName.trim() || addWbsSaving || (addWbsMode === 'requirement' && !addWbsParentId)} className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-xl text-sm font-bold disabled:opacity-40 active:scale-95 transition-all">
                                                        <Check size={16} />{addWbsSaving ? 'Zapisuję...' : 'Dodaj i przypisz'}
                                                    </button>
                                                    <button onClick={() => setAddWbsMode(null)} className="px-4 py-3 bg-white/5 text-gray-400 border border-white/10 rounded-xl text-sm active:scale-95 transition-all"><X size={16} /></button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex gap-3">
                                                <button onClick={() => openAddWbs('item')} className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-white/5 text-gray-400 border border-white/10 rounded-2xl text-sm font-medium active:scale-95 transition-all"><Plus size={16} /> Przedmiot</button>
                                                <button onClick={() => openAddWbs('requirement')} className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-white/5 text-gray-400 border border-white/10 rounded-2xl text-sm font-medium active:scale-95 transition-all"><Plus size={16} /> Wymaganie</button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Komentarz */}
                                {expandedSection === 'comment' && (
                                    <div className="space-y-2">
                                        <textarea value={editComment} onChange={e => setEditComment(e.target.value)} onBlur={handleUpdateComment} disabled={wbsLinks.length === 0}
                                            className={`w-full rounded-2xl p-4 text-sm resize-none h-48 focus:outline-none transition-all shadow-inner ${wbsLinks.length === 0 ? 'bg-white/3 border border-white/5 text-gray-600 placeholder-gray-700 cursor-not-allowed' : 'bg-[#1e293b]/50 border border-white/5 text-gray-100 placeholder-gray-600 focus:border-blue-500/50'}`}
                                            placeholder={wbsLinks.length === 0 ? 'Przypisz przedmiot projektu, aby dodać komentarz' : 'Wpisz komentarz…'} />
                                        {wbsLinks.length === 0 && <p className="text-[11px] text-gray-600 italic px-1">Najpierw przypisz przedmiot projektu</p>}
                                    </div>
                                )}

                                {/* Pytanie */}
                                {expandedSection === 'question' && (
                                    <div className="space-y-3">
                                        {/* Istniejące pytania z WBS node */}
                                        {linkedQuestions.length === 0 && extraQuestions.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-8 text-gray-600 space-y-2">
                                                <FilePlus size={32} className="opacity-20" />
                                                <p className="text-sm">Brak pytań — dodaj pierwsze</p>
                                            </div>
                                        ) : (
                                            linkedQuestions.map((item, idx) => (
                                                <div key={idx} className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-2">
                                                    <div className="flex items-start gap-2">
                                                        <span className="text-[10px] font-black text-amber-500/60 uppercase tracking-widest mt-0.5 flex-shrink-0">P{idx + 1}</span>
                                                        <p className="text-sm text-gray-200 leading-snug">{item.question}</p>
                                                    </div>
                                                    {item.answer && (
                                                        <div className="flex items-start gap-2 pt-1 border-t border-white/5">
                                                            <span className="text-[10px] font-black text-blue-500/60 uppercase tracking-widest mt-0.5 flex-shrink-0">O</span>
                                                            <p className="text-xs text-gray-400 leading-snug">{item.answer}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                        {/* Nowe pytania dodawane w tej sesji */}
                                        {extraQuestions.map(q => (
                                            <textarea key={q.id} value={q.text} autoFocus rows={2}
                                                placeholder="Wpisz pytanie…"
                                                onChange={e => handleExtraQuestionChange(q.id, e.target.value, e.target)}
                                                onBlur={() => handleSaveExtraQuestion(q.id)}
                                                className="w-full resize-none overflow-hidden rounded-xl px-4 py-3 text-sm leading-snug outline-none bg-white/5 border border-amber-500/30 text-gray-200 placeholder-gray-600 focus:border-amber-500/50" />
                                        ))}
                                        {/* Dodaj pytanie */}
                                        <button onClick={handleAddExtraQuestion} className="w-full flex items-center justify-center gap-2 py-3.5 bg-white/5 border border-white/10 text-gray-400 rounded-2xl text-xs font-bold active:scale-95 transition-all active:bg-amber-500/10 active:border-amber-500/30 active:text-amber-400">
                                            <Plus size={14} /> Dodaj pytanie
                                        </button>
                                    </div>
                                )}

                                {/* Nazwa */}
                                {expandedSection === 'name' && (
                                    <input value={editName} onChange={e => setEditName(e.target.value)} onBlur={handleUpdateName}
                                        className="w-full bg-[#1e293b]/50 border border-white/5 rounded-2xl px-4 py-4 text-sm text-gray-100 focus:outline-none focus:border-orange-500/50 transition-all shadow-inner placeholder:text-gray-600"
                                        placeholder="Nazwa widoczna na mapie..." />
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {LightboxEl}
            </>
        );
    }

    // ─── DESKTOP — panel boczny kafelkowy ─────────────────────────────────────
    const isExpanded = expandedSection !== null;
    const SECTION_TITLES = {
        attachments: `Załączniki (${marker.attachments?.length || 0})`,
        add: 'Dodaj plik',
        wbs: 'Przedmiot projektu',
        comment: 'Komentarz',
        question: `Pytania (${linkedQuestions.length})`,
        name: 'Nazwa znacznika',
    };

    return (
        <>
            <div className="absolute top-4 bottom-4 right-4 w-96 bg-[#0f172a] border border-white/10 shadow-2xl flex flex-col z-[60] rounded-[32px] animate-in slide-in-from-right duration-300">

                {/* Nagłówek */}
                <div className="p-5 flex items-center gap-3 border-b border-white/5 flex-shrink-0">
                    {isExpanded ? (
                        <button onClick={() => setExpandedSection(null)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all flex-shrink-0">
                            <ChevronLeft size={18} />
                        </button>
                    ) : (
                        <div className="p-2 bg-orange-500/20 rounded-xl flex-shrink-0">
                            <MapPin size={18} className="text-orange-500" />
                        </div>
                    )}
                    <h3 className="font-black text-sm text-white flex-1 truncate">
                        {isExpanded ? SECTION_TITLES[expandedSection] : (editName || 'Szczegóły znacznika')}
                    </h3>
                    {!isExpanded && (
                        <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all flex-shrink-0">
                            <X size={18} />
                        </button>
                    )}
                </div>

                {/* Zawartość */}
                <div className="flex-1 min-h-0 overflow-y-auto">
                    {!isExpanded ? (
                        /* ── SIATKA KAFELKÓW ── */
                        <div className="p-4 grid grid-cols-2 gap-3 pb-6">
                            {isTemp && (
                                <div className="col-span-2 flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl">
                                    <span className="text-amber-400 shrink-0">⏳</span>
                                    <p className="text-amber-400/70 text-[11px]">Oczekuje na synchronizację — edycja i załączniki niedostępne.</p>
                                </div>
                            )}

                            {/* Załączniki */}
                            <button onClick={() => setExpandedSection('attachments')} className="relative flex flex-col items-start gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-blue-500/10 hover:border-blue-500/30 transition-all text-left">
                                <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
                                    <ImageIcon size={20} className="text-blue-400" />
                                </div>
                                <div>
                                    <div className="text-xs font-black text-gray-200">Załączniki</div>
                                    <div className="text-[10px] text-gray-500 mt-0.5">{marker.attachments?.length || 0} plików</div>
                                </div>
                                {(marker.attachments?.length || 0) > 0 && (
                                    <div className="absolute top-3 right-3 min-w-[20px] h-5 px-1 rounded-full bg-blue-500 text-white text-[9px] font-black flex items-center justify-center">
                                        {marker.attachments.length}
                                    </div>
                                )}
                            </button>

                            {/* Dodaj plik */}
                            <button onClick={() => setExpandedSection('add')} className="flex flex-col items-start gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-orange-500/10 hover:border-orange-500/30 transition-all text-left">
                                <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20">
                                    <Camera size={20} className="text-orange-400" />
                                </div>
                                <div>
                                    <div className="text-xs font-black text-gray-200">Dodaj plik</div>
                                    <div className="text-[10px] text-gray-500 mt-0.5">Foto, głos, wideo…</div>
                                </div>
                            </button>

                            {/* Przedmiot projektu */}
                            {nodeId && (
                                <button onClick={() => setExpandedSection('wbs')} className="relative flex flex-col items-start gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-indigo-500/10 hover:border-indigo-500/30 transition-all text-left">
                                    <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                                        <Layers size={20} className="text-indigo-400" />
                                    </div>
                                    <div>
                                        <div className="text-xs font-black text-gray-200">Przedmiot</div>
                                        <div className="text-[10px] text-gray-500 mt-0.5">{wbsLinks.length > 0 ? `${wbsLinks.length} przypisane` : 'brak przypisania'}</div>
                                    </div>
                                    {wbsLinks.length > 0 && (
                                        <div className="absolute top-3 right-3 min-w-[20px] h-5 px-1 rounded-full bg-indigo-500 text-white text-[9px] font-black flex items-center justify-center">
                                            {wbsLinks.length}
                                        </div>
                                    )}
                                </button>
                            )}

                            {/* Komentarz */}
                            <button onClick={() => setExpandedSection('comment')} className="flex flex-col items-start gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-teal-500/10 hover:border-teal-500/30 transition-all text-left">
                                <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/20">
                                    <Save size={20} className="text-teal-400" />
                                </div>
                                <div>
                                    <div className="text-xs font-black text-gray-200">Komentarz</div>
                                    <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{editComment || 'brak komentarza'}</div>
                                </div>
                            </button>

                            {/* Pytania */}
                            <button onClick={() => setExpandedSection('question')} disabled={wbsLinks.length === 0} className="relative flex flex-col items-start gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-amber-500/10 hover:border-amber-500/30 transition-all text-left disabled:opacity-40 disabled:cursor-not-allowed">
                                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                    <FilePlus size={20} className="text-amber-400" />
                                </div>
                                <div>
                                    <div className="text-xs font-black text-gray-200">Pytania</div>
                                    <div className="text-[10px] text-gray-500 mt-0.5">
                                        {wbsLinks.length === 0 ? 'wymaga przedmiotu' : linkedQuestions.length > 0 ? `${linkedQuestions.length} pytań` : 'brak pytań'}
                                    </div>
                                </div>
                                {linkedQuestions.length > 0 && (
                                    <div className="absolute top-3 right-3 min-w-[20px] h-5 px-1 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center">
                                        {linkedQuestions.length}
                                    </div>
                                )}
                            </button>

                            {/* Nazwa */}
                            <button onClick={() => setExpandedSection('name')} className="flex flex-col items-start gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-gray-500/10 hover:border-gray-500/30 transition-all text-left">
                                <div className="p-2.5 rounded-xl bg-gray-500/10 border border-gray-500/20">
                                    <MapPin size={20} className="text-gray-400" />
                                </div>
                                <div>
                                    <div className="text-xs font-black text-gray-200">Nazwa</div>
                                    <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{editName || 'brak nazwy'}</div>
                                </div>
                            </button>

                            {/* Usuń */}
                            <button onClick={handleDeleteMarker} disabled={isTemp} className="col-span-2 flex items-center justify-center gap-2 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-black uppercase tracking-widest hover:bg-red-500/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                                <Trash2 size={16} /> Usuń znacznik
                            </button>
                        </div>
                    ) : (
                        /* ── ROZWINIĘTA SEKCJA ── */
                        <div className="p-5 space-y-4">

                            {/* Załączniki */}
                            {expandedSection === 'attachments' && AttachmentsGrid}

                            {/* Dodaj plik */}
                            {expandedSection === 'add' && (
                                <div className="space-y-4">
                                    {uploading && (
                                        <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl animate-pulse">
                                            <div className="w-2 h-2 bg-blue-500 rounded-full" />
                                            <span className="text-xs font-bold text-blue-400 uppercase">Wysyłanie...</span>
                                        </div>
                                    )}
                                    {isCameraActive && (
                                        <div className="relative bg-black rounded-3xl overflow-hidden border-2 border-blue-500/40 shadow-2xl">
                                            <video ref={videoRef} autoPlay playsInline className="w-full h-auto aspect-square object-cover" />
                                            <div className="absolute inset-x-0 bottom-6 flex justify-center">
                                                <button onClick={capturePhoto} className="bg-blue-600 text-white px-8 py-3 rounded-full text-xs font-black shadow-2xl active:scale-95 transition-all border border-blue-400/30">ZRÓB ZDJĘCIE</button>
                                            </div>
                                            <canvas ref={canvasRef} className="hidden" />
                                        </div>
                                    )}
                                    <div className="grid grid-cols-2 gap-3">
                                        <button onClick={isRecording ? stopRecording : startRecording} className={`flex items-center justify-center gap-2 px-4 py-4 w-full rounded-2xl text-sm font-bold transition-all active:scale-95 ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-[#1e293b] text-gray-300 border border-white/5 hover:bg-white/10'}`}>
                                            <Mic size={20} className={isRecording ? 'text-white' : 'text-orange-500'} />
                                            {isRecording ? 'Zatrzymaj' : 'Głos'}
                                        </button>
                                        {window.isSecureContext && navigator.mediaDevices?.getUserMedia ? (
                                            <button onClick={isCameraActive ? () => setIsCameraActive(false) : startCamera} className={`flex items-center justify-center gap-2 px-4 py-4 w-full rounded-2xl text-sm font-bold transition-all active:scale-95 ${isCameraActive ? 'bg-blue-600 text-white' : 'bg-[#1e293b] text-gray-300 border border-white/5 hover:bg-white/10'}`}>
                                                <Camera size={20} className={isCameraActive ? 'text-white' : 'text-orange-500'} /> Foto
                                            </button>
                                        ) : (
                                            <label className="flex items-center justify-center gap-2 px-4 py-4 w-full rounded-2xl text-sm font-bold transition-all active:scale-95 cursor-pointer bg-[#1e293b] text-gray-300 border border-white/5 hover:bg-white/10">
                                                <Camera size={20} className="text-orange-500" /> Foto
                                                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCapture} />
                                            </label>
                                        )}
                                        <label className="flex items-center justify-center gap-2 px-4 py-4 w-full bg-[#1e293b] border border-white/5 text-gray-300 rounded-2xl text-sm font-bold hover:bg-white/10 transition-all active:scale-95 cursor-pointer">
                                            <ImageIcon size={20} className="text-green-400" /> Galeria
                                            <input type="file" accept="image/*" multiple className="hidden" onChange={handleCapture} />
                                        </label>
                                        <label className="flex items-center justify-center gap-2 px-4 py-4 w-full bg-[#1e293b] border border-white/5 text-gray-300 rounded-2xl text-sm font-bold hover:bg-white/10 transition-all active:scale-95 cursor-pointer">
                                            <Video size={20} className="text-purple-400" /> Wideo
                                            <input type="file" accept="video/*" multiple className="hidden" onChange={handleCapture} />
                                        </label>
                                        <label className="col-span-2 flex items-center justify-center gap-2 px-4 py-4 w-full bg-[#1e293b] border border-white/5 text-gray-300 rounded-2xl text-sm font-bold hover:bg-white/10 transition-all active:scale-95 cursor-pointer">
                                            <FilePlus size={20} className="text-blue-400" /> + Plik
                                            <input type="file" multiple className="hidden" onChange={handleCapture} />
                                        </label>
                                    </div>
                                </div>
                            )}

                            {/* Przedmiot projektu */}
                            {expandedSection === 'wbs' && nodeId && (
                                <div className="space-y-3">
                                    {wbsNodes.filter(n => !n.path.includes('.')).map(node => {
                                        const linked = wbsLinks.some(l => l.wbsNodeId === node.id);
                                        const toggling = wbsToggling === node.id;
                                        return (
                                            <button key={node.id} onClick={() => toggleWbsLink(node.id)} disabled={toggling}
                                                className={`w-full flex items-center gap-3 py-3 px-4 rounded-2xl text-left text-sm transition-all ${linked ? 'bg-blue-500/15 border border-blue-500/30 text-blue-300' : 'bg-[#1e293b]/40 border border-white/5 text-gray-400 hover:bg-white/5 hover:text-gray-200'} ${toggling ? 'opacity-50' : ''}`}>
                                                {linked ? <CheckSquare size={16} className="text-blue-400 flex-shrink-0" /> : <Square size={16} className="text-gray-600 flex-shrink-0" />}
                                                <span className="font-mono text-xs text-gray-500 flex-shrink-0">{node.path}</span>
                                                <span className="font-medium truncate">{node.name}</span>
                                            </button>
                                        );
                                    })}
                                    {addWbsMode ? (
                                        <div className="p-4 bg-black/40 border border-white/10 rounded-2xl space-y-3">
                                            <p className="text-[11px] text-gray-400 uppercase font-black tracking-widest">{addWbsMode === 'item' ? '+ Nowy przedmiot' : '+ Nowe wymaganie'}</p>
                                            {addWbsMode === 'requirement' && wbsNodes.filter(n => !n.path.includes('.')).length > 0 && (
                                                <>
                                                    <select value={addWbsParentId} onChange={e => setAddWbsParentId(e.target.value)} className={`w-full bg-[#1e293b] border rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 ${addWbsParentId ? 'border-white/10' : 'border-amber-500/50'}`}>
                                                        <option value="" disabled>— wybierz gałąź —</option>
                                                        {wbsNodes.filter(n => !n.path.includes('.')).map(n => <option key={n.id} value={n.id}>{n.path} {n.name}</option>)}
                                                    </select>
                                                    {!addWbsParentId && <p className="text-[11px] text-amber-400/80 px-1">Wybierz gałąź, do której dodać wymaganie.</p>}
                                                </>
                                            )}
                                            {addWbsMode === 'requirement' && wbsNodes.length === 0 && <p className="text-[11px] text-amber-400/80 px-1">Brak gałęzi w drzewie — najpierw utwórz przedmiot.</p>}
                                            <input ref={addWbsInputRef} value={addWbsName} onChange={e => setAddWbsName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createWbsNode(); if (e.key === 'Escape') setAddWbsMode(null); }} placeholder="Nazwa..." className="w-full bg-[#1e293b] border border-white/10 rounded-xl px-3 py-3 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 placeholder-gray-600" />
                                            <div className="flex gap-2">
                                                <button onClick={createWbsNode} disabled={!addWbsName.trim() || addWbsSaving || (addWbsMode === 'requirement' && !addWbsParentId)} className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 rounded-xl text-sm font-bold disabled:opacity-40 active:scale-95 transition-all">
                                                    <Check size={15} />{addWbsSaving ? 'Zapisuję...' : 'Dodaj i przypisz'}
                                                </button>
                                                <button onClick={() => setAddWbsMode(null)} className="px-4 py-3 bg-white/5 hover:bg-white/10 text-gray-400 border border-white/10 rounded-xl text-sm active:scale-95 transition-all"><X size={15} /></button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex gap-3">
                                            <button onClick={() => openAddWbs('item')} className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-white/5 hover:bg-white/10 text-gray-400 border border-white/10 rounded-2xl text-sm font-medium active:scale-95 transition-all"><Plus size={16} /> Przedmiot</button>
                                            <button onClick={() => openAddWbs('requirement')} className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-white/5 hover:bg-white/10 text-gray-400 border border-white/10 rounded-2xl text-sm font-medium active:scale-95 transition-all"><Plus size={16} /> Wymaganie</button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Komentarz */}
                            {expandedSection === 'comment' && (
                                <div className="space-y-2">
                                    <textarea value={editComment} onChange={e => setEditComment(e.target.value)} onBlur={handleUpdateComment} disabled={wbsLinks.length === 0}
                                        className={`w-full rounded-2xl p-4 text-sm resize-none h-48 focus:outline-none transition-all shadow-inner ${wbsLinks.length === 0 ? 'bg-white/3 border border-white/5 text-gray-600 placeholder-gray-700 cursor-not-allowed' : 'bg-[#1e293b]/50 border border-white/5 text-gray-100 placeholder-gray-600 focus:border-blue-500/50'}`}
                                        placeholder={wbsLinks.length === 0 ? 'Przypisz przedmiot projektu, aby dodać komentarz' : 'Wpisz komentarz…'} />
                                    {wbsLinks.length === 0 && <p className="text-[11px] text-gray-600 italic px-1">Najpierw przypisz przedmiot projektu</p>}
                                </div>
                            )}

                            {/* Pytania */}
                            {expandedSection === 'question' && (
                                <div className="space-y-3">
                                    {linkedQuestions.length === 0 && extraQuestions.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-8 text-gray-600 space-y-2">
                                            <FilePlus size={32} className="opacity-20" />
                                            <p className="text-sm">Brak pytań — dodaj pierwsze</p>
                                        </div>
                                    ) : (
                                        linkedQuestions.map((item, idx) => (
                                            <div key={idx} className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-2">
                                                <div className="flex items-start gap-2">
                                                    <span className="text-[10px] font-black text-amber-500/60 uppercase tracking-widest mt-0.5 flex-shrink-0">P{idx + 1}</span>
                                                    <p className="text-sm text-gray-200 leading-snug">{item.question}</p>
                                                </div>
                                                {item.answer && (
                                                    <div className="flex items-start gap-2 pt-1 border-t border-white/5">
                                                        <span className="text-[10px] font-black text-blue-500/60 uppercase tracking-widest mt-0.5 flex-shrink-0">O</span>
                                                        <p className="text-xs text-gray-400 leading-snug">{item.answer}</p>
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                    {extraQuestions.map(q => (
                                        <textarea key={q.id} value={q.text} autoFocus rows={2} placeholder="Wpisz pytanie…"
                                            onChange={e => handleExtraQuestionChange(q.id, e.target.value, e.target)}
                                            onBlur={() => handleSaveExtraQuestion(q.id)}
                                            className="w-full resize-none overflow-hidden rounded-xl px-4 py-3 text-sm leading-snug outline-none bg-white/5 border border-amber-500/30 text-gray-200 placeholder-gray-600 focus:border-amber-500/50" />
                                    ))}
                                    <button onClick={handleAddExtraQuestion} className="w-full flex items-center justify-center gap-2 py-3.5 bg-white/5 border border-white/10 text-gray-400 rounded-2xl text-xs font-bold hover:bg-amber-500/10 hover:border-amber-500/30 hover:text-amber-400 transition-all active:scale-95">
                                        <Plus size={14} /> Dodaj pytanie
                                    </button>
                                </div>
                            )}

                            {/* Nazwa */}
                            {expandedSection === 'name' && (
                                <input value={editName} onChange={e => setEditName(e.target.value)} onBlur={handleUpdateName}
                                    className="w-full bg-[#1e293b]/50 border border-white/5 rounded-2xl px-4 py-4 text-sm text-gray-100 focus:outline-none focus:border-orange-500/50 transition-all shadow-inner placeholder:text-gray-600"
                                    placeholder="Nazwa widoczna na mapie..." />
                            )}
                        </div>
                    )}
                </div>
            </div>

            {LightboxEl}
        </>
    );
}
