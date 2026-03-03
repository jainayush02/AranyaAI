import React, { useState, useEffect, useRef } from 'react';
import {
    BookOpen, FileText, Video, MessageCircle, ArrowLeft, Search,
    Lightbulb, Activity, Plus, Pencil, Trash2, Upload, X,
    Save, Eye, EyeOff, Play, CheckCircle, AlertCircle, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOutletContext, useNavigate } from 'react-router-dom';
import axios from 'axios';
import styles from './Documentation.module.css';

const API = '/api/docs';
const CATEGORIES = [
    { id: 'getting-started', label: 'Getting Started', icon: BookOpen, color: '#2d5f3f' },
    { id: 'features', label: 'Features', icon: FileText, color: '#3b82f6' },
    { id: 'video-tutorials', label: 'Video Tutorials', icon: Video, color: '#7c3aed' },
];

const authHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
});

function Toast({ msg, type, onClose }) {
    useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, []);
    return (
        <motion.div
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
            className={`${styles.toast} ${type === 'error' ? styles.toastError : styles.toastSuccess}`}
        >
            {type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />} {msg}
        </motion.div>
    );
}

export default function Documentation() {
    const { role } = useOutletContext() || { role: 'user' };
    const isAdmin = role === 'admin';
    const navigate = useNavigate();

    const [grouped, setGrouped] = useState({ 'getting-started': [], 'features': [], 'video-tutorials': [] });
    const [selectedDoc, setSelectedDoc] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [toasts, setToasts] = useState([]);

    // Admin state
    const [editingDoc, setEditingDoc] = useState(null); // null = not editing, doc object = editing
    const [isCreating, setIsCreating] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [uploadingVideo, setUploadingVideo] = useState(null); // doc._id being uploaded to
    const [videoUploadProgress, setVideoUploadProgress] = useState(0);
    const fileInputRef = useRef(null);

    const [form, setForm] = useState({
        title: '', category: 'getting-started', content: '', steps: '', published: true
    });

    const [supportInfo, setSupportInfo] = useState({ email: 'support@aranya.ai', phone: '' });

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await axios.get('/api/settings');
                if (res.data) {
                    setSupportInfo({
                        email: res.data.supportEmail || 'support@aranya.ai',
                        phone: res.data.supportPhone || ''
                    });
                }
            } catch (err) { }
        };
        fetchSettings();
    }, []);

    const addToast = (msg, type = 'success') => {
        const id = Date.now();
        setToasts(p => [...p, { id, msg, type }]);
        setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
    };

    const fetchDocs = async () => {
        try {
            setLoading(true);
            // Admin gets all (including unpublished) from different endpoint
            const endpoint = isAdmin ? `${API}/admin/all` : API;
            const res = await axios.get(endpoint, isAdmin ? authHeaders() : {});
            if (isAdmin) {
                // Group manually for admin
                const g = { 'getting-started': [], 'features': [], 'video-tutorials': [] };
                res.data.forEach(d => { if (g[d.category]) g[d.category].push(d); });
                setGrouped(g);
            } else {
                setGrouped(res.data);
            }
        } catch (err) {
            // Fallback static content if DB empty
            setGrouped({ 'getting-started': [], 'features': [], 'video-tutorials': [] });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchDocs(); }, [isAdmin]);

    // Filter by search
    const filterDocs = (docs) => {
        if (!searchQuery) return docs;
        const q = searchQuery.toLowerCase();
        return docs.filter(d => d.title.toLowerCase().includes(q) || d.content?.toLowerCase().includes(q));
    };

    const openCreate = () => {
        setForm({ title: '', category: 'getting-started', content: '', steps: '', published: true });
        setIsCreating(true);
        setEditingDoc(null);
    };

    const openEdit = (doc) => {
        setForm({
            title: doc.title,
            category: doc.category,
            content: doc.content || '',
            steps: (doc.steps || []).join('\n'),
            published: doc.published !== false
        });
        setEditingDoc(doc);
        setIsCreating(false);
    };

    const handleSave = async () => {
        if (!form.title.trim()) return addToast('Title is required', 'error');
        const payload = {
            ...form,
            steps: form.steps.split('\n').map(s => s.trim()).filter(Boolean)
        };
        try {
            if (isCreating) {
                await axios.post(API, payload, authHeaders());
                addToast('Article created!');
            } else {
                await axios.put(`${API}/${editingDoc._id}`, payload, authHeaders());
                addToast('Article updated!');
            }
            setIsCreating(false); setEditingDoc(null);
            fetchDocs();
        } catch (err) {
            addToast(err.response?.data?.message || 'Save failed', 'error');
        }
    };

    const handleDelete = async (doc) => {
        try {
            await axios.delete(`${API}/${doc._id}`, authHeaders());
            addToast(`"${doc.title}" deleted`);
            setDeleteTarget(null);
            if (selectedDoc?._id === doc._id) setSelectedDoc(null);
            fetchDocs();
        } catch (err) {
            addToast(err.response?.data?.message || 'Delete failed', 'error');
        }
    };

    const handleVideoUpload = async (docId, file) => {
        if (!file) return;
        setUploadingVideo(docId);
        setVideoUploadProgress(0);
        const formData = new FormData();
        formData.append('video', file);
        formData.append('videoTitle', file.name.replace(/\.[^.]+$/, ''));
        try {
            await axios.post(`${API}/${docId}/upload-video`, formData, {
                ...authHeaders(),
                headers: { ...authHeaders().headers, 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (e) => setVideoUploadProgress(Math.round(e.loaded * 100 / e.total))
            });
            addToast('Video uploaded successfully!');
            fetchDocs();
        } catch (err) {
            addToast('Video upload failed', 'error');
        } finally {
            setUploadingVideo(null);
            setVideoUploadProgress(0);
        }
    };

    const handleRemoveVideo = async (docId) => {
        try {
            await axios.delete(`${API}/${docId}/video`, authHeaders());
            addToast('Video removed');
            fetchDocs();
        } catch {
            addToast('Failed to remove video', 'error');
        }
    };

    const allDocs = Object.values(grouped).flat();

    return (
        <div className={`container ${styles.pageContainer}`}>
            {/* Admin back button */}
            {isAdmin && (
                <button
                    onClick={() => navigate('/admin-portal')}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        padding: '6px 14px', marginBottom: '12px',
                        background: '#f8fafc', border: '1px solid #e2e8f0',
                        borderRadius: '8px', cursor: 'pointer',
                        fontSize: '0.84rem', fontWeight: 600, color: '#64748b',
                        transition: 'all 0.15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = '#0f172a'}
                    onMouseLeave={e => e.currentTarget.style.color = '#64748b'}
                >
                    <ArrowLeft size={15} /> Back to Admin Console
                </button>
            )}
            {/* Toast Notifications */}
            <div className={styles.toastContainer}>
                <AnimatePresence>
                    {toasts.map(t => (
                        <Toast key={t.id} msg={t.msg} type={t.type} onClose={() => setToasts(p => p.filter(x => x.id !== t.id))} />
                    ))}
                </AnimatePresence>
            </div>

            {/* Delete Confirm Modal */}
            <AnimatePresence>
                {deleteTarget && (
                    <motion.div className={styles.modalOverlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <motion.div className={styles.confirmModal} initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}>
                            <div className={styles.confirmIcon}><Trash2 size={28} color="#ef4444" /></div>
                            <h3>Delete Article</h3>
                            <p>Are you sure you want to delete <strong>"{deleteTarget.title}"</strong>? This cannot be undone.</p>
                            <div className={styles.confirmActions}>
                                <button className={styles.cancelBtn} onClick={() => setDeleteTarget(null)}>Cancel</button>
                                <button className={styles.dangerBtn} onClick={() => handleDelete(deleteTarget)}>Delete</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Admin Editor Panel */}
            <AnimatePresence>
                {(isCreating || editingDoc) && (
                    <motion.div className={styles.modalOverlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <motion.div className={styles.editorModal} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}>
                            <div className={styles.editorHeader}>
                                <h2>{isCreating ? '✍️ New Article' : '✏️ Edit Article'}</h2>
                                <button onClick={() => { setIsCreating(false); setEditingDoc(null); }} className={styles.editorClose}><X size={20} /></button>
                            </div>
                            <div className={styles.editorBody}>
                                <div className={styles.formRow}>
                                    <label>Title *</label>
                                    <input className={styles.editorInput} value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Article title..." />
                                </div>
                                <div className={styles.formRow}>
                                    <label>Category</label>
                                    <select className={styles.editorInput} value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                                        {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                    </select>
                                </div>
                                <div className={styles.formRow}>
                                    <label>Content (HTML supported)</label>
                                    <textarea className={`${styles.editorInput} ${styles.editorTextarea}`} value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} placeholder="<p>Article content...</p>" />
                                </div>
                                <div className={styles.formRow}>
                                    <label>Steps (one per line)</label>
                                    <textarea className={`${styles.editorInput} ${styles.editorSteps}`} value={form.steps} onChange={e => setForm(p => ({ ...p, steps: e.target.value }))} placeholder={"Step 1\nStep 2\nStep 3"} />
                                </div>
                                <div className={styles.formRowInline}>
                                    <label>Published</label>
                                    <button className={`${styles.toggleBtn} ${form.published ? styles.toggleOn : ''}`} onClick={() => setForm(p => ({ ...p, published: !p.published }))}>
                                        {form.published ? <><Eye size={14} /> Visible</> : <><EyeOff size={14} /> Hidden</>}
                                    </button>
                                </div>
                            </div>
                            <div className={styles.editorFooter}>
                                <button className={styles.cancelBtn} onClick={() => { setIsCreating(false); setEditingDoc(null); }}>Cancel</button>
                                <button className={styles.saveBtn} onClick={handleSave}><Save size={16} /> Save Article</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
                {!selectedDoc ? (
                    <motion.div key="grid" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className={styles.mainView}>
                        <div className={styles.pageHeader}>
                            <div>
                                <h1 className={styles.pageTitle}>Documentation</h1>
                                <p className={styles.pageSubtitle}>Everything you need to master Aranya AI</p>
                            </div>
                            {isAdmin && (
                                <button className={styles.addArticleBtn} onClick={openCreate}>
                                    <Plus size={18} /> New Article
                                </button>
                            )}
                        </div>

                        <div className={styles.searchWrapper}>
                            <Search className={styles.searchIcon} size={20} />
                            <input type="text" placeholder="Search tutorials, features, or guides..." className={styles.searchInput} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                        </div>

                        {loading ? (
                            <div className={styles.loadingState}><Loader2 size={32} className={styles.spinner} /><p>Loading documentation...</p></div>
                        ) : (
                            <div className={styles.docsGrid}>
                                {CATEGORIES.map(cat => {
                                    const Icon = cat.icon;
                                    const docs = filterDocs(grouped[cat.id] || []);
                                    return (
                                        <div className={styles.docCard} key={cat.id}>
                                            <div className={styles.cardHeader}>
                                                <Icon className={styles.cardIcon} size={24} style={{ color: cat.color }} />
                                                <h2 className={styles.cardTitle}>{cat.label}</h2>
                                                <span className={styles.countBadge}>{docs.length}</span>
                                            </div>
                                            <ul className={styles.docList}>
                                                {docs.length === 0 && (
                                                    <li className={styles.emptyItem}>
                                                        {isAdmin ? 'No articles yet. Click "New Article" to add one.' : 'Coming soon...'}
                                                    </li>
                                                )}
                                                {docs.map(doc => (
                                                    <li key={doc._id} className={`${styles.docItem} ${!doc.published ? styles.unpublished : ''}`}>
                                                        <span className={styles.bulletDot}>•</span>
                                                        <span className={styles.docLink} onClick={() => setSelectedDoc(doc)}>
                                                            {doc.title}
                                                            {!doc.published && <span className={styles.draftTag}>Draft</span>}
                                                            {doc.videoUrl && <Play size={12} className={styles.videoIcon} />}
                                                        </span>
                                                        {isAdmin && (
                                                            <div className={styles.docActions}>
                                                                <button className={styles.iconBtn} title="Edit" onClick={() => openEdit(doc)}>
                                                                    <Pencil size={13} />
                                                                </button>
                                                                <label className={styles.iconBtn} title="Upload Video">
                                                                    {uploadingVideo === doc._id
                                                                        ? <Loader2 size={13} className={styles.spinner} />
                                                                        : <Upload size={13} />}
                                                                    <input type="file" accept="video/*" style={{ display: 'none' }}
                                                                        onChange={e => handleVideoUpload(doc._id, e.target.files[0])} />
                                                                </label>
                                                                <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} title="Delete" onClick={() => setDeleteTarget(doc)}>
                                                                    <Trash2 size={13} />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {!isAdmin && (
                            <div className={styles.supportBanner}>
                                <MessageCircle size={40} className={styles.supportIcon} />
                                <h2 className={styles.supportTitle}>Need More Help?</h2>
                                <p className={styles.supportSubtitle} style={{ marginBottom: '0.5rem' }}>Our team is here to support you</p>
                                {supportInfo.phone && <p style={{ color: 'white', marginBottom: '1.5rem', opacity: 0.9 }}>Call: {supportInfo.phone}</p>}
                                <button className={styles.contactBtn} onClick={() => window.location.href = `mailto:${supportInfo.email}`}>
                                    Contact via Email
                                </button>
                            </div>
                        )}
                    </motion.div>
                ) : (
                    <motion.div key="detail" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className={styles.detailView}>
                        <div className={styles.detailTopBar}>
                            <button className={styles.backBtn} onClick={() => setSelectedDoc(null)}>
                                <ArrowLeft size={18} /> Back to Guides
                            </button>
                            {isAdmin && (
                                <div className={styles.articleAdminActions}>
                                    <button className={styles.editArticleBtn} onClick={() => { openEdit(selectedDoc); setSelectedDoc(null); }}>
                                        <Pencil size={15} /> Edit
                                    </button>
                                    <button className={`${styles.editArticleBtn} ${styles.deleteArticleBtn}`} onClick={() => { setDeleteTarget(selectedDoc); setSelectedDoc(null); }}>
                                        <Trash2 size={15} /> Delete
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className={styles.article}>
                            <div className={styles.articleHeader}>
                                <h1 className={styles.articleTitle}>{selectedDoc.title}</h1>
                                {!selectedDoc.published && <span className={styles.draftBanner}>📋 Draft — Not visible to users</span>}
                            </div>

                            {/* Video Player */}
                            {selectedDoc.videoUrl && (
                                <div className={styles.videoWrapper}>
                                    <div className={styles.videoHeader}>
                                        <Play size={16} /> {selectedDoc.videoTitle || 'Video Tutorial'}
                                        {isAdmin && (
                                            <button className={styles.removeVideoBtn} onClick={() => { handleRemoveVideo(selectedDoc._id); setSelectedDoc(null); }}>
                                                <X size={14} /> Remove Video
                                            </button>
                                        )}
                                    </div>
                                    <video controls className={styles.videoPlayer} src={`${selectedDoc.videoUrl}`}>
                                        Your browser does not support the video tag.
                                    </video>
                                </div>
                            )}

                            {isAdmin && !selectedDoc.videoUrl && (
                                <div className={styles.uploadVideoBox}>
                                    <Video size={32} />
                                    <p>No video attached. Upload a tutorial video:</p>
                                    <label className={styles.uploadVideoBtn}>
                                        <Upload size={16} /> Upload Video
                                        <input type="file" accept="video/*" style={{ display: 'none' }}
                                            onChange={e => { handleVideoUpload(selectedDoc._id, e.target.files[0]); setSelectedDoc(null); }} />
                                    </label>
                                    {uploadingVideo === selectedDoc._id && (
                                        <div className={styles.progressBar}><div className={styles.progressFill} style={{ width: `${videoUploadProgress}%` }} /></div>
                                    )}
                                </div>
                            )}

                            <div className={styles.articleContent} dangerouslySetInnerHTML={{ __html: selectedDoc.content || '<p>No content yet.</p>' }} />

                            {selectedDoc.steps?.length > 0 && (
                                <div className={styles.stepSection}>
                                    <h3>How-to Steps:</h3>
                                    <div className={styles.stepsList}>
                                        {selectedDoc.steps.map((step, idx) => (
                                            <div key={idx} className={styles.stepCard}>
                                                <span className={styles.stepNumber}>{idx + 1}</span>
                                                <p>{step}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className={styles.articleFooter}>
                                <p>Was this helpful?</p>
                                <div className={styles.voteBtns}>
                                    <button className={styles.voteBtn} onClick={() => addToast('Thanks for your feedback! 👍')}>Yes 👍</button>
                                    <button className={styles.voteBtn} onClick={() => addToast('We\'ll improve this article. Thanks!')}>No 👎</button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
