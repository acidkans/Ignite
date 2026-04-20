import { Plus, Trash2, GripVertical, ChevronDown, Search } from 'lucide-react';

export default function ProjectItemsPanel({
    categories,
    items,
    setItems,
    expandedCat,
    setExpandedCat,
    searchQuery,
    setSearchQuery,
    onSave,
    onItemDeleted,
    readOnly = false // Nowa opcja
}) {
    const totalItems = Object.values(items).reduce((sum, arr) => sum + arr.filter(i => i.name?.trim()).length, 0);

    const addItem = (catKey) => setItems(prev => ({
        ...prev,
        [catKey]: [...(prev[catKey] || []), { id: crypto.randomUUID(), name: '', description: '' }],
    }));

    const removeItem = (catKey, id) => {
        const nextItems = {
            ...items,
            [catKey]: (items[catKey] || []).filter(i => i.id !== id),
        };
        setItems(nextItems);
        if (onItemDeleted) onItemDeleted(id);
        if (onSave) onSave(null, null, false, nextItems);
    };

    const updateItem = (catKey, id, field, value) => setItems(prev => ({
        ...prev,
        [catKey]: (prev[catKey] || []).map(i => i.id === id ? { ...i, [field]: value } : i),
    }));

    const toggleCategory = (catKey) => setExpandedCat(prev => prev === catKey ? null : catKey);

    const handleDragStart = (e, item, catLabel, catKey) => {
        e.dataTransfer.setData('application/json', JSON.stringify({ ...item, catLabel, catKey }));
        e.dataTransfer.effectAllowed = 'copyMove';
    };

    return (
        <div className="flex flex-col h-full bg-black/20 border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="p-4 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-gray-300">Przedmioty projektu</h3>
                    <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] rounded-full font-mono">
                        {totalItems}
                    </span>
                </div>
                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Szukaj przedmiotów..."
                        className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-all"
                    />
                </div>
            </div>

            {/* Categories List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-hide">
                {categories.map(cat => {
                    const Icon = cat.icon;
                    const catItems = items[cat.key] || [];
                    const isOpen = expandedCat === cat.key;

                    const filteredItems = catItems.filter(i =>
                        !searchQuery ||
                        i.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        i.description?.toLowerCase().includes(searchQuery.toLowerCase())
                    );

                    const shouldShow = !searchQuery || filteredItems.length > 0;
                    if (!shouldShow) return null;

                    const effectiveOpen = isOpen || (searchQuery && filteredItems.length > 0);

                    return (
                        <div key={cat.key} className="space-y-1">
                            <button
                                onClick={() => toggleCategory(cat.key)}
                                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[11px] font-bold transition-all ${isOpen
                                    ? 'bg-white/10 border-white/20 text-white shadow-lg'
                                    : 'bg-black/30 border-white/5 text-gray-400 hover:border-white/10 hover:text-gray-300'
                                    }`}
                            >
                                <Icon size={14} className={cat.iconColor} />
                                <span className="flex-1 text-left truncate">{cat.label}</span>
                                {catItems.length > 0 && (
                                    <span className="px-1.5 py-0.5 bg-white/10 text-[9px] rounded-full font-mono min-w-[20px] text-center">
                                        {catItems.length}
                                    </span>
                                )}
                                <ChevronDown size={12} className={`transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {effectiveOpen && (
                                <div className="pl-2 space-y-1 mt-1">
                                    {filteredItems.map((item, idx) => (
                                        <div
                                            key={item.id}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, item, cat.label, cat.key)}
                                            className="group flex flex-col gap-1 p-3 bg-white/[0.02] border border-white/5 rounded-xl hover:border-blue-500/30 hover:bg-blue-500/5 transition-all cursor-grab active:cursor-grabbing relative overflow-hidden"
                                        >
                                            <div className="flex items-start gap-2">
                                                <GripVertical size={12} className="text-gray-600 mt-1 flex-shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    {readOnly ? (
                                                        <>
                                                            <div className="w-full bg-transparent border-none p-0 text-xs text-white placeholder-gray-700 focus:ring-0 font-medium pb-0.5 truncate" title={item.name}>
                                                                {item.name || "Brak nazwy"}
                                                            </div>
                                                            <div className="w-full bg-transparent border-none p-0 text-[10px] text-gray-500 placeholder-gray-800 focus:ring-0 mt-0.5 truncate" title={item.description}>
                                                                {item.description || "Brak opisu"}
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <input
                                                                type="text"
                                                                value={item.name}
                                                                onChange={e => updateItem(cat.key, item.id, 'name', e.target.value)}
                                                                onBlur={() => onSave()}
                                                                placeholder="Nazwa..."
                                                                className="w-full bg-transparent border-none p-0 text-xs text-white placeholder-gray-700 focus:ring-0 font-medium"
                                                            />
                                                            <input
                                                                type="text"
                                                                value={item.description}
                                                                onChange={e => updateItem(cat.key, item.id, 'description', e.target.value)}
                                                                onBlur={() => onSave()}
                                                                placeholder="Dodatkowy opis..."
                                                                className="w-full bg-transparent border-none p-0 text-[10px] text-gray-500 placeholder-gray-800 focus:ring-0 mt-0.5"
                                                            />
                                                        </>
                                                    )}
                                                </div>
                                                {!readOnly && (
                                                    <button
                                                        onClick={() => removeItem(cat.key, item.id)}
                                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/10 rounded text-red-500 transition-all"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {!readOnly ? (
                                        <button
                                            onClick={() => addItem(cat.key)}
                                            className="w-full py-2 border border-dashed border-white/5 hover:border-blue-500/30 hover:bg-blue-500/5 rounded-xl text-[10px] text-gray-600 hover:text-blue-400 transition-all flex items-center justify-center gap-1.5"
                                        >
                                            <Plus size={12} />
                                            Dodaj przedmiot
                                        </button>
                                    ) : (
                                        <div className="text-[10px] text-gray-600 px-2 pt-1 text-center italic">
                                            Edycja w zakładce 'Informacje'
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
