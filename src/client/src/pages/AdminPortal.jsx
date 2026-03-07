import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext, useNavigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard, Users, Activity, FileText, HelpCircle,
    Search, Lock, Unlock, Trash2, ChevronRight, ChevronLeft, ArrowLeft,
    BarChart3, Plus, Pencil, Save, X, Eye, EyeOff,
    RefreshCw, CheckCircle, AlertCircle, Loader2,
    Crown, TrendingUp, Globe, Clock, UserCheck, UserX,
    ShieldAlert, Zap, MousePointer2, BookOpen, Settings as SettingsIcon,
    Megaphone, FolderOpen, Menu, Video, Calendar, User,
    ShieldCheck, ShieldOff, Key, UserCog, Mail, AtSign
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import s from './AdminPortal.module.css';

const API = '/api';
const authH = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtTime = d => d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const ago = d => { if (!d) return '—'; const s = Math.floor((Date.now() - new Date(d)) / 1000); if (s < 60) return `${s}s ago`; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`; };
const DOT = { registration: '#22c55e', price: '#3b82f6', alert: '#ef4444', doc: '#7c3aed', admin: '#f59e0b', animal: '#06b6d4' };

// ── Micro components ─────────────────────────────
function Toast({ msg, type, onClose }) {
    useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
    return (
        <motion.div className={`${s.toast} ${type === 'err' ? s.toastErr : ''}`}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
            {type === 'err' ? <AlertCircle size={15} /> : <CheckCircle size={15} />} {msg}
        </motion.div>
    );
}

function Stat({ icon: Icon, label, value, sub, color }) {
    return (
        <div className={s.statCard}>
            <div className={s.statIcon} style={{ background: `${color}15`, color }}><Icon size={21} /></div>
            <div>
                <div className={s.statLabel}>{label}</div>
                <div className={s.statVal}>{value ?? '—'}</div>
                {sub && <div className={s.statSub}>{sub}</div>}
            </div>
        </div>
    );
}

function StatSkeleton() {
    return (
        <div className={s.skeletonCard}>
            <div className={`${s.skeletonIcon} ${s.pulse}`} />
            <div className={s.skeletonText}>
                <div className={`${s.skeletonBar} ${s.pulse}`} style={{ width: '40%' }} />
                <div className={`${s.skeletonBar} ${s.pulse}`} style={{ width: '80%', height: '14px' }} />
            </div>
        </div>
    );
}

function ActivitySkeleton() {
    return (
        <div className={s.skeletonActivity}>
            <div className={`${s.skeletonBar} ${s.pulse}`} style={{ width: '30%', height: '20px', marginBottom: '10px' }} />
            {[1, 2, 3, 4, 5].map(i => (
                <div key={i} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div className={`${s.actDot} ${s.pulse}`} style={{ background: '#f1f5f9' }} />
                    <div style={{ flex: 1 }}>
                        <div className={`${s.skeletonBar} ${s.pulse}`} style={{ width: '20%' }} />
                        <div className={`${s.skeletonBar} ${s.pulse}`} style={{ width: '60%' }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

function TableSkeleton({ cols = 7, rows = 10 }) {
    return (
        <div className={s.tableWrap} style={{ overflow: 'hidden' }}>
            <table className={s.table}>
                <thead>
                    <tr>{[...Array(cols)].map((_, i) => <th key={i}><div className={`${s.skeletonBar} ${s.pulse}`} style={{ width: '60%', margin: '0' }} /></th>)}</tr>
                </thead>
                <tbody>
                    {[...Array(rows)].map((_, i) => (
                        <tr key={i}>
                            {[...Array(cols)].map((_, j) => (
                                <td key={j}><div className={`${s.skeletonBar} ${s.pulse}`} style={{ width: j === 0 ? '80%' : '50%', margin: '0' }} /></td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ── Main ─────────────────────────────────────────
export default function AdminPortal() {
    const navigate = useNavigate();
    const location = useLocation();
    const queryParams = new URLSearchParams(location.search);
    const initialTab = queryParams.get('tab') || 'overview';

    const [tab, setTab] = useState(initialTab);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [toasts, setToasts] = useState([]);
    const push = useCallback((msg, type = 'ok') => { const id = Date.now(); setToasts(p => [...p, { id, msg, type }]); }, []);
    const pop = id => setToasts(p => p.filter(t => t.id !== id));

    // Overview
    const [stats, setStats] = useState(null);
    const [overviewLoading, setOverviewLoading] = useState(true);
    const [recentActivity, setRecentActivity] = useState([]);

    // Users
    const [users, setUsers] = useState([]);
    const [usersTotal, setUsersTotal] = useState(0);
    const [userPages, setUserPages] = useState(1);
    const [userPage, setUserPage] = useState(1);
    const [userSearch, setUserSearch] = useState('');
    const [userBlocked, setUserBlocked] = useState('');
    const [userPlan, setUserPlan] = useState('');
    const [userRole, setUserRole] = useState('user');
    const [usersLoading, setUsersLoading] = useState(false);
    const [focusedUser, setFocusedUser] = useState(null);
    const [focusLoading, setFocusLoading] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [userAnimalPage, setUserAnimalPage] = useState(1);
    const [userLogPage, setUserLogPage] = useState(1);

    // Activity log
    const [allLogs, setAllLogs] = useState([]);
    const [logsTotal, setLogsTotal] = useState(0);
    const [logPage, setLogPage] = useState(1);
    const [logType, setLogType] = useState('');
    const [logsLoading, setLogsLoading] = useState(false);

    // FAQs
    const [faqs, setFaqs] = useState([]);
    const [faqModal, setFaqModal] = useState(null);
    const [faqSearch, setFaqSearch] = useState('');
    const [faqForm, setFaqForm] = useState({ question: '', answer: '', category: 'General', published: true });
    const [faqDeleteTarget, setFaqDeleteTarget] = useState(null);

    // Docs Hub
    const [articles, setArticles] = useState([]);
    const [articlesLoading, setArticlesLoading] = useState(false);
    const [subTab, setSubTab] = useState('');
    const [docModal, setDocModal] = useState(null);

    // Admin Access Management
    const [adminUsers, setAdminUsers] = useState([]);
    const [adminAccessLoading, setAdminAccessLoading] = useState(false);
    const [adminSearch, setAdminSearch] = useState('');
    const [grantEmail, setGrantEmail] = useState('');
    const [grantLoading, setGrantLoading] = useState(false);
    const [revokeTarget, setRevokeTarget] = useState(null);
    const [adminAuditLog, setAdminAuditLog] = useState([]);
    const [expandedAdmin, setExpandedAdmin] = useState(null);
    const [adminLogs, setAdminLogs] = useState({});  // { [userId]: [...logs] }
    const [docForm, setDocForm] = useState({ title: '', category: 'getting-started', content: '', steps: '', published: true, videoFile: null });
    const [docDeleteTarget, setDocDeleteTarget] = useState(null);

    // ── Fetch helpers ────────────────────────────
    const fetchOverview = useCallback(async () => {
        setOverviewLoading(true);
        try {
            const [sr, ar] = await Promise.all([
                axios.get(`${API}/admin/stats`, authH()),
                axios.get(`${API}/admin/activity?limit=6`, authH())
            ]);
            setStats(sr.data);
            setRecentActivity(ar.data.logs || []);
        } catch (err) {
            console.error('Overview Fetch Error:', err);
            push('Failed to load overview data.', 'err');
        } finally {
            setOverviewLoading(false);
        }
    }, [push]);

    const fetchUsers = useCallback(async () => {
        setUsersLoading(true);
        try {
            const p = new URLSearchParams({ search: userSearch, page: userPage, limit: 15 });
            if (userBlocked !== '') p.set('blocked', userBlocked);
            if (userPlan) p.set('plan', userPlan);
            if (userRole) p.set('role', userRole);
            const r = await axios.get(`${API}/admin/users?${p}`, authH());
            setUsers(r.data.users);
            setUsersTotal(r.data.total);
            setUserPages(r.data.pages);
        } catch { } finally { setUsersLoading(false); }
    }, [userSearch, userPage, userBlocked, userPlan, userRole]);

    const fetchFocusedUser = async id => {
        setFocusLoading(true);
        try {
            const r = await axios.get(`${API}/admin/users/${id}`, authH());
            setFocusedUser(r.data);
            setUserAnimalPage(1);
            setUserLogPage(1);
        }
        catch { } finally { setFocusLoading(false); }
    };

    const fetchLogs = useCallback(async () => {
        setLogsLoading(true);
        try {
            const p = new URLSearchParams({ page: logPage, limit: 25 });
            if (logType) p.set('type', logType);
            const r = await axios.get(`${API}/admin/activity?${p}`, authH());
            setAllLogs(r.data.logs || []);
            setLogsTotal(r.data.total || 0);
        } catch { } finally { setLogsLoading(false); }
    }, [logPage, logType]);

    const fetchFaqs = useCallback(async () => {
        try { const r = await axios.get(`${API}/admin/faqs`, authH()); setFaqs(r.data); } catch { }
    }, []);

    const fetchArticles = useCallback(async () => {
        setArticlesLoading(true);
        try {
            const r = await axios.get(`${API}/docs/admin/all`, authH());
            setArticles(r.data || []);
        } catch { push('Docs fetch failing', 'err'); }
        finally { setArticlesLoading(false); }
    }, [push]);

    const fetchAdminAccess = useCallback(async () => {
        setAdminAccessLoading(true);
        try {
            // fetch ALL users (role=all), then filter admins client-side for accuracy
            const r = await axios.get(`${API}/admin/users?role=all&limit=200`, authH());
            const admins = (r.data.users || []).filter(u => u.role === 'admin');
            setAdminUsers(admins);
            const logR = await axios.get(`${API}/admin/activity?type=admin&limit=30`, authH());
            setAdminAuditLog(logR.data.logs || []);
        } catch { push('Failed to load admin roster', 'err'); }
        finally { setAdminAccessLoading(false); }
    }, [push]);

    const fetchAdminLog = async (userId) => {
        if (adminLogs[userId]) {
            // toggle collapse
            setExpandedAdmin(prev => prev === userId ? null : userId);
            return;
        }
        try {
            const r = await axios.get(`${API}/admin/users/${userId}/activity`, authH());
            setAdminLogs(prev => ({ ...prev, [userId]: r.data }));
            setExpandedAdmin(userId);
        } catch { push('Could not fetch admin logs', 'err'); }
    };

    const grantAdminAccess = async () => {
        if (!grantEmail.trim()) return push('Enter an email address', 'err');
        setGrantLoading(true);
        try {
            // search in ALL users (including admins) to detect existing admins
            const searchR = await axios.get(`${API}/admin/users?role=all&search=${encodeURIComponent(grantEmail)}&limit=1`, authH());
            const found = searchR.data.users?.[0];
            if (!found) { push('No user found with that email', 'err'); return; }
            if (found.role === 'admin') { push('User is already an admin', 'err'); return; }
            await axios.put(`${API}/admin/users/${found._id}/role`, { role: 'admin' }, authH());
            push(`✓ Admin access granted to ${found.full_name || found.email}`);
            setGrantEmail('');
            fetchAdminAccess();
        } catch (e) { push(e.response?.data?.message || 'Grant failed', 'err'); }
        finally { setGrantLoading(false); }
    };

    const revokeAdminAccess = async (u) => {
        try {
            await axios.put(`${API}/admin/users/${u._id}/role`, { role: 'user' }, authH());
            push(`Admin access revoked for ${u.full_name || u.email}`);
            setRevokeTarget(null);
            setExpandedAdmin(null);
            fetchAdminAccess();
        } catch (e) { push(e.response?.data?.message || 'Revoke failed', 'err'); }
    };

    // Real-time poll every 30s when on adminaccess tab
    useEffect(() => {
        if (tab !== 'adminaccess') return;
        const interval = setInterval(fetchAdminAccess, 30000);
        return () => clearInterval(interval);
    }, [tab, fetchAdminAccess]);

    useEffect(() => {
        const t = queryParams.get('tab');
        const sTab = queryParams.get('sub');
        if (t && ['overview', 'users', 'logs', 'content', 'docs', 'pricing', 'settings', 'adminaccess'].includes(t)) {
            setTab(t);
            setSubTab(sTab || '');
        }
    }, [location.search]);

    useEffect(() => { if (tab === 'overview') fetchOverview(); }, [tab, fetchOverview]);
    useEffect(() => { if (tab === 'users' && !focusedUser) fetchUsers(); }, [tab, fetchUsers, focusedUser]);
    useEffect(() => { if (tab === 'logs') fetchLogs(); }, [tab, fetchLogs]);
    useEffect(() => { if (tab === 'content') fetchFaqs(); }, [tab, fetchFaqs]);
    useEffect(() => { if (tab === 'docs') fetchArticles(); }, [tab, fetchArticles]);
    useEffect(() => { if (tab === 'adminaccess') fetchAdminAccess(); }, [tab, fetchAdminAccess]);

    const blockToggle = async u => {
        try {
            await axios.put(`${API}/admin/users/${u._id}/block`, { blocked: !u.blocked }, authH());
            push(`User ${u.blocked ? 'unblocked' : 'blocked'}`);
            fetchUsers();
            if (focusedUser?.user?._id === u._id) fetchFocusedUser(u._id);
        } catch (e) { push(e.response?.data?.message || 'Action Failed', 'err'); }
    };

    const deleteUser = async u => {
        try {
            await axios.delete(`${API}/admin/users/${u._id}`, authH());
            push(`${u.full_name || u.email} deleted`);
            setDeleteTarget(null);
            setFocusedUser(null);
            fetchUsers();
            fetchOverview();
        } catch (e) { push(e.response?.data?.message || 'Delete failed', 'err'); }
    };

    const roleToggle = async u => {
        const newRole = u.role === 'admin' ? 'user' : 'admin';
        try {
            await axios.put(`${API}/admin/users/${u._id}/role`, { role: newRole }, authH());
            push(`Role → ${newRole}`);
            fetchUsers();
        } catch { push('Failed', 'err'); }
    };

    // ── FAQ actions ──────────────────────────────
    const openFaqEdit = faq => { setFaqForm({ question: faq.question, answer: faq.answer, category: faq.category || 'General', published: faq.published !== false }); setFaqModal(faq); };
    const openFaqCreate = () => { setFaqForm({ question: '', answer: '', category: 'General', published: true }); setFaqModal('create'); };

    const saveFaq = async () => {
        if (!faqForm.question.trim() || !faqForm.answer.trim()) return push('Question and answer required', 'err');
        try {
            if (faqModal === 'create') await axios.post(`${API}/admin/faqs`, faqForm, authH());
            else await axios.put(`${API}/admin/faqs/${faqModal._id}`, faqForm, authH());
            push(faqModal === 'create' ? 'FAQ created!' : 'FAQ updated!');
            setFaqModal(null);
            fetchFaqs();
        } catch { push('Save failed', 'err'); }
    };

    const deleteFaq = async faq => {
        try { await axios.delete(`${API}/admin/faqs/${faq._id}`, authH()); push('FAQ deleted'); setFaqDeleteTarget(null); fetchFaqs(); }
        catch { push('Failed', 'err'); }
    };

    // ── Doc actions ──────────────────────────────
    const openDocEdit = doc => { setDocForm({ title: doc.title, category: doc.category, content: doc.content || '', steps: doc.steps ? doc.steps.join('\n') : '', published: doc.published !== false, videoFile: null }); setDocModal(doc); };
    const openDocCreate = () => { setDocForm({ title: '', category: subTab || 'getting-started', content: '', steps: '', published: true, videoFile: null }); setDocModal('create'); };

    const saveDoc = async () => {
        if (!docForm.title.trim()) return push('Title is required', 'err');

        const payload = { ...docForm, steps: docForm.steps.split('\n').filter(s => s.trim()) };
        delete payload.videoFile;

        try {
            let savedId;
            if (docModal === 'create') {
                const res = await axios.post(`${API}/docs`, payload, authH());
                savedId = (res.data.doc || res.data)._id;
            } else {
                await axios.put(`${API}/docs/${docModal._id}`, payload, authH());
                savedId = docModal._id;
            }

            if (docForm.videoFile && savedId) {
                const fd = new FormData();
                fd.append('video', docForm.videoFile);
                await axios.post(`${API}/docs/${savedId}/upload-video`, fd, {
                    headers: { ...authH().headers, 'Content-Type': 'multipart/form-data' }
                });
            }

            push(docModal === 'create' ? 'Article created!' : 'Article updated!');
            setDocModal(null);
            fetchArticles();
        } catch (err) { console.error('Save doc err:', err); push('Save failed', 'err'); }
    };

    const deleteDoc = async doc => {
        try { await axios.delete(`${API}/docs/${doc._id}`, authH()); push('Article deleted'); setDocDeleteTarget(null); fetchArticles(); }
        catch { push('Failed', 'err'); }
    };

    const TABS = [
        { id: 'overview', label: 'Business Stats', icon: LayoutDashboard },
        { id: 'users', label: 'User Management', icon: Users },
        { id: 'logs', label: 'Activity Logs', icon: Activity },
        { id: 'content', label: 'Help Center FAQs', icon: HelpCircle },
        { id: 'docs', label: 'Knowledge Base', icon: BookOpen },
        { id: 'pricing', label: 'Pricing Plans', icon: Crown },
        { id: 'settings', label: 'System Configuration', icon: SettingsIcon },
        { id: 'adminaccess', label: 'Admin Access', icon: ShieldCheck },
    ];

    const handleTabClick = (t) => {
        navigate(`?tab=${t.id}`, { replace: true });
        setTab(t.id);
    };

    // Banner info based on tab
    const bannerInfo = {
        overview: { title: 'BUSINESS', subtitle: 'OVERVIEW', desc: 'Real-time business metrics and platform performance', icon: LayoutDashboard },
        users: { title: 'USER', subtitle: 'DIRECTORY', desc: 'Manage, search, and moderate all platform users', icon: Users },
        logs: { title: 'ACTIVITY', subtitle: 'LOGS', desc: 'Monitor all platform events and user actions', icon: Activity },
        content: { title: 'CONTENT', subtitle: 'MANAGER', desc: 'Manage Help Center FAQs and Documentation', icon: HelpCircle },
        docs: { title: 'KNOWLEDGE', subtitle: 'BASE', desc: 'Create and organize platform guides and help articles', icon: BookOpen },
        pricing: { title: 'PRICING', subtitle: 'PLANS', desc: 'Manage subscription tiers and payment settings', icon: Crown },
        settings: { title: 'SYSTEM', subtitle: 'CONFIG', desc: 'Configure platform-wide security and infrastructure', icon: SettingsIcon },
        adminaccess: { title: 'ADMIN', subtitle: 'ACCESS', desc: 'Grant & revoke administrator privileges — handle with care', icon: ShieldCheck },
    };
    const currentBanner = bannerInfo[tab] || bannerInfo.overview;
    const BannerIcon = currentBanner.icon;

    return (
        <div className={s.root}>
            {/* Toasts */}
            <div className={s.toastWrap}>
                <AnimatePresence>{toasts.map(t => <Toast key={t.id} msg={t.msg} type={t.type} onClose={() => pop(t.id)} />)}</AnimatePresence>
            </div>

            {/* Delete user confirmation */}
            <AnimatePresence>
                {deleteTarget && (
                    <motion.div className={s.overlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <motion.div className={s.confirmBox} initial={{ scale: 0.92 }} animate={{ scale: 1 }} exit={{ scale: 0.92 }}>
                            <div className={s.confirmIcon}><Trash2 size={24} color="#ef4444" /></div>
                            <h3>Delete User?</h3>
                            <p>This will permanently delete <strong>{deleteTarget.full_name || deleteTarget.email}</strong> and all their data (animals, logs). Cannot be undone.</p>
                            <div className={s.confirmBtns}>
                                <button className={s.cancelSm} onClick={() => setDeleteTarget(null)}>Cancel</button>
                                <button className={s.dangerSm} onClick={() => deleteUser(deleteTarget)}>Delete</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* FAQ delete confirmation */}
            <AnimatePresence>
                {faqDeleteTarget && (
                    <motion.div className={s.overlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <motion.div className={s.confirmBox} initial={{ scale: 0.92 }} animate={{ scale: 1 }} exit={{ scale: 0.92 }}>
                            <div className={s.confirmIcon}><Trash2 size={24} color="#ef4444" /></div>
                            <h3>Delete FAQ?</h3>
                            <p>"{faqDeleteTarget.question}"</p>
                            <div className={s.confirmBtns}>
                                <button className={s.cancelSm} onClick={() => setFaqDeleteTarget(null)}>Cancel</button>
                                <button className={s.dangerSm} onClick={() => deleteFaq(faqDeleteTarget)}>Delete</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* FAQ Editor Modal */}
            <AnimatePresence>
                {faqModal && (
                    <motion.div className={s.overlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <motion.div className={s.editorBox} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}>
                            <div className={s.editorHead}>
                                <h2>{faqModal === 'create' ? '+ New FAQ' : 'Edit FAQ'}</h2>
                                <button className={s.closeBtn} onClick={() => setFaqModal(null)}><X size={17} /></button>
                            </div>
                            <div className={s.editorBody}>
                                <label>Question *</label>
                                <input className={s.field} value={faqForm.question} onChange={e => setFaqForm(p => ({ ...p, question: e.target.value }))} placeholder="e.g. How do I add an animal?" />
                                <label>Answer *</label>
                                <textarea className={`${s.field} ${s.fieldArea}`} value={faqForm.answer} onChange={e => setFaqForm(p => ({ ...p, answer: e.target.value }))} placeholder="Detailed answer..." />
                                <div className={s.editorRow}>
                                    <div style={{ flex: 1 }}>
                                        <label>Category</label>
                                        <select className={s.field} value={faqForm.category} onChange={e => setFaqForm(p => ({ ...p, category: e.target.value }))}>
                                            {['General', 'Getting Started', 'Health Monitoring', 'AI Features', 'Billing', 'Data & Reports'].map(c => <option key={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label>Visibility</label>
                                        <button className={`${s.toggleVis} ${faqForm.published ? s.visOn : ''}`} onClick={() => setFaqForm(p => ({ ...p, published: !p.published }))}>
                                            {faqForm.published ? <><Eye size={13} /> Published</> : <><EyeOff size={13} /> Hidden</>}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className={s.editorFoot}>
                                <button className={s.cancelSm} onClick={() => setFaqModal(null)}>Cancel</button>
                                <button className={s.saveBtn} onClick={saveFaq}><Save size={14} /> Save</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Doc delete confirmation */}
            <AnimatePresence>
                {docDeleteTarget && (
                    <motion.div className={s.overlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <motion.div className={s.confirmBox} initial={{ scale: 0.92 }} animate={{ scale: 1 }} exit={{ scale: 0.92 }}>
                            <div className={s.confirmIcon}><Trash2 size={24} color="#ef4444" /></div>
                            <h3>Delete Article?</h3>
                            <p>"{docDeleteTarget.title}"</p>
                            <div className={s.confirmBtns}>
                                <button className={s.cancelSm} onClick={() => setDocDeleteTarget(null)}>Cancel</button>
                                <button className={s.dangerSm} onClick={() => deleteDoc(docDeleteTarget)}>Delete</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Doc Editor Modal */}
            <AnimatePresence>
                {docModal && (
                    <motion.div className={s.overlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <motion.div className={s.editorBox} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}>
                            <div className={s.editorHead}>
                                <h2>{docModal === 'create' ? '+ New Article' : 'Edit Article'}</h2>
                                <button className={s.closeBtn} onClick={() => setDocModal(null)}><X size={17} /></button>
                            </div>
                            <div className={s.editorBody}>
                                <label>Title *</label>
                                <input className={s.field} value={docForm.title} onChange={e => setDocForm(p => ({ ...p, title: e.target.value }))} placeholder="Article title..." />

                                <label>Category</label>
                                <select className={s.field} value={docForm.category} onChange={e => setDocForm(p => ({ ...p, category: e.target.value }))}>
                                    <option value="getting-started">Getting Started</option>
                                    <option value="video-tutorials">Video Tutorials</option>
                                    <option value="features">Features</option>
                                </select>

                                {docForm.category === 'video-tutorials' && (
                                    <>
                                        <label>Tutorial Video Upload</label>
                                        {docModal && docModal.videoUrl && (
                                            <div style={{ marginBottom: '1rem' }}>
                                                <video src={docModal.videoUrl} controls style={{ width: '100%', borderRadius: '12px', background: '#000', maxHeight: '300px' }} />
                                            </div>
                                        )}
                                        <input type="file" accept="video/*" className={s.field} onChange={e => setDocForm(p => ({ ...p, videoFile: e.target.files[0] }))} />
                                    </>
                                )}

                                <label>Content (HTML supported)</label>
                                <textarea className={`${s.field} ${s.fieldArea}`} value={docForm.content} onChange={e => setDocForm(p => ({ ...p, content: e.target.value }))} placeholder="Detailed content..." style={{ minHeight: '120px' }} />

                                <label>Steps (one per line)</label>
                                <textarea className={`${s.field} ${s.fieldArea}`} value={docForm.steps} onChange={e => setDocForm(p => ({ ...p, steps: e.target.value }))} placeholder="One step per line..." style={{ minHeight: '100px' }} />

                                <div className={s.visibilityRow} style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '1rem' }}>
                                    <label style={{ margin: 0 }}>Published</label>
                                    <button className={`${s.toggleVis} ${docForm.published ? s.visOn : ''}`} onClick={() => setDocForm(p => ({ ...p, published: !p.published }))} style={{ width: 'auto', padding: '0.4rem 1.2rem' }}>
                                        {docForm.published ? <><Eye size={13} /> Visible</> : <><EyeOff size={13} /> Hidden</>}
                                    </button>
                                </div>
                            </div>
                            <div className={s.editorFoot} style={{ justifyContent: 'center' }}>
                                <button className={s.cancelSm} onClick={() => setDocModal(null)}>Cancel</button>
                                <button className={s.saveBtn} onClick={saveDoc} style={{ background: '#2d5f3f', color: '#fff' }}><Save size={14} /> Save Article</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ══ LAYOUT: Left Sidebar + Center ══ */}
            <div className={s.layout}>
                {/* ── Left Sidebar (ONLY navigation) ── */}
                <motion.aside
                    className={`${s.sidebar} ${!isSidebarOpen ? s.sidebarCollapsed : ''}`}
                    initial={false}
                    animate={{ width: isSidebarOpen ? 260 : 68 }}
                    transition={{ type: 'spring', damping: 22, stiffness: 220, mass: 0.8 }}
                >
                    <div className={s.sideHead}>
                        <div className={s.brandWrap}>
                            <motion.div
                                animate={{ rotate: isSidebarOpen ? 0 : 360 }}
                                transition={{ duration: 0.5, ease: "anticipate" }}
                            >
                                <Crown size={18} color="#2d5f3f" />
                            </motion.div>
                            <AnimatePresence>
                                {isSidebarOpen && (
                                    <motion.span
                                        initial={{ opacity: 0, x: -20, filter: 'blur(5px)' }}
                                        animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                                        exit={{ opacity: 0, x: -20, filter: 'blur(5px)' }}
                                        transition={{ duration: 0.25, ease: "easeOut" }}
                                        style={{ whiteSpace: 'nowrap' }}
                                    >
                                        Admin Control
                                    </motion.span>
                                )}
                            </AnimatePresence>
                        </div>
                        <button className={s.toggleBtn} onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
                            <motion.div animate={{ rotate: isSidebarOpen ? 0 : 180 }} transition={{ duration: 0.3 }}>
                                <Menu size={18} />
                            </motion.div>
                        </button>
                    </div>
                    <nav className={s.sideNav}>
                        {TABS.map(t => {
                            const isActive = tab === t.id;
                            return (
                                <button
                                    key={t.id}
                                    className={`${s.navItem} ${isActive ? s.navActive : ''} ${t.id === 'adminaccess' ? s.navItemAdminAccess : ''}`}
                                    onClick={() => handleTabClick(t)}
                                    title={!isSidebarOpen ? t.label : ''}
                                >
                                    {isActive && (
                                        <motion.div
                                            className={s.navPill}
                                            layoutId="admin-sidebar-pill"
                                            transition={{ type: 'spring', damping: 22, stiffness: 280 }}
                                        />
                                    )}
                                    <t.icon size={17} style={{ position: 'relative', zIndex: 1 }} />
                                    <AnimatePresence mode="wait">
                                        {isSidebarOpen && (
                                            <motion.span
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: -10 }}
                                                transition={{ duration: 0.15 }}
                                                style={{ position: 'relative', zIndex: 1 }}
                                            >
                                                {t.label}
                                            </motion.span>
                                        )}
                                    </AnimatePresence>
                                </button>
                            );
                        })}
                    </nav>
                </motion.aside>

                {/* ── Center Main Content ── */}
                <main className={s.main}>
                    {/* Top Banner */}
                    <div className={s.topBanner}>
                        <div className={s.bannerIcon}>
                            <BannerIcon size={28} />
                        </div>
                        <div className={s.bannerText}>
                            <h1>{currentBanner.title} <span style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 400 }}>{currentBanner.subtitle}</span></h1>
                            <p>{currentBanner.desc}</p>
                        </div>
                    </div>

                    {/* Content Body */}
                    <div className={s.contentBody}>
                        <AnimatePresence mode="wait">

                            {/* ── OVERVIEW ── */}
                            {tab === 'overview' && (
                                <motion.div key="ov" className={s.section}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.3 }}>
                                    <div className={s.sectionHead}>
                                        <div />
                                        <button className={s.refreshBtn} onClick={fetchOverview}><RefreshCw size={15} /> Refresh</button>
                                    </div>
                                    {overviewLoading ? (
                                        <>
                                            <div className={s.skeletonGrid}>
                                                {[...Array(8)].map((_, i) => <StatSkeleton key={i} />)}
                                            </div>
                                            <ActivitySkeleton />
                                        </>
                                    ) : !stats ? (
                                        <div className={s.emptyMsg} style={{ textAlign: 'center', padding: '3rem 0' }}>
                                            <AlertCircle size={32} color="#ef4444" style={{ marginBottom: '1rem' }} />
                                            <h3>Failed to load platform overview.</h3>
                                            <p>Please check your server connection or refresh.</p>
                                        </div>
                                    ) : (
                                        <>
                                            <div className={s.statsGrid}>
                                                <Stat icon={Users} label="Total Users" value={stats.totalUsers} sub={`+${stats.newToday} today`} color="#3b82f6" />
                                                <Stat icon={TrendingUp} label="New This Week" value={stats.newThisWeek} sub={`${stats.newThisMonth} this month`} color="#22c55e" />
                                                <Stat icon={Globe} label="Active Today" value={stats.activeToday} sub="logged in today" color="#06b6d4" />
                                                <Stat icon={MousePointer2} label="Traffic Index" value={stats.pageViews?.toLocaleString()} sub="total views" color="#7c3aed" />
                                                <Stat icon={Zap} label="Engagement" value={`${stats.avgSessionMin}m`} sub="avg session" color="#f59e0b" />
                                                <Stat icon={UserX} label="Blocked Users" value={stats.blockedUsers} sub="access denied" color="#ef4444" />
                                                <Stat icon={Crown} label="Pro Users" value={stats.proUsers} sub="paid plan" color="#a855f7" />
                                                <Stat icon={ShieldAlert} label="Critical Alerts" value={stats.criticalAnimals} sub="animals need vet" color="#f97316" />
                                            </div>

                                            <div className={s.activityCard}>
                                                <div className={s.actCardHead}><h2>Recent Activity</h2>
                                                    <button className={s.linkBtn} onClick={() => setTab('logs')}>View all →</button>
                                                </div>
                                                {recentActivity.length === 0 && <p className={s.emptyMsg}>No activity yet. User actions will appear here.</p>}
                                                {recentActivity.map(log => (
                                                    <div key={log._id} className={s.actRow}>
                                                        <span className={s.actDot} style={{ background: DOT[log.type] || '#94a3b8' }} />
                                                        <div className={s.actInfo}><strong>{log.user}</strong><span>{log.detail}</span></div>
                                                        <span className={s.actTime}>{ago(log.createdAt)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </motion.div>
                            )}

                            {/* ── USERS ── */}
                            {tab === 'users' && (
                                <motion.div key="us" className={s.section}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.3 }}>
                                    {focusedUser ? (
                                        <div>
                                            <button className={s.backBtn} onClick={() => setFocusedUser(null)}><ChevronLeft size={15} /> Back to Users</button>
                                            {focusLoading ? (
                                                <div className={s.userDetailGrid}>
                                                    <div className={s.skeletonCard} style={{ height: '350px', flexDirection: 'column', textAlign: 'center' }}>
                                                        <div className={`${s.skeletonIcon} ${s.pulse}`} style={{ width: '100px', height: '100px', borderRadius: '50%', margin: '0 auto 1rem' }} />
                                                        <div className={`${s.skeletonBar} ${s.pulse}`} style={{ width: '60%', height: '20px', margin: '0 auto 0.5rem' }} />
                                                        <div className={`${s.skeletonBar} ${s.pulse}`} style={{ width: '40%', height: '14px', margin: '0 auto 1.5rem' }} />
                                                        <div style={{ display: 'flex', gap: '0.5rem', width: '100%', justifyContent: 'center', marginBottom: '1.5rem' }}>
                                                            <div className={`${s.skeletonBar} ${s.pulse}`} style={{ width: '70px', height: '22px', borderRadius: '20px' }} />
                                                            <div className={`${s.skeletonBar} ${s.pulse}`} style={{ width: '70px', height: '22px', borderRadius: '20px' }} />
                                                        </div>
                                                        <div className={s.skeletonText}>
                                                            {[1, 2, 3, 4].map(i => <div key={i} className={`${s.skeletonBar} ${s.pulse}`} style={{ width: '100%', marginBottom: '10px' }} />)}
                                                        </div>
                                                    </div>
                                                    <div className={s.userDetailRight}>
                                                        <div className={s.skeletonActivity} style={{ margin: 0 }} />
                                                        <div className={s.skeletonActivity} style={{ margin: '1rem 0 0' }} />
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className={s.userDetailGrid} style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 0.35fr) 1fr', gap: '1rem', alignItems: 'stretch', maxHeight: '800px' }}>
                                                    <div className={s.userCard} style={{ background: '#fff', borderRadius: '24px', border: '1px solid #e2e8f0', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.03)', height: '100%', minHeight: '650px' }}>
                                                        <div className={s.bigAvatar} style={{ background: '#2d5f3f', color: '#fff', borderRadius: '16px', width: '80px', height: '80px', fontSize: '2rem' }}>{(focusedUser.user?.full_name || focusedUser.user?.email || '?')[0].toUpperCase()}</div>
                                                        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '1rem', color: '#0f172a' }}>{focusedUser.user?.full_name || '(no name)'}</h2>
                                                        <p style={{ color: '#64748b', fontSize: '0.95rem', marginBottom: '1rem' }}>{focusedUser.user?.email || focusedUser.user?.mobile}</p>
                                                        <div className={s.badges} style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'center', minHeight: '28px' }}>
                                                            <AnimatePresence mode="popLayout">
                                                                <motion.span
                                                                    key={focusedUser.user.role}
                                                                    layout
                                                                    initial={{ opacity: 0, scale: 0.9 }}
                                                                    animate={{ opacity: 1, scale: 1 }}
                                                                    exit={{ opacity: 0, scale: 0.9 }}
                                                                    className={`${s.badge} ${s[`b_${focusedUser.user.role}`]}`}
                                                                    style={{ background: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>
                                                                    {focusedUser.user.role}
                                                                </motion.span>
                                                                <motion.span
                                                                    key={focusedUser.user.plan || 'free'}
                                                                    layout
                                                                    initial={{ opacity: 0, scale: 0.9 }}
                                                                    animate={{ opacity: 1, scale: 1 }}
                                                                    exit={{ opacity: 0, scale: 0.9 }}
                                                                    className={`${s.badge} ${s[`b_${focusedUser.user.plan || 'free'}`]}`}
                                                                    style={{ background: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>
                                                                    {focusedUser.user.plan || 'free'}
                                                                </motion.span>
                                                                {focusedUser.user.blocked && (
                                                                    <motion.span
                                                                        initial={{ opacity: 0, x: 10 }}
                                                                        animate={{ opacity: 1, x: 0 }}
                                                                        exit={{ opacity: 0, x: 10 }}
                                                                        className={`${s.badge} ${s.b_blocked}`}
                                                                        style={{ background: '#fee2e2', color: '#ef4444', padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>
                                                                        Blocked
                                                                    </motion.span>
                                                                )}
                                                            </AnimatePresence>
                                                        </div>
                                                        <div className={s.userMeta} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', width: '100%', padding: '1.5rem 0', borderTop: '1px solid #f1f5f9', textAlign: 'left' }}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                                <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.05em' }}>Member Since</span>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#0f172a', fontSize: '0.85rem', fontWeight: 600 }}><Clock size={14} color="#64748b" /> {fmtDate(focusedUser.user.createdAt)}</div>
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                                <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.05em' }}>Status</span>
                                                                <div style={{ minHeight: '20px' }}>
                                                                    <AnimatePresence mode="wait">
                                                                        <motion.div
                                                                            key={focusedUser.user.isVerified ? 'v' : 'uv'}
                                                                            initial={{ opacity: 0, y: 5 }}
                                                                            animate={{ opacity: 1, y: 0 }}
                                                                            exit={{ opacity: 0, y: -5 }}
                                                                            transition={{ duration: 0.2 }}
                                                                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: focusedUser.user.isVerified ? '#166534' : '#64748b', fontSize: '0.85rem', fontWeight: 600 }}
                                                                        >
                                                                            {focusedUser.user?.isVerified ? <CheckCircle size={14} /> : <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #94a3b8' }} />}
                                                                            {focusedUser.user?.isVerified ? 'Verified' : 'Unverified'}
                                                                        </motion.div>
                                                                    </AnimatePresence>
                                                                </div>
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', gridColumn: 'span 2' }}>
                                                                <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.05em' }}>Last Presence</span>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0f172a', fontSize: '0.85rem' }}>
                                                                    <Globe size={14} color="#64748b" />
                                                                    {focusedUser.user.lastLoginAt ? (
                                                                        <span style={{ display: 'flex', alignItems: 'baseline', gap: '0.3rem' }}>
                                                                            <strong style={{ fontWeight: 700 }}>{ago(focusedUser.user.lastLoginAt)}</strong>
                                                                            <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>({fmtTime(focusedUser.user.lastLoginAt)})</span>
                                                                        </span>
                                                                    ) : <span style={{ color: '#94a3b8' }}>Never seen</span>}
                                                                </div>
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                                <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.05em' }}>Gender</span>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#0f172a', fontSize: '0.85rem', fontWeight: 600 }}>
                                                                    <User size={14} color="#64748b" /> {focusedUser.user.gender ? focusedUser.user.gender.charAt(0).toUpperCase() + focusedUser.user.gender.slice(1).replace('_', ' ') : 'N/A'}
                                                                </div>
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                                <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.05em' }}>Age</span>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#0f172a', fontSize: '0.85rem', fontWeight: 600 }}>
                                                                    <Calendar size={14} color="#64748b" /> {focusedUser.user.age || 'N/A'} {focusedUser.user.age ? 'yrs' : ''}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className={s.userDetailRight} style={{ background: '#fff', borderRadius: '24px', border: '1px solid #e2e8f0', padding: '2.5rem', boxShadow: '0 10px 30px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', height: '100%', minHeight: '650px', overflow: 'hidden' }}>
                                                        {/* Animated Tab Section */}
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>
                                                            <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '12px', gap: '4px', position: 'relative' }}>
                                                                <button
                                                                    onClick={() => setSubTab('animals')}
                                                                    style={{
                                                                        padding: '0.6rem 1.4rem', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 700, border: 'none', cursor: 'pointer', zIndex: 1, position: 'relative',
                                                                        background: 'transparent',
                                                                        color: (subTab === 'animals' || !subTab) ? '#166534' : '#64748b',
                                                                        transition: 'color 0.3s ease'
                                                                    }}
                                                                >
                                                                    {(subTab === 'animals' || !subTab) && (
                                                                        <motion.div layoutId="subTabPill" style={{ position: 'absolute', inset: 0, background: '#fff', borderRadius: '8px', zIndex: -1, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }} transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }} />
                                                                    )}
                                                                    Animal Log
                                                                </button>
                                                                <button
                                                                    onClick={() => setSubTab('activity')}
                                                                    style={{
                                                                        padding: '0.6rem 1.4rem', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 700, border: 'none', cursor: 'pointer', zIndex: 1, position: 'relative',
                                                                        background: 'transparent',
                                                                        color: subTab === 'activity' ? '#166534' : '#64748b',
                                                                        transition: 'color 0.3s ease'
                                                                    }}
                                                                >
                                                                    {subTab === 'activity' && (
                                                                        <motion.div layoutId="subTabPill" style={{ position: 'absolute', inset: 0, background: '#fff', borderRadius: '8px', zIndex: -1, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }} transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }} />
                                                                    )}
                                                                    Activity Log
                                                                </button>
                                                            </div>
                                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', background: '#f8fafc', padding: '4px 10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                                {(subTab === 'animals' || !subTab) ? `${(focusedUser.animals || []).length} Records` : `${(focusedUser.logs || []).length} Actions`}
                                                            </div>
                                                        </div>

                                                        <AnimatePresence mode="wait">
                                                            {(subTab === 'animals' || !subTab) ? (
                                                                <motion.div
                                                                    key="animal-panel"
                                                                    initial={{ opacity: 0, scale: 0.98 }}
                                                                    animate={{ opacity: 1, scale: 1 }}
                                                                    exit={{ opacity: 0, scale: 0.98 }}
                                                                    style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
                                                                >
                                                                    {(focusedUser.animals || []).length === 0 ? (
                                                                        <div style={{ padding: '3rem 1rem', background: '#f8fafc', borderRadius: '16px', border: '2px dashed #e2e8f0', textAlign: 'center' }}>
                                                                            <p style={{ color: '#64748b', fontWeight: 600 }}>No animals registered in this account</p>
                                                                        </div>
                                                                    ) : (
                                                                        <div className={s.customScroll} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingRight: '0.5rem' }}>
                                                                            {(focusedUser.animals || []).map((a, idx) => (
                                                                                <motion.div
                                                                                    key={a._id}
                                                                                    initial={{ opacity: 0, y: 15 }}
                                                                                    animate={{ opacity: 1, y: 0 }}
                                                                                    transition={{ delay: idx * 0.03 }}
                                                                                    style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: '16px', padding: '1.25rem', display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) 1fr auto', alignItems: 'center', gap: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)', transition: 'all 0.3s ease' }}
                                                                                    whileHover={{ scale: 1.01, borderColor: '#10b981', boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.05)' }}
                                                                                >
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                                                        <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#166534', fontWeight: 800, fontSize: '1.2rem' }}>{a.name?.[0].toUpperCase()}</div>
                                                                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                                            <span style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>{a.name}</span>
                                                                                            <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{a.type || 'Livestock'}</span>
                                                                                        </div>
                                                                                    </div>
                                                                                    <div style={{ textAlign: 'center' }}>
                                                                                        <span style={{ display: 'block', fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Breed / Species</span>
                                                                                        <span style={{ fontSize: '0.9rem', color: '#475569', fontWeight: 700 }}>{a.breed || 'Not specified'}</span>
                                                                                    </div>
                                                                                    <div style={{ textAlign: 'right' }}>
                                                                                        <span style={{ background: a.status === 'Healthy' ? '#ecfdf5' : '#fff1f2', color: a.status === 'Healthy' ? '#059669' : '#e11d48', padding: '6px 14px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 800, border: `1px solid ${a.status === 'Healthy' ? '#d1fae5' : '#ffe4e6'}`, textTransform: 'uppercase' }}>{a.status}</span>
                                                                                    </div>
                                                                                </motion.div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </motion.div>
                                                            ) : (
                                                                <motion.div
                                                                    key="activity-panel"
                                                                    initial={{ opacity: 0, scale: 0.98 }}
                                                                    animate={{ opacity: 1, scale: 1 }}
                                                                    exit={{ opacity: 0, scale: 0.98 }}
                                                                    style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
                                                                >
                                                                    {(focusedUser.logs || []).length === 0 ? (
                                                                        <div style={{ padding: '3rem 1rem', background: '#f8fafc', borderRadius: '16px', border: '2px dashed #e2e8f0', textAlign: 'center' }}>
                                                                            <p style={{ color: '#64748b', fontWeight: 600 }}>No activities recorded yet for this profile</p>
                                                                        </div>
                                                                    ) : (
                                                                        <div className={s.customScroll} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingRight: '0.5rem' }}>
                                                                            {(focusedUser.logs || []).map((log, idx) => (
                                                                                <motion.div
                                                                                    key={log._id}
                                                                                    initial={{ opacity: 0, y: 15 }}
                                                                                    animate={{ opacity: 1, y: 0 }}
                                                                                    transition={{ delay: idx * 0.03 }}
                                                                                    style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: '16px', padding: '1.25rem', display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) 100px 120px', alignItems: 'center', gap: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)', transition: 'all 0.3s ease' }}
                                                                                    whileHover={{ scale: 1.01, borderColor: '#2d5f3f', boxShadow: '0 10px 15px -3px rgba(45, 95, 63, 0.05)' }}
                                                                                >
                                                                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                                                                                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: log.type === 'admin' ? '#f59e0b' : log.type === 'animal_registry' ? '#10b981' : '#3b82f6', marginTop: '6px', flexShrink: 0, boxShadow: `0 0 10px ${log.type === 'admin' ? 'rgba(245,158,11,0.3)' : log.type === 'animal_registry' ? 'rgba(16,185,129,0.3)' : 'rgba(59,130,246,0.3)'}` }} />
                                                                                        <span style={{ fontSize: '0.95rem', color: '#0f172a', fontWeight: 600, lineHeight: 1.5 }}>{log.detail}</span>
                                                                                    </div>
                                                                                    <div style={{ textAlign: 'center' }}>
                                                                                        <span style={{ display: 'block', fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Type</span>
                                                                                        <span style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 800, background: '#f1f5f9', padding: '3px 10px', borderRadius: '8px', display: 'inline-block' }}>{log.type || 'system'}</span>
                                                                                    </div>
                                                                                    <div style={{ textAlign: 'right' }}>
                                                                                        <span style={{ display: 'block', fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Time</span>
                                                                                        <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700 }}>{fmtDate(log.createdAt)}<br /><span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 500 }}>{fmtTime(log.createdAt)}</span></span>
                                                                                    </div>
                                                                                </motion.div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div>
                                            <div className={s.sectionHead}>
                                                <div />
                                                <button className={s.refreshBtn} onClick={fetchUsers}><RefreshCw size={15} /></button>
                                            </div>
                                            <div className={s.filterRow}>
                                                <div className={s.searchWrap}><Search size={15} />
                                                    <input placeholder="Search name, email, mobile..." value={userSearch} onChange={e => { setUserSearch(e.target.value); setUserPage(1); }} />
                                                </div>
                                                <select className={s.sel} value={userBlocked} onChange={e => { setUserBlocked(e.target.value); setUserPage(1); }}>
                                                    <option value="">All Status</option>
                                                    <option value="false">Active</option>
                                                    <option value="true">Blocked</option>
                                                </select>
                                                <select className={s.sel} value={userPlan} onChange={e => { setUserPlan(e.target.value); setUserPage(1); }}>
                                                    <option value="">All Plans</option>
                                                    <option value="free">Free</option>
                                                    <option value="pro">Pro</option>
                                                    <option value="enterprise">Enterprise</option>
                                                </select>
                                                <select className={s.sel} value={userRole} onChange={e => { setUserRole(e.target.value); setUserPage(1); }}>
                                                    <option value="all">All Roles</option>
                                                    <option value="user">Users</option>
                                                    <option value="admin">Administrators</option>
                                                </select>
                                            </div>
                                            {usersLoading ? <TableSkeleton cols={7} rows={10} /> : (
                                                <div className={s.tableWrap}>
                                                    <table className={s.table}>
                                                        <thead>
                                                            <tr><th>User</th><th>Plan</th><th>Status</th><th>Joined</th><th>Last Presence</th><th>Logins</th><th>Actions</th></tr>
                                                        </thead>
                                                        <tbody>
                                                            {users.length === 0 && <tr><td colSpan="7" className={s.emptyCell}>No users found</td></tr>}
                                                            {users.map(u => (
                                                                <tr key={u._id} className={s.tr} onClick={() => fetchFocusedUser(u._id)}>
                                                                    <td>
                                                                        <div className={s.userCell}>
                                                                            <div className={s.avatar}>
                                                                                {u.full_name ? u.full_name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() : (u.email || u.mobile || '?')[0].toUpperCase()}
                                                                            </div>
                                                                            <div>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                    <div className={s.uname}>{u.full_name || u.email || u.mobile}</div>
                                                                                    {u.role === 'admin' && <span className={`${s.pill} ${s.plan_pro}`} style={{ padding: '2px 6px', fontSize: '10px' }}>Admin</span>}
                                                                                </div>
                                                                                {(u.full_name && (u.email || u.mobile) && u.full_name !== u.email) && <div className={s.uemail}>{u.email || u.mobile}</div>}
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                    <td><span className={`${s.pill} ${s[`plan_${u.plan || 'free'}`]}`}>{u.plan || 'free'}</span></td>
                                                                    <td><span className={`${s.pill} ${u.blocked ? s.pillBlocked : s.pillActive}`}>{u.blocked ? 'Blocked' : 'Active'}</span></td>
                                                                    <td className={s.tdMuted}>{fmtDate(u.createdAt)}</td>
                                                                    <td className={s.tdMuted}>{ago(u.lastLoginAt)}</td>
                                                                    <td className={s.tdMuted}>
                                                                        <span style={{ fontWeight: 700, color: '#0f172a' }}>{u.loginCount || 0}</span>
                                                                    </td>
                                                                    <td onClick={e => e.stopPropagation()}>
                                                                        <div className={s.rowBtns}>
                                                                            <button className={`${s.rowBtn} ${u.blocked ? s.rbUnblock : s.rbBlock}`} title={u.blocked ? 'Unblock' : 'Block'} onClick={() => blockToggle(u)}>
                                                                                {u.blocked ? <Unlock size={13} /> : <Lock size={13} />}
                                                                            </button>
                                                                            <button className={`${s.rowBtn} ${s.rbDelete}`} title="Delete" onClick={() => setDeleteTarget(u)}>
                                                                                <Trash2 size={13} />
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                    <div className={s.pager}>
                                                        <button disabled={userPage <= 1} onClick={() => setUserPage(p => p - 1)}><ChevronLeft size={15} /> Prev</button>
                                                        <span>Page {userPage} / {userPages || 1}</span>
                                                        <button disabled={userPage >= userPages} onClick={() => setUserPage(p => p + 1)}>Next <ChevronRight size={15} /></button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            {/* ── ACTIVITY LOGS ── */}
                            {tab === 'logs' && (
                                <motion.div key="lg" className={s.section}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.3 }}>
                                    <div className={s.sectionHead}>
                                        <div />
                                        <button className={s.refreshBtn} onClick={fetchLogs}><RefreshCw size={15} /> Refresh</button>
                                    </div>
                                    <div className={s.filterRow}>
                                        <select className={s.sel} value={logType} onChange={e => { setLogType(e.target.value); setLogPage(1); }}>
                                            <option value="">All Types</option>
                                            <option value="registration">Registration</option>
                                            <option value="admin">Admin</option>
                                            <option value="doc">Documentation</option>
                                            <option value="animal">Animal</option>
                                            <option value="alert">Alert</option>
                                            <option value="price">Pricing</option>
                                        </select>
                                    </div>
                                    {logsLoading ? (
                                        <div className={s.logList}>
                                            {[...Array(10)].map((_, i) => (
                                                <div key={i} className={s.logRow} style={{ border: 'none' }}>
                                                    <div className={`${s.actDot} ${s.pulse}`} style={{ background: '#f1f5f9' }} />
                                                    <div className={s.logMain}>
                                                        <div className={`${s.skeletonBar} ${s.pulse}`} style={{ width: '15%', height: '14px' }} />
                                                        <div className={`${s.skeletonBar} ${s.pulse}`} style={{ width: '40%', height: '12px' }} />
                                                    </div>
                                                    <div className={`${s.skeletonBar} ${s.pulse}`} style={{ width: '8%', height: '18px', borderRadius: '12px' }} />
                                                    <div className={`${s.skeletonBar} ${s.pulse}`} style={{ width: '10%', height: '12px' }} />
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className={s.logList}>
                                            {allLogs.length === 0 && <p className={s.emptyMsg}>No logs found for the selected filter.</p>}
                                            {allLogs.map((log, idx) => (
                                                <motion.div
                                                    key={log._id}
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: idx * 0.03 }}
                                                    style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1rem 1.25rem', display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', alignItems: 'center', gap: '1.25rem', marginBottom: '0.75rem', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', transition: 'all 0.2s' }}
                                                    onMouseEnter={e => e.currentTarget.style.borderColor = '#2d5f3f'}
                                                    onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                                                >
                                                    <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '1rem', fontWeight: 800 }}>
                                                        {log.user?.[0].toUpperCase() || '?'}
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                        <span style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: 700 }}>{log.detail}</span>
                                                        <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>Action by {log.user}</span>
                                                    </div>
                                                    <div style={{ textAlign: 'center' }}>
                                                        <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 800, background: '#f1f5f9', padding: '4px 12px', borderRadius: '8px', textTransform: 'uppercase' }}>{log.type || 'system'}</span>
                                                    </div>
                                                    <div style={{ textAlign: 'right', minWidth: '100px' }}>
                                                        <span style={{ display: 'block', fontSize: '0.8rem', color: '#475569', fontWeight: 700 }}>{fmtTime(log.createdAt)}</span>
                                                        <span style={{ display: 'block', fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>{fmtDate(log.createdAt)}</span>
                                                    </div>
                                                </motion.div>
                                            ))}
                                            <div className={s.pager}>
                                                <button disabled={logPage <= 1} onClick={() => setLogPage(p => p - 1)}><ChevronLeft size={15} /> Prev</button>
                                                <span>Page {logPage}</span>
                                                <button disabled={allLogs.length < 25} onClick={() => setLogPage(p => p + 1)}>Next <ChevronRight size={15} /></button>
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            {/* ── CONTENT (FAQs + Docs link) ── */}
                            {tab === 'content' && (
                                <motion.div key="ct" className={s.section} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
                                    <div className={s.sectionHead}>
                                        <div />
                                        <button className={s.addBtn} onClick={openFaqCreate} style={{ padding: '0.7rem 1.4rem', borderRadius: '12px' }}>
                                            <Plus size={16} /> New FAQ Article
                                        </button>
                                    </div>

                                    <div className={s.contentCard} style={{ border: 'none', background: 'transparent', boxShadow: 'none', padding: 0 }}>
                                        <div className={s.contentCardHead} style={{ background: '#fff', padding: '1.25rem 1.5rem', borderRadius: '16px 16px 0 0', margin: 0, border: '1px solid #e2e8f0', flexDirection: 'column', alignItems: 'flex-start', gap: '1rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                                <div className={s.contentCardTitle}>
                                                    <HelpCircle size={20} color="#3b82f6" />
                                                    <span>Help Center Repository</span>
                                                    <span className={s.countBadge}>{faqs.length} Articles</span>
                                                </div>
                                                <button className={s.refreshBtn} onClick={fetchFaqs}><RefreshCw size={14} /></button>
                                            </div>
                                            <div className={s.searchWrap} style={{ width: '100%', maxWidth: 'none', background: '#f8fafc' }}>
                                                <Search size={16} />
                                                <input type="text" placeholder="Filter questions or categories..." value={faqSearch} onChange={(e) => setFaqSearch(e.target.value)} />
                                            </div>
                                        </div>

                                        <div className={s.faqList} style={{ background: '#fff', padding: '1rem', borderRadius: '0 0 16px 16px', border: '1px solid #e2e8f0', borderTop: 'none' }}>
                                            {faqs.length === 0 && <p className={s.emptyMsg}>No FAQs published. Start by adding a new article above.</p>}
                                            {faqs.filter(f => f.question.toLowerCase().includes(faqSearch.toLowerCase()) || f.category.toLowerCase().includes(faqSearch.toLowerCase())).map(f => (
                                                <div key={f._id} className={`${s.faqRow} ${!f.published ? s.faqDraft : ''}`}>
                                                    <div className={s.faqQ}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                                                            <span className={s.faqCat} style={{ color: '#2d5f3f', background: '#f0fdf4', padding: '2px 8px', borderRadius: '6px' }}>{f.category}</span>
                                                            {!f.published && <span className={s.draftTag} style={{ background: '#fff1f2', color: '#e11d48' }}>Private Draft</span>}
                                                        </div>
                                                        <span style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>{f.question}</span>
                                                    </div>
                                                    <div className={s.faqActs}>
                                                        <button className={s.iconSm} onClick={() => openFaqEdit(f)}><Pencil size={15} /></button>
                                                        <button className={`${s.iconSm} ${s.iconDanger}`} onClick={() => setFaqDeleteTarget(f)}><Trash2 size={15} /></button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* ── DOCUMENTATION ── */}
                            {tab === 'docs' && (
                                <motion.div key="docs" className={s.section} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
                                    <div className={s.sectionHead}>
                                        <div />
                                    </div>

                                    {!subTab ? (
                                        <>
                                            <div className={s.heroCard} style={{ textAlign: 'left', alignItems: 'flex-start', padding: '2.5rem' }}>
                                                <div style={{ position: 'relative', zIndex: 1 }}>
                                                    <h2 className={s.heroCardTitle}>Knowledge Base Master Control</h2>
                                                    <p className={s.heroCardDesc} style={{ maxWidth: '600px' }}>Streamline user onboarding with detailed documentation. Coordinate with technical writers to update platform guides in real-time.</p>
                                                    <div className={s.statsGrid} style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
                                                        <div className={s.statCard} style={{ background: '#fff', border: '1px solid #86efac', padding: '1rem', borderRadius: '12px', flex: 1 }}>
                                                            <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 800 }}>Live Guides</div>
                                                            <div style={{ fontSize: '1.5rem', fontWeight: 900 }}>{articles.filter(a => a.published).length}</div>
                                                        </div>
                                                        <div className={s.statCard} style={{ background: '#fff', border: '1px solid #86efac', padding: '1rem', borderRadius: '12px', flex: 1 }}>
                                                            <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 800 }}>Video Assets</div>
                                                            <div style={{ fontSize: '1.5rem', fontWeight: 900 }}>12</div>
                                                        </div>
                                                        <div className={s.statCard} style={{ background: '#fff', border: '1px solid #86efac', padding: '1rem', borderRadius: '12px', flex: 1 }}>
                                                            <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 800 }}>Search Index</div>
                                                            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#16a34a' }}>Healthy</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className={s.featureGrid}>
                                                <div className={s.featureCard}>
                                                    <div className={s.featureCardIcon} style={{ background: '#ede9fe', color: '#7c3aed' }}><FileText size={24} /></div>
                                                    <div className={s.featureCardTitle}>Getting Started</div>
                                                    <div className={s.featureCardDesc}>Draft "Getting Started" guides for user onboarding.</div>
                                                    <button className={s.featureCardBtn} onClick={() => navigate('/admin-portal?tab=docs&sub=getting-started')}>Manage Articles <ChevronRight size={14} /></button>
                                                </div>
                                                <div className={s.featureCard}>
                                                    <div className={s.featureCardIcon} style={{ background: '#fce7f3', color: '#db2777' }}><Video size={24} /></div>
                                                    <div className={s.featureCardTitle}>Video Tutorials</div>
                                                    <div className={s.featureCardDesc}>Upload and manage video tutorials for the knowledge base.</div>
                                                    <button className={s.featureCardBtn} onClick={() => navigate('/admin-portal?tab=docs&sub=video-tutorials')}>Open Media Library <ChevronRight size={14} /></button>
                                                </div>
                                                <div className={s.featureCard}>
                                                    <div className={s.featureCardIcon} style={{ background: '#dcfce7', color: '#16a34a' }}><Pencil size={24} /></div>
                                                    <div className={s.featureCardTitle}>Features</div>
                                                    <div className={s.featureCardDesc}>Refine existing content regarding platform features.</div>
                                                    <button className={s.featureCardBtn} onClick={() => navigate('/admin-portal?tab=docs&sub=features')}>Edit Articles <ChevronRight size={14} /></button>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className={s.subSection}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                    <button onClick={() => navigate('/admin-portal?tab=docs')} className={s.backIconBtn}>
                                                        <ArrowLeft size={18} />
                                                    </button>
                                                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, textTransform: 'capitalize' }}>
                                                        {subTab.replace('-', ' ')}
                                                    </h2>
                                                </div>
                                                <button className={s.primaryBtn} onClick={openDocCreate}><Plus size={16} /> New Article</button>
                                            </div>

                                            <div className={s.tableWrap}>
                                                <table className={s.modernTable}>
                                                    <thead>
                                                        <tr>
                                                            <th>Title</th>
                                                            <th>Status</th>
                                                            <th>Last Updated</th>
                                                            <th>Actions</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {articlesLoading ? (
                                                            <tr><td colSpan="4" style={{ textAlign: 'center', padding: '2rem' }}>Loading documents...</td></tr>
                                                        ) : articles.filter(a => a.category.toLowerCase().replace(/\s+/g, '-') === subTab).length === 0 ? (
                                                            <tr><td colSpan="4" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>No articles found in this category.</td></tr>
                                                        ) : (
                                                            articles.filter(a => a.category.toLowerCase().replace(/\s+/g, '-') === subTab).map(art => (
                                                                <tr key={art._id}>
                                                                    <td style={{ fontWeight: 600 }}>{art.title}</td>
                                                                    <td>
                                                                        <span className={`${s.pill} ${art.published ? s.pillActive : s.pillGray}`}>
                                                                            {art.published ? 'Live' : 'Draft'}
                                                                        </span>
                                                                    </td>
                                                                    <td style={{ color: '#64748b', fontSize: '0.9rem' }}>{new Date(art.updatedAt).toLocaleDateString()}</td>
                                                                    <td>
                                                                        <div className={s.actionGrp}>
                                                                            <button className={s.iconSm} title="Edit" onClick={() => openDocEdit(art)}><Pencil size={15} /></button>
                                                                            <button className={`${s.iconSm} ${s.iconDanger}`} title="Delete" onClick={() => setDocDeleteTarget(art)}><Trash2 size={15} /></button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            ))
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            {/* ── PRICING ── */}
                            {tab === 'pricing' && (
                                <motion.div key="pr" className={s.section} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
                                    <div className={s.sectionHead}>
                                        <div />
                                        <button className={s.primaryBtn} onClick={() => navigate('/settings?tab=pricing')}><Crown size={16} /> Subscription Settings</button>
                                    </div>

                                    <div className={s.heroCard} style={{ background: '#1e293b', color: '#fff', textAlign: 'left', alignItems: 'flex-start' }}>
                                        <div style={{ position: 'relative', zIndex: 1, display: 'flex', width: '100%', alignItems: 'center', gap: '4rem' }}>
                                            <div style={{ flex: 1 }}>
                                                <h2 className={s.heroCardTitle} style={{ color: '#fff' }}>Revenue Optimization</h2>
                                                <p className={s.heroCardDesc} style={{ color: '#94a3b8' }}>Monitor real-time subscription performance and adjust tier pricing to maximize LTV.</p>
                                            </div>
                                            <div style={{ display: 'flex', gap: '2rem' }}>
                                                <div>
                                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Total MRR</div>
                                                    <div style={{ fontSize: '2rem', fontWeight: 900, color: '#22c55e' }}>₹4.2L</div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Growth</div>
                                                    <div style={{ fontSize: '2rem', fontWeight: 900, color: '#3b82f6' }}>+12%</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className={s.featureGrid}>
                                        <div className={s.featureCard}>
                                            <div className={s.featureCardIcon} style={{ background: 'rgba(71, 85, 105, 0.1)', color: '#475569' }}><Zap size={22} /></div>
                                            <div className={s.featureCardTitle}>Free Tier</div>
                                            <p className={s.featureCardDesc}>Basic health tracking for 2 animals. No AI features.</p>
                                            <div style={{ fontSize: '1.5rem', fontWeight: 900, marginTop: 'auto' }}>₹0<small style={{ fontSize: '0.8rem', opacity: 0.5 }}>/mo</small></div>
                                        </div>
                                        <div className={s.featureCard} style={{ border: '2px solid #2d5f3f' }}>
                                            <div className={s.featureCardIcon} style={{ background: '#2d5f3f', color: '#fff' }}><Crown size={22} /></div>
                                            <div className={s.featureCardTitle}>Pro Tier</div>
                                            <p className={s.featureCardDesc}>Unlimited animals & full AI diagnostics. Priority support.</p>
                                            <div style={{ fontSize: '1.5rem', fontWeight: 900, marginTop: 'auto', color: '#2d5f3f' }}>₹499<small style={{ fontSize: '0.8rem', opacity: 0.5 }}>/mo</small></div>
                                        </div>
                                        <div className={s.featureCard}>
                                            <div className={s.featureCardIcon} style={{ background: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed' }}><TrendingUp size={22} /></div>
                                            <div className={s.featureCardTitle}>Enterprise</div>
                                            <p className={s.featureCardDesc}>Custom deployment for labs & shelters. Dedicated SLA.</p>
                                            <div style={{ fontSize: '1.5rem', fontWeight: 900, marginTop: 'auto' }}>Custom</div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* ── SETTINGS ── */}
                            {tab === 'settings' && (
                                <motion.div key="st" className={s.section} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
                                    <div className={s.sectionHead}>
                                        <div />
                                        <button className={s.primaryBtn} onClick={() => navigate('/settings?tab=advanced')}><SettingsIcon size={16} /> Advanced Config</button>
                                    </div>

                                    <div className={s.contentGrid}>
                                        <div className={s.contentCard}>
                                            <div className={s.contentCardHead}>
                                                <div className={s.contentCardTitle}><Lock size={18} color="#ef4444" /> Security Firewall</div>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                <div className={s.miniAnimal} style={{ background: '#fff', border: '1px solid #f1f5f9', padding: '1rem', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                    <ShieldAlert size={18} color="#ef4444" />
                                                    <span style={{ fontWeight: 700 }}>Intrusion Detection (IDS)</span>
                                                    <span className={`${s.pill} ${s.pillActive}`} style={{ marginLeft: 'auto', background: '#dcfce7', color: '#166534' }}>Active</span>
                                                </div>
                                                <div className={s.miniAnimal} style={{ background: '#fff', border: '1px solid #f1f5f9', padding: '1rem', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                    <Lock size={18} color="#64748b" />
                                                    <span style={{ fontWeight: 700 }}>2FA Protocol</span>
                                                    <span style={{ marginLeft: 'auto', color: '#166534', fontWeight: 800 }}>Strict</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className={s.contentCard}>
                                            <div className={s.contentCardHead}>
                                                <div className={s.contentCardTitle}><Globe size={18} color="#0ea5e9" /> Global API Status</div>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                <div className={s.miniAnimal} style={{ background: '#fff', border: '1px solid #f1f5f9', padding: '1rem', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                    <Zap size={18} color="#f59e0b" />
                                                    <span style={{ fontWeight: 700 }}>Payment Gateway (Razorpay)</span>
                                                    <span className={`${s.pill} ${s.pillActive}`} style={{ marginLeft: 'auto', background: '#dcfce7', color: '#166534' }}>Operational</span>
                                                </div>
                                                <div className={s.miniAnimal} style={{ background: '#fff', border: '1px solid #f1f5f9', padding: '1rem', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                    <CheckCircle size={18} color="#22c55e" />
                                                    <span style={{ fontWeight: 700 }}>AI Model Server (inference)</span>
                                                    <span className={`${s.pill} ${s.pillActive}`} style={{ marginLeft: 'auto', background: '#dcfce7', color: '#166534' }}>0.4s Latency</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* ── ADMIN ACCESS ── */}
                            {tab === 'adminaccess' && (
                                <motion.div key="aa" className={s.section}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.3 }}>

                                    {/* Revoke confirmation modal */}
                                    <AnimatePresence>
                                        {revokeTarget && (
                                            <motion.div className={s.overlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                                <motion.div className={s.confirmBox} initial={{ scale: 0.92 }} animate={{ scale: 1 }} exit={{ scale: 0.92 }}>
                                                    <div className={s.confirmIcon}><ShieldOff size={24} color="#ef4444" /></div>
                                                    <h3>Revoke Admin Access?</h3>
                                                    <p>This will remove administrator privileges from <strong>{revokeTarget.full_name || revokeTarget.email}</strong>. They will retain their account but lose all admin capabilities.</p>
                                                    <div className={s.confirmBtns}>
                                                        <button className={s.cancelSm} onClick={() => setRevokeTarget(null)}>Cancel</button>
                                                        <button className={s.dangerSm} onClick={() => revokeAdminAccess(revokeTarget)}>Revoke Access</button>
                                                    </div>
                                                </motion.div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    <div className={s.sectionHead}>
                                        <div />
                                        <button className={s.refreshBtn} onClick={fetchAdminAccess}><RefreshCw size={15} /> Refresh</button>
                                    </div>

                                    {/* Grant Admin Access Card */}
                                    <div style={{
                                        background: 'linear-gradient(135deg, #0f2d1a 0%, #1a4a2e 100%)',
                                        borderRadius: '24px',
                                        padding: '2rem 2.5rem',
                                        marginBottom: '2rem',
                                        border: '1px solid rgba(45, 95, 63, 0.4)',
                                        position: 'relative',
                                        overflow: 'hidden',
                                    }}>
                                        <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(34, 197, 94, 0.06)', pointerEvents: 'none' }} />
                                        <div style={{ position: 'absolute', bottom: -60, left: -20, width: 150, height: 150, borderRadius: '50%', background: 'rgba(34, 197, 94, 0.04)', pointerEvents: 'none' }} />
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', position: 'relative', zIndex: 1 }}>
                                            <div style={{ width: 48, height: 48, borderRadius: '14px', background: 'rgba(34, 197, 94, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(34, 197, 94, 0.25)' }}>
                                                <Key size={22} color="#4ade80" />
                                            </div>
                                            <div>
                                                <h2 style={{ color: '#fff', fontWeight: 800, fontSize: '1.15rem', margin: 0 }}>Grant Admin Access</h2>
                                                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.82rem', margin: 0 }}>Enter the email of an existing user to promote them to administrator</p>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.75rem', position: 'relative', zIndex: 1 }}>
                                            <div style={{ flex: 1, position: 'relative' }}>
                                                <AtSign size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }} />
                                                <input
                                                    type="email"
                                                    placeholder="user@example.com"
                                                    value={grantEmail}
                                                    onChange={e => setGrantEmail(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && grantAdminAccess()}
                                                    style={{
                                                        width: '100%',
                                                        padding: '0.85rem 1rem 0.85rem 2.75rem',
                                                        borderRadius: '12px',
                                                        border: '1.5px solid rgba(255,255,255,0.12)',
                                                        background: 'rgba(255,255,255,0.07)',
                                                        color: '#fff',
                                                        fontSize: '0.9rem',
                                                        outline: 'none',
                                                        fontFamily: 'inherit',
                                                        backdropFilter: 'blur(8px)',
                                                        boxSizing: 'border-box',
                                                    }}
                                                />
                                            </div>
                                            <motion.button
                                                onClick={grantAdminAccess}
                                                disabled={grantLoading}
                                                whileHover={{ scale: 1.03 }}
                                                whileTap={{ scale: 0.97 }}
                                                style={{
                                                    padding: '0.85rem 1.75rem',
                                                    borderRadius: '12px',
                                                    border: 'none',
                                                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                                    color: '#fff',
                                                    fontWeight: 800,
                                                    fontSize: '0.9rem',
                                                    cursor: grantLoading ? 'not-allowed' : 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem',
                                                    whiteSpace: 'nowrap',
                                                    opacity: grantLoading ? 0.7 : 1,
                                                    boxShadow: '0 4px 15px rgba(34, 197, 94, 0.3)',
                                                }}
                                            >
                                                {grantLoading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <ShieldCheck size={16} />}
                                                {grantLoading ? 'Granting…' : 'Grant Access'}
                                            </motion.button>
                                        </div>
                                        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', marginTop: '0.85rem', position: 'relative', zIndex: 1 }}>
                                            ⚠ Only promote users you fully trust. Admins can manage all users, content, and platform settings.
                                        </p>
                                    </div>

                                    {/* Current Admins Roster */}
                                    <div style={{ background: '#fff', borderRadius: '20px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', marginBottom: '2rem' }}>
                                        <div style={{ padding: '1.5rem 1.75rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <div style={{ width: 36, height: 36, borderRadius: '10px', background: '#f0fdf4', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <UserCog size={18} color="#16a34a" />
                                                </div>
                                                <div>
                                                    <h3 style={{ margin: 0, fontWeight: 800, fontSize: '1rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                        Administrator Roster
                                                        {/* Real-time live dot */}
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: '20px', fontSize: '0.65rem', fontWeight: 700, color: '#16a34a' }}>
                                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', animation: 'ping 2s cubic-bezier(0,0,0.2,1) infinite', display: 'inline-block' }} />
                                                            LIVE
                                                        </span>
                                                    </h3>
                                                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>{adminUsers.length} admin{adminUsers.length !== 1 ? 's' : ''} · refreshes every 30s · click a row to view their logs</p>
                                                </div>
                                            </div>
                                            <div style={{ position: 'relative' }}>
                                                <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
                                                <input
                                                    placeholder="Filter admins…"
                                                    value={adminSearch}
                                                    onChange={e => setAdminSearch(e.target.value)}
                                                    style={{ padding: '0.5rem 0.75rem 0.5rem 2.1rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.82rem', outline: 'none', fontFamily: 'inherit', background: '#f8fafc', color: '#0f172a', width: '200px' }}
                                                />
                                            </div>
                                        </div>
                                        {adminAccessLoading ? (
                                            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                                                <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', marginBottom: '0.5rem' }} />
                                                <p style={{ margin: 0, fontSize: '0.85rem' }}>Loading admin roster…</p>
                                            </div>
                                        ) : adminUsers.filter(u => !adminSearch || `${u.full_name}${u.email}`.toLowerCase().includes(adminSearch.toLowerCase())).length === 0 ? (
                                            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                                                <ShieldOff size={32} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
                                                <p style={{ margin: 0, fontWeight: 600 }}>No admins found</p>
                                                <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem' }}>Use the Grant Access panel above to promote a user.</p>
                                            </div>
                                        ) : (
                                            <div>
                                                {adminUsers
                                                    .filter(u => !adminSearch || `${u.full_name}${u.email}`.toLowerCase().includes(adminSearch.toLowerCase()))
                                                    .map((u, idx) => {
                                                        const isExpanded = expandedAdmin === u._id;
                                                        const userLogs = adminLogs[u._id] || [];
                                                        return (
                                                            <div key={u._id}>
                                                                {/* Admin row */}
                                                                <motion.div
                                                                    initial={{ opacity: 0, y: 8 }}
                                                                    animate={{ opacity: 1, y: 0 }}
                                                                    transition={{ delay: idx * 0.04 }}
                                                                    onClick={() => fetchAdminLog(u._id)}
                                                                    style={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '1rem',
                                                                        padding: '1rem 1.75rem',
                                                                        borderBottom: '1px solid #f1f5f9',
                                                                        cursor: 'pointer',
                                                                        background: isExpanded ? '#f8fafc' : 'transparent',
                                                                        transition: 'background 0.2s',
                                                                    }}
                                                                    onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = '#fafafa'; }}
                                                                    onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }}
                                                                >
                                                                    <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'linear-gradient(135deg, #2d5f3f, #3e7d55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1.1rem', flexShrink: 0 }}>
                                                                        {(u.full_name || u.email || '?')[0].toUpperCase()}
                                                                    </div>
                                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                                            {u.full_name || '(no name)'}
                                                                            <span style={{ background: '#f0fdf4', color: '#166534', fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', borderRadius: '20px', border: '1px solid #bbf7d0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Admin</span>
                                                                        </div>
                                                                        <div style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'flex', gap: '1rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                                                                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Mail size={11} />{u.email || u.mobile || '—'}</span>
                                                                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Clock size={11} />Joined {fmtDate(u.createdAt)}</span>
                                                                            {u.lastLoginAt && <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Activity size={11} />Last seen {ago(u.lastLoginAt)}</span>}
                                                                        </div>
                                                                    </div>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                                                                        <span style={{ padding: '4px 10px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: 700, background: u.blocked ? '#fee2e2' : '#dcfce7', color: u.blocked ? '#ef4444' : '#166534' }}>
                                                                            {u.blocked ? 'Blocked' : 'Active'}
                                                                        </span>
                                                                        <span style={{ padding: '4px 10px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: 700, background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                                            <Activity size={10} />
                                                                            {isExpanded ? 'Hide Logs' : 'View Logs'}
                                                                        </span>
                                                                        <motion.button
                                                                            onClick={e => { e.stopPropagation(); setRevokeTarget(u); }}
                                                                            whileHover={{ scale: 1.05 }}
                                                                            whileTap={{ scale: 0.95 }}
                                                                            title="Revoke admin access"
                                                                            style={{ padding: '0.45rem 0.9rem', borderRadius: '8px', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}
                                                                        >
                                                                            <ShieldOff size={13} /> Revoke
                                                                        </motion.button>
                                                                    </div>
                                                                </motion.div>

                                                                {/* Expandable logs panel */}
                                                                <AnimatePresence>
                                                                    {isExpanded && (
                                                                        <motion.div
                                                                            initial={{ height: 0, opacity: 0 }}
                                                                            animate={{ height: 'auto', opacity: 1 }}
                                                                            exit={{ height: 0, opacity: 0 }}
                                                                            transition={{ duration: 0.3, ease: 'easeInOut' }}
                                                                            style={{ overflow: 'hidden', borderBottom: '1px solid #f1f5f9' }}
                                                                        >
                                                                            <div style={{ padding: '1rem 1.75rem 1.25rem', background: 'linear-gradient(180deg, #f8fafc 0%, #fff 100%)' }}>
                                                                                <p style={{ margin: '0 0 0.75rem', fontSize: '0.78rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                                                    <Activity size={13} color="#3b82f6" />
                                                                                    Activity Log — {u.full_name || u.email}
                                                                                </p>
                                                                                {userLogs.length === 0 ? (
                                                                                    <p style={{ margin: 0, fontSize: '0.82rem', color: '#94a3b8', fontStyle: 'italic' }}>No activity recorded for this admin yet.</p>
                                                                                ) : (
                                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '260px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                                                                                        {userLogs.map((log, li) => (
                                                                                            <div key={log._id || li} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.6rem 0.75rem', background: '#fff', border: '1px solid #f1f5f9', borderRadius: '10px' }}>
                                                                                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: DOT[log.type] || '#3b82f6', flexShrink: 0, marginTop: '0.35rem' }} />
                                                                                                <div style={{ flex: 1 }}>
                                                                                                    <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: '#0f172a' }}>{log.detail || log.action || '—'}</p>
                                                                                                    <p style={{ margin: '0.1rem 0 0', fontSize: '0.7rem', color: '#94a3b8' }}>{fmtTime(log.createdAt)} · {log.type}</p>
                                                                                                </div>
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </motion.div>
                                                                    )}
                                                                </AnimatePresence>
                                                            </div>
                                                        );
                                                    })
                                                }
                                            </div>
                                        )}
                                    </div>


                                </motion.div>
                            )}

                        </AnimatePresence>
                    </div>
                </main>
            </div >
        </div >
    );
}
