import React, { useState, useEffect } from 'react';
import { useOutletContext, useNavigate, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, ShieldAlert, CheckCircle, Flame, Plus, ThermometerSun, HeartPulse, Search, Sparkles, User, Trash2, CheckSquare, Square, X } from 'lucide-react';
import styles from './Dashboard.module.css';
import AddAnimalDialog from '../components/AddAnimalDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import axios from 'axios';
import AdvancedLoader from '../components/AdvancedLoader';

export default function Dashboard() {
    const { role, user } = useOutletContext(); // Get the role and user from Layout
    const navigate = useNavigate();



    const [isAddAnimalOpen, setIsAddAnimalOpen] = useState(false);
    const [animals, setAnimals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedAnimals, setSelectedAnimals] = useState([]);
    const [platformSettings, setPlatformSettings] = useState({ proPrice: 499, freeLimit: 5 });
    const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, title: '', message: '', onConfirm: () => { } });
    const [adminStats, setAdminStats] = useState({ totalUsers: 0, totalAnimals: 0, criticalAnimals: 0, platformLoad: 0, newThisWeek: 0, activeToday: 0, blockedUsers: 0, proUsers: 0 });
    const [activityLog, setActivityLog] = useState([]);

    const fetchAnimals = async () => {
        try {
            const token = localStorage.getItem('token');
            const config = { headers: { Authorization: `Bearer ${token}` } };

            // Artificial delay to show the premium Aranya AI loader
            await new Promise(resolve => setTimeout(resolve, 1000));

            const res = await axios.get('/api/animals', config);
            setAnimals(res.data);
            setLoading(false);

            // Auto-recalculate all animals' status via AI in background
            for (const animal of res.data) {
                try {
                    const recalcRes = await axios.post(
                        `/api/animals/${animal._id}/recalculate`, {}, config
                    );
                    setAnimals(prev => prev.map(a =>
                        a._id === animal._id ? { ...a, status: recalcRes.data.animalStatus } : a
                    ));
                } catch (recalcErr) {
                    // AI might not be running, skip silently
                }
            }
        } catch (err) {
            console.error(err);
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchAnimals();
    }, [role]);

    const handleAddAnimal = async (newAnimalData) => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.post('/api/animals', {
                name: newAnimalData.name,
                breed: newAnimalData.breed
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            // Update local state by prepending the newly saved item from MongoDB
            setAnimals([res.data, ...animals]);
        } catch (err) {
            console.error('Failed to add animal', err);
            alert('Failed to add animal. See console.');
        }
    };

    const handleDeleteAnimal = (e, id, name) => {
        if (e) e.stopPropagation();
        setConfirmConfig({
            isOpen: true,
            title: "Delete Animal",
            message: `Are you sure you want to delete ${name}? This action cannot be undone and all health records will be permanently removed.`,
            confirmText: "Delete Now",
            type: "danger",
            onConfirm: async () => {
                try {
                    const token = localStorage.getItem('token');
                    await axios.delete(`/api/animals/${id}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    setAnimals(prev => prev.filter(a => (a._id || a.id) !== id));
                    setSelectedAnimals(prev => prev.filter(sid => sid !== id));
                } catch (err) {
                    console.error('Delete failed', err);
                    alert('Failed to delete animal');
                }
            }
        });
    };

    const handleToggleSelection = (e, id) => {
        e.stopPropagation();
        setSelectedAnimals(prev =>
            prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
        );
    };

    const handleSelectAll = () => {
        if (selectedAnimals.length === filteredAnimals.length) {
            setSelectedAnimals([]);
        } else {
            setSelectedAnimals(filteredAnimals.map(a => a._id || a.id));
        }
    };

    const handleBulkDelete = () => {
        setConfirmConfig({
            isOpen: true,
            title: "Bulk Delete",
            message: `Are you sure you want to delete ${selectedAnimals.length} selected animals? This will permanently remove all their health data.`,
            confirmText: `Delete ${selectedAnimals.length} Animals`,
            type: "danger",
            onConfirm: async () => {
                try {
                    const token = localStorage.getItem('token');
                    await Promise.all(selectedAnimals.map(id =>
                        axios.delete(`/api/animals/${id}`, {
                            headers: { Authorization: `Bearer ${token}` }
                        })
                    ));

                    setAnimals(prev => prev.filter(a => !selectedAnimals.includes(a._id || a.id)));
                    setSelectedAnimals([]);
                } catch (err) {
                    console.error('Bulk delete failed', err);
                    alert('Failed to delete some animals');
                }
            }
        });
    };

    const total = animals.length;
    const healthy = animals.filter(a => (a.status || '').toLowerCase() === 'healthy').length;
    const alert = animals.filter(a => (a.status || '').toLowerCase() === 'alert' || (a.status || '').toLowerCase() === 'warning').length;
    const critical = animals.filter(a => (a.status || '').toLowerCase() === 'critical').length;

    const filteredAnimals = animals.filter(animal =>
        (animal.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (animal.tag_number || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    const healthScore = total > 0 ? Math.round((healthy / total) * 100) : 100;

    let insightMessage = "Your herd is currently stable with no immediate concerns.";
    let insightTheme = { bg: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)", color: "var(--primary)", border: "#bbf7d0" };

    if (critical > 0) {
        insightMessage = `Critical alert: ${critical} of your cattle require immediate veterinary attention! AI models detected severe vital anomalies.`;
        insightTheme = { bg: "linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)", color: "#b91c1c", border: "#fecaca" };
    } else if (alert > 0) {
        insightMessage = `Attention needed: ${alert} of your cattle are showing early warning signs. The AI recommends close monitoring over the next 24 hours.`;
        insightTheme = { bg: "linear-gradient(135deg, #fefce8 0%, #fef08a 100%)", color: "#a16207", border: "#fde047" };
    } else if (total > 0 && healthScore === 100) {
        insightMessage = "Perfect! The AI model confirms your entire herd's vitals are in excellent condition today.";
    }

    if (role === 'admin') {
        return <Navigate to="/admin-portal" replace />;
    }

    if (loading) return <AdvancedLoader message="Syncing your herd data with Aranya AI..." />;

    return (
        <div className={`container ${styles.dashboard} animate-fade-in`}>
            <header className={styles.header}>
                <div className={styles.headerText}>
                    <h1 className={styles.title}>My Cattle Dashboard</h1>
                    <p className={styles.subtitle}>Here is the latest health report of your cattle.</p>
                </div>
                <button className="btn-primary" onClick={() => setIsAddAnimalOpen(true)}>
                    <Plus size={20} /> Add New Animal
                </button>
            </header>

            {/* USER DASHBOARD VIEW */}
            {!loading && total > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className={styles.insightBanner}
                >
                    <div className={styles.insightIconWrapper} style={{ color: insightTheme.color }}>
                        <Sparkles size={28} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h4 className={styles.insightTitle} style={{ color: insightTheme.color }}>
                            Aranya AI Insights
                            <span className={styles.insightBadge} style={{ background: insightTheme.color }}>
                                {healthScore}% Herd Score
                            </span>
                        </h4>
                        <p className={styles.insightText} style={{ color: insightTheme.color }}>
                            {insightMessage}
                        </p>
                    </div>

                    {/* AI Mist Animation (Smoke effect) */}
                    <div className={styles.aiScanner} style={{ color: insightTheme.color }}>
                        {[...Array(6)].map((_, i) => (
                            <div
                                key={i}
                                className={styles.aiMistParticle}
                                style={{
                                    animationDelay: `${i * 1.5}s`,
                                    opacity: 0.4 + (i * 0.1)
                                }}
                            />
                        ))}
                    </div>
                </motion.div>
            )}

            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}><Activity size={24} /></div>
                    <div className={styles.statInfo}>
                        <span className={styles.statLabel}>Total Cattle</span>
                        <span className={styles.statValue}>{total}</span>
                    </div>
                </div>

                <div className={styles.statCard}>
                    <div className={styles.statIcon} style={{ background: 'rgba(34, 197, 94, 0.1)', color: 'var(--success)' }}>
                        <CheckCircle size={24} />
                    </div>
                    <div className={styles.statInfo}>
                        <span className={styles.statLabel}>Healthy</span>
                        <span className={styles.statValue}>{healthy}</span>
                    </div>
                </div>

                <div className={styles.statCard}>
                    <div className={styles.statIcon} style={{ background: 'rgba(234, 179, 8, 0.1)', color: 'var(--warning)' }}>
                        <ShieldAlert size={24} />
                    </div>
                    <div className={styles.statInfo}>
                        <span className={styles.statLabel}>Needs Attention</span>
                        <span className={styles.statValue}>{alert}</span>
                    </div>
                </div>

                <div className={styles.statCard}>
                    <div className={styles.statIcon} style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--error)' }}>
                        <Flame size={24} />
                    </div>
                    <div className={styles.statInfo}>
                        <span className={styles.statLabel}>Critical</span>
                        <span className={styles.statValue}>{critical}</span>
                    </div>
                </div>
            </div>

            <section className={styles.animalsSection}>
                <div className={styles.animalsHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <h2 className={styles.animalsTitle}>Your Herd</h2>
                        {filteredAnimals.length > 0 && (
                            <button
                                className={styles.selectAllBtn}
                                onClick={handleSelectAll}
                            >
                                {selectedAnimals.length === filteredAnimals.length ? 'Deselect All' : 'Select All'}
                            </button>
                        )}
                    </div>
                    <div className={styles.searchContainer}>
                        <Search size={18} className={styles.searchIcon} />
                        <input
                            type="text"
                            placeholder="Search by name or ID..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={styles.searchInput}
                        />
                    </div>
                </div>

                <AnimatePresence>
                    {selectedAnimals.length > 0 && (
                        <motion.div
                            className={styles.bulkActionBar}
                            initial={{ y: 50, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 50, opacity: 0 }}
                        >
                            <div className={styles.bulkActionInfo}>
                                <div className={styles.selectionCount}>{selectedAnimals.length} selected</div>
                                <button className={styles.clearSelection} onClick={() => setSelectedAnimals([])}>
                                    <X size={14} /> Clear
                                </button>
                            </div>
                            <div className={styles.bulkActions}>
                                <button className={styles.bulkDeleteBtn} onClick={handleBulkDelete}>
                                    <Trash2 size={16} /> Delete Selected
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className={styles.animalGrid}>
                    {animals.length === 0 ? (
                        <p className={styles.emptyText}>You haven't added any cattle yet. Click "Add New Animal" to start building your herd.</p>
                    ) : filteredAnimals.length === 0 ? (
                        <p className={styles.emptyText}>No cattle found matching your search.</p>
                    ) : (
                        filteredAnimals.map((animal, idx) => (
                            <motion.div
                                key={animal._id || animal.id || Math.random()}
                                className={`${styles.animalCard} ${selectedAnimals.includes(animal._id || animal.id) ? styles.animalCardSelected : ''}`}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.1 }}
                                onClick={() => navigate(`/animal/${animal._id || animal.id}`)}
                            >
                                <div
                                    className={styles.cardSelectOverlay}
                                    onClick={(e) => handleToggleSelection(e, animal._id || animal.id)}
                                >
                                    {selectedAnimals.includes(animal._id || animal.id) ?
                                        <CheckSquare size={20} className={styles.checkIcon} /> :
                                        <Square size={20} className={styles.squareIcon} />
                                    }
                                </div>

                                {!selectedAnimals.includes(animal._id || animal.id) && (
                                    <button
                                        className={styles.cardDeleteBtn}
                                        onClick={(e) => handleDeleteAnimal(e, animal._id || animal.id, animal.name)}
                                        title="Quick Delete"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                )}
                                <div className={styles.animalContent}>
                                    <div className={styles.animalHeader}>
                                        <div>
                                            <h3 className={styles.animalName}>{animal.name}</h3>
                                            <p className={styles.animalBreed}>{animal.breed}</p>
                                        </div>
                                        <span className={`badge badge-${(animal.status || '').toLowerCase() === 'healthy' ? 'success' :
                                            ((animal.status || '').toLowerCase() === 'warning' || (animal.status || '').toLowerCase() === 'alert') ? 'warning' : 'error'
                                            }`}>
                                            {animal.status}
                                        </span>
                                    </div>

                                    <div className={styles.vitalGrid}>
                                        <div className={styles.vital}>
                                            <ThermometerSun size={18} />
                                            <span><span className={styles.vitalValue}>{animal.recentVitals?.temperature ?? '--'}°C</span> Temp</span>
                                        </div>
                                        <div className={styles.vital}>
                                            <HeartPulse size={18} />
                                            <span><span className={styles.vitalValue}>{animal.recentVitals?.heartRate ?? '--'}</span> BPM</span>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ))
                    )}
                </div>
            </section>

            <AddAnimalDialog
                isOpen={isAddAnimalOpen}
                onClose={() => setIsAddAnimalOpen(false)}
                onAdd={handleAddAnimal}
            />

            <ConfirmDialog
                {...confirmConfig}
                onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
            />
        </div>
    );
}

