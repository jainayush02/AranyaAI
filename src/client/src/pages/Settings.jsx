import React, { useState, useEffect } from 'react';
import { Globe, Bell, Lock, Tag, IndianRupee, Database, Save, Activity, Plus, Trash2, Mail, Phone, Settings as SettingsIcon, CreditCard, ShieldAlert, Zap, Users, UserPlus, CheckCircle, RefreshCw, MailCheck, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOutletContext, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import styles from './Settings.module.css';
import { useToast } from '../components/ToastProvider';

export default function Settings() {
    const { role, user: loggedInUser } = useOutletContext();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const location = useLocation();
    const queryParams = new URLSearchParams(location.search);
    const initialTab = queryParams.get('tab') || (role === 'admin' ? 'infrastructure' : 'account');
    const [activeTab, setActiveTab] = useState(initialTab);
    const [user, setUser] = useState(loggedInUser);
    const [aiEngine, setAiEngine] = useState('scientist_js');
    const [aiEngineLoading, setAiEngineLoading] = useState(false);
    const [settings, setSettings] = useState({
        language: 'en',
        region: 'in',
        emailNotifications: true,
        healthAlerts: true,
        weeklyReports: true,
    });
    const [isApplying, setIsApplying] = useState(false);
    const [sendingReport, setSendingReport] = useState(false);
    const [reportStatus, setReportStatus] = useState(null);

    // Care Circle Management
    const [circleMembers, setCircleMembers] = useState([]);
    const [inviteForm, setInviteForm] = useState({ full_name: '', email: '', mobile: '', password: '' });
    const [isInviting, setIsInviting] = useState(false);

    // Admin specific settings (Pricing & Sets)
    const [adminSettings, setAdminSettings] = useState({
        proPrice: 499,
        freeLimit: 5,
        systemAlerts: true,
        plans: [
            { id: Date.now().toString(), name: 'Free Plan', price: '0', isRecommended: false, features: 'Up to 10 animals\nBasic health tracking\nAI veterinary assistant\nWeekly reports', cta: 'Current Plan' },
            { id: (Date.now() + 1).toString(), name: 'Pro Plan', price: '499', isRecommended: true, features: 'Unlimited animals\nAdvanced analytics\nPriority support\nCustom reports\nMultiple users', cta: 'Upgrade to this Plan' },
            { id: (Date.now() + 2).toString(), name: 'Enterprise Plan', price: 'Custom', isRecommended: false, features: 'Everything in Pro\nDedicated support\nCustom integrations\nAPI access\nOn-site training', cta: 'Upgrade to this Plan' }
        ],
        supportEmail: 'support@aranya.ai',
        supportPhone: '+1-800-ARANYA'
    });

    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            try {
                const parsed = JSON.parse(storedUser);
                setUser(parsed);
                if (parsed.settings) {
                    setSettings(parsed.settings);
                }
            } catch (e) { }
        }

        // Fetch global settings if admin or user (public info)
        const fetchGlobalSettings = async () => {
            try {
                const res = await axios.get('/api/settings');
                if (res.data.proPrice) setAdminSettings(prev => ({ ...prev, proPrice: res.data.proPrice }));
                if (res.data.freeLimit) setAdminSettings(prev => ({ ...prev, freeLimit: res.data.freeLimit }));
                if (res.data.plans) setAdminSettings(prev => ({ ...prev, plans: typeof res.data.plans === 'string' ? JSON.parse(res.data.plans) : res.data.plans }));
                if (res.data.supportEmail) setAdminSettings(prev => ({ ...prev, supportEmail: res.data.supportEmail }));
                if (res.data.supportPhone) setAdminSettings(prev => ({ ...prev, supportPhone: res.data.supportPhone }));

                // New system toggles
                if (res.data.idsProtection !== undefined) setAdminSettings(prev => ({ ...prev, idsProtection: res.data.idsProtection === 'true' || res.data.idsProtection === true }));
                if (res.data.strict2FA !== undefined) setAdminSettings(prev => ({ ...prev, strict2FA: res.data.strict2FA === 'true' || res.data.strict2FA === true }));
                if (res.data.systemAlerts !== undefined) setAdminSettings(prev => ({ ...prev, systemAlerts: res.data.systemAlerts === 'true' || res.data.systemAlerts === true }));
                if (res.data.maintenanceMode !== undefined) setAdminSettings(prev => ({ ...prev, maintenanceMode: res.data.maintenanceMode === 'true' || res.data.maintenanceMode === true }));
            } catch (err) {
                console.error("Failed to fetch current platform sets:", err);
            }
        };
        fetchGlobalSettings();
        if (role === 'admin') fetchAiEngine();

        // Fetch circle members if user
        if (role !== 'admin') {
            fetchCircleMembers();

            // Load fresh settings on mount
            const fetchFreshProfile = async () => {
                try {
                    const token = localStorage.getItem('token');
                    if (!token) return;
                    const res = await axios.get('/api/auth/profile', {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (res.data) {
                        setUser(res.data);
                        if (res.data.settings) setSettings(prev => ({ ...prev, ...res.data.settings }));
                    }
                } catch (e) { }
            };
            fetchFreshProfile();
        }
    }, [role]);

    const fetchCircleMembers = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get('/api/auth/care-circle', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setCircleMembers(res.data);
        } catch (err) {
            console.error("Failed to fetch care circle members:", err);
        }
    };

    const handleInviteMember = async (e) => {
        e.preventDefault();
        setIsInviting(true);
        try {
            const token = localStorage.getItem('token');
            await axios.post('/api/auth/care-circle/invite', inviteForm, {
                headers: { Authorization: `Bearer ${token}` }
            });
            showToast('Member added to your Care Circle!', 'success');
            setInviteForm({ full_name: '', email: '', mobile: '', password: '' });
            fetchCircleMembers();
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to invite member', 'error');
        } finally {
            setIsInviting(false);
        }
    };

    const handleRemoveMember = async (id) => {
        if (!window.confirm('Are you sure you want to remove this member from your Care Circle?')) return;
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`/api/auth/care-circle/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchCircleMembers();
        } catch (err) {
            showToast('Failed to remove member', 'error');
        }
    };
    
    const fetchAiEngine = async () => {
        try {
            const token = localStorage.getItem('token');
            const r = await axios.get('/api/admin/config/ai-engine', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (r.data.engine) setAiEngine(r.data.engine);
        } catch { }
    };

    const toggleAiEngine = async (newEngine) => {
        if (aiEngine === newEngine) return;
        setAiEngineLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.post('/api/admin/config/ai-engine', { engine: newEngine }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (res.data.engine) {
                setAiEngine(res.data.engine);
                showToast(`Platform synchronized to ${res.data.engine === 'scientist_js' ? 'Version 2' : 'Version 1'} logic`, 'success');
            }
        } catch (err) {
            console.error("AI Engine Switch Error:", err);
            showToast(err.response?.data?.message || 'Failed to switch AI engine', 'error');
        } finally {
            setAiEngineLoading(false);
        }
    };

    useEffect(() => {
        const tab = queryParams.get('tab');
        if (tab) {
            // Support 'advanced' alias for infrastructure section
            setActiveTab(tab === 'advanced' ? 'infrastructure' : tab);
        } else {
            setActiveTab(role === 'admin' ? 'infrastructure' : 'account');
        }
    }, [location.search, role]);

    const handleSaveAdminSettings = async () => {
        setIsSaving(true);
        try {
            const token = localStorage.getItem('token');
            const config = { headers: { Authorization: `Bearer ${token}` } };

            const updates = [
                { key: 'proPrice', value: Number(adminSettings.proPrice) },
                { key: 'freeLimit', value: Number(adminSettings.freeLimit) },
                { key: 'plans', value: JSON.stringify(adminSettings.plans) },
                { key: 'supportEmail', value: adminSettings.supportEmail },
                { key: 'supportPhone', value: adminSettings.supportPhone },
                { key: 'idsProtection', value: adminSettings.idsProtection },
                { key: 'strict2FA', value: adminSettings.strict2FA },
                { key: 'systemAlerts', value: adminSettings.systemAlerts },
                { key: 'maintenanceMode', value: adminSettings.maintenanceMode }
            ];

            for (const item of updates) {
                await axios.post('/api/settings/update', item, config);
            }

            showToast('System Configuration and Pricing updated successfully!', 'success');
        } catch (err) {
            console.error("Save error:", err);
            showToast('Failed to update global settings.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const updateUserSettings = async (updatedSettings) => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const res = await axios.put('/api/auth/profile', { settings: updatedSettings }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.data.user) {
                setUser(res.data.user);
                localStorage.setItem('user', JSON.stringify(res.data.user));
                window.dispatchEvent(new Event('userUpdated'));
            }
        } catch (err) {
            console.error("Failed to update user settings:", err);
        }
    };

    const handleToggle = (field) => {
        const updated = { ...settings, [field]: !settings[field] };
        setSettings(updated);
        updateUserSettings(updated);
    };

    const handleChangeLang = (e) => {
        const val = e.target.value;
        const updated = { ...settings, language: val };
        setSettings(updated);

        // Feedback is immediate
        setIsApplying(true);
        setTimeout(() => setIsApplying(false), 800);
        updateUserSettings(updated);
    };

    const handleChangeRegion = (e) => {
        const updated = { ...settings, region: e.target.value };
        setSettings(updated);
        // Only update local state if region is not part of model
    };

    const handleSendManualReport = async () => {
        try {
            setSendingReport(true);
            const res = await axios.post('/api/auth/send-report', {}, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            // Success toast message
            setReportStatus({ type: 'success', text: 'Digest sent to your email' });
            setTimeout(() => setReportStatus(null), 5000);
        } catch (err) {
            setReportStatus({ type: 'error', text: err.response?.data?.message || 'Failed to send' });
            setTimeout(() => setReportStatus(null), 5000);
        } finally {
            setSendingReport(false);
        }
    };

    const navTabs = role === 'admin'
        ? [
            { id: 'infrastructure', label: 'Core Infrastructure', icon: SettingsIcon }
        ]
        : (role === 'user'
            ? [
                { id: 'account', label: 'Account Settings', icon: Globe },
                { id: 'care-circle', label: 'Care Circle', icon: Users }
            ]
            : [
                { id: 'account', label: 'Account Settings', icon: Globe }
            ]
        );

    // (Removed duplicate tab effect to prevent state jitter)
    return (
        <div className={`container ${styles.pageContainer} animate-fade-in`}>
            {/* Top Navigation Bar - Only show if there are multiple tabs */}
            {navTabs.length > 1 && (
                <div className={styles.topActions} style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2.5rem' }}>
                    <div style={{ display: 'flex', background: '#f1f5f9', padding: '5px', borderRadius: '18px', gap: '5px', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)' }}>
                        {navTabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => { setActiveTab(tab.id); navigate(`/settings?tab=${tab.id}`, { replace: true }); }}
                                style={{
                                    border: 'none', padding: '8px 20px', borderRadius: '14px', fontSize: '0.85rem', fontWeight: 800,
                                    background: activeTab === tab.id ? '#fff' : 'transparent',
                                    color: activeTab === tab.id ? 'var(--primary)' : '#64748b',
                                    boxShadow: activeTab === tab.id ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
                                    cursor: 'pointer', transition: '0.3s', display: 'flex', alignItems: 'center', gap: '8px'
                                }}
                            >
                                <tab.icon size={16} /> {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Content Header */}
            <motion.div
                className={styles.pageHeader}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5 }}
            >
                <h1 className={styles.pageTitle}>
                    {role === 'admin'
                        ? 'Core Infrastructure'
                        : (activeTab === 'care-circle' ? 'Care Circle Management' : 'Account Settings')}
                </h1>
                <p className={styles.pageSubtitle}>
                    {role === 'admin'
                        ? 'Manage platform security, firewall rules, and support contact channels.'
                        : (activeTab === 'care-circle' ? 'Invite and manage your care circle. Assign roles to help coordinate daily operations.' : 'Customize your experience, notification preferences, and regional settings.')}
                </p>
            </motion.div>

            {/* Dynamic Content Area */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={role === 'admin' ? activeTab : 'user-settings'}
                    initial={{ opacity: 0, scale: 0.98, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98, y: -10 }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                >
                    {role === 'admin' ? (
                        <div className={styles.adminContainer} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            <section className={styles.card}>
                                <div className={styles.cardHeader}>
                                    <div className={styles.cardIcon} style={{ background: '#3b82f6' }}>
                                        <SettingsIcon size={24} />
                                    </div>
                                    <h2 className={styles.cardTitle}>Platform System Rules</h2>
                                </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            {[
                                                { key: 'idsProtection', label: 'Intrusion Detection System (IDS)', desc: 'Real-time packet inspection and threat anomaly scoring for API nodes.', icon: ShieldAlert },
                                                { key: 'strict2FA', label: 'Strict 2FA Protocol Enforcement', desc: 'Require TOTP confirmation for all administrative user modifications.', icon: Lock },
                                                { key: 'systemAlerts', label: 'Dashboard Critical Smart Health Alert', desc: 'Broadcast critical animal biometric anomalies to admin feed.', icon: Zap },
                                                { key: 'maintenanceMode', label: 'Platform Maintenance Mode', desc: 'Restricts user portal access to administrative personnel only.', icon: Activity }
                                            ].map(item => {
                                                const Icon = item.icon || Activity;
                                                return (
                                                    <div key={item.key} className={styles.toggleRow} style={{ border: 'none', background: '#f8fafc', padding: '1.5rem', borderRadius: '22px' }}>
                                                        <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
                                                            <div style={{ padding: '10px', background: '#fff', borderRadius: '12px', color: 'var(--primary)', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                                                                <Icon size={20} />
                                                            </div>
                                                            <div className={styles.toggleInfo}>
                                                                <span className={styles.toggleLabel}>{item.label}</span>
                                                                <span className={styles.toggleDesc}>{item.desc}</span>
                                                            </div>
                                                        </div>
                                                        <label className={styles.switch}>
                                                            <input
                                                                type="checkbox"
                                                                checked={adminSettings[item.key] || false}
                                                                onChange={() => setAdminSettings({ ...adminSettings, [item.key]: !adminSettings[item.key] })}
                                                            />
                                                            <span className={styles.slider}></span>
                                                        </label>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </section>

                                    {/* Support Section */}
                                    <section className={styles.card}>
                                        <div className={styles.cardHeader}>
                                            <div className={styles.cardIcon} style={{ background: '#f59e0b' }}>
                                                <Mail size={24} />
                                            </div>
                                            <h2 className={styles.cardTitle}>Support Channels</h2>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                            <div className={styles.formItem}>
                                                <label className={styles.label}>Support Email</label>
                                                <div className={styles.selectWrapper}>
                                                    <Mail size={18} />
                                                    <input
                                                        className={styles.plainInput}
                                                        value={adminSettings.supportEmail}
                                                        onChange={e => setAdminSettings({ ...adminSettings, supportEmail: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                            <div className={styles.formItem}>
                                                <label className={styles.label}>Contact Phone</label>
                                                <div className={styles.selectWrapper}>
                                                    <Phone size={18} />
                                                    <input
                                                        className={styles.plainInput}
                                                        value={adminSettings.supportPhone}
                                                        onChange={e => setAdminSettings({ ...adminSettings, supportPhone: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    <section className={styles.card}>
                                        <div className={styles.cardHeader}>
                                            <div className={styles.cardIcon} style={{ background: '#2d5f3f' }}>
                                                <Zap size={24} />
                                            </div>
                                            <h2 className={styles.cardTitle}>Aranya Core Intelligence</h2>
                                        </div>
                                        <div className={styles.toggleRow} style={{ border: 'none', background: '#f0fdf4', padding: '1.5rem', borderRadius: '22px' }}>
                                            <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
                                                <div style={{ padding: '10px', background: '#fff', borderRadius: '12px', color: '#2d5f3f', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                                                    <Activity size={20} />
                                                </div>
                                                <div className={styles.toggleInfo}>
                                                    <span className={styles.toggleLabel}>Active Monitoring Engine</span>
                                                    <span className={styles.toggleDesc}>
                                                        {aiEngine === 'legacy_python' 
                                                            ? 'Currently using Version 1 (Deterministic Logic for high consistency)' 
                                                            : 'Currently using Version 2 (Probabilistic Reasoning for complex diagnostics)'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', background: '#fff', padding: '4px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                                <button 
                                                    onClick={() => toggleAiEngine('legacy_python')}
                                                    disabled={aiEngineLoading}
                                                    style={{ 
                                                        border: 'none', padding: '6px 14px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800,
                                                        background: aiEngine === 'legacy_python' ? '#2d5f3f' : 'transparent',
                                                        color: aiEngine === 'legacy_python' ? '#fff' : '#64748b',
                                                        cursor: 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', gap: '6px'
                                                    }}
                                                >
                                                    {aiEngineLoading && aiEngine !== 'legacy_python' && <Activity className="animate-spin" size={12} />}
                                                    Version 1
                                                </button>
                                                <button 
                                                    onClick={() => toggleAiEngine('scientist_js')}
                                                    disabled={aiEngineLoading}
                                                    style={{ 
                                                        border: 'none', padding: '6px 14px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800,
                                                        background: aiEngine === 'scientist_js' ? '#2d5f3f' : 'transparent',
                                                        color: aiEngine === 'scientist_js' ? '#fff' : '#64748b',
                                                        cursor: 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', gap: '6px'
                                                    }}
                                                >
                                                    {aiEngineLoading && aiEngine !== 'scientist_js' && <Activity className="animate-spin" size={12} />}
                                                    Version 2
                                                </button>
                                            </div>
                                        </div>
                                    </section>

                                    <section className={styles.card}>
                                        <div className={styles.cardHeader}>
                                            <div className={styles.cardIcon} style={{ background: '#6366f1' }}>
                                                <Lock size={24} />
                                            </div>
                                            <h2 className={styles.cardTitle}>Infrastructure Shield</h2>
                                        </div>
                                        <div style={{ padding: '2rem', background: '#e0f2fe', border: '1.5px solid #bae6fd', borderRadius: '24px', color: '#0369a1', lineHeight: 1.7 }}>
                                            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '10px' }}>
                                                <ShieldAlert size={20} />
                                                <strong>Administrative Infrastructure Notice</strong>
                                            </div>
                                            Low-level firewall rules and Redis persistence layers are provisioned via Terraform. Business-level overrides below are currently synced with the central VPC configuration.
                                        </div>
                                    </section>

                            {/* Sticky Save Bar */}
                            <div style={{
                                display: 'flex', justifyContent: 'flex-end', marginTop: '2rem',
                                position: 'sticky', bottom: '2rem', zIndex: 100
                            }}>
                                <button
                                    className="btn-primary"
                                    onClick={handleSaveAdminSettings}
                                    disabled={isSaving}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '10px',
                                        padding: '0.8rem 1.75rem', background: 'var(--primary)', color: '#fff',
                                        border: 'none', borderRadius: '14px', fontSize: '0.9rem', fontWeight: 800,
                                        cursor: 'pointer', boxShadow: '0 8px 16px -4px rgba(45, 95, 63, 0.3)',
                                        transition: '0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-5px)'}
                                    onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                                >
                                    {isSaving ? <Activity className="animate-spin" size={22} /> : <Save size={22} />}
                                    {isSaving ? 'Deploying Changes...' : 'Sync Global Config'}
                                </button>
                            </div>
                        </div>

                    ) : (
                        <div className={styles.userContainer} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            {activeTab === 'care-circle' ? (
                                <>
                                    <section className={styles.card}>
                                        <div className={styles.cardHeader}>
                                            <div className={styles.cardIcon}>
                                                <UserPlus size={24} />
                                            </div>
                                            <h2 className={styles.cardTitle}>Invite Care Circle Member</h2>
                                        </div>
                                        <form onSubmit={handleInviteMember} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                                            <div className={styles.formItem}>
                                                <label className={styles.label}>Full Name</label>
                                                <input
                                                    className={styles.boxedInput}
                                                    placeholder="e.g. Rahul Sharma"
                                                    value={inviteForm.full_name}
                                                    onChange={e => setInviteForm({ ...inviteForm, full_name: e.target.value })}
                                                    required
                                                />
                                            </div>
                                            <div className={styles.formItem}>
                                                <label className={styles.label}>Email Address</label>
                                                <input
                                                    className={styles.boxedInput}
                                                    type="email"
                                                    placeholder="member@example.com"
                                                    value={inviteForm.email}
                                                    onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })}
                                                    required
                                                />
                                            </div>
                                            <div className={styles.formItem}>
                                                <label className={styles.label}>Mobile Number</label>
                                                <input
                                                    className={styles.boxedInput}
                                                    placeholder="e.g. 9876543210"
                                                    value={inviteForm.mobile}
                                                    onChange={e => setInviteForm({ ...inviteForm, mobile: e.target.value })}
                                                />
                                            </div>
                                            <div className={styles.formItem}>
                                                <label className={styles.label}>Access Password</label>
                                                <input
                                                    className={styles.boxedInput}
                                                    type="password"
                                                    placeholder="Set initial password"
                                                    value={inviteForm.password}
                                                    onChange={e => setInviteForm({ ...inviteForm, password: e.target.value })}
                                                    required
                                                />
                                            </div>
                                            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
                                                <button type="submit" className="btn-primary" disabled={isInviting}>
                                                    {isInviting ? <Activity className="animate-spin" size={18} /> : <Plus size={18} />}
                                                    {isInviting ? 'Sending Invite...' : 'Add to Care Circle'}
                                                </button>
                                            </div>
                                        </form>
                                    </section>

                                    <section className={styles.card}>
                                        <div className={styles.cardHeader}>
                                            <div className={styles.cardIcon} style={{ background: '#3b82f6' }}>
                                                <Users size={24} />
                                            </div>
                                            <h2 className={styles.cardTitle}>Active Care Circle</h2>
                                        </div>
                                        <div className={styles.circleList}>
                                            {circleMembers.length === 0 ? (
                                                <div className={styles.empty}>
                                                    <p>No members added yet. Start by inviting someone to your Care Circle!</p>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'grid', gap: '1rem' }}>
                                                    {circleMembers.map(member => (
                                                        <div key={member._id} className={styles.toggleRow} style={{ border: '1px solid #e2e8f0', background: '#fff' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                                                <div style={{ width: '40px', height: '40px', background: '#f1f5f9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--primary)' }}>
                                                                    {member.full_name?.charAt(0) || 'M'}
                                                                </div>
                                                                <div className={styles.toggleInfo}>
                                                                    <span className={styles.toggleLabel}>{member.full_name}</span>
                                                                    <span className={styles.toggleDesc}>{member.email || member.mobile} • Role: Caretaker</span>
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() => handleRemoveMember(member._id)}
                                                                style={{ border: 'none', background: '#fee2e2', color: '#ef4444', padding: '8px 12px', borderRadius: '10px', cursor: 'pointer', fontWeight: 700 }}
                                                            >
                                                                Remove
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </section>
                                </>
                            ) : (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                        <section className={styles.card} style={{ marginBottom: 0 }}>
                                            <div className={styles.cardHeader}>
                                                <div className={styles.cardIcon}>
                                                    <Globe size={24} />
                                                </div>
                                                <h2 className={styles.cardTitle}>Language</h2>
                                            </div>
                                            <div className={styles.formItem}>
                                                <label className={styles.label}>Primary Language</label>
                                                <div className={styles.selectWrapper}>
                                                    <Globe size={18} />
                                                    <select className={styles.select} value={settings.language} onChange={handleChangeLang}>
                                                        <option value="en">English (US/UK)</option>
                                                        <option value="hi">हिंदी (Indo-Aryan)</option>
                                                        <option value="gu">ગુજરાતી (West Indian)</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </section>

                                        <section className={styles.card} style={{ marginBottom: 0 }}>
                                            <div className={styles.cardHeader}>
                                                <div className={styles.cardIcon} style={{ background: '#3b82f6' }}>
                                                    <IndianRupee size={24} />
                                                </div>
                                                <h2 className={styles.cardTitle}>Region</h2>
                                            </div>
                                            <div className={styles.formItem}>
                                                <label className={styles.label}>Locale Format</label>
                                                <div className={styles.selectWrapper}>
                                                    <IndianRupee size={18} />
                                                    <select className={styles.select} value={settings.region || 'in'} onChange={handleChangeRegion}>
                                                        <option value="in">India (GMT+5:30)</option>
                                                        <option value="us">United States (EST/PST)</option>
                                                        <option value="gb">United Kingdom (GMT)</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </section>
                                    </div>

                                    <AnimatePresence>
                                        {isApplying && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.9 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0 }}
                                                style={{
                                                    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                                    padding: '1rem 2rem', background: 'rgba(0,0,0,0.8)', color: '#fff',
                                                    borderRadius: '50px', zIndex: 999, display: 'flex', alignItems: 'center', gap: '12px',
                                                    backdropFilter: 'blur(10px)', boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
                                                }}
                                            >
                                                <Activity className="animate-spin" size={20} />
                                                <span style={{ fontWeight: 600 }}>Applying Language...</span>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    <section className={styles.card}>
                                        <div className={styles.cardHeader}>
                                            <div className={styles.cardIcon}>
                                                <Bell size={24} />
                                            </div>
                                            <h2 className={styles.cardTitle}>Communication Preferences</h2>
                                        </div>
                                        <div className={styles.sectionGroup} style={{ gap: '0.5rem' }}>
                                            {[
                                                { key: 'emailNotifications', label: 'Email Reports', desc: 'Detailed health summaries sent to your inbox' },
                                                { key: 'healthAlerts', label: 'Critical Smart Alerts', desc: 'Real-time alerts for biometric anomalies' },
                                                { key: 'weeklyReports', label: 'Weekly Performance Digest', desc: 'Consolidated data for animal trends' }
                                            ].map(item => (
                                                <div key={item.key} className={styles.toggleRow} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: 'none', background: '#f8fafc', padding: '1.25rem', borderRadius: '18px', marginBottom: '0.75rem' }}>
                                                    <div className={styles.toggleInfo} style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <span className={styles.toggleLabel}>{item.label}</span>
                                                        <span className={styles.toggleDesc}>{item.desc}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                                        {item.key === 'weeklyReports' && settings.weeklyReports && (
                                                            <motion.button
                                                                whileHover={{ scale: 1.05 }}
                                                                whileTap={{ scale: 0.95 }}
                                                                onClick={handleSendManualReport}
                                                                disabled={sendingReport}
                                                                style={{
                                                                    padding: '6px 14px',
                                                                    background: reportStatus?.type === 'success' ? '#22c55e' : 'var(--primary)',
                                                                    color: '#fff',
                                                                    border: 'none',
                                                                    borderRadius: '20px',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: 600,
                                                                    cursor: 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '6px',
                                                                    boxShadow: '0 4px 10px rgba(45, 95, 63, 0.15)'
                                                                }}
                                                            >
                                                                {sendingReport ? (
                                                                    <RefreshCw className="animate-spin" size={14} />
                                                                ) : (
                                                                    <Mail size={14} />
                                                                )}
                                                                {sendingReport ? 'Sending...' : 'Send Now'}
                                                            </motion.button>
                                                        )}
                                                        <label className={styles.switch} style={{ flexShrink: 0 }}>
                                                            <input type="checkbox" checked={!!settings?.[item.key]} onChange={() => handleToggle(item.key)} />
                                                            <span className={styles.slider}></span>
                                                        </label>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                    <AnimatePresence>
                                        {reportStatus && (
                                            <motion.div
                                                initial={{ opacity: 0, x: 100 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: 100 }}
                                                style={{
                                                    position: 'fixed', bottom: '100px', right: '30px',
                                                    padding: '12px 24px', background: reportStatus.type === 'success' ? '#2d5f3f' : '#991b1b', color: '#fff',
                                                    borderRadius: '16px', zIndex: 1000, display: 'flex', alignItems: 'center', gap: '12px',
                                                    backdropFilter: 'blur(10px)', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', 
                                                    border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.9rem'
                                                }}
                                            >
                                                {reportStatus.type === 'success' ? <MailCheck size={22} /> : <AlertCircle size={22} />}
                                                <span style={{ fontWeight: 600 }}>{reportStatus.text}</span>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </>
                            )}
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
