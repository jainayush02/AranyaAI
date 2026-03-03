import React, { useState, useEffect } from 'react';
import { Globe, Bell, Lock, Tag, IndianRupee, Database, Save, Activity, ArrowLeft, Plus, Trash2, Mail, Phone } from 'lucide-react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import axios from 'axios';
import styles from './Settings.module.css';

export default function Settings() {
    const { role, user: loggedInUser } = useOutletContext();
    const navigate = useNavigate();
    const [user, setUser] = useState(loggedInUser);
    const [settings, setSettings] = useState({
        language: 'en',
        emailNotifications: true,
        healthAlerts: true,
        weeklyReports: true,
    });

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
            } catch (err) {
                console.error("Failed to fetch current platform sets:", err);
            }
        };
        fetchGlobalSettings();
    }, [role]);

    const handleSaveAdminSettings = async () => {
        setIsSaving(true);
        try {
            const token = localStorage.getItem('token');
            const config = { headers: { Authorization: `Bearer ${token}` } };

            // Send as numbers
            await axios.post('/api/settings/update', { key: 'proPrice', value: Number(adminSettings.proPrice) }, config);
            await axios.post('/api/settings/update', { key: 'freeLimit', value: Number(adminSettings.freeLimit) }, config);

            // Send plans and support info
            await axios.post('/api/settings/update', { key: 'plans', value: JSON.stringify(adminSettings.plans) }, config);
            await axios.post('/api/settings/update', { key: 'supportEmail', value: adminSettings.supportEmail }, config);
            await axios.post('/api/settings/update', { key: 'supportPhone', value: adminSettings.supportPhone }, config);

            alert('✨ Pricing and Platform sets updated successfully!');

            // Log activity in background (simulated for now)
            console.log(`Admin updated pricing to ₹${adminSettings.proPrice}`);
        } catch (err) {
            console.error("Save error:", err);
            alert('❌ Failed to update admin settings. Please check server connection.');
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
        const updated = { ...settings, language: e.target.value };
        setSettings(updated);
        if (user) {
            const updatedUser = { ...user, settings: updated };
            localStorage.setItem('user', JSON.stringify(updatedUser));
        }
    };

    return (
        <div className={`container ${styles.pageContainer} animate-fade-in`}>
            {role === 'admin' && (
                <button
                    onClick={() => navigate('/admin-portal')}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        padding: '6px 14px', marginBottom: '16px',
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
            <div className={styles.pageHeader}>
                <h1 className={styles.pageTitle}>{role === 'admin' ? 'Pricing & Sets' : 'Settings'}</h1>
                <p className={styles.pageSubtitle}>
                    {role === 'admin' ? 'Global platform configuration and pricing sets.' : 'Manage your app preferences and notifications'}
                </p>
            </div>

            {role === 'admin' ? (
                <div className={styles.adminSection}>
                    {/* Support Config */}
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <Tag className={styles.cardIcon} size={24} />
                            <h2 className={styles.cardTitle}>Support Contact Info</h2>
                        </div>
                        <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                            Customize where users can contact you when they click "Need More Help?".
                        </p>
                        <div className={styles.inputGroup} style={{ gridTemplateColumns: '1fr 1fr' }}>
                            <div className={styles.formItem}>
                                <label className={styles.label}>Support Email</label>
                                <div className={styles.selectWrapper}>
                                    <Mail size={18} color="var(--text-secondary)" />
                                    <input
                                        type="email"
                                        className={styles.plainInput}
                                        value={adminSettings.supportEmail}
                                        onChange={(e) => setAdminSettings({ ...adminSettings, supportEmail: e.target.value })}
                                        placeholder="support@example.com"
                                    />
                                </div>
                            </div>
                            <div className={styles.formItem}>
                                <label className={styles.label}>Contact Phone / Link</label>
                                <div className={styles.selectWrapper}>
                                    <Phone size={18} color="var(--text-secondary)" />
                                    <input
                                        type="text"
                                        className={styles.plainInput}
                                        value={adminSettings.supportPhone}
                                        onChange={(e) => setAdminSettings({ ...adminSettings, supportPhone: e.target.value })}
                                        placeholder="+1 800 123 4567 or URL"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Subscription Plans */}
                    <div className={styles.card} style={{ marginBottom: '1.5rem' }}>
                        <div className={styles.cardHeader} style={{ justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Database className={styles.cardIcon} size={24} />
                                <h2 className={styles.cardTitle}>Subscription Plans Configuration</h2>
                            </div>
                            <button
                                onClick={() => setAdminSettings({
                                    ...adminSettings,
                                    plans: [...adminSettings.plans, { id: Date.now().toString(), name: 'New Plan', price: '0', isRecommended: false, features: '', cta: 'Select Plan' }]
                                })}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    background: '#10b981', color: 'white', padding: '6px 14px',
                                    borderRadius: '6px', fontSize: '13px', fontWeight: '500', cursor: 'pointer',
                                    border: 'none'
                                }}
                            >
                                <Plus size={14} /> Add Plan
                            </button>
                        </div>
                        <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                            These plans will be displayed directly on the Billing page to all users. Features should be separated by new lines.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {adminSettings.plans.map((plan, index) => (
                                <div key={plan.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative' }}>
                                    <button
                                        onClick={() => setAdminSettings({ ...adminSettings, plans: adminSettings.plans.filter(p => p.id !== plan.id) })}
                                        style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                                        title="Delete plan"
                                    >
                                        <Trash2 size={18} />
                                    </button>

                                    <div className={styles.inputGroup} style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) auto', gap: '1rem', marginTop: '0', paddingRight: '30px' }}>
                                        <div className={styles.formItem} style={{ marginBottom: 0 }}>
                                            <label className={styles.label}>Plan Name</label>
                                            <input
                                                className={styles.plainInput} style={{ background: 'white', border: '1px solid #cbd5e1', padding: '10px 14px' }}
                                                value={plan.name} onChange={e => {
                                                    const newPlans = [...adminSettings.plans];
                                                    newPlans[index].name = e.target.value;
                                                    setAdminSettings({ ...adminSettings, plans: newPlans });
                                                }}
                                            />
                                        </div>
                                        <div className={styles.formItem} style={{ marginBottom: 0 }}>
                                            <label className={styles.label}>Price (e.g. 499 or Custom)</label>
                                            <div className={styles.selectWrapper} style={{ background: 'white', border: '1px solid #cbd5e1' }}>
                                                <IndianRupee size={16} color="var(--text-secondary)" />
                                                <input
                                                    className={styles.plainInput} style={{ background: 'transparent' }}
                                                    value={plan.price} onChange={e => {
                                                        const newPlans = [...adminSettings.plans];
                                                        newPlans[index].price = e.target.value;
                                                        setAdminSettings({ ...adminSettings, plans: newPlans });
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <div className={styles.formItem} style={{ marginBottom: 0, alignSelf: 'center', marginTop: '22px' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500 }}>
                                                <input type="checkbox" checked={plan.isRecommended} onChange={e => {
                                                    const newPlans = [...adminSettings.plans];
                                                    if (e.target.checked) newPlans.forEach(p => p.isRecommended = false); // only one can be recommended
                                                    newPlans[index].isRecommended = e.target.checked;
                                                    setAdminSettings({ ...adminSettings, plans: newPlans });
                                                }} style={{ width: '18px', height: '18px', accentColor: '#10b981' }} />
                                                Recommended badge
                                            </label>
                                        </div>
                                    </div>

                                    <div className={styles.inputGroup} style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0' }}>
                                        <div className={styles.formItem} style={{ marginBottom: 0 }}>
                                            <label className={styles.label}>Features (one per line)</label>
                                            <textarea
                                                className={styles.plainInput} style={{ background: 'white', border: '1px solid #cbd5e1', padding: '12px 14px', minHeight: '110px', resize: 'vertical' }}
                                                placeholder="Up to 10 animals&#10;Basic Analytics..."
                                                value={plan.features} onChange={e => {
                                                    const newPlans = [...adminSettings.plans];
                                                    newPlans[index].features = e.target.value;
                                                    setAdminSettings({ ...adminSettings, plans: newPlans });
                                                }}
                                            />
                                        </div>
                                        <div className={styles.formItem} style={{ marginBottom: 0 }}>
                                            <label className={styles.label}>Button Call to Action (CTA)</label>
                                            <input
                                                className={styles.plainInput} style={{ background: 'white', border: '1px solid #cbd5e1', padding: '10px 14px', marginBottom: '1rem' }}
                                                value={plan.cta} onChange={e => {
                                                    const newPlans = [...adminSettings.plans];
                                                    newPlans[index].cta = e.target.value;
                                                    setAdminSettings({ ...adminSettings, plans: newPlans });
                                                }}
                                                placeholder="e.g. Upgrade to this Plan"
                                            />
                                            <div style={{ padding: '10px 14px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px', fontSize: '0.85rem', color: '#065f46', lineHeight: 1.5 }}>
                                                <strong>Notice:</strong> This plan will be visible to all users. Modifying the features will instantly update the user portal.
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {adminSettings.plans.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '3rem', background: '#f8fafc', borderRadius: '10px', color: 'var(--text-secondary)' }}>
                                    No plans configured. Add a plan to display it on the Billing page.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Pricing Config (Legacy) */}
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <Tag className={styles.cardIcon} size={24} />
                            <h2 className={styles.cardTitle}>Legacy Plan Configuration</h2>
                        </div>
                        <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                            Used by backend API limits for free/pro users.
                        </p>

                        <div className={styles.inputGroup} style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem' }}>
                            <div className={styles.formItem}>
                                <label className={styles.label}>Pro Plan Price Amount (₹)</label>
                                <div className={styles.selectWrapper}>
                                    <IndianRupee size={18} color="var(--text-secondary)" />
                                    <input
                                        type="number"
                                        className={styles.plainInput}
                                        value={adminSettings.proPrice}
                                        onChange={(e) => setAdminSettings({ ...adminSettings, proPrice: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className={styles.formItem}>
                                <label className={styles.label}>Free Account Animal Limit</label>
                                <div className={styles.selectWrapper}>
                                    <Activity size={18} color="var(--text-secondary)" />
                                    <input
                                        type="number"
                                        className={styles.plainInput}
                                        value={adminSettings.freeLimit}
                                        onChange={(e) => setAdminSettings({ ...adminSettings, freeLimit: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>



                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                        <button
                            className="btn-primary"
                            style={{ gap: '0.75rem', padding: '0.75rem 2rem' }}
                            disabled={isSaving}
                            onClick={handleSaveAdminSettings}
                        >
                            <Save size={18} /> {isSaving ? 'Saving...' : 'Save Global Sets'}
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <Globe className={styles.cardIcon} size={24} />
                            <h2 className={styles.cardTitle}>Language Preferences</h2>
                        </div>
                        <label className={styles.label}>Select your preferred language</label>
                        <div className={styles.selectWrapper}>
                            <Globe size={18} color="var(--text-secondary)" />
                            <select
                                className={styles.select}
                                value={settings.language}
                                onChange={handleChangeLang}
                            >
                                <option value="en">GB English</option>
                                <option value="hi">हिंदी (Hindi)</option>
                                <option value="gu">ગુજરાતી (Gujarati)</option>
                            </select>
                        </div>
                    </div>

                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <Bell className={styles.cardIcon} size={24} />
                            <h2 className={styles.cardTitle}>Notifications</h2>
                        </div>
                        <div className={styles.sectionGroup}>
                            <div className={styles.toggleRow}>
                                <div className={styles.toggleInfo}>
                                    <span className={styles.toggleLabel}>Email Notifications</span>
                                    <span className={styles.toggleDesc}>Receive email updates about your cattle</span>
                                </div>
                                <label className={styles.switch}>
                                    <input
                                        type="checkbox"
                                        checked={settings.emailNotifications}
                                        onChange={() => handleToggle('emailNotifications')}
                                    />
                                    <span className={styles.slider}></span>
                                </label>
                            </div>

                            <div className={styles.toggleRow}>
                                <div className={styles.toggleInfo}>
                                    <span className={styles.toggleLabel}>Health Alerts</span>
                                    <span className={styles.toggleDesc}>Get alerts for critical health status</span>
                                </div>
                                <label className={styles.switch}>
                                    <input
                                        type="checkbox"
                                        checked={settings.healthAlerts}
                                        onChange={() => handleToggle('healthAlerts')}
                                    />
                                    <span className={styles.slider}></span>
                                </label>
                            </div>

                            <div className={styles.toggleRow}>
                                <div className={styles.toggleInfo}>
                                    <span className={styles.toggleLabel}>Weekly reports</span>
                                    <span className={styles.toggleDesc}>Receive weekly health summary</span>
                                </div>
                                <label className={styles.switch}>
                                    <input
                                        type="checkbox"
                                        checked={settings.weeklyReports}
                                        onChange={() => handleToggle('weeklyReports')}
                                    />
                                    <span className={styles.slider}></span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <Lock className={styles.cardIcon} size={24} />
                            <h2 className={styles.cardTitle}>Security & Privacy</h2>
                        </div>
                        <p className={styles.securityText}>
                            Your security and privacy are managed by the platform settings.
                        </p>
                    </div>
                </>
            )}
        </div>
    );
}
