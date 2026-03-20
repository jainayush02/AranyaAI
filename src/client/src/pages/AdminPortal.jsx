import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext, useNavigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard, Users, Activity, FileText, HelpCircle,
    Search, Lock, Unlock, Trash2, ChevronRight, ChevronLeft, ArrowLeft, ArrowLeftCircle,
    Plus, Minus, Pencil, Save, X, Eye, EyeOff,
    RefreshCw, CheckCircle, AlertCircle, Loader2,
    Crown, TrendingUp, Globe, Clock, UserCheck, UserX,
    ShieldAlert, Zap, MousePointer2, BookOpen, Settings as SettingsIcon,
    Megaphone, FolderOpen, Menu, Video, Calendar, User, Upload,
    ShieldCheck, ShieldOff, Key, UserCog, Mail, AtSign, Network, Shapes,
    ZoomIn, ZoomOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import axios from 'axios';
import AdvancedLoader from '../components/AdvancedLoader';
import s from './AdminPortal.module.css';

const API = '/api';
const authH = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtTime = d => d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';
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
            <div className={s.statIcon} style={{ background: `${color}15`, color }}><Icon size={18} /></div>
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

function VendorIcon({ vendor, icon, color, focused }) {
    const [err, setErr] = useState(false);
    if (err || !vendor || vendor === 'Unknown') {
        return (
            <div style={{ 
                width: '1.2rem', height: '1.2rem', borderRadius: '4px', 
                background: `${color}15`, color: color || '#64748b',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem',
                flexShrink: 0
            }}>
                {icon || '🤖'}
            </div>
        );
    }
    const domainMap = { 
        'OpenAI': 'openai.com', 'Anthropic': 'anthropic.com', 'Google': 'google.com', 
        'Mistral': 'mistral.ai', 'Meta / Llama': 'meta.com', 'NVIDIA': 'nvidia.com', 
        'DeepSeek': 'deepseek.com', 'Alibaba': 'alibaba.com', 'Cohere': 'cohere.com', 
        'Microsoft': 'microsoft.com', 'Upstage': 'upstage.ai', 'Databricks': 'databricks.com', 
        'TII': 'tii.ae', 'Nous': 'nousresearch.com', '01.AI': '01.ai', 'Groq': 'groq.com'
    };
    return (
        <img 
            src={`https://www.google.com/s2/favicons?domain=${domainMap[vendor] || 'huggingface.co'}&sz=64`} 
            alt={vendor} 
            onError={() => setErr(true)}
            style={{ 
                width: '1.2rem', height: '1.2rem', borderRadius: '4px', 
                filter: focused ? 'none' : 'grayscale(30%)',
                flexShrink: 0,
                objectFit: 'contain'
            }} 
        />
    );
}


