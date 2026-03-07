import React, { useState, useEffect } from 'react';
import { Globe, Bell, Lock, Tag, IndianRupee, Database, Save, Activity, Plus, Trash2, Mail, Phone, Settings as SettingsIcon, CreditCard, ShieldAlert, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOutletContext, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import styles from './Settings.module.css';

export default function Settings() {
    const { role, user: loggedInUser } = useOutletContext();
    const navigate = useNavigate();
    const location = useLocation();
    const queryParams = new URLSearchParams(location.search);
    const initialTab = queryParams.get('tab') || 'pricing';
    const [activeTab, setActiveTab] = useState(initialTab);
    const [user, setUser] = useState(loggedInUser);
    const [settings, setSettings] = useState({
        language: 'en',
        region: 'in',
        emailNotifications: true,
        healthAlerts: true,
        weeklyReports: true,
    });
    const [isApplying, setIsApplying] = useState(false);

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
    }, [role]);

    useEffect(() => {
        const tab = queryParams.get('tab');
        if (tab && (tab === 'pricing' || tab === 'settings' || tab === 'advanced')) {
            setActiveTab(tab === 'advanced' ? 'settings' : tab);
        }
    }, [location.search]);

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

            alert('✨ System Configuration and Pricing updated successfully!');
        } catch (err) {
            console.error("Save error:", err);
            alert('❌ Failed to update global settings.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggle = (field) => {
        const updated = { ...settings, [field]: !settings[field] };
        setSettings(updated);
        if (user) {
            const updatedUser = { ...user, settings: updated };
            localStorage.setItem('user', JSON.stringify(updatedUser));
        }
    };

    const handleChangeLang = (e) => {
        const val = e.target.value;
        const updated = { ...settings, language: val };
        setSettings(updated);

        // Feedback is now immediate
        setIsApplying(true);
        setIsApplying(false);

        if (user) {
            const updatedUser = { ...user, settings: updated };
            localStorage.setItem('user', JSON.stringify(updatedUser));
            window.dispatchEvent(new Event('storage'));
        }
    };

    const handleChangeRegion = (e) => {
        const updated = { ...settings, region: e.target.value };
        setSettings(updated);
        if (user) {
            const updatedUser = { ...user, settings: updated };
            localStorage.setItem('user', JSON.stringify(updatedUser));
            window.dispatchEvent(new Event('storage'));
        }
    };

    return (
        <div className={`container ${styles.pageContainer} animate-fade-in`}>
            {/* Top Navigation Bar */}
            <div className={styles.topActions} style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2.5rem' }}>
                {role === 'admin' && (
                    <div style={{ display: 'flex', background: '#f1f5f9', padding: '5px', borderRadius: '18px', gap: '5px', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)' }}>
                        {[
                            { id: 'pricing', label: 'Subscription', icon: CreditCard },
                            { id: 'settings', label: 'System Configuration', icon: SettingsIcon }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => { setActiveTab(tab.id); navigate(`/settings?tab=${tab.id}`, { replace: true }); }}
                                style={{
                                    border: 'none', padding: '10px 24px', borderRadius: '14px', fontSize: '0.95rem', fontWeight: 700,
                                    background: activeTab === tab.id ? '#fff' : 'transparent',
                                    color: activeTab === tab.id ? 'var(--primary)' : '#64748b',
                                    boxShadow: activeTab === tab.id ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
                                    cursor: 'pointer', transition: '0.3s', display: 'flex', alignItems: 'center', gap: '10px'
                                }}
                            >
                                <tab.icon size={18} /> {tab.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Content Header */}
            <motion.div
                className={styles.pageHeader}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5 }}
            >
                <h1 className={styles.pageTitle}>
                    {role === 'admin'
                        ? (activeTab === 'pricing' ? 'Subscription Configuration' : 'System Configuration')
                        : 'Account Settings'}
                </h1>
                <p className={styles.pageSubtitle}>
                    {role === 'admin'
                        ? (activeTab === 'pricing' ? 'Manage global subscription tiers and platform pricing models.' : 'Manage platform security, firewall rules, and support contact channels.')
                        : 'Customize your experience, notification preferences, and regional settings.'}
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
                            {activeTab === 'pricing' ? (
                                <>
                                    {/* Plan Editor Section */}
                                    <section className={styles.card}>
                                        <div className={styles.cardHeader} style={{ justifyContent: 'space-between', marginBottom: '2rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                                <div className={styles.cardIcon} style={{ background: '#10b981' }}>
                                                    <Database size={24} />
                                                </div>
                                                <h2 className={styles.cardTitle}>Subscription Tiers</h2>
                                            </div>
                                            <button
                                                className="btn-new"
                                                onClick={() => setAdminSettings({
                                                    ...adminSettings,
                                                    plans: [...adminSettings.plans, { id: Date.now().toString(), name: 'New Tier', price: '0', isRecommended: false, features: 'Feature 1', cta: 'Upgrade' }]
                                                })}
                                                style={{
                                                    background: 'var(--primary)', color: '#fff', border: 'none',
                                                    padding: '12px 24px', borderRadius: '14px', fontWeight: 800,
                                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                                                    boxShadow: '0 10px 15px -3px rgba(45, 95, 63, 0.3)'
                                                }}
                                            >
                                                <Plus size={18} /> Add New Plan
                                            </button>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
                                            {adminSettings.plans.map((plan, idx) => (
                                                <div key={plan.id} style={{
                                                    background: '#f8fafc', border: '1.5px solid #e2e8f0',
                                                    borderRadius: '24px', padding: '2rem', transition: '0.3s',
                                                    position: 'relative', overflow: 'hidden'
                                                }}>
                                                    <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: plan.isRecommended ? 'var(--primary)' : '#e2e8f0' }} />
                                                    <button
                                                        onClick={() => setAdminSettings({ ...adminSettings, plans: adminSettings.plans.filter(p => p.id !== plan.id) })}
                                                        style={{ position: 'absolute', top: '20px', right: '20px', background: '#fee2e2', color: '#ef4444', border: 'none', padding: '8px', borderRadius: '12px', cursor: 'pointer' }}
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>

                                                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                                        <div className={styles.formItem}>
                                                            <label className={styles.label}>Tier Name</label>
                                                            <input
                                                                className={styles.boxedInput}
                                                                value={plan.name}
                                                                onChange={e => {
                                                                    const up = [...adminSettings.plans];
                                                                    up[idx].name = e.target.value;
                                                                    setAdminSettings({ ...adminSettings, plans: up });
                                                                }}
                                                            />
                                                        </div>
                                                        <div className={styles.formItem}>
                                                            <label className={styles.label}>Price</label>
                                                            <div className={styles.selectWrapper} style={{ background: '#fff' }}>
                                                                <IndianRupee size={16} />
                                                                <input
                                                                    className={styles.plainInput}
                                                                    value={plan.price}
                                                                    onChange={e => {
                                                                        const up = [...adminSettings.plans];
                                                                        up[idx].price = e.target.value;
                                                                        setAdminSettings({ ...adminSettings, plans: up });
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className={styles.formItem} style={{ alignSelf: 'center', marginTop: '20px' }}>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 700 }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={plan.isRecommended}
                                                                    onChange={e => {
                                                                        const up = [...adminSettings.plans];
                                                                        if (e.target.checked) up.forEach(u => u.isRecommended = false);
                                                                        up[idx].isRecommended = e.target.checked;
                                                                        setAdminSettings({ ...adminSettings, plans: up });
                                                                    }}
                                                                    style={{ width: '20px', height: '20px', accentColor: 'var(--primary)' }}
                                                                />
                                                                Popular Tag
                                                            </label>
                                                        </div>
                                                    </div>

                                                    <div className={styles.formItem}>
                                                        <label className={styles.label}>Value Features (one per line)</label>
                                                        <textarea
                                                            className={styles.boxedInput}
                                                            value={plan.features}
                                                            onChange={e => {
                                                                const up = [...adminSettings.plans];
                                                                up[idx].features = e.target.value;
                                                                setAdminSettings({ ...adminSettings, plans: up });
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                </>
                            ) : (
                                <>
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
                                </>
                            )}

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
                                        display: 'flex', alignItems: 'center', gap: '12px',
                                        padding: '1.2rem 3rem', background: 'var(--primary)', color: '#fff',
                                        border: 'none', borderRadius: '22px', fontSize: '1.1rem', fontWeight: 800,
                                        cursor: 'pointer', boxShadow: '0 15px 30px -5px rgba(45, 95, 63, 0.4)',
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
                                        <div key={item.key} className={styles.toggleRow} style={{ border: 'none', background: '#f8fafc', padding: '1.25rem', borderRadius: '18px', marginBottom: '0.75rem' }}>
                                            <div className={styles.toggleInfo}>
                                                <span className={styles.toggleLabel}>{item.label}</span>
                                                <span className={styles.toggleDesc}>{item.desc}</span>
                                            </div>
                                            <label className={styles.switch}>
                                                <input type="checkbox" checked={settings[item.key]} onChange={() => handleToggle(item.key)} />
                                                <span className={styles.slider}></span>
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
