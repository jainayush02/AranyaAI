import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard, Users, Activity, FileText, HelpCircle,
    Search, Lock, Unlock, Trash2, ChevronRight, ChevronLeft,
    BarChart3, Plus, Pencil, Save, X, Eye, EyeOff,
    RefreshCw, CheckCircle, AlertCircle, Loader2,
    Crown, TrendingUp, Globe, Clock, UserCheck, UserX,
    ShieldAlert, Zap, MousePointer2, BookOpen, Settings as SettingsIcon
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
            <div className={s.statIcon} style={{ background: `${color}18`, color }}><Icon size={21} /></div>
            <div>
                <div className={s.statLabel}>{label}</div>
                <div className={s.statVal}>{value ?? '—'}</div>
                {sub && <div className={s.statSub}>{sub}</div>}
            </div>
        </div>
    );
}

// ── Main ─────────────────────────────────────────
export default function AdminPortal() {
    const [tab, setTab] = useState('overview');
    const navigate = useNavigate();
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
    const [userRole, setUserRole] = useState('user'); // Default to showing users, changed from hiding admins implicitly
    const [usersLoading, setUsersLoading] = useState(false);
    const [focusedUser, setFocusedUser] = useState(null);  // { user, animals, logs }
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
    const [faqModal, setFaqModal] = useState(null);  // null | 'create' | {_id,...}
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
        { id: 'overview', label: 'Overview', icon: LayoutDashboard },
        { id: 'users', label: 'Users CRM', icon: Users },
        { id: 'logs', label: 'Activity Logs', icon: Activity },
        { id: 'content', label: 'Help Center FAQs', icon: HelpCircle },
        { id: 'docs', label: 'Documentation', icon: BookOpen, external: '/docs' },
        { id: 'pricing', label: 'Pricing & Settings', icon: SettingsIcon, external: '/settings' },
    ];

    const handleTabClick = (t) => {
        if (t.external) { navigate(t.external); return; }
        setTab(t.id);
    };

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

            {/* Layout */}
            <div className={s.layout}>
                {/* Sidebar */}
                <aside className={s.sidebar}>
                    <div className={s.sideHead}><Crown size={18} color="#f59e0b" /> Admin CRM</div>
                    <nav className={s.sideNav}>
                        {TABS.map(t => (
                            <button key={t.id} className={`${s.navItem} ${tab === t.id && !t.external ? s.navActive : ''} ${t.external ? s.navExternal : ''}`} onClick={() => handleTabClick(t)}>
                                <t.icon size={17} /> {t.label}
                                {tab === t.id && !t.external && <ChevronRight size={13} className={s.navArr} />}
                                {t.external && <ChevronRight size={12} className={s.navArr} style={{ opacity: 0.4 }} />}
                            </button>
                        ))}
                    </nav>
                    {stats && (
                        <div className={s.sideMini}>
                            <div className={s.miniRow}><Users size={13} /> {stats.totalUsers} Users</div>
                            <div className={s.miniRow}><Lock size={13} color="#ef4444" /> {stats.blockedUsers} Blocked</div>
                            <div className={s.miniRow}><TrendingUp size={13} color="#22c55e" /> +{stats.newThisWeek} this week</div>
                        </div>
                    )}
                </aside>

                {/* Main */}
                <main className={s.main}>
                    <AnimatePresence mode="wait">

                        {/* ── OVERVIEW ─────────────────────────────── */}
                        {tab === 'overview' && (
                            <motion.div key="ov" className={s.section} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
                                <div className={s.sectionHead}>
                                    <div><h1>Platform Overview</h1><p>Real-time business metrics</p></div>
                                    <button className={s.refreshBtn} onClick={fetchOverview}><RefreshCw size={15} /> Refresh</button>
                                </div>
                                {!stats && overviewLoading ? (
                                    <div className={s.loading}><Loader2 size={26} className={s.spin} /> Loading Overview...</div>
                                ) : !stats && !overviewLoading ? (
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
                                            <Stat icon={MousePointer2} label="Page Views" value={stats.pageViews?.toLocaleString()} sub="estimated" color="#7c3aed" />
                                            <Stat icon={Zap} label="Avg. Session" value={`${stats.avgSessionMin}m`} sub="per user" color="#f59e0b" />
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

                        {/* ── USERS ────────────────────────────────── */}
                        {tab === 'users' && (
                            <motion.div key="us" className={s.section} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
                                {focusedUser ? (
                                    /* User detail */
                                    <div>
                                        <button className={s.backBtn} onClick={() => setFocusedUser(null)}><ChevronLeft size={15} /> Back to Users</button>
                                        {focusLoading ? <div className={s.loading}><Loader2 size={24} className={s.spin} /></div> : (
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
                                    /* Users table */
                                    <div>
                                        <div className={s.sectionHead}>
                                            <div><h1>User Management</h1><p>{usersTotal} users registered</p></div>
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
                                        {usersLoading ? <div className={s.loading}><Loader2 size={22} className={s.spin} /> Loading...</div> : (
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

                        {/* ── ACTIVITY LOGS ─────────────────────────── */}
                        {tab === 'logs' && (
                            <motion.div key="lg" className={s.section} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
                                <div className={s.sectionHead}>
                                    <div><h1>Activity Logs</h1><p>{logsTotal} events recorded</p></div>
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
                                {logsLoading ? <div className={s.loading}><Loader2 size={22} className={s.spin} /></div> : (
                                    <div className={s.logList}>
                                        {allLogs.length === 0 && <p className={s.emptyMsg}>No logs found.</p>}
                                        {allLogs.map(log => (
                                            <div key={log._id} className={s.logRow}>
                                                <span className={s.actDot} style={{ background: DOT[log.type] || '#94a3b8' }} />
                                                <div className={s.logMain}>
                                                    <strong>{log.user}</strong>
                                                    <span>{log.detail}</span>
                                                </div>
                                                <span className={`${s.logType} ${s[`lt_${log.type}`]}`}>{log.type}</span>
                                                <span className={s.actTime}>{fmtTime(log.createdAt)}</span>
                                            </div>
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

                        {/* ── CONTENT (FAQs + Docs link) ─────────────── */}
                        {tab === 'content' && (
                            <motion.div key="ct" className={s.section} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
                                <div className={s.sectionHead}>
                                    <div><h1>Content Management</h1><p>Manage Help Center FAQs and Documentation</p></div>
                                </div>
                                <div className={s.contentGrid}>
                                    {/* FAQs */}
                                    <div className={s.contentCard}>
                                        <div className={s.contentCardHead}>
                                            <div className={s.contentCardTitle}><HelpCircle size={19} color="#3b82f6" /> Help Center FAQs <span className={s.countBadge}>{faqs.length}</span></div>
                                            <button className={s.addBtn} onClick={openFaqCreate}><Plus size={15} /> New FAQ</button>
                                        </div>
                                        <div className={s.faqList}>
                                            {faqs.length === 0 && <p className={s.emptyMsg}>No FAQs yet. Click "+ New FAQ" to add one.</p>}
                                            {faqs.map(f => (
                                                <div key={f._id} className={`${s.faqRow} ${!f.published ? s.faqDraft : ''}`}>
                                                    <div className={s.faqQ}>{f.question}<span className={s.faqCat}>{f.category}</span>{!f.published && <span className={s.draftTag}>Draft</span>}</div>
                                                    <div className={s.faqActs}>
                                                        <button className={s.iconSm} onClick={() => openFaqEdit(f)}><Pencil size={13} /></button>
                                                        <button className={`${s.iconSm} ${s.iconDanger}`} onClick={() => setFaqDeleteTarget(f)}><Trash2 size={13} /></button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    {/* Docs redirect */}
                                    <div className={s.contentCard}>
                                        <div className={s.contentCardHead}>
                                            <div className={s.contentCardTitle}><BookOpen size={19} color="#7c3aed" /> Documentation Articles</div>
                                        </div>
                                        <p className={s.docHint}>Documentation articles are managed from the Documentation page — create, edit, delete, and upload video tutorials for each article.</p>
                                        <a href="/docs" className={s.docLink}>Open Documentation Manager →</a>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                    </AnimatePresence>
                </main>
            </div>
        </div>
    );
}
