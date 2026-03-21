import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ThermometerSun, HeartPulse, Save, RefreshCw, Download, FileText, Upload, AlertCircle, Trash2, Calendar, Zap, ShieldAlert, FolderHeart, Utensils, Activity, Plus, Scale, Venus, Mars, Dna, HelpCircle, Edit } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import axios from 'axios';
import styles from './AnimalProfile.module.css';
import AdvancedLoader from '../components/AdvancedLoader';
import ConfirmDialog from '../components/ConfirmDialog';
import EditAnimalDialog from '../components/EditAnimalDialog';
import { useToast } from '../components/ToastProvider';

const calculateLogStatus = (log) => {
    let score = 0;
    const t = Number(log.temperature);
    if (t > 40.0 || t < 37.0) score += 3;
    else if (t > 39.3 || t < 37.6) score += 1;

    const hr = Number(log.heartRate);
    if (hr > 100 || hr < 40) score += 3;
    else if (hr > 85 || hr < 50) score += 1;

    const act = Number(log.activityLevel || 5);
    if (act < 2) score += 2;
    else if (act < 3) score += 1;

    const app = Number(log.appetite || 3.5);
    if (app < 1.5) score += 2;
    else if (app < 2.5) score += 1;

    if (score >= 4) return 'Critical';
    if (score >= 2) return 'Warning';
    return 'Healthy';
};

