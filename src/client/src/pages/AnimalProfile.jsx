import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ThermometerSun, HeartPulse, Save, RefreshCw, Download, FileText, Upload, AlertCircle, Trash2, Calendar, Zap, ShieldAlert } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import axios from 'axios';
import styles from './AnimalProfile.module.css';
import AdvancedLoader from '../components/AdvancedLoader';
import ConfirmDialog from '../components/ConfirmDialog';

export default function AnimalProfile() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { role } = useOutletContext();

    const [animal, setAnimal] = useState(null);
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = React.useRef(null);

    const [formData, setFormData] = useState({
        temperature: '',
        heartRate: '',
        activityLevel: 5,
        appetite: 3,
        notes: ''
    });

    const [submitting, setSubmitting] = useState(false);
    const [aiScore, setAiScore] = useState(null);
    const [recalculating, setRecalculating] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    useEffect(() => {
        const fetchAnimal = async () => {
            try {
                const token = localStorage.getItem('token');
                const config = { headers: { Authorization: `Bearer ${token}` } };

                // Data fetches as fast as the network allows

                const [animalRes, logsRes] = await Promise.all([
                    axios.get(`/api/animals/${id}`, config),
                    axios.get(`/api/animals/${id}/logs`, config)
                ]);

                setAnimal(animalRes.data);
                setLogs(logsRes.data);
                setLoading(false);

                // Auto-recalculate status with AI if logs exist
                if (logsRes.data.length > 0) {
                    try {
                        const recalcRes = await axios.post(
                            `/api/animals/${id}/recalculate`, {}, config
                        );
                        setAnimal(prev => ({ ...prev, status: recalcRes.data.animalStatus }));
                        setAiScore(recalcRes.data.aiErrorScore);
                    } catch (recalcErr) {
                        console.log('AI recalculation skipped');
                    }
                }
            } catch (err) {
                console.error("Failed to fetch animal data", err);
                setLoading(false);
            }
        };

        fetchAnimal();
    }, [id]);

    const handleRecalculate = async () => {
        setRecalculating(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.post(
                `/api/animals/${id}/recalculate`, {},
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setAnimal(prev => ({ ...prev, status: res.data.animalStatus }));
            setAiScore(res.data.aiErrorScore);
        } catch (err) {
            console.error('Recalculation failed', err);
        } finally {
            setRecalculating(false);
        }
    };

    const handleBack = () => {
        navigate('/');
    };

    const handleDelete = async () => {
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`/api/animals/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            navigate('/'); // Go back to dashboard after deletion
        } catch (err) {
            console.error('Failed to delete animal', err);
            alert('Failed to delete animal. Please try again.');
        }
    };

    const handleToggleVaccination = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.put(`/api/animals/${id}/vaccination`, {
                vaccinated: !animal.vaccinated
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setAnimal(prev => ({ ...prev, vaccinated: res.data.vaccinated }));
        } catch (err) {
            console.error('Failed to update vaccination status', err);
            alert('Failed to update vaccination status.');
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.post(`/api/animals/${id}/logs`, formData, {
                headers: { Authorization: `Bearer ${token}` }
            });

            // Update animal status based on server response mapping
            setAnimal(prev => ({
                ...prev,
                status: res.data.animalStatus,
                recentVitals: {
                    temperature: parseFloat(formData.temperature),
                    heartRate: parseInt(formData.heartRate)
                }
            }));
            setAiScore(res.data.aiErrorScore);

            // Prepend new log
            setLogs([res.data.log, ...logs]);

            // Reset numerical inputs for fresh submission
            setFormData(prev => ({ ...prev, temperature: '', heartRate: '', notes: '' }));

        } catch (err) {
            console.error("Failed to save log", err);
            alert("Failed to save log.");
        } finally {
            setSubmitting(false);
        }
    };

    const chartData = [...logs].reverse().map(log => {
        const d = new Date(log.createdAt);
        return {
            date: d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
            temperature: log.temperature,
            heartRate: log.heartRate
        };
    });

    const handleExportCSV = () => {
        if (!logs || logs.length === 0) return;

        // Define CSV headers
        const headers = ['Date', 'Time', 'Temperature (C)', 'Heart Rate (bpm)', 'Activity Level', 'Appetite'];

        // Map logs to CSV rows
        const rows = logs.map(log => {
            const date = new Date(log.createdAt || log.timestamp || new Date());
            return [
                date.toLocaleDateString(),
                date.toLocaleTimeString(),
                log.temperature,
                log.heartRate,
                log.activityLevel,
                log.appetite
            ].join(',');
        });

        const csvContent = [headers.join(','), ...rows].join('\n');

        // Create a blob and trigger download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `${animal.name || 'animal'}_health_logs_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImportCSV = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsImporting(true);
        const reader = new FileReader();

        reader.onload = async (event) => {
            const text = event.target.result;
            const lines = text.split('\n').map(row => row.split(','));

            // Basic validation: skip header [0]
            if (lines.length <= 1) {
                alert("CSV file is empty or invalid format.");
                setIsImporting(false);
                return;
            }

            const token = localStorage.getItem('token');
            const config = { headers: { Authorization: `Bearer ${token}` } };
            let successCount = 0;

            // Iterate over data rows (skip header)
            for (let i = 1; i < lines.length; i++) {
                const row = lines[i];
                if (row.length < 6 || !row[2]) continue; // Skip empty/invalid rows

                try {
                    const data = {
                        temperature: parseFloat(row[2]),
                        heartRate: parseInt(row[3]),
                        activityLevel: parseInt(row[4]) || 5,
                        appetite: parseInt(row[5]) || 3,
                        notes: `Imported from CSV on ${new Date().toLocaleDateString()}`
                    };

                    await axios.post(`/api/animals/${id}/logs`, data, config);
                    successCount++;
                } catch (err) {
                    console.error(`Row ${i} failed to import`, err);
                }
            }

            alert(`Successfully imported ${successCount} logs!`);
            setIsImporting(false);
            e.target.value = ''; // Reset input
            window.location.reload(); // Refresh to catch all new logs and AI recalculation
        };

        reader.onerror = () => {
            alert("Error reading file.");
            setIsImporting(false);
        };

        reader.readAsText(file);
    };

    if (loading) {
        return <AdvancedLoader type="default" />;
    }

    if (!animal) {
        return (
            <div className={styles.pageContainer}>
                <div style={{ textAlign: 'center', marginTop: '3rem', color: 'var(--text-secondary)' }}>
                    Animal not found.
                </div>
                <button className={styles.backBtn} onClick={handleBack}>
                    <ArrowLeft size={18} /> Back to My Aranya
                </button>
            </div>
        );
    }

    const getAvatarEmoji = (category) => {
        if (!category) return '🐾';
        const lowerCat = category.toLowerCase();
        if (lowerCat.includes('cow')) return '🐄';
        if (lowerCat.includes('dog')) return '🐕';
        if (lowerCat.includes('cat')) return '🐈';
        if (lowerCat.includes('horse')) return '🐎';
        if (lowerCat.includes('pig')) return '🐖';
        if (lowerCat.includes('sheep')) return '🐑';
        if (lowerCat.includes('goat')) return '🐐';
        if (lowerCat.includes('bird') || lowerCat.includes('chicken')) return '🐔';
        return '🐾';
    };

    const calculateAge = (dob) => {
        if (!dob) return '';
        const birthDate = new Date(dob);
        const today = new Date();
        let years = today.getFullYear() - birthDate.getFullYear();
        let months = today.getMonth() - birthDate.getMonth();

        if (months < 0 || (months === 0 && today.getDate() < birthDate.getDate())) {
            years--;
            months += 12;
        }

        if (years <= 0 && months <= 0) return 'Newborn';
        if (years <= 0) return `${months}m`;
        if (months === 0) return `${years}y`;
        return `${years}y ${months}m`;
    };

    return (
        <React.Fragment>
            <motion.div
                className={styles.pageContainer}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
            >
                <button className={styles.backBtn} onClick={handleBack}>
                    <ArrowLeft size={16} /> Back to My Aranya
                </button>

                {/* Hero Summary Card */}
                <div className={styles.heroCard}>
                    <div className={styles.heroBranding}></div>
                    <div className={styles.heroMain}>
                        <div className={styles.avatarWrapper}>
                            <motion.div
                                className={styles.avatarGlass}
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: 'spring', damping: 15 }}
                            >
                                {getAvatarEmoji(animal.category)}
                            </motion.div>
                        </div>

                        <div className={styles.heroInfo}>
                            <div className={styles.heroTopRow}>
                                <div className={styles.nameGroup}>
                                    <h1 className={styles.animalNamePrimary}>{animal.name}</h1>
                                    <span className={`${styles.statusBadge} ${animal.status ? styles[`status${animal.status.charAt(0).toUpperCase() + animal.status.slice(1).toLowerCase()}`] : ''}`}>
                                        <div className={styles.statusDot}></div>
                                        {animal.status ? animal.status.toUpperCase() : 'UNKNOWN'}
                                    </span>
                                </div>
                                <div className={styles.heroActionsGroup}>
                                    <button
                                        onClick={handleRecalculate}
                                        disabled={recalculating}
                                        className={styles.glassActionBtn}
                                    >
                                        <RefreshCw size={14} className={recalculating ? 'spin' : ''} />
                                        Recalculate
                                    </button>
                                    {role !== 'caretaker' && (
                                        <button
                                            onClick={() => setShowConfirm(true)}
                                            className={styles.deleteActionBtn}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className={styles.heroMetadataRow}>
                                <div className={styles.metaPill}>
                                    <Zap size={14} className={styles.metaIcon} />
                                    <span>{animal.breed}</span>
                                </div>

                                {animal.dob && (
                                    <div className={styles.metaPill}>
                                        <Calendar size={14} className={styles.metaIcon} />
                                        <span>{calculateAge(animal.dob)}</span>
                                    </div>
                                )}

                                <button
                                    onClick={handleToggleVaccination}
                                    className={`${styles.metaPill} ${animal.vaccinated ? styles.metaPillSuccess : styles.metaPillWarning}`}
                                >
                                    <ShieldAlert size={14} />
                                    <span>{animal.vaccinated ? 'Fully Protected' : 'Vaccine Required'}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className={styles.vitalCards}>
                    <div className={`${styles.vitalCard} ${styles.vitalTemp}`}>
                        <div className={styles.vitalLabel}>
                            <ThermometerSun size={16} /> Temperature
                        </div>
                        <div className={styles.vitalValue}>
                            {animal.recentVitals?.temperature ? `${animal.recentVitals.temperature}°C` : 'N/A'}
                        </div>
                    </div>
                    <div className={`${styles.vitalCard} ${styles.vitalHeart}`}>
                        <div className={styles.vitalLabel}>
                            <HeartPulse size={16} /> Heart Rate
                        </div>
                        <div className={styles.vitalValue}>
                            {animal.recentVitals?.heartRate ? `${animal.recentVitals.heartRate} bpm` : 'N/A'}
                        </div>
                    </div>
                </div>

                {/* Historical Chart Container */}
                <div className={styles.card} style={logs.length === 0 ? { padding: 0 } : {}}>
                    {logs.length === 0 ? (
                        <div className={styles.emptyState}>
                            <div className={styles.emptyIcon}>📊</div>
                            <div className={styles.emptyTitle}>No health data yet</div>
                            <div className={styles.emptySubtitle}>Start logging health data to see trends and patterns</div>
                        </div>
                    ) : (
                        <div style={{ width: '100%', height: 350 }}>
                            <h3 className={styles.formHeader} style={{ marginBottom: '1rem' }}>Health Trends</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart
                                    data={chartData}
                                    margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} axisLine={false} minTickGap={30} />
                                    <YAxis yAxisId="left" tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} axisLine={false} domain={['dataMin - 1', 'dataMax + 1']} />
                                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} axisLine={false} domain={['dataMin - 5', 'dataMax + 5']} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                    />
                                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                    <Line yAxisId="left" type="monotone" dataKey="temperature" name="Temp (°C)" stroke="#166534" strokeWidth={3} dot={{ r: 4, fill: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                                    <Line yAxisId="right" type="monotone" dataKey="heartRate" name="Heart Rate (BPM)" stroke="#075985" strokeWidth={3} dot={{ r: 4, fill: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                {/* Log New Health Data Form */}
                <div className={styles.card}>
                    <h3 className={styles.formHeader}>Log New Health Data</h3>

                    <form onSubmit={handleSubmit}>
                        <div className={styles.formGrid}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Temperature (°C) *</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    name="temperature"
                                    value={formData.temperature}
                                    onChange={handleChange}
                                    placeholder="e.g., 38.5"
                                    className={styles.input}
                                    required
                                />
                                <span className={styles.helpText}>Normal range: 38-39.2°C</span>
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>Heart Rate (bpm) *</label>
                                <input
                                    type="number"
                                    name="heartRate"
                                    value={formData.heartRate}
                                    onChange={handleChange}
                                    placeholder="e.g., 70"
                                    className={styles.input}
                                    required
                                />
                                <span className={styles.helpText}>Normal range: 60-80 bpm</span>
                            </div>
                        </div>

                        <div className={styles.rangeGroup}>
                            <div className={styles.rangeHeader}>
                                <label className={styles.label}>Activity Level: {formData.activityLevel}/10</label>
                            </div>
                            <input
                                type="range"
                                min="1" max="10"
                                name="activityLevel"
                                value={formData.activityLevel}
                                onChange={handleChange}
                                className={styles.rangeSlider}
                            />
                            <div className={styles.rangeLabels}>
                                <span>Low Activity</span>
                                <span>High Activity</span>
                            </div>
                        </div>

                        <div className={styles.rangeGroup}>
                            <div className={styles.rangeHeader}>
                                <label className={styles.label}>Appetite: {formData.appetite}/5</label>
                            </div>
                            <input
                                type="range"
                                min="1" max="5"
                                name="appetite"
                                value={formData.appetite}
                                onChange={handleChange}
                                className={styles.rangeSlider}
                            />
                            <div className={styles.rangeLabels}>
                                <span>Poor Appetite</span>
                                <span>Excellent Appetite</span>
                            </div>
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.label}>Additional Notes (Optional)</label>
                            <textarea
                                name="notes"
                                value={formData.notes}
                                onChange={handleChange}
                                placeholder="Any observations or concerns about the animal..."
                                className={`${styles.input} ${styles.textarea}`}
                            ></textarea>
                        </div>

                        <button
                            type="submit"
                            className={styles.saveBtn}
                            disabled={submitting}
                        >
                            <Save size={20} />
                            {submitting ? 'Saving...' : 'Save Health Log'}
                        </button>
                    </form>
                </div>

                {/* History Table */}
                <div className={styles.card} style={{ marginTop: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                        <h3 className={styles.formHeader} style={{ margin: 0 }}>
                            <FileText size={20} style={{ marginRight: '8px', verticalAlign: 'text-bottom' }} />
                            Historical Health Logs
                        </h3>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <input
                                type="file"
                                accept=".csv"
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                onChange={handleImportCSV}
                            />
                            <button
                                className="btn-secondary"
                                onClick={() => fileInputRef.current.click()}
                                disabled={isImporting}
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                <Upload size={16} /> {isImporting ? 'Importing...' : 'Import CSV'}
                            </button>
                            <button
                                className="btn-secondary"
                                onClick={handleExportCSV}
                                disabled={logs.length === 0}
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                <Download size={16} /> Export CSV
                            </button>
                        </div>
                    </div>

                    {logs.length === 0 ? (
                        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 0' }}>
                            No logs found for this animal.
                        </p>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
                                <thead>
                                    <tr style={{ background: 'var(--background-start)', borderBottom: '2px solid var(--border)' }}>
                                        <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Date & Time</th>
                                        <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Temp (°C)</th>
                                        <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Heart Rate</th>
                                        <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Activity</th>
                                        <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Appetite</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...logs].reverse().map((log, idx) => {
                                        const logDate = log.createdAt || log.timestamp;
                                        const displayDate = logDate ? new Date(logDate).toLocaleString() : 'N/A';

                                        return (
                                            <tr key={log._id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '12px 16px' }}>{displayDate}</td>
                                                <td style={{ padding: '12px 16px', fontWeight: 500 }}>{log.temperature}</td>
                                                <td style={{ padding: '12px 16px', fontWeight: 500 }}>{log.heartRate}</td>
                                                <td style={{ padding: '12px 16px' }}>{log.activityLevel}/10</td>
                                                <td style={{ padding: '12px 16px' }}>{log.appetite}/5</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

            </motion.div>

            <ConfirmDialog
                isOpen={showConfirm}
                onClose={() => setShowConfirm(false)}
                onConfirm={handleDelete}
                title="Delete Animal"
                message={`Are you sure you want to delete ${animal?.name}? This action cannot be undone and all health history will be lost.`}
                confirmText="Delete permanently"
                type="danger"
            />
        </React.Fragment>
    );
}
