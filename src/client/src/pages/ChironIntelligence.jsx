import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Upload, Trash2, Plus, Link as LinkIcon, Settings,
    Database, Zap, FileText, Globe, Key, Save, X, RefreshCw,
    ShieldCheck, AlertCircle, CheckCircle, Search, Clock, Brain,
    Sparkles, Eye, EyeOff
} from 'lucide-react';
import axios from 'axios';
import s from './AdminPortal.module.css';

const authH = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

export default function ChironIntelligence() {
    const [stats, setStats] = useState({ documents: 0, chunks: 0, entities: 0, vectorDbStats: {} });
    const [documents, setDocuments] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(null);
    const [urlInput, setUrlInput] = useState('');
    const [urlDocName, setUrlDocName] = useState('');
    const [showUrlForm, setShowUrlForm] = useState(false);
    const [showEmbeddingConfig, setShowEmbeddingConfig] = useState(false);
    const [embeddingConfig, setEmbeddingConfig] = useState(null);
    const [configForm, setConfigForm] = useState({ provider: 'gemini', baseUrl: '', model: '', apiKey: '' });
    const [showEmbeddingApiKey, setShowEmbeddingApiKey] = useState(false);
    const [savingConfig, setSavingConfig] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [deleteModal, setDeleteModal] = useState(null); // { id, name }
    const fileInputRef = useRef(null);

    // Fetch data on mount
    useEffect(() => {
        refreshData();
        const interval = setInterval(refreshData, 10000);
        return () => clearInterval(interval);
    }, []);

    const refreshData = async () => {
        if (refreshing) return;
        setRefreshing(true);
        try {
            await Promise.all([
                fetchStats(),
                fetchDocuments(),
                fetchEmbeddingConfig()
            ]);
        } finally {
            setRefreshing(false);
        }
    };

    const fetchStats = async () => {
        try {
            const response = await axios.get('/api/chiron/stats', authH());
            setStats(response.data);
        } catch (err) { console.error('Stats error:', err); }
    };

    const fetchDocuments = async () => {
        try {
            const response = await axios.get('/api/chiron/documents', authH());
            setDocuments(response.data);
        } catch (err) { console.error('Docs error:', err); }
    };

    const fetchEmbeddingConfig = async () => {
        try {
            const response = await axios.get('/api/chiron/embedding-config', authH());
            setEmbeddingConfig(response.data);
            if (!showEmbeddingConfig) setConfigForm(response.data);
        } catch (err) { console.error('Config error:', err); }
    };

    const handleSaveEmbeddingConfig = async () => {
        setSavingConfig(true);
        try {
            await axios.put('/api/chiron/embedding-config', configForm, authH());
            setEmbeddingConfig(configForm);
            setShowEmbeddingConfig(false);
        } catch (err) {
            alert('Error saving config: ' + err.message);
        } finally {
            setSavingConfig(false);
        }
    };

    const handleFileSelect = async (file) => {
        if (!file) return;
        setUploading(true);
        setProgress({ status: 'preparing', percent: 5 });
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/chiron/ingest', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${localStorage.getItem('token')}`
                },
                body: formData
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Ingest failed: ${response.status} ${text}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                lines.forEach(line => {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.substring(6));
                            setProgress(data);
                            if (data.status === 'complete') {
                                setTimeout(refreshData, 1000);
                            }
                        } catch (e) { }
                    }
                });
            }
        } catch (err) {
            setProgress({ status: 'error', error: err.message, percent: 0 });
        } finally {
            setUploading(false);
        }
    };

    const handleUrlIngest = async () => {
        if (!urlInput.trim()) return;
        setUploading(true);
        setProgress({ status: 'downloading', percent: 5 });

        try {
            const response = await fetch('/api/chiron/ingest-url', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    url: urlInput,
                    document_name: urlDocName || urlInput.split('/').pop()
                })
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Ingest failed: ${response.status} ${text}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                lines.forEach(line => {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.substring(6));
                            setProgress(data);
                            if (data.status === 'complete') {
                                setUrlInput('');
                                setUrlDocName('');
                                setShowUrlForm(false);
                                setTimeout(refreshData, 1000);
                            }
                        } catch (e) { }
                    }
                });
            }
        } catch (err) {
            setProgress({ status: 'error', error: err.message, percent: 0 });
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (docId, name) => {
        setDeleteModal({ id: docId, name });
    };

    const confirmDelete = async () => {
        const { id } = deleteModal;
        try {
            await axios.delete(`/api/chiron/documents/${id}`, authH());
            setDocuments(prev => prev.filter(d => d._id !== id));
            fetchStats();
            setDeleteModal(null);
        } catch (err) { alert('Delete failed: ' + err.message); }
    };

    const filteredDocs = documents.filter(doc =>
        doc.document_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Stats Grid */}
            <div className={s.statsGrid}>
                <StatCard icon={FileText} label="Total Documents" value={stats.documents} color="#10b981" />
                <StatCard icon={Zap} label="Indexed Chunks" value={stats.chunks} color="#f59e0b" />
                <StatCard icon={Globe} label="Graph Entities" value={stats.entities} color="#3b82f6" />
                <StatCard icon={Database} label="Relationships" value={stats.vectorDbStats?.relationships || 0} color="#8b5cf6" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>

                {/* Upload Actions Card */}
                <div style={{ background: '#fff', borderRadius: '20px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
                    <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to right, #f8fafc, #fff)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <Upload size={18} color="#10b981" />
                            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a' }}>Ingest Knowledge</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button
                                className={s.addBtn}
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                                style={{ height: '36px', background: '#2d5f3f', color: '#fff', padding: '0 1rem', border: 'none' }}
                            >
                                <Plus size={16} /> File Ingest
                            </button>
                            <button
                                className={s.addBtn}
                                onClick={() => setShowUrlForm(!showUrlForm)}
                                disabled={uploading}
                                style={{ height: '36px', background: '#f0fdf4', color: '#166534', padding: '0 1rem', border: '1px solid #bbf7d0' }}
                            >
                                <LinkIcon size={16} /> URL Ingest
                            </button>
                        </div>
                    </div>

                    <AnimatePresence>
                        {(showUrlForm || progress) && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                style={{ overflow: 'hidden', borderBottom: '1px solid #f1f5f9' }}
                            >
                                <div style={{ padding: '1.5rem', background: '#f8fafc' }}>
                                    {showUrlForm && !uploading && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                <div className={s.aiConfigGroup}>
                                                    <label className={s.inputLabel}>Knowledge URL</label>
                                                    <input
                                                        className={s.configInput}
                                                        placeholder="https://example.com/guide.pdf"
                                                        value={urlInput}
                                                        onChange={e => setUrlInput(e.target.value)}
                                                    />
                                                </div>
                                                <div className={s.aiConfigGroup}>
                                                    <label className={s.inputLabel}>Label (Optional)</label>
                                                    <input
                                                        className={s.configInput}
                                                        placeholder="e.g. Merck Manual"
                                                        value={urlDocName}
                                                        onChange={e => setUrlDocName(e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                                                <button className={s.refreshBtn} onClick={() => setShowUrlForm(false)}>Cancel</button>
                                                <button className={s.addBtn} onClick={handleUrlIngest} style={{ background: '#10b981', color: '#fff', border: 'none', padding: '0 1.25rem' }}>Start Ingest</button>
                                            </div>
                                        </div>
                                    )}

                                    {progress && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    {progress.status === 'error' ? <AlertCircle color="#ef4444" size={18} /> : (progress.status === 'complete' ? <CheckCircle color="#10b981" size={18} /> : <Clock className={s.spin} color="#10b981" size={18} />)}
                                                    <span style={{ fontWeight: 700, color: '#1e293b' }}>
                                                        {progress.status === 'error' ? 'Ingestion Failed' : (progress.status === 'complete' ? 'Sync Successful' : `Processing: ${progress.status}`)}
                                                    </span>
                                                </div>
                                                <span style={{ fontWeight: 800, color: progress.status === 'error' ? '#ef4444' : '#10b981' }}>{progress.percent || 0}%</span>
                                            </div>
                                            <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${progress.percent || 0}%` }}
                                                    style={{ height: '100%', background: progress.status === 'error' ? '#ef4444' : 'linear-gradient(90deg, #10b981, #059669)', borderRadius: '10px' }}
                                                />
                                            </div>
                                            {progress.error && <p style={{ margin: 0, color: '#ef4444', fontSize: '0.8rem' }}>{progress.error}</p>}
                                            {progress.status === 'complete' && (
                                                <button className={s.refreshBtn} onClick={() => setProgress(null)} style={{ alignSelf: 'center' }}>Dismiss</button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div style={{ padding: '0 1.5rem' }}>
                        <div style={{ padding: '1rem 0', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'nowrap' }}>
                            <div className={s.searchWrap} style={{ width: '320px', margin: 0, flexShrink: 0 }}>
                                <Search size={14} />
                                <input
                                    type="text"
                                    placeholder="Filter documents..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>Showing {filteredDocs.length} Sources</div>
                        </div>
                    </div>

                    <div className={s.tableWrap}>
                        <table className={s.modernTable}>
                            <thead>
                                <tr>
                                    <th>Content Source</th>
                                    <th style={{ textAlign: 'center' }}>Segments</th>
                                    <th style={{ textAlign: 'center' }}>Knowledge Points</th>
                                    <th style={{ textAlign: 'center' }}>Relations</th>
                                    <th>Status</th>
                                    <th>Indexed On</th>
                                    <th style={{ width: '80px' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                <AnimatePresence>
                                    {filteredDocs.map((doc, idx) => (
                                        <motion.tr
                                            key={doc._id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: idx * 0.05 }}
                                        >
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <div style={{ width: 32, height: 32, borderRadius: '8px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', border: '1px solid #d1fae5' }}>
                                                        {doc.document_name?.toLowerCase().endsWith('.pdf') ? <FileText size={16} /> : <Globe size={16} />}
                                                    </div>
                                                    <span style={{ fontWeight: 700, color: '#0f172a' }}>{doc.document_name}</span>
                                                </div>
                                            </td>
                                            <td style={{ textAlign: 'center', fontWeight: 800, color: '#64748b' }}>{doc.chunks_count}</td>
                                            <td style={{ textAlign: 'center', fontWeight: 800, color: '#10b981' }}>{doc.entities_count}</td>
                                            <td style={{ textAlign: 'center', fontWeight: 800, color: '#3b82f6' }}>{doc.relationships_count || '—'}</td>
                                            <td>
                                                <span className={s.pill} style={{
                                                    background: doc.status === 'complete' ? '#f0fdf4' : '#fff7ed',
                                                    color: doc.status === 'complete' ? '#166534' : '#c2410c',
                                                    border: `1px solid ${doc.status === 'complete' ? '#bbf7d0' : '#ffedd5'}`
                                                }}>
                                                    {doc.status}
                                                </span>
                                            </td>
                                            <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{new Date(doc.uploaded_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</td>
                                            <td>
                                                <button className={s.iconSm} style={{ border: 'none', background: '#fef2f2', color: '#ef4444' }} onClick={() => handleDelete(doc._id, doc.document_name)} title="Purge database">
                                                    <Trash2 size={15} />
                                                </button>
                                            </td>
                                        </motion.tr>
                                    ))}
                                </AnimatePresence>
                                {filteredDocs.length === 0 && (
                                    <tr>
                                        <td colSpan="7" style={{ padding: '5rem', textAlign: 'center' }}>
                                            <Database size={40} color="#e2e8f0" style={{ marginBottom: '1rem' }} />
                                            <p style={{ margin: 0, color: '#94a3b8', fontWeight: 600 }}>Zero segments found. Feed the engine with veterinary data.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Custom Modals */}
            <AnimatePresence>
                {deleteModal && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '1rem' }}>
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            style={{ background: '#fff', borderRadius: '24px', width: '100%', maxWidth: '440px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15)', overflow: 'hidden' }}
                        >
                            <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '1rem' }}>
                                <div style={{ width: 64, height: 64, borderRadius: '20px', background: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Trash2 size={32} />
                                </div>
                                <div>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.5rem 0' }}>Purge Document Data?</h3>
                                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem', lineHeight: 1.5 }}>
                                        Are you sure you want to delete <span style={{ fontWeight: 800, color: '#1e293b' }}>{deleteModal.name}</span>? 
                                        This will permanently erase all associated vectors and semantic chunks.
                                    </p>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', width: '100%', marginTop: '1rem' }}>
                                    <button 
                                        onClick={() => setDeleteModal(null)}
                                        style={{ padding: '0.75rem', borderRadius: '14px', border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
                                    >
                                        Keep Data
                                    </button>
                                    <button 
                                        onClick={confirmDelete}
                                        style={{ padding: '0.75rem', borderRadius: '14px', border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)', transition: 'all 0.2s' }}
                                    >
                                        Erase Permanently
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Hidden Input */}
            <input
                ref={fileInputRef}
                type="file"
                onChange={e => handleFileSelect(e.target.files?.[0])}
                accept=".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg"
                style={{ display: 'none' }}
            />
        </div>
    );
}

function StatCard({ icon: Icon, label, value, color }) {
    return (
        <div className={s.statCard}>
            <div className={s.statIcon} style={{ background: `${color}15`, color }}><Icon size={18} /></div>
            <div>
                <div className={s.statLabel}>{label}</div>
                <div className={s.statVal}>{value ?? '—'}</div>
            </div>
        </div>
    );
}