export default function AnimalProfile() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { role } = useOutletContext();
    const { showToast } = useToast();

    const [animal, setAnimal] = useState(null);
    const [healthLogs, setHealthLogs] = useState([]);
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
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [activeTab, setActiveTab] = useState('health'); // Options: 'health', 'vault'
    
    // Care Hub States
    const [medicalRecords, setMedicalRecords] = useState([]);
    const recordFileInputRef = React.useRef(null);
    const [isUploadingRecord, setIsUploadingRecord] = useState(false);
    const [isEditingWeight, setIsEditingWeight] = useState(false);
    const [tempWeight, setTempWeight] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const logsPerPage = 7;

    const [timeRange, setTimeRange] = useState('all');

    const handleExportCSV = () => {
        if (!healthLogs.length) return showToast("No data to export", "warning");
        const headers = ["Date", "Time", "Category", "Breed", "Gender", "Temp (°C)", "Heart Rate", "Activity", "Appetite", "Notes", "Health Status"];
        const rows = healthLogs.map(log => {
            const d = new Date(log.createdAt);
            return [
                d.toLocaleDateString(), 
                d.toLocaleTimeString(), 
                animal.category,
                animal.breed,
                animal.gender || 'Not Specified',
                log.temperature, 
                log.heartRate, 
                log.activityLevel, 
                log.appetite, 
                `"${log.notes || ''}"`,
                calculateLogStatus(log)
            ].join(",");
        });
        const csv = "\ufeff" + headers.join(",") + "\r\n" + rows.join("\r\n");
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${animal.name}_Medical_Report.csv`;
        link.click();
    };

    const filteredLogs = React.useMemo(() => {
        if (timeRange === 'all') return healthLogs;
        const now = new Date();
        const cutoff = new Date();
        if (timeRange === '1h') cutoff.setHours(now.getHours() - 1);
        else if (timeRange === '1d') cutoff.setDate(now.getDate() - 1);
        else if (timeRange === '7d') cutoff.setDate(now.getDate() - 7);
        return healthLogs.filter(log => new Date(log.createdAt) >= cutoff);
    }, [healthLogs, timeRange]);

    useEffect(() => { setCurrentPage(1); }, [timeRange]);

    const handleRecordUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsUploadingRecord(true); // Use setIsUploadingRecord as it's already defined for this purpose
        try {
            const token = localStorage.getItem('token');
            const formData = new FormData();
            formData.append('recordFile', file);
            
            // Intelligence: Simple keyword parsing for smarter labels
            let detectedType = 'General';
            const fileName = file.name.toLowerCase();
            if (fileName.includes('lab') || fileName.includes('report')) detectedType = 'Lab Results';
            if (fileName.includes('vacc') || fileName.includes('shot')) detectedType = 'Vaccination';
            if (fileName.includes('blood')) detectedType = 'Lab Results'; // Map blood to lab results
            if (fileName.includes('presc')) detectedType = 'Prescription';

            // Snappy AI Analysis Feedback
            await new Promise(resolve => setTimeout(resolve, 800));

            formData.append('title', file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, ' '));
            formData.append('recordType', detectedType);

            const res = await axios.post(`/api/animals/${id}/records`, formData, { 
                headers: { 
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                } 
            });
            
            // Absolute synchronization
            const recordsRes = await axios.get(`/api/animals/${id}/records`, { headers: { Authorization: `Bearer ${token}` } });
            setMedicalRecords(recordsRes.data);
            
            const logsRes = await axios.get(`/api/animals/${id}/logs`, { headers: { Authorization: `Bearer ${token}` } });
            setHealthLogs(logsRes.data);
            e.target.value = ''; 
            console.log('Care records synchronized');
            
            // Success feedback
            console.log('Record scanned successfully');
        } catch (err) {
            console.error('Upload failed', err);
        } finally {
            setIsUploadingRecord(false);
        }
    };

    const handleDeleteRecord = async (recordId) => {
        if (!window.confirm('Are you sure you want to delete this record?')) return;
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`/api/animals/${id}/records/${recordId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setMedicalRecords(prev => prev.filter(r => r._id !== recordId));
        } catch (err) {
            console.error('Failed to delete record', err);
            showToast('Failed to delete record', 'error');
        }
    };

    const handleWeightUpdate = async () => {
        if (!tempWeight) return setIsEditingWeight(false);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.put(`/api/animals/${id}/vitals`, { 
                weight: parseFloat(tempWeight) 
            }, { headers: { Authorization: `Bearer ${token}` } });
            
            setAnimal(prev => ({
                ...prev,
                recentVitals: { ...prev.recentVitals, weight: res.data.recentVitals.weight }
            }));
            setIsEditingWeight(false);
        } catch (err) {
            console.error('Weight update failed', err);
            showToast('Failed to update weight', 'error');
        }
    };

    const handleUpdateAnimal = async (updatedData) => {
        const token = localStorage.getItem('token');
        try {
            const res = await axios.put(`/api/animals/${id}`, updatedData, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setAnimal(res.data);
            showToast('Aranya profile updated successfully!');
        } catch (err) {
            console.error('Update error:', err);
            showToast('Failed to update Aranya details.', 'error');
        }
    };


    useEffect(() => {
        const fetchAnimal = async () => {
            try {
                const token = localStorage.getItem('token');
                const config = { headers: { Authorization: `Bearer ${token}` } };

                const [animalRes, logsRes, recordsRes] = await Promise.all([
                    axios.get(`/api/animals/${id}`, config),
                    axios.get(`/api/animals/${id}/logs`, config),
                    axios.get(`/api/animals/${id}/records`, config)
                ]);

                setAnimal(animalRes.data);
                setHealthLogs(logsRes.data);
                setMedicalRecords(recordsRes.data);
                setLoading(false);

                if (logsRes.data.length > 0) {
                    try {
                        const recalcRes = await axios.post(`/api/animals/${id}/reanalyze`, {}, config);
                        setAnimal(prev => ({ ...prev, status: recalcRes.data.animalStatus }));
                        setAiScore(recalcRes.data.aiErrorScore);
                    } catch (recalcErr) {
                        console.log('AI reanalysis skipped');
                    }
                }
            } catch (err) {
                console.error("Failed to fetch animal data", err);
                setLoading(false);
            }
        };

        fetchAnimal();
    }, [id]);

    const handleReanalyze = async () => {
        setRecalculating(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.post(`/api/animals/${id}/reanalyze`, {}, { headers: { Authorization: `Bearer ${token}` } });
            setAnimal(prev => ({ ...prev, status: res.data.animalStatus }));
            setAiScore(res.data.aiErrorScore);
            showToast('Reanalysis complete!', 'success');
        } catch (err) {
            console.error('Reanalysis failed', err);
            showToast(err.response?.data?.msg || 'Reanalysis failed', 'error');
        } finally {
            setRecalculating(false);
        }
    };

    const handleBack = () => navigate('/');

    const handleDelete = async () => {
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`/api/animals/${id}`, { headers: { Authorization: `Bearer ${token}` } });
            navigate('/');
        } catch (err) {
            console.error('Failed to delete animal', err);
            showToast('Failed to delete animal.', 'error');
        }
    };

    const handleToggleVaccination = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.put(`/api/animals/${id}/vaccination`, { vaccinated: !animal.vaccinated }, { headers: { Authorization: `Bearer ${token}` } });
            setAnimal(prev => ({ ...prev, vaccinated: res.data.vaccinated }));
        } catch (err) {
            console.error('Failed to update vaccination status', err);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const token = localStorage.getItem('token');
            // Explicitly merging current animal weight since it's no longer in the form
            const submitData = { 
                ...formData, 
                weight: animal.recentVitals?.weight 
            };
            const res = await axios.post(`/api/animals/${id}/logs`, submitData, { headers: { Authorization: `Bearer ${token}` } });
            setAnimal(prev => ({
                ...prev,
                status: res.data.animalStatus,
                recentVitals: { 
                    temperature: parseFloat(formData.temperature), 
                    heartRate: parseInt(formData.heartRate),
                    weight: animal.recentVitals?.weight 
                }
            }));
            setAiScore(res.data.aiErrorScore);
            setHealthLogs([res.data.log, ...healthLogs]);
            setFormData(prev => ({ ...prev, temperature: '', heartRate: '', notes: '' }));
        } catch (err) {
            console.error("Failed to save log", err);
        } finally {
            setSubmitting(false);
        }
    };

    const chartData = [...filteredLogs].reverse().map(log => ({
        date: new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase(),
        temperature: log.temperature,
        heartRate: log.heartRate
    }));

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
        if (months < 0 || (months === 0 && today.getDate() < birthDate.getDate())) { years--; months += 12; }
        if (years <= 0 && months <= 0) return 'Newborn';
        if (years <= 0) return `${months}m`;
        if (months === 0) return `${years}y`;
        return `${years}y ${months}m`;
    };

    if (loading) return <AdvancedLoader type="default" />;
    if (!animal) return <div className={styles.pageContainer}><button className={styles.backBtn} onClick={handleBack}><ArrowLeft size={18} /> Back</button></div>;

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
                            <motion.div className={styles.avatarGlass} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
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
                                    <button onClick={() => setShowEditDialog(true)} className={styles.glassActionBtn}>
                                        <Edit size={14} /> Profile
                                    </button>
                                    <button onClick={handleReanalyze} disabled={recalculating} className={styles.glassActionBtn}>
                                        <RefreshCw size={14} className={recalculating ? 'spin' : ''} /> {recalculating ? 'Reanalyzing...' : 'Reanalyze'}
                                    </button>
                                    {role !== 'caretaker' && (
                                        <button onClick={() => setShowConfirm(true)} className={styles.deleteActionBtn}><Trash2 size={14} /></button>
                                    )}
                                </div>
                            </div>
                            <div className={styles.heroMetadataRow}>
                                <div className={styles.metaPill}><Dna size={14} style={{ color: '#8b5cf6' }} /> <span>{animal.breed}</span></div>
                                <div className={styles.metaPill}>
                                    {animal.gender === 'Male' ? (
                                        <Mars size={14} style={{ color: '#3b82f6' }} />
                                    ) : animal.gender === 'Female' ? (
                                        <Venus size={14} style={{ color: '#ec4899' }} />
                                    ) : (
                                        <HelpCircle size={14} style={{ color: '#64748b' }} />
                                    )}
                                    <span>{animal.gender || 'Not Specified'}</span>
                                </div>
                                {animal.dob && <div className={styles.metaPill}><Calendar size={14} style={{ color: '#f59e0b' }} /> <span>{calculateAge(animal.dob)}</span></div>}
                                <button onClick={handleToggleVaccination} className={`${styles.metaPill} ${animal.vaccinated ? styles.metaPillSuccess : styles.metaPillWarning}`}>
                                    <ShieldAlert size={14} /> <span>{animal.vaccinated ? 'Fully Protected' : 'Vaccination Due'}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className={styles.vitalCards}>
                    <div className={`${styles.vitalCard} ${styles.vitalTemp}`}>
                        <div className={styles.vitalLabel}><ThermometerSun size={16} /> Temperature</div>
                        <div className={styles.vitalValue}>{animal.recentVitals?.temperature ? `${animal.recentVitals.temperature}°C` : 'N/A'}</div>
                    </div>
                    <div className={`${styles.vitalCard} ${styles.vitalHeart}`}>
                        <div className={styles.vitalLabel}><HeartPulse size={16} /> Heart Rate</div>
                        <div className={styles.vitalValue}>{animal.recentVitals?.heartRate ? `${animal.recentVitals.heartRate} bpm` : 'N/A'}</div>
                    </div>
                    <div className={`${styles.vitalCard} ${styles.vitalWeight}`}>
                        <div className={styles.vitalLabel}>
                            <Scale size={16} /> Weight (kg)
                            <button 
                                className={styles.editPillBtn} 
                                onClick={() => {
                                    setTempWeight(animal.recentVitals?.weight || '');
                                    setIsEditingWeight(!isEditingWeight);
                                }}
                            >
                                {isEditingWeight ? 'Cancel' : 'Edit'}
                            </button>
                        </div>
                        {isEditingWeight ? (
                            <div className={styles.inlineEditGroup}>
                                <input 
                                    type="number" 
                                    step="0.1" 
                                    value={tempWeight} 
                                    onChange={(e) => setTempWeight(e.target.value)}
                                    className={styles.inlineInput}
                                    autoFocus
                                />
                                <button onClick={handleWeightUpdate} className={styles.inlineSaveBtn}><Save size={14} /></button>
                            </div>
                        ) : (
                            <div className={styles.vitalValue}>{animal.recentVitals?.weight ? `${animal.recentVitals.weight} kg` : 'N/A'}</div>
                        )}
                    </div>
                </div>

                {/* --- TAB NAVIGATION --- */}
                <div className={styles.tabNav}>
                    <button className={`${styles.tabBtn} ${activeTab === 'health' ? styles.tabBtnActive : ''}`} onClick={() => setActiveTab('health')}>
                        <Activity size={18} /> Health Monitor
                    </button>
                    <button className={`${styles.tabBtn} ${activeTab === 'vault' ? styles.tabBtnActive : ''}`} onClick={() => setActiveTab('vault')}>
                        <FolderHeart size={18} /> Medical Vault
                    </button>
                </div>

                {/* --- TAB CONTENT --- */}
                {activeTab === 'health' && (
                    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
                        {/* ── 1. Log New Data (Form) ── */}
                        <div className={styles.card}>
                            <h3 className={styles.formHeader}>Log New Health Data</h3>
                            <form onSubmit={handleSubmit}>
                                <div className={styles.formGrid}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.label}>Temperature (°C) *</label>
                                        <input type="number" step="0.1" name="temperature" value={formData.temperature} onChange={handleChange} placeholder="e.g., 38.5" className={styles.input} required />
                                        <span className={styles.helpText}>Normal range: 38.0-39.0°C</span>
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.label}>Heart Rate (bpm) *</label>
                                        <input type="number" name="heartRate" value={formData.heartRate} onChange={handleChange} placeholder="e.g., 70" className={styles.input} required />
                                        <span className={styles.helpText}>Normal range: 60-80 bpm</span>
                                    </div>
                                </div>

                                <div className={styles.rangeGroup}>
                                    <div className={styles.rangeHeader}>
                                        <label className={styles.label}>Activity Level: {formData.activityLevel}/10</label>
                                    </div>
                                    <input type="range" name="activityLevel" min="0" max="10" value={formData.activityLevel} onChange={handleChange} className={styles.rangeSlider} />
                                    <div className={styles.rangeLabels}><span>Low Activity</span><span>High Activity</span></div>
                                </div>

                                <div className={styles.rangeGroup}>
                                    <div className={styles.rangeHeader}>
                                        <label className={styles.label}>Appetite: {formData.appetite}/5</label>
                                    </div>
                                    <input type="range" name="appetite" min="1" max="5" value={formData.appetite} onChange={handleChange} className={styles.rangeSlider} />
                                    <div className={styles.rangeLabels}><span>Poor Appetite</span><span>Excellent Appetite</span></div>
                                </div>

                                <button type="submit" className={styles.saveBtn} disabled={submitting}>
                                    <Save size={20} /> {submitting ? 'Saving...' : 'Save Health Log'}
                                </button>
                            </form>
                        </div>

                        {/* ── 2. Historical Logs (Chart/Table) ── */}
                        <div className={styles.card}>
                            <div className={styles.vaultHeader} style={{ marginBottom: '1.5rem', marginTop: 0 }}>
                                <h3 className={styles.formHeader} style={{ marginBottom: 0 }}><FileText size={20} style={{ marginRight: '8px' }} /> Historical Health Logs</h3>
                                <div className={styles.heroActionsGroup}>
                                    <button className={styles.viewBtn} onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
                                        <Upload size={16} /> {isImporting ? 'Importing...' : 'Import CSV'}
                                    </button>
                                    <button className={styles.viewBtn} onClick={handleExportCSV}><Download size={16} /> Export CSV</button>
                                </div>
                                <input type="file" ref={fileInputRef} onChange={() => {}} style={{ display: 'none' }} accept=".csv" />
                            </div>

                            {healthLogs.length === 0 ? (
                                <div className={styles.emptyStateV2}>No logs found for this animal.</div>
                            ) : (
                                <React.Fragment>
                                    <div className={styles.tableWrapper}>
                                        <table className={styles.healthTable}>
                                            <thead>
                                                <tr>
                                                    <th>Date & Time</th>
                                                    <th>Category</th>
                                                    <th>Breed</th>
                                                    <th>Gender</th>
                                                    <th>Temp (°C)</th>
                                                    <th>Heart Rate</th>
                                                    <th>Activity</th>
                                                    <th>Appetite</th>
                                                    <th>Health Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {healthLogs.slice((currentPage - 1) * logsPerPage, currentPage * logsPerPage).map(log => (
                                                    <tr key={log._id}>
                                                        <td>{new Date(log.createdAt).toLocaleString([], { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}</td>
                                                        <td>{animal.category}</td>
                                                        <td>{animal.breed}</td>
                                                        <td>{animal.gender || '—'}</td>
                                                        <td>{log.temperature}</td>
                                                        <td>{log.heartRate}</td>
                                                        <td>{log.activityLevel || 5}/10</td>
                                                        <td>{log.appetite || 3}/5</td>
                                                        <td>
                                                            <span className={`${styles.statusBadge} ${styles[`status${calculateLogStatus(log)}`]}`}>
                                                                <div className={styles.statusDot}></div>
                                                                {calculateLogStatus(log)}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    {healthLogs.length > logsPerPage && (
                                        <div className={styles.pagination}>
                                            <button 
                                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                                                disabled={currentPage === 1}
                                                className={styles.pageBtn}
                                            >
                                                &lt; Prev
                                            </button>
                                            <span className={styles.pageInfo}>Page {currentPage} of {Math.ceil(healthLogs.length / logsPerPage)}</span>
                                            <button 
                                                onClick={() => setCurrentPage(p => Math.min(Math.ceil(healthLogs.length / logsPerPage), p + 1))} 
                                                disabled={currentPage === Math.ceil(healthLogs.length / logsPerPage)}
                                                className={styles.pageBtn}
                                            >
                                                Next &gt;
                                            </button>
                                        </div>
                                    )}
                                </React.Fragment>
                            )}
                        </div>

                        {/* ── 3. Health Chart (Visual Trends) ── */}
                        {healthLogs.length > 0 && (
                            <div className={styles.card}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                                    <h3 className={styles.chartTitle} style={{ marginBottom: 0 }}>Health Visual Trends</h3>
                                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginRight: '0.5rem' }}>
                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#166534' }} />
                                                <span style={{ fontSize: '0.7rem', fontWeight: 900, color: '#64748b', letterSpacing: '0.05em' }}>TEMP</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0ea5e9' }} />
                                                <span style={{ fontSize: '0.7rem', fontWeight: 900, color: '#64748b', letterSpacing: '0.05em' }}>HEART RATE</span>
                                            </div>
                                        </div>
                                        <div className={styles.filterTrack}>
                                        {['1h', '1d', '7d', 'all'].map(r => (
                                            <button 
                                                key={r} 
                                                onClick={() => setTimeRange(r)} 
                                                className={`${styles.filterItem} ${timeRange === r ? styles.filterItemActive : ''}`}
                                            >
                                                {timeRange === r && (
                                                    <motion.div 
                                                        layoutId="activeFilter" 
                                                        className={styles.activeHighlight} 
                                                        transition={{ type: "spring", bounce: 0.3, duration: 0.6 }}
                                                    />
                                                )}
                                                <span className={styles.filterLabel}>
                                                    {r.toUpperCase()}
                                                </span>
                                            </button>
                                        ))}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ width: '100%', height: 350 }}>
                                    <ResponsiveContainer width="100%" height="90%">
                                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#166534" stopOpacity={0.1}/><stop offset="95%" stopColor="#166534" stopOpacity={0}/></linearGradient>
                                                <linearGradient id="colorHR" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.1}/><stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/></linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                                            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                                            <Tooltip />
                                            <Area type="monotone" dataKey="temperature" name="Temp (°C)" stroke="#166534" strokeWidth={3} fillOpacity={1} fill="url(#colorTemp)" isAnimationActive={false} />
                                            <Area type="monotone" dataKey="heartRate" name="Heart Rate" stroke="#0ea5e9" strokeWidth={3} fillOpacity={1} fill="url(#colorHR)" isAnimationActive={false} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}

                {activeTab === 'vault' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                        <div className={styles.card}>
                            <div className={styles.vaultHeader}>
                                <div>
                                    <h3 className={styles.formHeader}><FolderHeart size={20} style={{ marginRight: '8px' }} /> Medical Records Vault</h3>
                                    <p className={styles.vaultSubtitle}>Upload vaccinations and lab results.</p>
                                </div>
                                <button className={styles.uploadBtn} onClick={() => recordFileInputRef.current?.click()} disabled={isUploadingRecord}>
                                    <Upload size={18} /> {isUploadingRecord ? 'Scanning...' : 'Upload New'}
                                </button>
                                <input type="file" ref={recordFileInputRef} onChange={handleRecordUpload} style={{ display: 'none' }} />
                            </div>
                            {medicalRecords.length === 0 ? (
                                <div className={styles.emptyStateVault}>📂<p>Vault is empty. Start scanning medical records.</p></div>
                            ) : (
                                <div className={styles.recordsList}>
                                    {medicalRecords.map(record => (
                                        <div key={record._id} className={styles.recordItem}>
                                            <div className={styles.recordIcon}><FileText size={18} /></div>
                                            <div className={styles.recordInfo}>
                                                <div className={styles.recordTitle}>{record.title}</div>
                                                <div className={styles.recordMeta}>{record.recordType} • {new Date(record.createdAt).toLocaleDateString()}</div>
                                            </div>
                                            <div className={styles.recordActionGroup}>
                                                <a href={record.fileUrl} target="_blank" rel="noopener noreferrer" className={styles.viewBtn}>View</a>
                                                <button onClick={() => handleDeleteRecord(record._id)} className={styles.deleteRecordBtn}><Trash2 size={16} /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </motion.div>

            <EditAnimalDialog
                isOpen={showEditDialog}
                onClose={() => setShowEditDialog(false)}
                onUpdate={handleUpdateAnimal}
                animal={animal}
            />

            <ConfirmDialog
                isOpen={showConfirm}
                onClose={() => setShowConfirm(false)}
                onConfirm={handleDelete}
                title="Delete Animal"
                message={`Are you sure you want to delete ${animal?.name}?`}
                confirmText="Delete permanently"
                type="danger"
            />
        </React.Fragment>
    );
}
