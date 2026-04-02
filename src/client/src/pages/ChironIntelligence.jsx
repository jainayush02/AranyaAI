import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Upload, Trash2, Plus, Link as LinkIcon, Settings,
    Database, Zap, FileText, Globe, RefreshCw,
    ShieldCheck, AlertCircle, CheckCircle, Search, Clock, Brain, X, Terminal, RotateCw,
    Save, Activity, ChevronRight, Target
} from 'lucide-react';
import axios from 'axios';
import s from './AdminPortal.module.css';

const authH = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

export default function ChironIntelligence() {
    const [stats, setStats] = useState({ documents: 0, vectorDbStats: {}, dimensions: 1536, host: 'Detecting...' });
    const [documents, setDocuments] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [purging, setPurging] = useState(false);
    const [progress, setProgress] = useState(null);
    const [showUrlForm, setShowUrlForm] = useState(false);
    const [urlInput, setUrlInput] = useState('');
    const [urlName, setUrlName] = useState('');
    const [toasts, setToasts] = useState([]);
    const [modal, setModal] = useState(null);
    const [search, setSearch] = useState('');
    const [aiConfig, setAiConfig] = useState({ chiron: { chunkSize: 500, overlap: 50, topK: 5, temperature: 0.3 } });
    const [tempConfig, setTempConfig] = useState(null);
    const [topKInput, setTopKInput] = useState('');
    const [tempInput, setTempInput] = useState('');
    const [aiConfigSaving, setAiConfigSaving] = useState(false);

    const fileInputRef = useRef(null);
    const abortRef = useRef(null);

    const addToast = (msg, type = 'success') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, msg, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
    };

    const handleStop = () => {
        if (abortRef.current) abortRef.current.abort();
        setUploading(false);
        setProgress(null);
        addToast('Ingestion Terminated', 'error');
    };

    useEffect(() => {
        refreshData();
        const interval = setInterval(refreshData, 15000);
        return () => clearInterval(interval);
    }, []);

    const refreshData = async () => {
        try {
            const [st, dc, cfg] = await Promise.all([
                axios.get('/api/chiron/stats', authH()),
                axios.get('/api/chiron/documents', authH()),
                axios.get('/api/admin/config/ai', authH())
            ]);
            setStats(st.data);
            setDocuments(dc.data);
            setAiConfig(cfg.data);
        } catch (e) { console.error('Refresh Error', e); }
    };

    const openTuningModal = () => {
        setTempConfig({ ...aiConfig });
        setTopKInput(aiConfig?.chiron?.topK?.toString() || '5');
        setTempInput(aiConfig?.chiron?.temperature?.toString() || '0.3');
        setModal({ type: 'tuning' });
    };

    const handleTopKChange = (val) => {
        setTopKInput(val);
        let parsed = parseInt(val);
        if (!isNaN(parsed)) {
            if (parsed < 1) parsed = 1;
            if (parsed > 50) parsed = 50;
            setTempConfig(prev => ({ ...prev, chiron: { ...prev.chiron, topK: parsed } }));
        }
    };

    const handleTempChange = (val) => {
        setTempInput(val);
        let parsed = parseFloat(val);
        if (!isNaN(parsed)) {
            if (parsed < 0) parsed = 0;
            if (parsed > 1) parsed = 1;
            setTempConfig(prev => ({ ...prev, chiron: { ...prev.chiron, temperature: parsed } }));
        }
    };

    const saveAiConfig = async () => {
        setAiConfigSaving(true);
        try {
            const res = await axios.post('/api/admin/config/ai', tempConfig, authH());
            setAiConfig(res.data);
            addToast('RAG Tuning Grounded');
            setModal(null);
        } catch (e) {
            addToast('Config Save Fail', 'error');
        } finally {
            setAiConfigSaving(false);
        }
    };

    const processSSE = async (res) => {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const l of lines) {
                if (l.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(l.substring(6));
                        setProgress(data);
                        if (data.status === 'Discovery Complete') {
                            addToast('Ingestion Success');
                            setUploading(false);
                            refreshData();
                            setTimeout(() => setProgress(null), 3000);
                        }
                    } catch (e) { }
                }
            }
        }
    };

    const handleIngest = async (file) => {
        if (!file) return;
        setUploading(true);
        setProgress({ status: 'Processing...', percent: 5 });
        abortRef.current = new AbortController();
        const fd = new FormData();
        fd.append('file', file);
        try {
            const res = await fetch('/api/chiron/ingest', {
                method: 'POST',
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
                body: fd,
                signal: abortRef.current.signal
            });
            if (!res.ok) throw new Error(await res.text());
            await processSSE(res);
        } catch (e) {
            if (e.name !== 'AbortError') addToast('Ingest Error', 'error');
            setUploading(false);
        }
    };

    const handleUrlIngest = async () => {
        if (!urlInput) return;
        setUploading(true);
        setShowUrlForm(false);
        setProgress({ status: 'Fetching Remote...', percent: 5 });
        abortRef.current = new AbortController();
        try {
            const res = await fetch('/api/chiron/ingest-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify({ url: urlInput, name: urlName }),
                signal: abortRef.current.signal
            });
            if (!res.ok) throw new Error(await res.text());
            await processSSE(res);
            setUrlInput(''); setUrlName('');
        } catch (e) {
            if (e.name !== 'AbortError') addToast('URL Fetch Fail', 'error');
            setUploading(false);
        }
    };

    const handleSync = async (id) => {
        setUploading(true);
        setProgress({ status: 'Handshaking...', percent: 5 });
        abortRef.current = new AbortController();
        try {
            const res = await fetch(`/api/chiron/sync/${id}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
                signal: abortRef.current.signal
            });
            if (!res.ok) throw new Error(await res.text());
            await processSSE(res);
        } catch (e) {
            if (e.name !== 'AbortError') addToast('Sync Error', 'error');
            setUploading(false);
        }
    };

    const handlePurge = async () => {
        setModal(null); setPurging(true);
        try {
            await axios.delete('/api/chiron/purge', authH());
            addToast('Knowledge Purged');
            refreshData();
        } catch (e) { addToast('Purge Failed', 'error'); }
        finally { setPurging(false); }
    };

    const handleDocDelete = async (id) => {
        try {
            await axios.delete(`/api/chiron/documents/${id}`, authH());
            addToast('Document Deleted');
            refreshData();
        } catch (e) { addToast('Delete Failed', 'error'); }
    };

    const filtered = documents.filter(d => d.document_name?.toLowerCase().includes(search.toLowerCase()));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', paddingBottom: '4rem' }}>
            {/* Command Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem' }}>
                <Stat icon={FileText} label="Total Sources" value={stats.documents || 0} color="#10b981" />
                <Stat icon={Zap} label="Physical Vectors" value={stats.vectorDbStats?.vectors || 0} color="#f59e0b" />
                <Stat icon={Brain} label="Active Precision" value={`${stats.dimensions || 768}d`} color="#3b82f6" badge={stats.dimensions === 1536 ? 'High fidelity' : 'Standard Alignment'} />
                <Stat icon={Terminal} label="Target Host" value={stats.host?.split('-')[0] + '...'} color="#8b5cf6" sub={stats.host} />
            </div>

            {/* Controller */}
            <div style={{ background: '#fff', borderRadius: '32px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.03)' }}>
                <div style={{ padding: '1.5rem 2rem', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ width: 44, height: 44, borderRadius: '14px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                            <ShieldCheck size={24} />
                        </div>
                        <div>
                            <span style={{ fontWeight: 900, fontSize: '1.1rem', color: '#0f172a', display: 'block' }}>Chiron Intelligence Control</span>
                            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>Autonomous cross-dimension knowledge engine</span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        {(uploading || (progress && progress.status !== 'Discovery Complete')) ? (
                            <button onClick={handleStop} style={{ height: 42, background: '#fef2f2', color: '#ef4444', border: '1.5px solid #fee2e2', borderRadius: '14px', padding: '0 1.25rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                <X size={18} /> Stop Command
                            </button>
                        ) : (
                            <>
                                <button onClick={() => fileInputRef.current?.click()} style={{ height: 42, background: '#2d5f3f', color: '#fff', border: 'none', borderRadius: '14px', padding: '0 1.25rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                    <Plus size={18} /> Ingest Manual
                                </button>
                                <button onClick={() => setShowUrlForm(!showUrlForm)} style={{ height: 42, background: '#fff', color: '#10b981', border: '1.5px solid #d1fae5', borderRadius: '14px', padding: '0 1.25rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                    <LinkIcon size={18} /> URL Ingest
                                </button>
                                <button onClick={openTuningModal} style={{ height: 42, background: '#fff', color: '#10b981', border: '1.5px solid #d1fae5', borderRadius: '14px', padding: '0 1.25rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                    <Settings size={18} /> RAG Settings
                                </button>
                                <button onClick={() => setModal({ type: 'purge' })} disabled={purging} style={{ height: 42, background: '#fff', color: purging ? '#94a3b8' : '#ef4444', border: '1.5px solid #fee2e2', borderRadius: '14px', padding: '0 1.25rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                    {purging ? <Clock className={s.spin} size={18} /> : <RotateCw size={18} />}
                                    Reset Index
                                </button>
                            </>
                        )}
                    </div>
                </div>

                <AnimatePresence>
                    {(showUrlForm || progress) && (
                        <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} style={{ overflow: 'hidden', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                            <div style={{ padding: '2rem' }}>
                                {showUrlForm && !uploading && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '1rem', alignItems: 'end', marginBottom: progress ? '2rem' : 0 }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <label style={{ fontSize: '0.85rem', fontWeight: 800 }}>Clinical Link (PDF/DOCX)</label>
                                            <input type="text" className={s.configInput} placeholder="https://..." value={urlInput} onChange={e => setUrlInput(e.target.value)} />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <label style={{ fontSize: '0.85rem', fontWeight: 800 }}>Reference Label</label>
                                            <input type="text" className={s.configInput} placeholder="e.g. Discovery Alpha" value={urlName} onChange={e => setUrlName(e.target.value)} />
                                        </div>
                                        <button onClick={handleUrlIngest} style={{ height: 42, padding: '0 1.5rem', background: '#10b981', color: '#fff', borderRadius: '12px', border: 'none', fontWeight: 800 }}>Start URL Ingest</button>
                                    </div>
                                )}
                                {progress && (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                {progress.error ? <AlertCircle color="#ef4444" size={20} /> : <Clock className={s.spin} size={20} color="#10b981" />}
                                                <span style={{ fontWeight: 800, color: progress.error ? '#ef4444' : '#1e293b' }}>{progress.error ? 'HANDSHAKE REFUSED' : progress.status}</span>
                                            </div>
                                            <span style={{ fontWeight: 900, color: progress.error ? '#ef4444' : '#10b981' }}>{progress.percent || 0}%</span>
                                        </div>
                                        <div style={{ height: 12, background: '#e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
                                            <motion.div animate={{ width: `${progress.percent || 0}%` }} transition={{ type: 'spring', damping: 25, stiffness: 60 }} style={{ height: '100%', background: progress.error ? '#ef4444' : 'linear-gradient(90deg, #10b981, #3b82f6)', borderRadius: 6 }} />
                                        </div>
                                        {progress.error && <p style={{ margin: '1rem 0 0', color: '#ef4444', fontWeight: 800, fontSize: '0.85rem' }}>{progress.error}</p>}
                                        {progress.status === 'Discovery Complete' && <button onClick={() => setProgress(null)} className={s.refreshBtn} style={{ marginTop: '1.5rem' }}>Dismiss & Reset Controller</button>}
                                    </>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Vault View */}
                <div className={s.tableWrap} style={{ padding: '0 1rem 1rem' }}>
                    <div style={{ padding: '1.25rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ position: 'relative', width: '340px' }}>
                            <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input type="text" placeholder="Search knowledge vault..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', height: 40, padding: '0 1rem 0 2.5rem', borderRadius: '10px', border: '1.5px solid #f1f5f9', background: '#f8fafc', fontSize: '0.85rem', fontWeight: 600, outline: 'none' }} />
                        </div>
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 800 }}>DISCOVERY AGENT ACTIVE</span>
                    </div>
                    <table className={s.modernTable}>
                        <thead>
                            <tr>
                                <th>Content Identity</th>
                                <th style={{ textAlign: 'center' }}>Segments</th>
                                <th style={{ width: 140 }}>Status</th>
                                <th style={{ width: 120 }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(d => (
                                <tr key={d._id}>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div style={{ width: 32, height: 32, borderRadius: '10px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', border: '1px solid #e2e8f0' }}><FileText size={16} /></div>
                                            <span style={{ fontWeight: 800, color: '#0f172a' }}>{d.document_name}</span>
                                        </div>
                                    </td>
                                    <td style={{ textAlign: 'center', fontWeight: 900 }}>{d.chunks_count || 0}</td>
                                    <td><span style={{ padding: '4px 10px', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 900, background: d.status === 'complete' ? '#f0fdf4' : '#fef2f2', color: d.status === 'complete' ? '#10b981' : '#ef4444' }}>{d.status?.toUpperCase()}</span></td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                            <button className={s.iconSm} onClick={() => handleSync(d._id)} title="Sync"><RefreshCw size={14} /></button>
                                            <button className={s.iconSm} onClick={() => handleDocDelete(d._id)} style={{ color: '#ef4444' }}><Trash2 size={14} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <input ref={fileInputRef} type="file" onChange={e => handleIngest(e.target.files?.[0])} style={{ display: 'none' }} />

            <AnimatePresence>
                {modal && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(10px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {modal.type === 'purge' ? (
                            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} style={{ background: '#fff', borderRadius: '28px', width: '100%', maxWidth: 440, padding: '2.5rem', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.1)' }}>
                                <div style={{ width: 64, height: 64, borderRadius: '20px', background: '#fef2f2', color: '#ef4444', margin: '0 auto 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><RotateCw size={32} /></div>
                                <h3 style={{ fontWeight: 950, fontSize: '1.5rem', color: '#0f172a' }}>Reset Index?</h3>
                                <p style={{ color: '#64748b', fontWeight: 600, marginTop: '0.5rem' }}>This will permanently erase all knowledge segments from the physical brain index.</p>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '2.5rem' }}>
                                    <button onClick={() => setModal(null)} style={{ height: 48, borderRadius: '14px', border: '1.5px solid #f1f5f9', background: '#fff', fontWeight: 800, cursor: 'pointer' }}>Cancel</button>
                                    <button onClick={handlePurge} style={{ height: 48, borderRadius: '14px', border: 'none', background: '#ef4444', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Yes, Purge</button>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className={s.modal} style={{ maxWidth: '480px', width: '95%' }}>
                                <div className={s.modalHeader} style={{ background: '#fff', padding: '1.5rem 2rem', borderBottom: '1px solid #f1f5f9', position: 'relative' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Brain size={22} style={{ color: '#10b981' }} />
                                        </div>
                                        <div>
                                            <h2 style={{ color: '#0f172a', fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>RAG Tuning</h2>
                                            <p style={{ color: '#64748b', fontSize: '0.75rem', margin: '2px 0 0' }}>Calibrate retrieval parameters</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setModal(null)}
                                        style={{
                                            position: 'absolute',
                                            top: '1.5rem',
                                            right: '1.5rem',
                                            background: '#f8fafc',
                                            border: '1.5px solid #e2e8f0',
                                            color: '#64748b',
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: '8px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <X size={18} />
                                    </button>
                                </div>

                                <div className={s.modalContent} style={{ padding: '1.75rem 2.25rem', background: '#fff', overflow: 'hidden' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
                                        {/* Chunk Size */}
                                        <div className={s.aiConfigGroup}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                                <label className={s.clinicalLabel}><Database size={14} /> Chunk Size</label>
                                                <span className={s.clinicalValueBadge}>{tempConfig?.chiron?.chunkSize || 500} pts</span>
                                            </div>
                                            <input
                                                type="range" min="100" max="2000" step="50"
                                                className={s.clinicalSlider}
                                                value={tempConfig?.chiron?.chunkSize || 500}
                                                style={{
                                                    background: `linear-gradient(to right, #2d5f3f 0%, #2d5f3f ${(((tempConfig?.chiron?.chunkSize || 500) - 100) / 1900) * 100}%, #f1f5f9 ${(((tempConfig?.chiron?.chunkSize || 500) - 100) / 1900) * 100}%, #f1f5f9 100%)`
                                                }}
                                                onChange={e => setTempConfig(p => ({ ...p, chiron: { ...p.chiron, chunkSize: parseInt(e.target.value) } }))}
                                            />
                                            <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.75rem', lineHeight: 1.5 }}>
                                                Larger chunks provide deeper context; smaller chunks enable higher surgical precision.
                                            </p>
                                        </div>

                                        {/* Overlap */}
                                        <div className={s.aiConfigGroup}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                                <label className={s.clinicalLabel}><Activity size={14} /> Overlap Window</label>
                                                <span className={s.clinicalValueBadge}>{tempConfig?.chiron?.overlap || 50} pts</span>
                                            </div>
                                            <input
                                                type="range" min="0" max="500" step="10"
                                                className={s.clinicalSlider}
                                                value={tempConfig?.chiron?.overlap || 50}
                                                style={{
                                                    background: `linear-gradient(to right, #2d5f3f 0%, #2d5f3f ${((tempConfig?.chiron?.overlap || 50) / 500) * 100}%, #f1f5f9 ${((tempConfig?.chiron?.overlap || 50) / 500) * 100}%, #f1f5f9 100%)`
                                                }}
                                                onChange={e => setTempConfig(p => ({ ...p, chiron: { ...p.chiron, overlap: parseInt(e.target.value) } }))}
                                            />
                                        </div>

                                        <div className={s.dualColumnGrid} style={{ gap: '1.5rem', marginTop: '0.5rem' }}>
                                            {/* TopK */}
                                            <div className={s.aiConfigGroup}>
                                                <label className={s.clinicalLabel}>Search Depth (Top-K)</label>
                                                <input
                                                    type="number" min="1" max="50"
                                                    className={s.configInput}
                                                    style={{ width: '100%', height: '52px', padding: '0 1.5rem', fontSize: '1.1rem', fontWeight: 800, transition: '0.2s', border: '1.5px solid #e2e8f0', borderRadius: '16px' }}
                                                    value={topKInput}
                                                    onChange={e => handleTopKChange(e.target.value)}
                                                    onFocus={e => e.currentTarget.style.borderColor = '#10b981'}
                                                    onBlur={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                                                />
                                            </div>
                                            {/* Temperature */}
                                            <div className={s.aiConfigGroup}>
                                                <label className={s.clinicalLabel}>Precision Variance</label>
                                                <input
                                                    type="number" min="0" max="1" step="0.05"
                                                    className={s.configInput}
                                                    style={{ width: '100%', height: '52px', padding: '0 1.5rem', fontSize: '1.1rem', fontWeight: 800, transition: '0.2s', border: '1.5px solid #e2e8f0', borderRadius: '16px' }}
                                                    value={tempInput}
                                                    onChange={e => handleTempChange(e.target.value)}
                                                    onFocus={e => e.currentTarget.style.borderColor = '#10b981'}
                                                    onBlur={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className={s.modalFooter} style={{ padding: '1.25rem 2.25rem', background: '#fcfdfe', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                                    <button onClick={() => setModal(null)} style={{ border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '10px', padding: '0.6rem 1.2rem', fontWeight: 700, fontSize: '0.85rem', color: '#64748b', cursor: 'pointer' }}>Discard</button>
                                    <button onClick={saveAiConfig} style={{ border: 'none', background: '#2d5f3f', color: '#fff', borderRadius: '10px', padding: '0.6rem 1.5rem', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {aiConfigSaving ? <RefreshCw className={s.spin} size={16} /> : <Save size={16} />}
                                        Save Changes
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </div>
                )}
            </AnimatePresence>

            <div style={{ position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 20000, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <AnimatePresence>
                    {toasts.map(t => (
                        <motion.div key={t.id} initial={{ x: 100 }} animate={{ x: 0 }} exit={{ x: 100 }} style={{ background: '#fff', padding: '0.8rem 1.2rem', borderRadius: '14px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ color: t.type === 'error' ? '#ef4444' : '#10b981' }}>{t.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}</div>
                            <span style={{ fontWeight: 800, fontSize: '0.85rem' }}>{t.msg}</span>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
}

function Stat({ icon: Icon, label, value, color, badge, sub }) {
    return (
        <div style={{ background: '#fff', padding: '1.25rem 1.5rem', borderRadius: '28px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '1.25rem', position: 'relative', overflow: 'hidden' }}>
            {badge && (
                <div style={{ position: 'absolute', top: 12, right: 12, fontSize: '0.55rem', fontWeight: 900, background: '#f0f9ff', color: '#0ea5e9', padding: '2px 8px', borderRadius: '6px', border: '1px solid #bae6fd' }}>
                    {badge}
                </div>
            )}
            <div style={{ width: 44, height: 44, borderRadius: '14px', background: `${color}10`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={20} />
            </div>
            <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '2px' }}>{label}</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 950, color: '#1e293b', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{value}</div>
                {sub && <div style={{ fontSize: '0.5rem', color: '#94a3b8', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
            </div>
        </div>
    );
}
