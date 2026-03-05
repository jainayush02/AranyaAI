import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext, useNavigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard, Users, Activity, FileText, HelpCircle,
    Search, Lock, Unlock, Trash2, ChevronRight, ChevronLeft,
    BarChart3, Plus, Pencil, Save, X, Eye, EyeOff,
    RefreshCw, CheckCircle, AlertCircle, Loader2,
    Crown, TrendingUp, Globe, Clock, UserCheck, UserX,
    ShieldAlert, Zap, MousePointer2, BookOpen, Settings as SettingsIcon,
    Megaphone, FolderOpen, Menu, Video
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

    // ── Fetch helpers ────────────────────────────
    const fetchOverview = useCallback(async () => {
        setOverviewLoading(true);
        try {
            const [sr, ar] = await Promise.all([
                axios.get(`${API}/admin/stats`, authH()),
                axios.get(`${API}/admin/activity?limit=8`, authH()),
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
        try { const r = await axios.get(`${API}/admin/users/${id}`, authH()); setFocusedUser(r.data); }
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

    useEffect(() => {
        const t = queryParams.get('tab');
        if (t && ['overview', 'users', 'logs', 'content', 'docs', 'pricing', 'settings'].includes(t)) {
            setTab(t);
        }
    }, [location.search]);

    useEffect(() => { if (tab === 'overview') fetchOverview(); }, [tab, fetchOverview]);
    useEffect(() => { if (tab === 'users' && !focusedUser) fetchUsers(); }, [tab, fetchUsers, focusedUser]);
    useEffect(() => { if (tab === 'logs') fetchLogs(); }, [tab, fetchLogs]);
    useEffect(() => { if (tab === 'content') fetchFaqs(); }, [tab, fetchFaqs]);

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

    const TABS = [
        { id: 'overview', label: 'Business Stats', icon: LayoutDashboard },
        { id: 'users', label: 'User Management', icon: Users },
        { id: 'logs', label: 'Activity Logs', icon: Activity },
        { id: 'content', label: 'Help Center FAQs', icon: HelpCircle },
        { id: 'docs', label: 'Knowledge Base', icon: BookOpen },
        { id: 'pricing', label: 'Pricing Plans', icon: Crown },
        { id: 'settings', label: 'System Configuration', icon: SettingsIcon },
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
                        {TABS.map(t => (
                            <button
                                key={t.id}
                                className={`${s.navItem} ${tab === t.id ? s.navActive : ''}`}
                                onClick={() => handleTabClick(t)}
                                title={!isSidebarOpen ? t.label : ''}
                            >
                                <t.icon size={17} />
                                <AnimatePresence mode="wait">
                                    {isSidebarOpen && (
                                        <motion.span
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -10 }}
                                            transition={{ duration: 0.15 }}
                                        >
                                            {t.label}
                                        </motion.span>
                                    )}
                                </AnimatePresence>
                            </button>
                        ))}
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
                                                <div className={s.userDetailGrid}>
                                                    <div className={s.userCard}>
                                                        <div className={s.bigAvatar}>{(focusedUser.user.full_name || focusedUser.user.email || '?')[0].toUpperCase()}</div>
                                                        <h2>{focusedUser.user.full_name || '(no name)'}</h2>
                                                        <p>{focusedUser.user.email || focusedUser.user.mobile}</p>
                                                        <div className={s.badges}>
                                                            <span className={`${s.badge} ${s[`b_${focusedUser.user.role}`]}`}>{focusedUser.user.role}</span>
                                                            <span className={`${s.badge} ${s[`b_${focusedUser.user.plan || 'free'}`]}`}>{focusedUser.user.plan || 'free'}</span>
                                                            {focusedUser.user.blocked && <span className={`${s.badge} ${s.b_blocked}`}>Blocked</span>}
                                                        </div>
                                                        <div className={s.userMeta}>
                                                            <div><Clock size={13} /> Joined: {fmtDate(focusedUser.user.createdAt)}</div>
                                                            <div><Globe size={13} /> Last login: {ago(focusedUser.user.lastLoginAt)}</div>
                                                            <div><BarChart3 size={13} /> Logins: {focusedUser.user.loginCount || 0}</div>
                                                            <div><CheckCircle size={13} /> Verified: {focusedUser.user.isVerified ? 'Yes' : 'No'}</div>
                                                        </div>
                                                        <div className={s.userCtrl}>
                                                            <button className={`${s.ctrlBtn} ${focusedUser.user.blocked ? s.ctrlUnblock : s.ctrlBlock}`} onClick={() => blockToggle(focusedUser.user)}>
                                                                {focusedUser.user.blocked ? <><Unlock size={14} /> Unblock</> : <><Lock size={14} /> Block</>}
                                                            </button>
                                                            <button className={`${s.ctrlBtn} ${s.ctrlRole}`} onClick={() => roleToggle(focusedUser.user)}>
                                                                <Crown size={14} /> {focusedUser.user.role === 'admin' ? 'Demote' : 'Promote'}
                                                            </button>
                                                            <button className={`${s.ctrlBtn} ${s.ctrlDelete}`} onClick={() => setDeleteTarget(focusedUser.user)}>
                                                                <Trash2 size={14} /> Delete
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className={s.userDetailRight}>
                                                        <div className={s.detailPanel}>
                                                            <h3>Animals ({focusedUser.animals.length})</h3>
                                                            {focusedUser.animals.length === 0 && <p className={s.emptyMsg}>No animals yet</p>}
                                                            {focusedUser.animals.map(a => (
                                                                <div key={a._id} className={s.miniAnimal}>
                                                                    <span className={`${s.statusDot} ${s[`st_${a.status}`]}`} />
                                                                    <span>{a.name}</span>
                                                                    <span className={s.animalBreed}>{a.breed}</span>
                                                                    <span className={`${s.pill} ${s[`pill_${a.status}`]}`}>{a.status || 'unknown'}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div className={s.detailPanel}>
                                                            <h3>Activity Log ({focusedUser.logs.length})</h3>
                                                            {focusedUser.logs.length === 0 && <p className={s.emptyMsg}>No activity for this user</p>}
                                                            {focusedUser.logs.map(log => (
                                                                <div key={log._id} className={s.miniLog}>
                                                                    <span className={s.actDot} style={{ background: DOT[log.type] || '#94a3b8' }} />
                                                                    <span className={s.logDetail}>{log.detail}</span>
                                                                    <span className={s.actTime}>{ago(log.createdAt)}</span>
                                                                </div>
                                                            ))}
                                                        </div>
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
                                                            <tr><th>User</th><th>Plan</th><th>Status</th><th>Joined</th><th>Last Login</th><th>Logins</th><th>Actions</th></tr>
                                                        </thead>
                                                        <tbody>
                                                            {users.length === 0 && <tr><td colSpan="7" className={s.emptyCell}>No users found</td></tr>}
                                                            {users.map(u => (
                                                                <tr key={u._id} className={s.tr} onClick={() => fetchFocusedUser(u._id)}>
                                                                    <td>
                                                                        <div className={s.userCell}>
                                                                            <div className={s.avatar}>{(u.full_name || u.email || '?')[0].toUpperCase()}</div>
                                                                            <div>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                    <div className={s.uname}>{u.full_name || '(no name)'}</div>
                                                                                    {u.role === 'admin' && <span className={`${s.pill} ${s.plan_pro}`} style={{ padding: '2px 6px', fontSize: '10px' }}>Admin</span>}
                                                                                </div>
                                                                                <div className={s.uemail}>{u.email || u.mobile}</div>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                    <td><span className={`${s.pill} ${s[`plan_${u.plan || 'free'}`]}`}>{u.plan || 'free'}</span></td>
                                                                    <td><span className={`${s.pill} ${u.blocked ? s.pillBlocked : s.pillActive}`}>{u.blocked ? 'Blocked' : 'Active'}</span></td>
                                                                    <td className={s.tdMuted}>{fmtDate(u.createdAt)}</td>
                                                                    <td className={s.tdMuted}>{ago(u.lastLoginAt)}</td>
                                                                    <td className={s.tdMuted}>{u.loginCount || 0}</td>
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
                                            {allLogs.map(log => (
                                                <motion.div key={log._id} className={s.logRow}
                                                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}>
                                                    <span className={s.actDot} style={{ background: DOT[log.type] || '#94a3b8' }} />
                                                    <div className={s.logMain}>
                                                        <strong>{log.user}</strong>
                                                        <span>{log.detail}</span>
                                                    </div>
                                                    <span className={`${s.logType} ${s[`lt_${log.type}`]}`}>{log.type}</span>
                                                    <span className={s.actTime}>{fmtTime(log.createdAt)}</span>
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

                                    <div className={s.heroCard} style={{ textAlign: 'left', alignItems: 'flex-start', padding: '2.5rem' }}>
                                        <div style={{ position: 'relative', zIndex: 1 }}>
                                            <h2 className={s.heroCardTitle}>Knowledge Base Master Control</h2>
                                            <p className={s.heroCardDesc} style={{ maxWidth: '600px' }}>Streamline user onboarding with detailed documentation. Coordinate with technical writers to update platform guides in real-time.</p>
                                            <div className={s.statsGrid} style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
                                                <div className={s.statCard} style={{ background: '#fff', border: '1px solid #86efac', padding: '1rem', borderRadius: '12px', flex: 1 }}>
                                                    <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 800 }}>Live Guides</div>
                                                    <div style={{ fontSize: '1.5rem', fontWeight: 900 }}>24</div>
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
                                            <div className={s.featureCardTitle}>Article Drafting</div>
                                            <div className={s.featureCardDesc}>Draft "Getting Started" and "Features" articles for user onboarding.</div>
                                            <button className={s.featureCardBtn} onClick={() => navigate('/docs')}>Manage Articles <ChevronRight size={14} /></button>
                                        </div>
                                        <div className={s.featureCard}>
                                            <div className={s.featureCardIcon} style={{ background: '#fce7f3', color: '#db2777' }}><Video size={24} /></div>
                                            <div className={s.featureCardTitle}>Video Tutorials</div>
                                            <div className={s.featureCardDesc}>Upload and manage video tutorials for the knowledge base.</div>
                                            <button className={s.featureCardBtn} onClick={() => navigate('/docs')}>Open Media Library <ChevronRight size={14} /></button>
                                        </div>
                                        <div className={s.featureCard}>
                                            <div className={s.featureCardIcon} style={{ background: '#dcfce7', color: '#16a34a' }}><Pencil size={24} /></div>
                                            <div className={s.featureCardTitle}>Article Editing</div>
                                            <div className={s.featureCardDesc}>Refine existing content, update steps, and manage publication status.</div>
                                            <button className={s.featureCardBtn} onClick={() => navigate('/docs')}>Edit Articles <ChevronRight size={14} /></button>
                                        </div>
                                    </div>
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

                        </AnimatePresence>
                    </div>
                </main>
            </div>
        </div>
    );
}