function ToggleSwitch({ checked, onChange, disabled, label, activeColor = '#2d5f3f' }) {
    return (
        <div 
            className={s.switchWrapper} 
            onClick={() => !disabled && onChange(!checked)}
            style={{ opacity: disabled ? 0.6 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
        >
            <div 
                className={s.switchTrack} 
                style={{ 
                    backgroundColor: checked ? activeColor : '#e2e8f0',
                }}
            >
                <motion.div 
                    className={s.switchThumb}
                    animate={{ x: checked ? 20 : 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
            </div>
            {label && <span className={s.switchLabel} style={{ color: checked ? activeColor : '#64748b' }}>{label}</span>}
        </div>
    );
}

// ── Main ─────────────────────────────────────────

export default function AdminPortal() {
    const navigate = useNavigate();
    const location = useLocation();
    const queryParams = new URLSearchParams(location.search);
    const initialTab = queryParams.get('tab') || 'overview';
    const initialSubTab = queryParams.get('sub') || '';

    const [tab, setTab] = useState(initialTab);
    const [subTab, setSubTab] = useState(initialSubTab); // For Docs
    const [userLogSubTab, setUserLogSubTab] = useState('animals'); // For User details

    // To avoid flicker, we use the values from URL directly for UI rendering
    const activeTab = queryParams.get('tab') || 'overview';
    const activeSubTab = queryParams.get('sub') || '';
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [toasts, setToasts] = useState([]);
    const push = useCallback((msg, type = 'ok') => { const id = Date.now(); setToasts(p => [...p, { id, msg, type }]); }, []);
    const pop = id => setToasts(p => p.filter(t => t.id !== id));

    // Overview
    const [stats, setStats] = useState(null);
    const [overviewLoading, setOverviewLoading] = useState(true);
    const [llmStats, setLlmStats] = useState([]); 
    const [focusedGraphModel, setFocusedGraphModel] = useState(null);
    const [latencyTimeframe, setLatencyTimeframe] = useState('24');
    const [llmHistory, setLlmHistory] = useState([]);
    const [isPinging, setIsPinging] = useState(false);
    const [liveUpdates, setLiveUpdates] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

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
    const [faqsLoading, setFaqsLoading] = useState(false);
    const [faqModal, setFaqModal] = useState(null);
    const [faqSearch, setFaqSearch] = useState('');
    const [faqForm, setFaqForm] = useState({ question: '', answer: '', category: 'General', published: true });
    const [faqDeleteTarget, setFaqDeleteTarget] = useState(null);

    // Docs Hub
    const [articles, setArticles] = useState([]);
    const [articlesLoading, setArticlesLoading] = useState(false);
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
    const [docForm, setDocForm] = useState({ title: '', category: 'getting-started', content: '', steps: '', published: true, videoFile: null, videoUrl: null });
    const [docDeleteTarget, setDocDeleteTarget] = useState(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadSuccess, setUploadSuccess] = useState(false);
    const [videoPreview, setVideoPreview] = useState(null);

    const [pricingLoading, setPricingLoading] = useState(false);
    const [settingsLoading, setSettingsLoading] = useState(false);

    // Animal Taxonomy Management
    const DEFAULT_CATEGORIES = {
        Cow: ['Holstein', 'Jersey', 'Gir', 'Sahiwal', 'Redsindhi'],
        Dog: ['Labrador', 'German Shepherd', 'Golden Retriever', 'Beagle', 'Bulldog'],
        Cat: ['Persian', 'Maine Coon', 'Siamese', 'Ragdoll', 'Bengal'],
        Horse: ['Arabian', 'Thoroughbred', 'Quarter Horse', 'Appaloosa', 'Paint Horse'],
    };
    const [animalCategories, setAnimalCategories] = useState(DEFAULT_CATEGORIES);
    const [taxonomySaving, setTaxonomySaving] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [newBreedName, setNewBreedName] = useState('');
    const [selectedCat, setSelectedCat] = useState('Cow');

    // AI Config
    const [aiConfig, setAiConfig] = useState(null);
    const [aiConfigLoading, setAiConfigLoading] = useState(false);
    const [aiConfigSaving, setAiConfigSaving] = useState(false);
    const [isEditingAi, setIsEditingAi] = useState(false);
    const [showPromptModal, setShowPromptModal] = useState(false);
    const [showPriKey, setShowPriKey] = useState(false);
    const [showFbKey, setShowFbKey] = useState(false);
    const addModel = (engine) => {
        setAiConfig(p => {
            const existingModels = p[engine]?.models || [];
            const newModel = { id: Date.now().toString(), name: 'New Model', type: 'text', modelId: '' };
            return {
                ...p,
                [engine]: { ...p[engine], models: [...existingModels, newModel] }
            };
        });
    };

    const updateModel = (engine, id, field, val) => {
        setAiConfig(p => {
            const existingModels = p[engine]?.models || [];
            const newModels = existingModels.map(m => m.id === id ? { ...m, [field]: val } : m);
            return { ...p, [engine]: { ...p[engine], models: newModels } };
        });
    };

    const removeModel = (engine, id) => {
        setAiConfig(p => {
            const existingModels = p[engine]?.models || [];
            return {
                ...p,
                [engine]: { ...p[engine], models: existingModels.filter(m => m.id !== id) }
            };
        });
    };


    // ── Fetch helpers ────────────────────────────


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
            setUserLogSubTab('animals');
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
        setFaqsLoading(true);
        try {
            const r = await axios.get(`${API}/admin/faqs`, authH());
            setFaqs(r.data);
        } catch { }
        finally { setFaqsLoading(false); }
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

    const fetchAiConfig = useCallback(async () => {
        setSettingsLoading(true);
        try {
            const r = await axios.get(`${API}/admin/config/ai`, authH());
            setAiConfig(r.data);
        } catch { push('Failed to load AI config', 'err'); }
        finally { setSettingsLoading(false); }
    }, [push]);

    // ── Animal Taxonomy helpers ───────────────────
    const fetchTaxonomy = useCallback(async () => {
        try {
            const r = await axios.get(`${API}/settings`, authH());
            if (r.data?.animal_categories && Object.keys(r.data.animal_categories).length > 0) {
                setAnimalCategories(r.data.animal_categories);
            }
        } catch { /* silently fallback to default */ }
    }, []);

    const saveTaxonomy = async (updated, logMsg) => {
        // Optimistic update — update UI immediately
        setAnimalCategories(updated);
        setTaxonomySaving(true);
        try {
            await axios.post(`${API}/settings/update`, { key: 'animal_categories', value: updated }, authH());
            
            // Record in Activity Logs if a message is provided
            if (logMsg) {
                try { await axios.post(`${API}/admin/activity/log`, { action: logMsg, type: 'admin' }, authH()); } catch(e) { console.error('Logging failed', e); }
                fetchOverview(); // Refresh overview logs
            }
            
            push('Saved!');
        } catch (err) {
            console.error('Taxonomy save error:', err);
            push('Failed to save — check your connection', 'err');
        } finally { setTaxonomySaving(false); }
    };

    const handleAddCategory = () => {
        const name = newCategoryName.trim();
        if (!name) return;
        if (animalCategories[name]) return push('Category already exists', 'err');
        const updated = { ...animalCategories, [name]: [] };
        saveTaxonomy(updated, `Added "${name}" to species categories`);
        setNewCategoryName('');
        setSelectedCat(name);
    };

    const handleDeleteCategory = (cat) => {
        if (!window.confirm(`Delete the "${cat}" category and all its breeds?`)) return;
        const updated = { ...animalCategories };
        delete updated[cat];
        saveTaxonomy(updated, `Removed "${cat}" category and all its breeds`);
        if (selectedCat === cat) setSelectedCat(Object.keys(updated)[0] || '');
    };

    const handleAddBreed = () => {
        const name = newBreedName.trim();
        if (!name || !selectedCat) return;
        const breeds = animalCategories[selectedCat] || [];
        if (breeds.includes(name)) return push('Breed already exists', 'err');
        const updated = { ...animalCategories, [selectedCat]: [...breeds, name] };
        saveTaxonomy(updated, `Added "${name}" breed to "${selectedCat}"`);
        setNewBreedName('');
    };

    const handleDeleteBreed = (cat, breed) => {
        const breedToRemove = breed;
        const updated = { ...animalCategories, [cat]: animalCategories[cat].filter(b => b !== breed) };
        saveTaxonomy(updated, `Removed "${breedToRemove}" breed from "${cat}"`);
    };

    const CATEGORY_EMOJI = (cat) => {
        const c = cat.toLowerCase();
        if (c.includes('cow') || c.includes('cattle')) return '🐄';
        if (c.includes('dog')) return '🐕';
        if (c.includes('cat')) return '🐈';
        if (c.includes('horse')) return '🐎';
        if (c.includes('rabbit')) return '🐇';
        if (c.includes('goat')) return '🐐';
        if (c.includes('sheep')) return '🐑';
        if (c.includes('pig')) return '🐖';
        if (c.includes('chicken') || c.includes('poultry')) return '🐓';
        if (c.includes('duck')) return '🦆';
        if (c.includes('fish')) return '🐟';
        return '🐾';
    };


    const saveAiConfig = async (configOverride = null) => {
        const configToSave = configOverride || aiConfig;
        setAiConfigSaving(true);
        try {
            await axios.post(`${API}/admin/config/ai`, configToSave, authH());
            push('AI Configuration updated!');
            if (!configOverride) setIsEditingAi(false);
        } catch { push('Failed to update AI config', 'err'); }
        finally { setAiConfigSaving(false); }
    };

    const toggleEngine = async (engine, val) => {
        const newConfig = { ...aiConfig, [engine]: { ...aiConfig[engine], enabled: val } };
        setAiConfig(newConfig);
        await saveAiConfig(newConfig);
    };


    const fetchOverview = useCallback(async (silent = false) => {
        if (!silent) setOverviewLoading(true);
        else setRefreshing(true);
        try {
            const [sr, lr] = await Promise.all([
                axios.get(`${API}/admin/stats`, authH()),
                axios.get(`${API}/admin/llm-stats`, authH())
            ]);
            setStats(sr.data || {});
            setLlmStats(lr.data || []);
        } catch (e) {
            push('Failed to load overview data.');
        } finally {
            setOverviewLoading(false);
            setRefreshing(false);
        }
    }, [push]);

    const fetchLlmHistory = useCallback(async (modelId) => {
        if (!modelId) return;
        try {
            const res = await axios.get(`${API}/admin/llm-history?modelId=${encodeURIComponent(modelId)}&hours=${latencyTimeframe}`, authH());
            if (res.data) {
                setLlmHistory(res.data);
                
                // If chart is empty, generate initial data points immediately 
                if (res.data.length === 0 && !isPinging) {
                    setIsPinging(true);
                    try {
                        // Perform 2 rapid pings to show an initial trend
                        for (let i = 0; i < 2; i++) {
                            const pingRes = await axios.get(`${API}/admin/ping-model/${encodeURIComponent(modelId)}`, authH());
                            if (pingRes.data.success) {
                                setLlmHistory(prev => [...prev.slice(-49), { timestamp: pingRes.data.timestamp, latency: pingRes.data.latency }]);
                            }
                            if (i < 1) await new Promise(r => setTimeout(r, 1200));
                        }
                    } finally { setIsPinging(false); }
                }
            }
        } catch (e) { 
            console.error('History fetch failed:', e); 
            setLlmHistory([]);
        }
    }, [latencyTimeframe, isPinging]);

    // Sync state with URL
    useEffect(() => {
        const q = new URLSearchParams(location.search);
        const t = q.get('tab') || 'overview';
        const s = q.get('sub') || '';
        if (t !== tab) setTab(t);
        if (s !== subTab) setSubTab(s);
    }, [location.search, tab, subTab]);

    // Real-time poll (reduced frequency and made background-compatible)
    useEffect(() => {
        if (tab !== 'overview' || !liveUpdates) return;
        const interval = setInterval(() => fetchOverview(true), 120000); // Poll every 2 mins instead of 30s
        return () => clearInterval(interval);
    }, [tab, liveUpdates, fetchOverview]);

    useEffect(() => {
        if (tab === 'adminaccess' && liveUpdates) {
            const interval = setInterval(fetchAdminAccess, 120000);
            return () => clearInterval(interval);
        }
    }, [tab, liveUpdates, fetchAdminAccess]);

    useEffect(() => {
        if (tab === 'overview') {
            fetchOverview();
        }
    }, [tab, fetchOverview]);

    useEffect(() => {
        if (tab === 'overview' && focusedGraphModel) {
            fetchLlmHistory(focusedGraphModel);
        }
    }, [tab, focusedGraphModel, fetchLlmHistory]);
    useEffect(() => {
        if (llmStats.length > 0 && !focusedGraphModel) {
            const firstModel = llmStats[0]?.models?.[0]?.modelId;
            if (firstModel) setFocusedGraphModel(firstModel);
        }
    }, [llmStats, focusedGraphModel]);

    useEffect(() => { if (activeTab === 'users' && !focusedUser) fetchUsers(); }, [activeTab, fetchUsers, focusedUser]);
    useEffect(() => { if (activeTab === 'logs') fetchLogs(); }, [activeTab, fetchLogs]);
    useEffect(() => { if (activeTab === 'content') fetchFaqs(); }, [activeTab, fetchFaqs]);
    useEffect(() => { if (activeTab === 'docs') fetchArticles(); }, [activeTab, fetchArticles]);
    useEffect(() => { if (activeTab === 'adminaccess') fetchAdminAccess(); }, [activeTab, fetchAdminAccess]);
    useEffect(() => { if (activeTab === 'settings') fetchAiConfig(); }, [activeTab, fetchAiConfig]);
    useEffect(() => { if (activeTab === 'taxonomy') fetchTaxonomy(); }, [activeTab, fetchTaxonomy]);

    useEffect(() => {
        if (activeTab === 'pricing') {
            setPricingLoading(true);
            setTimeout(() => setPricingLoading(false), 300); // Small delay for effect
        }
    }, [activeTab]);

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
    const openDocEdit = doc => {
        setDocForm({
            title: doc.title,
            category: doc.category,
            content: doc.content || '',
            steps: doc.steps ? doc.steps.join('\n') : '',
            published: doc.published !== false,
            videoFile: null,
            videoUrl: doc.videoUrl || null
        });
        setVideoPreview(null);
        setDocModal(doc);
    };
    const openDocCreate = () => {
        setDocForm({ title: '', category: subTab || 'getting-started', content: '', steps: '', published: true, videoFile: null, videoUrl: null });
        setVideoPreview(null);
        setDocModal('create');
    };

    const handleVideoSelect = (file) => {
        if (videoPreview) URL.revokeObjectURL(videoPreview);
        setDocForm(p => ({ ...p, videoFile: file }));
        if (file) setVideoPreview(URL.createObjectURL(file));
        else setVideoPreview(null);
    };

    const removeVideo = async () => {
        // If it's a new file selected but not saved
        if (docForm.videoFile) {
            setDocForm(p => ({ ...p, videoFile: null }));
            if (videoPreview) URL.revokeObjectURL(videoPreview);
            setVideoPreview(null);
            return;
        }

        // If it's an existing video on the server
        if (docForm.videoUrl) {
            if (!window.confirm("Are you sure you want to delete this video permanently?")) return;

            try {
                // If it's an existing article, delete from server
                if (docModal && docModal._id) {
                    await axios.delete(`${API}/docs/${docModal._id}/video`, authH());
                }

                setDocForm(p => ({ ...p, videoUrl: null }));
                push('Video removed');
                fetchArticles();
            } catch (err) {
                console.error('Remove video error:', err);
                push('Failed to remove video', 'err');
            }
        }
    };

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
                setIsUploading(true);
                try {
                    // 1. Get Cloudinary Auth parameters from backend
                    const authR = await axios.get(`${API}/docs/admin/cloudinary-auth`, authH());
                    const { signature, timestamp, cloud_name, api_key, folder } = authR.data;

                    // 2. Upload directly to Cloudinary
                    const fd = new FormData();
                    fd.append('file', docForm.videoFile);
                    fd.append('api_key', api_key);
                    fd.append('timestamp', timestamp);
                    fd.append('signature', signature);
                    fd.append('folder', folder);

                    const cloudUrl = `https://api.cloudinary.com/v1_1/${cloud_name}/video/upload`;
                    const uploadR = await axios.post(cloudUrl, fd, {
                        onUploadProgress: (pe) => {
                            const pct = Math.round((pe.loaded * 100) / pe.total);
                            setUploadProgress(pct);
                        }
                    });

                    const videoUrl = uploadR.data.secure_url;
                    const cloudFileId = uploadR.data.public_id;

                    // 3. Update the article in MongoDB with the new video URL
                    await axios.put(`${API}/docs/${savedId}`, {
                        videoUrl,
                        videoTitle: docForm.videoFile.name,
                        cloudFileId
                    }, authH());

                    setUploadSuccess(true);
                    setTimeout(() => setUploadSuccess(false), 3500);
                } catch (err) {
                    console.error('Cloudinary Upload error:', err);
                    push('Video upload failed. Check file size or connection.', 'err');
                } finally {
                    setIsUploading(false);
                    setUploadProgress(0);
                }
            }

            push(docModal === 'create' ? 'Article created!' : 'Article updated!');
            setDocModal(null);
            fetchArticles();
        } catch (err) {
            console.error('Save doc err:', err);
            push(err.response?.data?.message || 'Save failed', 'err');
        } finally {
            setIsUploading(false);
        }
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
        { id: 'taxonomy', label: 'Aranya Taxonomy', icon: Shapes },
        { id: 'settings', label: 'System Configuration', icon: SettingsIcon },
        { id: 'adminaccess', label: 'Admin Access', icon: ShieldCheck },
    ];

    const handleTabClick = (t) => {
        navigate(`?tab=${t.id}`, { replace: true });
    };

    // Banner info based on tab
    const bannerInfo = {
        overview: { title: 'BUSINESS', subtitle: 'OVERVIEW', desc: 'Real-time business metrics and platform performance', icon: LayoutDashboard },
        users: { title: 'USER', subtitle: 'DIRECTORY', desc: 'Manage, search, and moderate all platform users', icon: Users },
        logs: { title: 'ACTIVITY', subtitle: 'LOGS', desc: 'Monitor all platform events and user actions', icon: Activity },
        content: { title: 'CONTENT', subtitle: 'MANAGER', desc: 'Manage Help Center FAQs and Documentation', icon: HelpCircle },
        docs: { title: 'KNOWLEDGE', subtitle: 'BASE', desc: 'Create and organize platform guides and help articles', icon: BookOpen },
        pricing: { title: 'PRICING', subtitle: 'PLANS', desc: 'Manage subscription tiers and payment settings', icon: Crown },
        taxonomy: { title: 'ARANYA', subtitle: 'TAXONOMY', desc: 'Manage animal categories and breed registry across the platform', icon: Shapes },
        settings: { title: 'SYSTEM', subtitle: 'CONFIG', desc: 'Configure platform-wide security and infrastructure', icon: SettingsIcon },
        adminaccess: { title: 'ADMIN', subtitle: 'ACCESS', desc: 'Grant & revoke administrator privileges — handle with care', icon: ShieldCheck },
    };
    const currentBanner = bannerInfo[activeTab] || bannerInfo.overview;
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
                                    <div className={s.videoUploadSection}>
                                        <label>Tutorial Video</label>

                                        {/* Preview Area */}
                                        {(videoPreview || docForm.videoUrl) && (
                                            <div className={s.videoPreviewWrap}>
                                                <video
                                                    src={videoPreview || docForm.videoUrl}
                                                    controls
                                                    playsInline
                                                    preload="metadata"
                                                    
                                                    className={s.videoPreviewObj}
                                                />
                                                <div className={s.videoPreviewBadge}>
                                                    {videoPreview ? 'New Selection' : (!docForm.videoUrl ? 'No Video Link' : (docForm.videoUrl.startsWith('/uploads') ? 'Local Save (Vercel Incompatible)' : 'Saved to Cloud'))}
                                                </div>
                                                <button className={s.removeVideoBtn} onClick={removeVideo} type="button">
                                                    <Trash2 size={14} /> Remove Video
                                                </button>
                                            </div>
                                        )}

                                        {!videoPreview && !docForm.videoUrl && (
                                            <div className={s.dropZone}>
                                                <Video size={40} className={s.dropIcon} />
                                                <p>Upload a tutorial video to help your users</p>
                                                <label className={s.fileLabel}>
                                                    <Upload size={14} /> Choose Video File
                                                    <input
                                                        type="file"
                                                        accept="video/*"
                                                        hidden
                                                        onChange={e => handleVideoSelect(e.target.files[0])}
                                                    />
                                                </label>
                                            </div>
                                        )}
                                    </div>
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
                                {isUploading && (
                                    <div className={s.progressRow}>
                                        <div className={s.progressInfo}>
                                            <span>Uploading Video...</span>
                                            <span>{uploadProgress}%</span>
                                        </div>
                                        <div className={s.progressTrack}>
                                            <motion.div
                                                className={s.progressBar}
                                                initial={{ width: 0 }}
                                                animate={{ width: `${uploadProgress}%` }}
                                                transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                                            />
                                        </div>
                                    </div>
                                )}
                                {uploadSuccess && (
                                    <motion.div
                                        className={s.successMsg}
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ type: 'spring' }}
                                    >
                                        <CheckCircle size={16} /> Video Uploaded Successfully!
                                    </motion.div>
                                )}
                            </div>
                            <div className={s.editorFoot} style={{ justifyContent: 'center' }}>
                                <button className={s.cancelSm} onClick={() => setDocModal(null)} disabled={isUploading}>Cancel</button>
                                <button
                                    className={`${s.saveBtn} ${isUploading ? s.btnLoading : ''}`}
                                    onClick={saveDoc}
                                    style={{ background: '#2d5f3f', color: '#fff' }}
                                    disabled={isUploading}
                                >
                                    {isUploading ? (
                                        <><Loader2 size={14} className={s.spin} /> Uploading...</>
                                    ) : (
                                        <><Save size={14} /> Save Article</>
                                    )}
                                </button>
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
                            const isActive = activeTab === t.id;
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
                        <div className={s.sidebarFooter}>
                            <button className={s.navItem} onClick={() => navigate('/dashboard')} style={{ marginTop: 'auto', borderTop: '1px solid #f1f5f9', paddingTop: '1rem', borderRadius: 0 }}>
                                <ArrowLeftCircle size={17} />
                                {isSidebarOpen && <span>Exit Portal</span>}
                            </button>
                        </div>
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
                            {activeTab === 'overview' && (
                                <motion.div key="ov" className={s.section}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.3 }}>
                                    {/* Header with Poll Controls */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
                                        <div>
                                            <h2 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#0f172a', margin: 0 }}>Business Platform Overview</h2>
                                            <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '4px 0 0' }}>Real-time growth and system status metrics.</p>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                                            <div 
                                                onClick={() => setLiveUpdates(!liveUpdates)}
                                                style={{ 
                                                    display: 'flex', alignItems: 'center', gap: '8px', 
                                                    padding: '6px 14px', borderRadius: '99px',
                                                    background: liveUpdates ? '#f0fdf4' : '#f8fafc',
                                                    border: `1px solid ${liveUpdates ? '#10b98140' : '#e2e8f0'}`,
                                                    cursor: 'pointer', transition: 'all 0.2s ease'
                                                }}
                                            >
                                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: liveUpdates ? '#10b981' : '#94a3b8', boxShadow: liveUpdates ? '0 0 8px #10b981' : 'none' }} />
                                                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: liveUpdates ? '#166534' : '#64748b' }}>
                                                    {liveUpdates ? 'LIVE UPDATES ON' : 'AUTO UPDATES OFF'}
                                                </span>
                                            </div>
                                            <button 
                                                onClick={() => fetchOverview()}
                                                disabled={refreshing}
                                                style={{ 
                                                    display: 'flex', alignItems: 'center', gap: '8px', 
                                                    padding: '6px 16px', borderRadius: '12px',
                                                    background: '#fff', border: '1px solid #e2e8f0',
                                                    fontSize: '0.75rem', fontWeight: 700, color: '#0f172a',
                                                    cursor: 'pointer', transition: 'all 0.2s ease',
                                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.borderColor = '#3b82f6'}
                                                onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                                            >
                                                <RefreshCw size={14} className={refreshing ? 'spinning' : ''} style={{ transition: 'transform 0.5s ease' }} />
                                                {refreshing ? 'Refreshing...' : 'Refresh Now'}
                                            </button>
                                        </div>
                                    </div>

                                    {overviewLoading ? (
                                        <AdvancedLoader type="home" compact={false} fullScreen={false} />
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

                                            <div className={s.llmStatsCard} style={{ marginTop: '2rem', padding: '1.5rem', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                                                <div className={s.actCardHead} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                                    <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <Zap size={20} color="#3b82f6" /> Real-time LLM Usage & Configuration
                                                    </h2>
                                                    <button className={s.linkBtn} onClick={() => setTab('settings')}>Configure Models →</button>
                                                </div>
                                                {llmStats.length === 0 ? (
                                                    <p className={s.emptyMsg} style={{ padding: '2rem', textAlign: 'center' }}>No LLM configuration found.</p>
                                                ) : (
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
                                                        {llmStats.map((st, i) => (
                                                            <div key={i} style={{
                                                                background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                                                                borderRadius: '16px',
                                                                border: '1px solid #e2e8f0',
                                                                overflow: 'hidden',
                                                                boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.02)',
                                                                transition: 'box-shadow 0.2s, transform 0.2s',
                                                            }}
                                                            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                                                            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.02)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                                                            >
                                                                {/* Card Header */}
                                                                <div style={{
                                                                    padding: '1.25rem',
                                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                                    borderBottom: '1px solid #f1f5f9'
                                                                }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                        <span style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>{st.provider}</span>
                                                                        <span style={{ fontSize: '0.6rem', fontWeight: 800, color: st.role === 'Primary' ? '#3b82f6' : '#94a3b8', background: st.role === 'Primary' ? '#eff6ff' : '#f8fafc', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>{st.role}</span>
                                                                    </div>
                                                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: st.status === 'Active' ? '#10b981' : '#ef4444' }} />
                                                                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>{st.status}</span>
                                                                        </div>
                                                                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>{typeof st.latency === 'number' ? `${st.latency}ms` : 'Unknown'}</span>
                                                                    </div>
                                                                </div>

                                                                {/* Card Body */}
                                                                <div style={{ padding: '1.25rem' }}>
                                                                    {/* Clean Stats Row */}
                                                                    <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.25rem', background: '#f8fafc', padding: '0.8rem 1rem', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                                                                        <div>
                                                                            <div style={{ fontSize: '0.55rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Used</div>
                                                                            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e293b' }}>{typeof st.usage === 'number' ? `$${st.usage.toFixed(4)}` : st.usage}</div>
                                                                        </div>
                                                                        <div style={{ width: '1px', background: '#e2e8f0' }} />
                                                                        <div>
                                                                            <div style={{ fontSize: '0.55rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Remaining</div>
                                                                            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e293b' }}>{st.limitRemaining || '—'}</div>
                                                                        </div>
                                                                    </div>

                                                                    <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 700, color: '#94a3b8', marginBottom: '0.6rem', letterSpacing: '0.06em' }}>
                                                                        Active Models ({st.models.length})
                                                                    </div>
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                        {st.models.map((m, mi) => (
                                                                            <div key={mi} 
                                                                                onClick={() => setFocusedGraphModel(m.modelId)}
                                                                                title="Track model latency"
                                                                                style={{
                                                                                    display: 'flex', alignItems: 'center', gap: '12px',
                                                                                    padding: '0.75rem 1rem',
                                                                                    background: focusedGraphModel === m.modelId ? '#eff6ff' : 'transparent',
                                                                                    borderRadius: '12px',
                                                                                    border: focusedGraphModel === m.modelId ? '1px solid #3b82f6' : '1px solid transparent',
                                                                                    cursor: 'pointer',
                                                                                    transition: 'all 0.15s ease-out',
                                                                                }}
                                                                                onMouseEnter={e => { if (focusedGraphModel !== m.modelId) e.currentTarget.style.background = '#f8fafc'; }}
                                                                                onMouseLeave={e => { if (focusedGraphModel !== m.modelId) e.currentTarget.style.background = 'transparent'; }}
                                                                            >
                                                                                <VendorIcon vendor={m.vendor} icon={m.icon} color={m.color} focused={focusedGraphModel === m.modelId} />
                                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                                    <div style={{ fontSize: '0.85rem', fontWeight: focusedGraphModel === m.modelId ? 800 : 700, color: focusedGraphModel === m.modelId ? '#2563eb' : '#334155', wordBreak: 'break-all' }}>
                                                                                        {m.modelId.split('/').pop()}
                                                                                    </div>
                                                                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                        <span>{m.vendor} model via {m.host || st.provider}</span>
                                                                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: 0.8 }} title="Specific model inference latency">
                                                                                             <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: typeof m.latency === 'number' ? (m.latency < 300 ? '#10b981' : m.latency < 700 ? '#f59e0b' : '#ef4444') : '#94a3b8' }} />
                                                                                             {typeof m.latency === 'number' ? `${m.latency}ms` : 'Unknown'}
                                                                                         </span>
                                                                                    </div>
                                                                                </div>
                                                                                <span style={{
                                                                                    fontSize: '0.58rem', fontWeight: 800,
                                                                                    padding: '3px 8px', borderRadius: '6px',
                                                                                    background: m.type?.toLowerCase().includes('vision') ? '#faf5ff' : '#f0fdf4',
                                                                                    color: m.type?.toLowerCase().includes('vision') ? '#9333ea' : '#166534',
                                                                                    textTransform: 'uppercase',
                                                                                    letterSpacing: '0.04em'
                                                                                }}>
                                                                                    {m.type}
                                                                                </span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* ── PERFORMANCE TRENDS (GRAPHS) ── */}
                                            {!overviewLoading && llmStats.length > 0 && (
                                                <div style={{ marginTop: '2.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
                                                    
                                                    {/* Latency History Graph */}
                                                    <div style={{ background: '#fff', borderRadius: '20px', padding: '1.5rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                                                <div>
                                                                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                                                                        {focusedGraphModel ? `Latency: ${focusedGraphModel.split('/').pop()}` : 'Latency Performance'}
                                                                    </h3>
                                                                    <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '4px 0 0' }}>
                                                                        {focusedGraphModel ? 'Tracking specific model performance' : `Response time in ms (Last ${latencyTimeframe} hours)`}
                                                                        {focusedGraphModel && (
                                                                            <span 
                                                                                onClick={(e) => { e.stopPropagation(); setFocusedGraphModel(null); }}
                                                                                style={{ color: '#3b82f6', marginLeft: '8px', cursor: 'pointer', fontWeight: 700, textDecoration: 'underline' }}
                                                                            >
                                                                                Reset
                                                                            </span>
                                                                        )}
                                                                    </p>
                                                                </div>
                                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                                    <div style={{ display: 'flex', background: '#f1f5f9', padding: '2px', borderRadius: '99px', alignItems: 'center', border: '1px solid #e2e8f0', height: '28px' }}>
                                                                        <button 
                                                                            onClick={() => {
                                                                                const steps = [1, 2, 4, 6, 12, 24, 48, 72, 168];
                                                                                const current = parseInt(latencyTimeframe);
                                                                                const idx = steps.slice().reverse().findIndex(s => s < current);
                                                                                if (idx !== -1) setLatencyTimeframe(steps.slice().reverse()[idx].toString());
                                                                            }}
                                                                            disabled={latencyTimeframe === '1'}
                                                                            style={{ width: '22px', height: '22px', borderRadius: '50%', border: 'none', background: '#fff', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.08)', marginLeft: '2px', opacity: latencyTimeframe === '1' ? 0.4 : 1 }}
                                                                        >
                                                                            <Minus size={10} strokeWidth={4} />
                                                                        </button>
                                                                        
                                                                        <div style={{ padding: '0 10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                                            <span style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Window</span>
                                                                            <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#0f172a' }}>
                                                                                {latencyTimeframe === '168' ? 'Weekly' : (latencyTimeframe >= 24 ? `${Math.floor(latencyTimeframe/24)}d` : `${latencyTimeframe}h`)}
                                                                            </span>
                                                                        </div>

                                                                        <button 
                                                                            onClick={() => {
                                                                                const steps = [1, 2, 4, 6, 12, 24, 48, 72, 168];
                                                                                const current = parseInt(latencyTimeframe);
                                                                                const step = steps.find(s => s > current);
                                                                                if (step) setLatencyTimeframe(step.toString());
                                                                            }}
                                                                            disabled={latencyTimeframe === '168'}
                                                                            style={{ width: '22px', height: '22px', borderRadius: '50%', border: 'none', background: '#fff', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.08)', marginRight: '2px', opacity: latencyTimeframe === '168' ? 0.4 : 1 }}
                                                                        >
                                                                            <Plus size={10} strokeWidth={4} />
                                                                        </button>
                                                                    </div>
                                                                    
                                                                    <div style={{ display: 'flex', gap: '6px' }}>
                                                                        <div style={{ 
                                                                            background: liveUpdates ? '#f0fdf4' : '#f8fafc', 
                                                                            padding: '0 12px', 
                                                                            borderRadius: '99px', 
                                                                            fontSize: '0.64rem', 
                                                                            color: liveUpdates ? '#10b981' : '#64748b', 
                                                                            fontWeight: 800, 
                                                                            border: `1px solid ${liveUpdates ? '#10b98140' : '#e2e8f0'}`, 
                                                                            height: '28px', 
                                                                            display: 'flex', 
                                                                            alignItems: 'center',
                                                                            gap: '6px',
                                                                            transition: 'all 0.3s ease'
                                                                        }}>
                                                                            {liveUpdates && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} className="pulse" />}
                                                                            LIVE
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div style={{ height: '240px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                                                {llmHistory.length === 0 ? (
                                                                    <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                                                                        <Activity size={24} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                                                                        <p>No data collected for this window yet</p>
                                                                    </div>
                                                                ) : (
                                                                    <ResponsiveContainer>
                                                                        <AreaChart data={llmHistory.map(h => ({
                                                                                h: fmtTime(h.timestamp),
                                                                                ms: h.latency
                                                                            }))}>
                                                                            <defs>
                                                                                <linearGradient id="colorms" x1="0" y1="0" x2="0" y2="1">
                                                                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                                                                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                                                                </linearGradient>
                                                                            </defs>
                                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                                            <XAxis dataKey="h" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} dy={10} />
                                                                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} unit="ms" />
                                                                            <Tooltip 
                                                                                contentStyle={{ background: 'rgba(255,255,255,0.95)', border: 'none', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '12px' }}
                                                                                itemStyle={{ color: '#3b82f6', fontWeight: 700 }}
                                                                            />
                                                                            <Area type="monotone" dataKey="ms" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorms)" animationDuration={1500} />
                                                                        </AreaChart>
                                                                    </ResponsiveContainer>
                                                                )}
                                                            </div>
                                                    </div>

                                                    {/* Usage Distribution Bar Chart */}
                                                    <div style={{ background: '#fff', borderRadius: '20px', padding: '1.5rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                                            <div>
                                                                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Usage Distribution</h3>
                                                                <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '4px 0 0' }}>Request volume by provider (Weekly)</p>
                                                            </div>
                                                            <div style={{ 
                                                                background: '#f0fdf4', 
                                                                padding: '0 12px', 
                                                                borderRadius: '99px', 
                                                                fontSize: '0.64rem', 
                                                                color: '#10b981', 
                                                                fontWeight: 800, 
                                                                border: '1px solid #10b98140', 
                                                                height: '28px', 
                                                                display: 'flex', 
                                                                alignItems: 'center',
                                                                gap: '6px'
                                                            }}>
                                                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                                                                STABLE
                                                            </div>
                                                        </div>
                                                        <div style={{ height: '240px', width: '100%' }}>
                                                            <ResponsiveContainer>
                                                                <BarChart data={[...Array(7)].map((_, i) => {
                                                                    const d = new Date();
                                                                    d.setDate(d.getDate() - (6 - i));
                                                                    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                                                                    const isToday = i === 6;
                                                                    return {
                                                                        name: isToday ? 'Today' : `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]}`,
                                                                        val: [120, 190, 300, 240, 320, 210, 280][i] // Mock values for the rolling window
                                                                    };
                                                                })}>
                                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} dy={10} />
                                                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                                                    <Tooltip 
                                                                        cursor={{ fill: '#f8fafc' }}
                                                                        contentStyle={{ background: 'rgba(255,255,255,0.95)', border: 'none', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '12px' }}
                                                                    />
                                                                    <Bar dataKey="val" radius={[6, 6, 0, 0]} barSize={24} animationDuration={2000}>
                                                                        {[...Array(7)].map((_, index) => (
                                                                            <Cell key={index} fill={index === 6 ? '#3b82f6' : '#e2e8f0'} />
                                                                        ))}
                                                                    </Bar>
                                                                </BarChart>
                                                            </ResponsiveContainer>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </motion.div>
                            )}

                            {/* ── USERS ── */}
                            {activeTab === 'users' && (
                                <motion.div key="us" className={s.section}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.3 }}>
                                    {focusedUser ? (
                                        <div>
                                            <button className={s.backBtn} onClick={() => setFocusedUser(null)}><ChevronLeft size={15} /> Back to Users</button>
                                            {focusLoading ? (
                                                <AdvancedLoader type="profile" compact={false} fullScreen={false} />
                                            ) : (
                                                <div className={s.userDetailGrid} style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 0.35fr) 1fr', gap: '1rem', alignItems: 'stretch', maxHeight: '800px' }}>
                                                    <div className={s.userCard} style={{ background: '#fff', borderRadius: '24px', border: '1px solid #e2e8f0', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.03)', height: '100%', minHeight: '650px' }}>
                                                        <div className={s.bigAvatar} style={{ background: '#2d5f3f', color: '#fff', borderRadius: '16px', width: '64px', height: '64px', fontSize: '1.5rem' }}>{(focusedUser.user?.full_name || focusedUser.user?.email || '?')[0].toUpperCase()}</div>
                                                        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '1rem', color: '#0f172a' }}>{focusedUser.user?.full_name || '(no name)'}</h2>
                                                        <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1rem' }}>{focusedUser.user?.email || focusedUser.user?.mobile}</p>
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
                                                                    onClick={() => setUserLogSubTab('animals')}
                                                                    style={{
                                                                        padding: '0.6rem 1.4rem', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 700, border: 'none', cursor: 'pointer', zIndex: 1, position: 'relative',
                                                                        background: 'transparent',
                                                                        color: (userLogSubTab === 'animals') ? '#166534' : '#64748b',
                                                                        transition: 'color 0.3s ease'
                                                                    }}
                                                                >
                                                                    {(userLogSubTab === 'animals') && (
                                                                        <motion.div layoutId="subTabPill" style={{ position: 'absolute', inset: 0, background: '#fff', borderRadius: '8px', zIndex: -1, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }} transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }} />
                                                                    )}
                                                                    Animal Log
                                                                </button>
                                                                <button
                                                                    onClick={() => setUserLogSubTab('activity')}
                                                                    style={{
                                                                        padding: '0.6rem 1.4rem', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 700, border: 'none', cursor: 'pointer', zIndex: 1, position: 'relative',
                                                                        background: 'transparent',
                                                                        color: userLogSubTab === 'activity' ? '#166534' : '#64748b',
                                                                        transition: 'color 0.3s ease'
                                                                    }}
                                                                >
                                                                    {userLogSubTab === 'activity' && (
                                                                        <motion.div layoutId="subTabPill" style={{ position: 'absolute', inset: 0, background: '#fff', borderRadius: '8px', zIndex: -1, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }} transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }} />
                                                                    )}
                                                                    Activity Log
                                                                </button>
                                                            </div>
                                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', background: '#f8fafc', padding: '4px 10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                                {(userLogSubTab === 'animals') ? `${(focusedUser.animals || []).length} Records` : `${(focusedUser.logs || []).length} Actions`}
                                                            </div>
                                                        </div>

                                                        <AnimatePresence mode="wait">
                                                            {(userLogSubTab === 'animals') ? (
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
                                                                        <div className={s.customScroll} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem' }}>
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
                                                                                        <div style={{ width: '40px', height: '40px', borderRadius: '14px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#166534', fontWeight: 800, fontSize: '1rem' }}>{a.name?.[0].toUpperCase()}</div>
                                                                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                                            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a' }}>{a.name}</span>
                                                                                            <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{a.type || 'Livestock'}</span>
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
                                                                        <div className={s.customScroll} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem' }}>
                                                                            {(focusedUser.logs || []).map((log, idx) => (
                                                                                <motion.div
                                                                                    key={log._id}
                                                                                    initial={{ opacity: 0, y: 15 }}
                                                                                    animate={{ opacity: 1, y: 0 }}
                                                                                    transition={{ delay: idx * 0.03 }}
                                                                                    style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: '16px', padding: '1.25rem', display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) 100px 120px', alignItems: 'center', gap: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)', transition: 'all 0.3s ease' }}
                                                                                    whileHover={{ scale: 1.01, borderColor: '#2d5f3f', boxShadow: '0 10px 15px -3px rgba(45, 95, 63, 0.05)' }}
                                                                                >
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                                                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: log.type === 'admin' ? '#f59e0b' : log.type === 'animal_registry' ? '#10b981' : '#3b82f6', flexShrink: 0, boxShadow: `0 0 10px ${log.type === 'admin' ? 'rgba(245,158,11,0.3)' : log.type === 'animal_registry' ? 'rgba(16,185,129,0.3)' : 'rgba(59,130,246,0.3)'}` }} />
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
                                                    <option value="caretaker">Care Circle Members</option>
                                                    <option value="admin">Administrators</option>
                                                </select>
                                            </div>
                                            {usersLoading ? <AdvancedLoader type="profile" compact={false} fullScreen={false} /> : (
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
                                                                                    {u.role === 'caretaker' && <span className={`${s.pill}`} style={{ padding: '2px 6px', fontSize: '10px', background: '#ecfdf5', color: '#059669', border: '1px solid #d1fae5' }}>Care Circle</span>}
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
                            {activeTab === 'logs' && (
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
                                        <AdvancedLoader type="activity" compact={false} fullScreen={false} />
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
                            {activeTab === 'content' && (
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

                                        {faqsLoading ? (
                                            <AdvancedLoader type="help" compact={false} fullScreen={false} />
                                        ) : (
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
                                        )}
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
                                                        {activeSubTab.replace('-', ' ')}
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
                                                            <tr>
                                                                <td colSpan="4" style={{ padding: '0' }}>
                                                                    <AdvancedLoader type="docs" compact={true} fullScreen={false} />
                                                                </td>
                                                            </tr>
                                                        ) : articles.filter(a => a.category.toLowerCase().replace(/\s+/g, '-') === activeSubTab).length === 0 ? (
                                                            <tr><td colSpan="4" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>No articles found in this category.</td></tr>
                                                        ) : (
                                                            articles.filter(a => a.category.toLowerCase().replace(/\s+/g, '-') === activeSubTab).map(art => (
                                                                <tr key={art._id}>
                                                                    <td style={{ fontWeight: 600 }}>
                                                                        {art.title}
                                                                        {art.videoUrl && (
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', fontSize: '0.65rem' }}>
                                                                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: art.videoUrl?.startsWith('/uploads') ? '#f43f5e' : '#10b981' }} />
                                                                                <span style={{ color: art.videoUrl?.startsWith('/uploads') ? '#f43f5e' : '#64748b' }}>
                                                                                    {art.videoUrl?.startsWith('/uploads') ? 'Local Video (Needs Re-upload)' : 'Cloud Managed'}
                                                                                </span>
                                                                            </div>
                                                                        )}
                                                                    </td>
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
                            {activeTab === 'pricing' && (
                                <motion.div key="pr" className={s.section} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
                                    <div className={s.sectionHead}>
                                        <div />
                                        <button className={s.primaryBtn} onClick={() => navigate('/settings?tab=pricing')}><Crown size={16} /> Subscription Settings</button>
                                    </div>

                                    {pricingLoading ? (
                                        <AdvancedLoader type="pricing" compact={false} fullScreen={false} />
                                    ) : (
                                        <>

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
                                        </>
                                    )}
                                </motion.div>
                            )}

                            {/* ── SETTINGS ── */}
                            {tab === 'settings' && (
                                <motion.div key="st" className={s.section} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
                                    <div className={s.sectionHead}>
                                        <div />
                                        <button className={s.primaryBtn} onClick={() => navigate('/settings?tab=advanced')}><SettingsIcon size={16} /> Advanced Config</button>
                                    </div>

                                    {settingsLoading ? (
                                        <AdvancedLoader type="settings" compact={false} fullScreen={false} />
                                    ) : (
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

                                            {aiConfig && (
                                                <div className={s.contentCard}>
                                                    <div className={s.contentCardHead}>
                                                        <div className={s.contentCardTitle}>
                                                            <div style={{ width: 44, height: 44, borderRadius: '14px', background: 'rgba(139, 92, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                <FileText size={22} color="#8b5cf6" />
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '1rem' }}>System Integrity & Protocol</div>
                                                                <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>Global rules for Arion's clinical behavior</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '20px', border: '1.5px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                                                            <div className={`${s.badge} ${s.badgeSuccess}`}>Active Persona</div>
                                                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>Arion Multimodal Assistant V2</p>
                                                        </div>
                                                        <button
                                                            className={`${s.premiumButton} ${s.btnPrimary}`}
                                                            onClick={() => setShowPromptModal(true)}
                                                            style={{ padding: '0.6rem 1.25rem', fontSize: '0.85rem' }}
                                                        >
                                                            <Pencil size={15} /> Edit Instructions
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {aiConfig && (
                                                <div className={s.contentCard} style={{ gridColumn: '1 / -1' }}>
                                                    <div className={s.contentCardHead}>
                                                        <div className={s.contentCardTitle}>
                                                            <div style={{ width: 42, height: 42, borderRadius: '14px', background: 'rgba(245, 158, 11, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                <Zap size={22} color="#f59e0b" />
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '1.1rem' }}>AI Model Routing Architecture</div>
                                                                <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>Configure primary and alternate providers</div>
                                                            </div>
                                                        </div>
                                                        {!isEditingAi ? (
                                                            <button
                                                                className={`${s.premiumButton} ${s.btnSecondary}`}
                                                                onClick={() => setIsEditingAi(true)}
                                                                style={{ padding: '0.6rem 1.25rem', fontSize: '0.85rem' }}
                                                            >
                                                                <Pencil size={15} /> Edit Routing
                                                            </button>
                                                        ) : (
                                                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                                                <button
                                                                    className={`${s.premiumButton} ${s.btnSecondary}`}
                                                                    onClick={() => { setIsEditingAi(false); fetchAiConfig(); }}
                                                                    disabled={aiConfigSaving}
                                                                    style={{ padding: '0.6rem 1.25rem', fontSize: '0.85rem' }}
                                                                >
                                                                    Cancel
                                                                </button>
                                                                <button
                                                                    className={`${s.premiumButton} ${s.btnPrimary}`}
                                                                    onClick={async () => { await saveAiConfig(); setIsEditingAi(false); }}
                                                                    disabled={aiConfigSaving}
                                                                    style={{ padding: '0.6rem 1.5rem', fontSize: '0.85rem' }}
                                                                >
                                                                    {aiConfigSaving ? <Loader2 size={16} className={s.spin} /> : <Save size={16} />}
                                                                    {aiConfigSaving ? ' Saving...' : ' Save Architecture'}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className={s.aiConfigGrid}>
                                                        {/* Primary Engine */}
                                                        <div style={{ background: '#ffffff', padding: '2rem', borderRadius: '24px', border: '1.5px solid #f1f5f9', boxShadow: '0 4px 20px rgba(0,0,0,0.02)', position: 'relative', opacity: isEditingAi ? 1 : 0.85 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem' }}>
                                                                <h4 style={{ margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.1rem', fontWeight: 800 }}>
                                                                    <Crown size={20} color="#2d5f3f" /> Primary Gateway
                                                                </h4>
                                                                <div className={s.inputTogglePremium}>
                                                                    <ToggleSwitch 
                                                                        checked={aiConfig.primary.enabled}
                                                                        onChange={val => isEditingAi ? setAiConfig(p => ({ ...p, primary: { ...p.primary, enabled: val } })) : toggleEngine('primary', val)}
                                                                        label={aiConfig.primary.enabled ? 'Active' : 'Disabled'}
                                                                        disabled={aiConfigSaving}
                                                                    />

                                                                </div>

                                                            </div>

                                                            <div className={s.aiConfigRow} style={{ marginBottom: '1rem' }}>
                                                                <div className={s.aiConfigGroup}>
                                                                    <label className={s.inputLabel}>Provider Name</label>
                                                                    <select className={s.configInput} value={aiConfig.primary.provider} disabled={!isEditingAi} onChange={e => {
                                                                        const val = e.target.value;
                                                                        setAiConfig(p => {
                                                                            let nuConfig = { ...p, primary: { ...p.primary, provider: val } };
                                                                            if (val === 'Hugging Face') nuConfig.primary.baseURL = 'https://router.huggingface.co/v1';
                                                                            if (val === 'Groq') nuConfig.primary.baseURL = 'https://api.groq.com/openai/v1';
                                                                            if (val === 'OpenRouter') nuConfig.primary.baseURL = 'https://openrouter.ai/api/v1';
                                                                            if (val === 'Together AI') nuConfig.primary.baseURL = 'https://api.together.xyz/v1';
                                                                            return nuConfig;
                                                                        });
                                                                    }}>
                                                                        <option value="Hugging Face">Hugging Face</option>
                                                                        <option value="Groq">Groq</option>
                                                                        <option value="OpenRouter">OpenRouter</option>
                                                                        <option value="Together AI">Together AI</option>
                                                                        <option value="Custom">Custom / Other</option>
                                                                    </select>
                                                                </div>

                                                                {aiConfig.primary.provider === 'Custom' && (
                                                                    <div className={s.aiConfigGroup}>
                                                                        <label className={s.inputLabel}>Custom Name</label>
                                                                        <input
                                                                            type="text"
                                                                            className={s.configInput}
                                                                            value={aiConfig.primary.customProvider}
                                                                            onChange={e => setAiConfig(p => ({ ...p, primary: { ...p.primary, customProvider: e.target.value } }))}
                                                                            placeholder="My Own AI"
                                                                            disabled={!isEditingAi}
                                                                        />
                                                                    </div>
                                                                )}

                                                                <div className={s.aiConfigGroup} style={{ gridColumn: 'span 2' }}>
                                                                    <label className={s.inputLabel}>Base URL</label>
                                                                    <input
                                                                        type="text"
                                                                        className={s.configInput}
                                                                        value={aiConfig.primary.baseURL}
                                                                        onChange={e => setAiConfig(p => ({ ...p, primary: { ...p.primary, baseURL: e.target.value } }))}
                                                                        placeholder="https://api.provider.com/v1"
                                                                        disabled={!isEditingAi || aiConfig.primary.provider !== 'Custom'}
                                                                        style={{ background: aiConfig.primary.provider !== 'Custom' ? '#e2e8f0' : '#fff' }}
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div className={s.aiConfigGroup} style={{ marginBottom: '1rem' }}>
                                                                <label className={s.inputLabel}><Key size={14} /> API Key</label>
                                                                <div className={s.inputWrapper} style={{ position: 'relative' }}>
                                                                    <input
                                                                        type={showPriKey ? "text" : "password"}
                                                                        className={s.configInput}
                                                                        value={aiConfig.primary.apiKey}
                                                                        onChange={e => setAiConfig(p => ({ ...p, primary: { ...p.primary, apiKey: e.target.value } }))}
                                                                        placeholder="sk-..."
                                                                        disabled={!isEditingAi}
                                                                        style={{ paddingRight: '2.5rem', background: '#fff' }}
                                                                    />
                                                                    <button
                                                                        onClick={() => setShowPriKey(!showPriKey)}
                                                                        style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                                                                    >
                                                                        {showPriKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            <div className={s.aiConfigGroup} style={{ marginTop: '1.5rem' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                        <Network size={18} color="#2d5f3f" />
                                                                        <label className={s.inputLabel} style={{ margin: 0 }}>Model Routing List</label>
                                                                    </div>
                                                                    {isEditingAi && (
                                                                        <button onClick={() => addModel('primary')} style={{ background: '#2d5f3f', color: '#fff', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', transition: '0.2s' }} onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'} onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
                                                                            <Plus size={14} /> Add Model
                                                                        </button>
                                                                    )}
                                                                </div>

                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                                    {(aiConfig.primary.models || []).map(m => (
                                                                        <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: '#fff', padding: '0.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                                            <div style={{ display: 'grid', gridTemplateColumns: isEditingAi ? 'minmax(0, 1.2fr) minmax(0, 1.5fr) minmax(0, 2.5fr) auto auto' : 'minmax(0, 1.2fr) minmax(0, 1.5fr) minmax(0, 2.5fr) auto', gap: '0.4rem', alignItems: 'center' }}>
                                                                                <select className={s.configInput} disabled={!isEditingAi} value={m.type} onChange={e => updateModel('primary', m.id, 'type', e.target.value)} style={{ padding: '0.35rem 0.2rem', minWidth: 0, fontSize: '0.75rem' }}>
                                                                                    <option value="text">Text Only</option>
                                                                                    <option value="vision">Vision Only</option>
                                                                                    <option value="text+vision">Text + Vision</option>
                                                                                    <option value="audio">Audio</option>
                                                                                </select>
                                                                                <input type="text" className={s.configInput} disabled={!isEditingAi} placeholder="Name (e.g. Text)" value={m.name} onChange={e => updateModel('primary', m.id, 'name', e.target.value)} style={{ padding: '0.35rem 0.4rem', minWidth: 0, fontSize: '0.75rem' }} />
                                                                                <input type="text" className={s.configInput} disabled={!isEditingAi} placeholder="Model ID" value={m.modelId} onChange={e => updateModel('primary', m.id, 'modelId', e.target.value)} style={{ padding: '0.35rem 0.4rem', minWidth: 0, fontSize: '0.75rem', textOverflow: 'ellipsis' }} />
                                                                                <button onClick={() => updateModel('primary', m.id, 'showOverrides', !m.showOverrides)} disabled={!isEditingAi} style={{ background: m.showOverrides ? '#e0f2fe' : 'none', border: 'none', color: m.showOverrides ? '#0284c7' : '#94a3b8', cursor: isEditingAi ? 'pointer' : 'default', padding: '0.25rem', borderRadius: '4px' }}>
                                                                                    <SettingsIcon size={16} />
                                                                                </button>
                                                                                {isEditingAi && (
                                                                                    <button onClick={() => removeModel('primary', m.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.25rem' }}>
                                                                                        <Trash2 size={16} />
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                            {m.showOverrides && (
                                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px dashed #cbd5e1', marginTop: '0.25rem' }}>
                                                                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                                                        <label style={{ fontSize: '0.75rem', fontWeight: 600, width: '70px', color: '#64748b' }}>Base URL:</label>
                                                                                        <input type="text" className={s.configInput} disabled={!isEditingAi} placeholder="Override URL (Optional)" value={m.baseURL || ''} onChange={e => updateModel('primary', m.id, 'baseURL', e.target.value)} style={{ padding: '0.4rem', flex: 1, fontSize: '0.8rem' }} />
                                                                                    </div>
                                                                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                                                        <label style={{ fontSize: '0.75rem', fontWeight: 600, width: '70px', color: '#64748b' }}>API Key:</label>
                                                                                        <input type="text" className={s.configInput} disabled={!isEditingAi} placeholder="Override Key (Optional)" value={m.apiKey || ''} onChange={e => updateModel('primary', m.id, 'apiKey', e.target.value)} style={{ padding: '0.4rem', flex: 1, fontSize: '0.8rem' }} />
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Fallback Engine */}
                                                        <div style={{ background: '#ffffff', padding: '2rem', borderRadius: '24px', border: '1.5px solid #f1f5f9', boxShadow: '0 4px 20px rgba(0,0,0,0.02)', position: 'relative', opacity: isEditingAi ? 1 : 0.85 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem' }}>
                                                                <h4 style={{ margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.1rem', fontWeight: 800 }}>
                                                                    <ShieldCheck size={20} color="#6366f1" /> Secondary Recovery
                                                                </h4>
                                                                <div className={s.inputTogglePremium}>
                                                                    <ToggleSwitch 
                                                                        checked={aiConfig.fallback.enabled}
                                                                        onChange={val => isEditingAi ? setAiConfig(p => ({ ...p, fallback: { ...p.fallback, enabled: val } })) : toggleEngine('fallback', val)}
                                                                        label={aiConfig.fallback.enabled ? 'Enabled' : 'Disabled'}
                                                                        activeColor="#6366f1"
                                                                        disabled={aiConfigSaving}
                                                                    />

                                                                </div>

                                                            </div>

                                                            <div className={s.aiConfigRow} style={{ marginBottom: '1rem' }}>
                                                                <div className={s.aiConfigGroup}>
                                                                    <label className={s.inputLabel}>Provider Hub</label>
                                                                    <select className={s.configInput} value={aiConfig.fallback.provider} disabled={!isEditingAi} onChange={e => {
                                                                        const val = e.target.value;
                                                                        setAiConfig(p => {
                                                                            let nuConfig = { ...p, fallback: { ...p.fallback, provider: val } };
                                                                            if (val === 'Hugging Face') nuConfig.fallback.baseURL = 'https://router.huggingface.co/v1';
                                                                            if (val === 'Groq') nuConfig.fallback.baseURL = 'https://api.groq.com/openai/v1';
                                                                            if (val === 'OpenRouter') nuConfig.fallback.baseURL = 'https://openrouter.ai/api/v1';
                                                                            if (val === 'Together AI') nuConfig.fallback.baseURL = 'https://api.together.xyz/v1';
                                                                            return nuConfig;
                                                                        });
                                                                    }}>
                                                                        <option value="Hugging Face">Hugging Face</option>
                                                                        <option value="Groq">Groq</option>
                                                                        <option value="OpenRouter">OpenRouter</option>
                                                                        <option value="Together AI">Together AI</option>
                                                                        <option value="Custom">Custom / Other</option>
                                                                    </select>
                                                                </div>

                                                                {aiConfig.fallback.provider === 'Custom' && (
                                                                    <div className={s.aiConfigGroup}>
                                                                        <label className={s.inputLabel}>Custom Name</label>
                                                                        <input
                                                                            type="text"
                                                                            className={s.configInput}
                                                                            value={aiConfig.fallback.customProvider}
                                                                            onChange={e => setAiConfig(p => ({ ...p, fallback: { ...p.fallback, customProvider: e.target.value } }))}
                                                                            placeholder="My Own AI"
                                                                            disabled={!isEditingAi}
                                                                        />
                                                                    </div>
                                                                )}

                                                                <div className={s.aiConfigGroup} style={{ gridColumn: 'span 2' }}>
                                                                    <label className={s.inputLabel}>Base URL</label>
                                                                    <input
                                                                        type="text"
                                                                        className={s.configInput}
                                                                        value={aiConfig.fallback.baseURL}
                                                                        onChange={e => setAiConfig(p => ({ ...p, fallback: { ...p.fallback, baseURL: e.target.value } }))}
                                                                        placeholder="https://api.provider.com/v1"
                                                                        disabled={!isEditingAi || aiConfig.fallback.provider !== 'Custom'}
                                                                        style={{ background: aiConfig.fallback.provider !== 'Custom' ? '#f1f5f9' : '#fff' }}
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div className={s.aiConfigGroup} style={{ marginBottom: '1rem' }}>
                                                                <label className={s.inputLabel}><Key size={14} /> API Key</label>
                                                                <div className={s.inputWrapper} style={{ position: 'relative' }}>
                                                                    <input
                                                                        type={showFbKey ? "text" : "password"}
                                                                        className={s.configInput}
                                                                        value={aiConfig.fallback.apiKey}
                                                                        onChange={e => setAiConfig(p => ({ ...p, fallback: { ...p.fallback, apiKey: e.target.value } }))}
                                                                        placeholder="sk-..."
                                                                        disabled={!isEditingAi}
                                                                        style={{ paddingRight: '2.5rem' }}
                                                                    />
                                                                    <button
                                                                        onClick={() => setShowFbKey(!showFbKey)}
                                                                        style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                                                                    >
                                                                        {showFbKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            <div className={s.aiConfigGroup} style={{ marginTop: '1.5rem' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                        <Network size={18} color="#6366f1" />
                                                                        <label className={s.inputLabel} style={{ margin: 0 }}>Recovery Model Routing</label>
                                                                    </div>
                                                                    {isEditingAi && (
                                                                        <button onClick={() => addModel('fallback')} style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', transition: '0.2s' }} onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'} onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
                                                                            <Plus size={14} /> Add Model
                                                                        </button>
                                                                    )}
                                                                </div>

                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                                    {(aiConfig.fallback.models || []).map(m => (
                                                                        <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: '#f8fafc', padding: '0.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                                            <div style={{ display: 'grid', gridTemplateColumns: isEditingAi ? 'minmax(0, 1.2fr) minmax(0, 1.5fr) minmax(0, 2.5fr) auto auto' : 'minmax(0, 1.2fr) minmax(0, 1.5fr) minmax(0, 2.5fr) auto', gap: '0.4rem', alignItems: 'center' }}>
                                                                                <select className={s.configInput} disabled={!isEditingAi} value={m.type} onChange={e => updateModel('fallback', m.id, 'type', e.target.value)} style={{ padding: '0.35rem 0.2rem', minWidth: 0, fontSize: '0.75rem' }}>
                                                                                    <option value="text">Text Only</option>
                                                                                    <option value="vision">Vision Only</option>
                                                                                    <option value="text+vision">Text + Vision</option>
                                                                                    <option value="audio">Audio</option>
                                                                                </select>
                                                                                <input type="text" className={s.configInput} disabled={!isEditingAi} placeholder="Name (e.g. Text)" value={m.name} onChange={e => updateModel('fallback', m.id, 'name', e.target.value)} style={{ padding: '0.35rem 0.4rem', minWidth: 0, fontSize: '0.75rem' }} />
                                                                                <input type="text" className={s.configInput} disabled={!isEditingAi} placeholder="Model ID" value={m.modelId} onChange={e => updateModel('fallback', m.id, 'modelId', e.target.value)} style={{ padding: '0.35rem 0.4rem', minWidth: 0, fontSize: '0.75rem', textOverflow: 'ellipsis' }} />
                                                                                <button onClick={() => updateModel('fallback', m.id, 'showOverrides', !m.showOverrides)} disabled={!isEditingAi} style={{ background: m.showOverrides ? '#e0f2fe' : 'none', border: 'none', color: m.showOverrides ? '#0284c7' : '#94a3b8', cursor: isEditingAi ? 'pointer' : 'default', padding: '0.25rem', borderRadius: '4px' }}>
                                                                                    <SettingsIcon size={16} />
                                                                                </button>
                                                                                {isEditingAi && (
                                                                                    <button onClick={() => removeModel('fallback', m.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.25rem' }}>
                                                                                        <Trash2 size={16} />
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                            {m.showOverrides && (
                                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: '#fff', padding: '0.75rem', borderRadius: '6px', border: '1px dashed #cbd5e1', marginTop: '0.25rem' }}>
                                                                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                                                        <label style={{ fontSize: '0.75rem', fontWeight: 600, width: '70px', color: '#64748b' }}>Base URL:</label>
                                                                                        <input type="text" className={s.configInput} disabled={!isEditingAi} placeholder="Override URL (Optional)" value={m.baseURL || ''} onChange={e => updateModel('fallback', m.id, 'baseURL', e.target.value)} style={{ padding: '0.4rem', flex: 1, fontSize: '0.8rem' }} />
                                                                                    </div>
                                                                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                                                        <label style={{ fontSize: '0.75rem', fontWeight: 600, width: '70px', color: '#64748b' }}>API Key:</label>
                                                                                        <input type="text" className={s.configInput} disabled={!isEditingAi} placeholder="Override Key (Optional)" value={m.apiKey || ''} onChange={e => updateModel('fallback', m.id, 'apiKey', e.target.value)} style={{ padding: '0.4rem', flex: 1, fontSize: '0.8rem' }} />
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* System Prompt Modal Overlay - Moved out of the grid and handled independently */}
                                    <AnimatePresence>
                                        {showPromptModal && (
                                            <motion.div className={s.overlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ zIndex: 1100 }}>
                                                <motion.div
                                                    className={s.modal}
                                                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                                                    animate={{ scale: 1, opacity: 1, y: 0 }}
                                                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                                                    style={{ width: '1000px', maxWidth: '95vw', height: '85vh' }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.5rem 2rem', borderBottom: '1px solid #f1f5f9', background: 'linear-gradient(to right, #ffffff, #f8fafc)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                            <div style={{ width: 40, height: 40, borderRadius: '12px', background: 'rgba(139, 92, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                <FileText size={20} color="#8b5cf6" />
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1.1rem' }}>Edit System Instructions</div>
                                                                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>Global AI personality and guardrails</div>
                                                            </div>
                                                        </div>
                                                        <button onClick={() => setShowPromptModal(false)} style={{ width: 32, height: 32, borderRadius: '50%', background: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', transition: '0.2s' }} onMouseOver={e => e.currentTarget.style.background = '#e2e8f0'} onMouseOut={e => e.currentTarget.style.background = '#f1f5f9'}><X size={18} /></button>
                                                    </div>

                                                    <div style={{ flex: 1, padding: '2rem', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                            <label className={s.inputLabel} style={{ fontSize: '0.85rem' }}>Full Instruction Prompt</label>
                                                            <div className={`${s.badge} ${s.badgeSuccess}`} style={{ fontSize: '0.65rem' }}>Active Configuration</div>
                                                        </div>
                                                        <textarea
                                                            className={s.premiumTextarea}
                                                            value={aiConfig.systemPrompt}
                                                            onChange={e => setAiConfig(p => ({ ...p, systemPrompt: e.target.value }))}
                                                            placeholder="Define rules, tone, and clinical protocols..."
                                                            style={{ flex: 1 }}
                                                        />
                                                    </div>

                                                    <div style={{ padding: '1.5rem 2rem', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                                        <button className={`${s.premiumButton} ${s.btnSecondary}`} onClick={() => setShowPromptModal(false)}>
                                                            Discard Changes
                                                        </button>
                                                        <button
                                                            className={`${s.premiumButton} ${s.btnPrimary}`}
                                                            onClick={async () => {
                                                                await saveAiConfig();
                                                                setShowPromptModal(false);
                                                            }}
                                                            disabled={aiConfigSaving}
                                                        >
                                                            {aiConfigSaving ? <Loader2 size={18} className={s.spin} /> : <Save size={18} />}
                                                            {aiConfigSaving ? 'Saving Changes...' : 'Update Instructions'}
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            )}

                            {/* ── ANIMAL TAXONOMY ── */}
                            {activeTab === 'taxonomy' && (
                                <motion.div key="tx" className={s.section}
                                    initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>

                                    {/* Two-column layout */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '1.5rem', alignItems: 'start' }}>

                                        {/* ─── LEFT: Categories panel ─── */}
                                        <div style={{ background: '#fff', borderRadius: '24px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.05)' }}>
                                            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9', background: 'linear-gradient(to right, #f8fafc, #fff)' }}>
                                                <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <Shapes size={14} color="#10b981" /> Categories
                                                </div>
                                                <div style={{ fontSize: '0.73rem', color: '#94a3b8', marginTop: '0.2rem' }}>Click a row to manage its breeds</div>
                                            </div>
                                            <div style={{ padding: '1rem' }}>
                                                {/* Add category input */}
                                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                                    <input
                                                        type="text"
                                                        className={s.configInput}
                                                        placeholder="New category (e.g. Rabbit)"
                                                        value={newCategoryName}
                                                        onChange={e => setNewCategoryName(e.target.value)}
                                                        onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                                                        style={{ flex: 1, height: '42px', padding: '0 0.9rem', borderRadius: '10px', fontSize: '0.875rem' }}
                                                    />
                                                    <button
                                                        className={s.addBtn}
                                                        onClick={handleAddCategory}
                                                        disabled={taxonomySaving}
                                                        style={{ height: '42px', padding: '0 1rem', borderRadius: '10px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.82rem' }}
                                                    >
                                                        {taxonomySaving ? <Loader2 size={15} className={s.spin} /> : <><Plus size={15} /> Add</>}
                                                    </button>
                                                </div>
                                                {/* Category list */}
                                                <div className={s.customScroll} style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: '540px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                                                    {Object.keys(animalCategories).map(cat => {
                                                        const isActive = selectedCat === cat;
                                                        return (
                                                            <motion.div
                                                                key={cat}
                                                                onClick={() => setSelectedCat(cat)}
                                                                whileHover={{ scale: 1.015 }}
                                                                whileTap={{ scale: 0.97 }}
                                                                style={{
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                                    padding: '0.8rem 1rem', borderRadius: '14px',
                                                                    background: isActive ? 'linear-gradient(135deg, #2d5f3f, #1a4028)' : '#f8fafc',
                                                                    color: isActive ? '#fff' : '#1e293b',
                                                                    cursor: 'pointer', border: '1.5px solid',
                                                                    borderColor: isActive ? '#2d5f3f' : '#f1f5f9',
                                                                    boxShadow: isActive ? '0 8px 20px rgba(45,95,63,0.3)' : 'none',
                                                                    transition: 'all 0.22s ease',
                                                                }}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                                                                    <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>{CATEGORY_EMOJI(cat)}</span>
                                                                    <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>{cat}</span>
                                                                </div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                    <span style={{ fontSize: '0.68rem', fontWeight: 700, background: isActive ? 'rgba(255,255,255,0.18)' : '#e2e8f0', color: isActive ? '#fff' : '#64748b', padding: '2px 8px', borderRadius: '6px' }}>
                                                                        {animalCategories[cat].length}
                                                                    </span>
                                                                    <button
                                                                        onClick={e => { e.stopPropagation(); handleDeleteCategory(cat); }}
                                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px', borderRadius: '6px', display: 'flex', alignItems: 'center', color: isActive ? 'rgba(255,255,255,0.65)' : '#ef4444', transition: '0.15s' }}
                                                                        onMouseOver={e => e.currentTarget.style.background = 'rgba(239,68,68,0.12)'}
                                                                        onMouseOut={e => e.currentTarget.style.background = 'none'}
                                                                    >
                                                                        <Trash2 size={13} />
                                                                    </button>
                                                                </div>
                                                            </motion.div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>

                                        {/* ─── RIGHT: Breeds panel ─── */}
                                        <div style={{ background: '#fff', borderRadius: '24px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.05)', minHeight: '420px' }}>
                                            {selectedCat && animalCategories[selectedCat] ? (
                                                <>
                                                    <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9', background: 'linear-gradient(to right, #f8fafc, #fff)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                        <div>
                                                            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                <span style={{ fontSize: '1.1rem' }}>{CATEGORY_EMOJI(selectedCat)}</span> Breeds for {selectedCat}
                                                            </div>
                                                            <div style={{ fontSize: '0.73rem', color: '#94a3b8', marginTop: '0.2rem' }}>{animalCategories[selectedCat].length} breed{animalCategories[selectedCat].length !== 1 ? 's' : ''} registered</div>
                                                        </div>
                                                        <span style={{ background: '#f0fdf4', color: '#166534', fontSize: '0.7rem', fontWeight: 800, padding: '4px 12px', borderRadius: '20px', border: '1px solid #bbf7d0' }}>Active</span>
                                                    </div>
                                                    <div style={{ padding: '1.25rem 1.5rem' }}>
                                                        <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.25rem' }}>
                                                            <input
                                                                type="text"
                                                                className={s.configInput}
                                                                placeholder={`Add a breed for ${selectedCat}...`}
                                                                value={newBreedName}
                                                                onChange={e => setNewBreedName(e.target.value)}
                                                                onKeyDown={e => e.key === 'Enter' && handleAddBreed()}
                                                                style={{ flex: 1, height: '42px', padding: '0 0.9rem', borderRadius: '10px', fontSize: '0.875rem' }}
                                                            />
                                                            <button
                                                                className={s.addBtn}
                                                                onClick={handleAddBreed}
                                                                disabled={taxonomySaving}
                                                                style={{ height: '42px', padding: '0 1rem', borderRadius: '10px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.82rem' }}
                                                            >
                                                                {taxonomySaving ? <Loader2 size={15} className={s.spin} /> : <><Plus size={15} /> Add</>}
                                                            </button>
                                                        </div>
                                                        {animalCategories[selectedCat].length === 0 ? (
                                                            <div style={{ padding: '3rem', textAlign: 'center', background: '#f8fafc', borderRadius: '16px', border: '2px dashed #e2e8f0' }}>
                                                                <p style={{ color: '#94a3b8', fontWeight: 600, margin: 0, fontSize: '0.9rem' }}>No breeds yet — add one above!</p>
                                                            </div>
                                                        ) : (
                                                            <div className={s.customScroll} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: '0.65rem', maxHeight: '460px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                                                                {animalCategories[selectedCat].map(breed => (
                                                                    <motion.div
                                                                        key={breed}
                                                                        initial={{ opacity: 0, scale: 0.9 }}
                                                                        animate={{ opacity: 1, scale: 1 }}
                                                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.7rem 0.9rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', gap: '0.5rem', transition: 'all 0.18s' }}
                                                                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#10b981'; e.currentTarget.style.background = '#f0fdf4'; }}
                                                                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc'; }}
                                                                    >
                                                                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{breed}</span>
                                                                        <button
                                                                            onClick={() => handleDeleteBreed(selectedCat, breed)}
                                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', opacity: 0.5, display: 'flex', alignItems: 'center', flexShrink: 0, transition: '0.15s', padding: '2px' }}
                                                                            onMouseOver={e => e.currentTarget.style.opacity = 1}
                                                                            onMouseOut={e => e.currentTarget.style.opacity = 0.5}
                                                                        >
                                                                            <Trash2 size={13} />
                                                                        </button>
                                                                    </motion.div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </>
                                            ) : (
                                                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', padding: '4rem', color: '#94a3b8' }}>
                                                    <div style={{ width: 60, height: 60, borderRadius: '18px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <Shapes size={28} color="#cbd5e1" />
                                                    </div>
                                                    <div style={{ textAlign: 'center' }}>
                                                        <p style={{ margin: 0, fontWeight: 700, color: '#475569' }}>Select a category</p>
                                                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>Pick one from the left to add or remove breeds</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* ── ADMIN ACCESS ── */}
                            {activeTab === 'adminaccess' && (
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
                                            <AdvancedLoader type="admin" compact={true} fullScreen={false} />
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
