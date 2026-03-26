import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

import {
    ThermometerSun, HeartPulse, Save, RefreshCw, Download, FileText, Upload, AlertCircle,
    Trash2, Calendar, Zap, ShieldAlert, FolderHeart, Utensils, Activity, Plus, Gauge,
    Venus, Mars, Dna, HelpCircle, Edit, HardDrive, MapPin, CloudSun, Sparkles, X, Check,
    ShieldCheck, Syringe, CheckCircle, Circle, Cpu, RotateCcw
} from 'lucide-react';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import axios from 'axios';
import styles from './AnimalProfile.module.css';
import AdvancedLoader from '../components/AdvancedLoader';
import ConfirmDialog from '../components/ConfirmDialog';
import EditAnimalDialog from '../components/EditAnimalDialog';
import { useToast } from '../components/ToastProvider';

const calculateLogStatus = (log, index, allLogs = [], animalLimits = null) => {
    // 🧠 TIER 1: TACTICAL INDIVIDUAL ENGINE (Row-by-Row status)
    const base = animalLimits || { min_temp_c: 37.5, max_temp_c: 39.2, min_hr: 60, max_hr: 110, min_spo2: 95, max_spo2: 100, min_rr: 10, max_rr: 30 };

    // Scale for Activity/Ambient in the table
    let adj = { ...base };
    const activity = Number(log.activityLevel || 3);
    const ambient = Number(log.ambientTemperature || 22);
    if (activity >= 4) { adj.max_hr *= 1.5; adj.max_rr *= 1.5; }
    if (activity <= 1) { adj.min_hr *= 0.8; }
    if (ambient > 30.0) { adj.max_rr *= 1.25; adj.max_temp_c += 0.5; }

    const t = Number(log.temperature);
    const hr = Number(log.heartRate);
    const spo2 = Number(log.spo2);
    const rr = Number(log.respiratoryRate);

    // Immediate Surgical Critical (Life-threatening)
    if (t < 33.5 || t > 42.0 || hr > adj.max_hr * 1.8 || (spo2 > 0 && spo2 < 86)) return 'CRITICAL';

    // Simple Alert (Out of range)
    if (t > adj.max_temp_c || t < adj.min_temp_c || hr > adj.max_hr || hr < adj.min_hr || (spo2 > 0 && spo2 < 93) || (rr > adj.max_rr)) {
        return 'ALERT';
    }

    return 'HEALTHY';
};

const VaccineItem = ({ v, idx, toggleVaccineStatus, handleVaccineDateChange }) => {
    const done = v.status === 'Completed';

    return (
        <div className={styles.timelineItem}>
            <div className={styles.timelineConnector}>
                <div
                    className={`${styles.timelineNode} ${done ? styles.nodeGolden : ''}`}
                >
                    {done ? <ShieldCheck size={14} className={styles.goldenIcon} strokeWidth={2.5} /> : <Circle size={10} strokeWidth={3} className={styles.emptyNodeIcon} />}
                </div>
                <div className={styles.timelineLine}></div>
            </div>

            <div className={`${styles.careCard} ${done ? styles.careCardDone : ''}`}>
                <div className={styles.ccHeader}>
                    <div className={styles.ccTitleWrapper}>
                        <div className={styles.ccTitleGroup}>
                            <h4 className={styles.ccTitle}>{v.name}</h4>
                            <span className={`${styles.ccBadge} ${v.type === 'Core' ? styles.ccBadgeCore : styles.ccBadgeOpt}`}>
                                {v.type}
                            </span>
                        </div>
                    </div>

                    <label className={styles.ccCheckboxContainer}>
                        <input
                            type="checkbox"
                            checked={done}
                            onChange={() => toggleVaccineStatus(idx)}
                            className={styles.ccHiddenCheckbox}
                        />
                        <div className={`${styles.ccCustomCheckbox} ${done ? styles.ccChecked : ''}`}>
                            {done ? <Check size={14} strokeWidth={3} /> : null}
                        </div>
                    </label>
                </div>

                <p className={styles.ccDesc}>{v.description}</p>

                <div className={styles.ccDates}>
                    <div className={styles.ccDateGroup}>
                        <div className={styles.ccDateBlock}>
                            <div className={styles.ccDateIconWrap}>
                                <Calendar size={14} className={styles.ccDateIcon} />
                            </div>
                            <div className={styles.ccDateInputWrapper}>
                                <label>Last Given</label>
                                <input
                                    type="date"
                                    className={styles.cleanDateInput}
                                    value={v.lastDate ? new Date(v.lastDate).toISOString().split('T')[0] : ''}
                                    onChange={(e) => handleVaccineDateChange(idx, 'lastDate', e.target.value)}
                                />
                            </div>
                        </div>


                        <div className={styles.ccDateBlock}>
                            <div className={styles.ccDateIconWrap}>
                                <Calendar size={14} className={styles.ccDateIcon} />
                            </div>
                            <div className={styles.ccDateInputWrapper}>
                                <label>Next Due</label>
                                <span className={styles.ccDateDisplay}>
                                    {v.dueDate ? (() => {
                                        const d = new Date(v.dueDate);
                                        return `${d.getDate()} ${d.toLocaleDateString('en-IN', { month: 'short' })}, ${d.getFullYear().toString().slice(-2)}`;
                                    })() : '—'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className={styles.ccInfoPills}>
                        {(v.frequencyLabel || v.isOneTime || v.frequencyMonths) && (
                            <span className={styles.ccFreqPill}>
                                <RefreshCw size={10} /> {
                                    v.frequencyLabel || (
                                        v.isOneTime ? 'PROTECTED' : (
                                            v.frequencyMonths >= 12 && v.frequencyMonths % 12 === 0
                                                ? `Every ${v.frequencyMonths / 12} ${v.frequencyMonths / 12 === 1 ? 'Year' : 'Years'}`
                                                : `Every ${v.frequencyMonths || 12} Months`
                                        )
                                    )
                                }
                            </span>
                        )}
                        {v.ageRangeLabel && (
                            <span className={styles.ccAgePill}>
                                <Clock size={10} /> {v.ageRangeLabel}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// Normalize status string to a CSS class name suffix (e.g. 'HEALTHY' -> 'Healthy')
const normalizeStatus = (status) => {
    if (!status) return 'Healthy';
    const s = status.toUpperCase();
    if (s === 'CRITICAL') return 'Critical';
    if (s === 'ALERT' || s === 'WARNING') return 'Alert';
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
        spo2: '',
        respiratoryRate: '',
        ambientTemperature: '',
        activityLevel: 5,
        notes: ''
    });

    const [submitting, setSubmitting] = useState(false);
    const [aiScore, setAiScore] = useState(null);
    const [recalculating, setRecalculating] = useState(false);
    const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, title: '', message: '', onConfirm: () => { }, confirmText: 'Confirm', type: 'primary' });
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [activeTab, setActiveTab] = useState('health'); // Options: 'health', 'vault'
    const [userProfile, setUserProfile] = useState(null);

    // Care Hub States
    const [medicalRecords, setMedicalRecords] = useState([]);
    const recordFileInputRef = React.useRef(null);
    const [isUploadingRecord, setIsUploadingRecord] = useState(false);
    const [isEditingWeight, setIsEditingWeight] = useState(false);
    const [tempWeight, setTempWeight] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const logsPerPage = 7;

    const [timeRange, setTimeRange] = useState('all');
    const [outsideTemp, setOutsideTemp] = useState(24.5); // Mocked live temp
    const [fetchingTemp, setFetchingTemp] = useState(false);
    const [fetchingLoc, setFetchingLoc] = useState(false);

    // Arion Care Cycle States
    const [showVaccineModal, setShowVaccineModal] = useState(false);
    const [isFetchingVaccines, setIsFetchingVaccines] = useState(false);
    const [vaccineSchedule, setVaccineSchedule] = useState([]);
    const [aiConclusion, setAiConclusion] = useState('');
    const [isSavingVaccines, setIsSavingVaccines] = useState(false);


    const handleExportCSV = () => {
        if (!healthLogs.length) return showToast("No data to export", "warning");
        const headers = ["Date", "Time", "Category", "Breed", "Gender", "Temp (°C)", "Heart Rate", "SpO2 (%)", "Resp Rate", "Ambient Temp (°C)", "Activity", "Health Status"];
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
                log.spo2 || '—',
                log.respiratoryRate || '—',
                log.ambientTemperature || '—',
                log.activityLevel,
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

    const handleImportCSV = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setIsImporting(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const text = event.target.result;
                const rows = text.split('\n').map(r => r.trim()).filter(r => r && !r.startsWith('Date'));
                const parsedLogs = [];
                for (const row of rows) {
                    // Split by comma but preserve commas inside quotes (rudimentary CSV parse)
                    const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/^"|"$/g, '').trim());
                    if (cols.length >= 8) {
                        const isOld = cols.length < 11;
                        parsedLogs.push({
                            temperature: parseFloat(cols[5]),
                            heartRate: parseFloat(cols[6]),
                            spo2: isOld ? undefined : parseFloat(cols[7]),
                            respiratoryRate: isOld ? undefined : parseFloat(cols[8]),
                            ambientTemperature: cols.length >= 12 ? parseFloat(cols[9]) : undefined,
                            activityLevel: cols.length >= 12 ? parseFloat(cols[10]) : (isOld ? parseFloat(cols[7]) : parseFloat(cols[9]))
                        });
                    }
                }

                if (parsedLogs.length === 0) throw new Error("No valid logs found in CSV");

                const token = localStorage.getItem('token');
                await axios.post(`/api/animals/${id}/bulk-logs`, { logs: parsedLogs }, {
                    headers: { Authorization: `Bearer ${token}` }
                });

                showToast(`Successfully imported ${parsedLogs.length} logs!`, 'success');

                // Refresh logs
                const logsRes = await axios.get(`/api/animals/${id}/logs`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setHealthLogs(logsRes.data);
                handleReanalyze();
            } catch (err) {
                console.error(err);
                showToast(err.message || 'Failed to import logs', 'error');
            } finally {
                setIsImporting(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsText(file);
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
            const errorMsg = err.response?.data?.msg || 'Failed to upload medical record.';
            showToast(errorMsg, 'error');
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
                setVaccineSchedule(animalRes.data.vaccinationSchedule || []);
                setLoading(false);


                // Fetch full limits/usage
                try {
                    const profileRes = await axios.get('/api/auth/profile', config);
                    setUserProfile(profileRes.data);
                } catch { console.log('Profile sync skipped'); }

                if (logsRes.data.length > 0) {
                    try {
                        const recalcRes = await axios.post(`/api/animals/${id}/reanalyze`, {}, config);
                        setAnimal(prev => ({ ...prev, status: recalcRes.data.animalStatus, statusDetail: recalcRes.data.detail }));
                        setAiScore(recalcRes.data.aiErrorScore);
                    } catch (recalcErr) {
                        console.log('AI reanalysis skipped or failed:', recalcErr.message);
                    }
                }
            } finally {
                setLoading(false);
            }
        };

        fetchAnimal();
    }, [id]);

    useEffect(() => {
        const fetchRealWeather = async () => {
            if (animal?.syncRealTime && animal?.location) {
                setFetchingTemp(true);
                if (animal.location === 'Not Specified') {
                    setFetchingTemp(false);
                    return;
                }
                try {
                    // Fetch real-time weather from local proxy to avoid CORS
                    const res = await axios.get(`/api/animals/weather/${encodeURIComponent(animal.location)}`);
                    const temp = res.data.current_condition?.[0]?.temp_C;
                    if (temp) setOutsideTemp(parseFloat(temp));
                } catch (err) {
                    console.error('Weather proxy fetch failed', err);
                    setOutsideTemp(prev => prev + (Math.random() * 0.4 - 0.2));
                } finally {
                    setFetchingTemp(false);
                }
            }
        };

        fetchRealWeather();
        // Refresh every 30 minutes if sync is on
        const interval = setInterval(fetchRealWeather, 30 * 60 * 1000);
        return () => clearInterval(interval);
    }, [animal?.location, animal?.syncRealTime]);

    useEffect(() => {
        if (animal?.syncRealTime && outsideTemp) {
            setFormData(prev => ({ ...prev, ambientTemperature: outsideTemp.toFixed(1) }));
        }
    }, [outsideTemp, animal?.syncRealTime]);

    const handleReanalyze = async () => {
        setRecalculating(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.post(`/api/animals/${id}/reanalyze`, {}, { headers: { Authorization: `Bearer ${token}` } });
            setAnimal(prev => ({ ...prev, status: res.data.animalStatus, statusDetail: res.data.detail }));
            setAiScore(res.data.aiErrorScore);
            showToast('Reanalysis complete!', 'success');

        } catch (err) {
            console.error('Reanalysis failed', err);
            showToast(err.response?.data?.msg || 'Reanalysis failed', 'error');
        } finally {
            setRecalculating(false);
        }
    };



    const handleDelete = () => {
        setConfirmConfig({
            isOpen: true,
            title: "Delete Animal",
            message: `Are you sure you want to delete ${animal?.name}? This action cannot be undone and all health records will be permanently removed.`,
            confirmText: "Delete Now",
            type: "danger",
            onConfirm: async () => {
                try {
                    const token = localStorage.getItem('token');
                    await axios.delete(`/api/animals/${id}`, { headers: { Authorization: `Bearer ${token}` } });
                    showToast('Animal deleted successfully!');
                    navigate('/');
                } catch (err) {
                    console.error('Delete failed', err);
                    showToast('Failed to delete animal.', 'error');
                }
            }
        });
    };

    const calculateDueDate = (v, lastDateValue) => {
        const { frequencyMonths, recommendationAgeWeeks, isOneTime } = v;
        const lastDate = lastDateValue || v.lastDate;

        if (isOneTime && lastDate) return '';
        if (lastDate) {
            const d = new Date(lastDate);
            d.setMonth(d.getMonth() + (frequencyMonths || 12));
            return d.toISOString().split('T')[0];
        } else if (animal.dob && recommendationAgeWeeks) {
            const d = new Date(animal.dob);
            d.setDate(d.getDate() + (recommendationAgeWeeks * 7));
            return d.toISOString().split('T')[0];
        }
        return '';
    };

    const fetchVaccineRecommendations = async (force = false) => {
        // --- 0. LAZY LOADING ---
        // If not forced AND we have data, just open the modal.
        if (!force && animal.vaccinationSchedule && animal.vaccinationSchedule.length > 0) {
            setVaccineSchedule(animal.vaccinationSchedule);
            setAiConclusion(animal.aiConclusion || "");
            setShowVaccineModal(true);
            return;
        }

        // If we reach here, we need to fetch from AI
        setShowVaccineModal(true);
        setIsFetchingVaccines(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`/api/animals/${id}/vaccine-recommendations?force=${force}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const { alreadyCompleted = [], futureNeeded = [], conclusion = "" } = res.data;

            const allVaccines = [...alreadyCompleted, ...futureNeeded]
                .map(v => ({
                    ...v,
                    status: 'Pending',
                    lastDate: '',
                    dueDate: calculateDueDate(v, ''),
                    isHistorical: false
                }))
                .sort((a, b) => (a.recommendationAgeWeeks || 0) - (b.recommendationAgeWeeks || 0));

            setVaccineSchedule(allVaccines);
            setAiConclusion(conclusion);
        } catch (err) {
            console.error('Failed to fetch recommendations', err);
            showToast('AI could not generate recommendations right now.', 'error');
        } finally {
            setIsFetchingVaccines(false);
        }
    };

    const handleRegenerateCareCycle = () => {
        fetchVaccineRecommendations(true);
    };

    const handleSaveVaccinations = async () => {
        setIsSavingVaccines(true);
        try {
            const token = localStorage.getItem('token');
            // Sanitize: remove empty date strings to prevent Mongoose CastError
            const sanitizedSchedule = vaccineSchedule.map(v => {
                const item = { ...v };
                if (!item.lastDate) delete item.lastDate;
                if (!item.dueDate) delete item.dueDate;
                return item;
            });
            const res = await axios.put(`/api/animals/${id}/vaccination-schedule`, {
                schedule: sanitizedSchedule,
                conclusion: aiConclusion
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setAnimal(prev => ({ ...prev, vaccinationSchedule: res.data.vaccinationSchedule }));
            showToast('Arion CareCycle updated!', 'success');
            setShowVaccineModal(false);
        } catch (err) {
            console.error('Failed to save vaccination schedule', err);
            showToast('Failed to save schedule.', 'error');
        } finally {
            setIsSavingVaccines(false);
        }
    };

    const handleResetCareCycle = async () => {
        setConfirmConfig({
            isOpen: true,
            title: 'Reset CareCycle',
            message: 'Are you sure you want to completely reset the vaccination roadmap? This will clear all pending and completed vaccines for this animal.',
            confirmText: 'Reset Now',
            type: 'danger',
            onConfirm: async () => {
                try {
                    const token = localStorage.getItem('token');
                    const config = { headers: { Authorization: `Bearer ${token}` } };
                    await axios.put(`/api/animals/${id}/vaccination-schedule`, {
                        schedule: [],
                        conclusion: ''
                    }, config);
                    setVaccineSchedule([]);
                    setAiConclusion('');
                    setAnimal(prev => ({ ...prev, vaccinationSchedule: [] }));
                    showToast('CareCycle roadmap reset.');
                } catch (err) {
                    showToast('Failed to reset.', 'error');
                }
            }
        });
    };

    const toggleVaccineStatus = (index) => {
        const updated = [...vaccineSchedule];
        const item = updated[index];
        item.status = item.status === 'Completed' ? 'Pending' : 'Completed';
        if (item.status === 'Completed' && !item.lastDate) {
            item.lastDate = new Date().toISOString().split('T')[0];
            item.dueDate = calculateDueDate(item, item.lastDate);
        }
        setVaccineSchedule(updated);
    };

    const handleVaccineDateChange = (index, field, value) => {
        const updated = [...vaccineSchedule];
        const item = updated[index];
        item[field] = value;
        if (field === 'lastDate') {
            item.dueDate = calculateDueDate(item, value);
            if (value) item.status = 'Completed';
        }
        setVaccineSchedule(updated);
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

    const handleToggleSync = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.put(`/api/animals/${id}`, { syncRealTime: !animal.syncRealTime }, { headers: { Authorization: `Bearer ${token}` } });
            setAnimal(res.data);
            showToast(`Sync turned ${!animal.syncRealTime ? 'ON' : 'OFF'}`, 'success');
        } catch (err) {
            showToast('Failed to toggle sync', 'error');
        }
    };

    const handleRequestLocation = () => {
        if (!navigator.geolocation) return showToast('Geolocation not supported', 'error');

        setFetchingLoc(true);
        showToast('Accessing GPS...', 'info');
        navigator.geolocation.getCurrentPosition(async (pos) => {
            try {
                const { latitude, longitude } = pos.coords;
                const token = localStorage.getItem('token');

                // Fetch city name using free OpenStreetMap API
                let locString = `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
                try {
                    const geoRes = await axios.get(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
                    const city = geoRes.data.address.city || geoRes.data.address.town || geoRes.data.address.village || geoRes.data.address.state;
                    if (city) locString = city;
                } catch (gErr) { console.error('Geocoding failed', gErr); }

                const res = await axios.put(`/api/animals/${id}`, { location: locString }, { headers: { Authorization: `Bearer ${token}` } });
                setAnimal(res.data);
                showToast(`Location: ${locString}`, 'success');
            } catch (err) { showToast('Update failed', 'error'); }
            finally { setFetchingLoc(false); }
        }, (err) => {
            setFetchingLoc(false);
            showToast('Permission Denied', 'error');
        });
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
    if (!animal) return (
        <div className={styles.pageContainer} style={{ padding: '4rem 1rem', textAlign: 'center' }}>
            <h2 style={{ color: '#0f172a' }}>Aranya Not Found</h2>
            <p style={{ color: '#64748b' }}>The profile you are looking for does not exist or has been removed.</p>
        </div>
    );

    return (
        <React.Fragment>
            <motion.div
                className={styles.pageContainer}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
            >


                <div className={styles.heroSectionStack}>
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
                                <div className={styles.nameGroup}>
                                    <h1 className={styles.animalNamePrimary}>{animal.name}</h1>
                                    <span className={`${styles.statusBadge} ${styles[animal.status?.toLowerCase()] || ''}`}>
                                        <Activity size={12} /> {animal.status || 'UNKNOWN'}
                                    </span>
                                </div>
                                {animal.statusDetail && (
                                    <div className={styles.neuralDiagnosis}>
                                        <div className={styles.diagnosisRipple}></div>
                                        <Zap size={12} /> {animal.statusDetail}
                                    </div>
                                )}


                                <div className={styles.heroMetadataRow}>
                                    <div className={styles.metaPill}><Dna size={14} style={{ color: '#8b5cf6' }} /> <span>{animal.breed}</span></div>
                                    <div className={styles.metaPill}>
                                        {animal.gender === 'Male' ? (<Mars size={14} style={{ color: '#3b82f6' }} />) : animal.gender === 'Female' ? (<Venus size={14} style={{ color: '#ec4899' }} />) : (<HelpCircle size={14} style={{ color: '#64748b' }} />)}
                                        <span>{animal.gender || 'Not Specified'}</span>
                                    </div>
                                    {animal.dob && <div className={styles.metaPill}><Calendar size={14} style={{ color: '#f59e0b' }} /> <span>{calculateAge(animal.dob)}</span></div>}
                                    <button onClick={handleToggleVaccination} className={`${styles.metaPill} ${animal.vaccinated ? styles.metaPillSuccess : styles.metaPillWarning}`}>
                                        <ShieldAlert size={14} /> <span>{animal.vaccinated ? 'Fully Protected' : 'Vaccination Due'}</span>
                                    </button>
                                    <button onClick={() => fetchVaccineRecommendations(false)} className={styles.careCyclePill}>
                                        <Syringe size={16} /> <span>Arion CareCycle</span>
                                    </button>


                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Dashboard Interaction Row */}
                    <div className={styles.dashboardActionBar}>
                        <div className={`${styles.compactSyncBox} ${animal.syncRealTime ? styles.boxActive : ''}`}>
                            <div className={styles.syncMain}>
                                <div className={styles.syncLoc} title="Auto Detect Location" onClick={handleRequestLocation}>
                                    <MapPin size={12} style={{ color: fetchingLoc ? '#3b82f6' : '#ef4444' }} className={fetchingLoc ? 'spin' : ''} />
                                    <span>{fetchingLoc ? 'Detecting...' : (animal.location || 'Auto Detect')}</span>
                                </div>
                                <div className={styles.syncWeather}>
                                    <CloudSun size={14} style={{ color: '#f59e0b' }} />
                                    <span className={styles.syncTemp}>
                                        {fetchingTemp ? '..' : `${outsideTemp.toFixed(1)}°C`}
                                    </span>
                                </div>
                            </div>
                            <div className={styles.syncToggle} onClick={handleToggleSync}>
                                <div className={`${styles.toggleSwitch} ${animal.syncRealTime ? styles.switchOn : ''}`}>
                                    <div className={styles.switchKnob}></div>
                                </div>
                            </div>
                        </div>

                        {/* Neural Data Bridge - NEW ANIMATION COMPONENT */}
                        <div className={styles.dataBridge}>
                            <motion.div
                                className={styles.dataPulse}
                                animate={{
                                    left: ['-10%', '110%'],
                                    opacity: [0, 1, 1, 0]
                                }}
                                transition={{
                                    duration: 3,
                                    repeat: Infinity,
                                    ease: "linear"
                                }}
                            />
                        </div>

                        <div className={styles.heroActionsGroupStandalone}>
                            <button onClick={() => setShowEditDialog(true)} className={styles.glassActionBtn}>
                                <Edit size={14} /> Profile
                            </button>
                            <button onClick={handleReanalyze} disabled={recalculating} className={`${styles.glassActionBtn} ${recalculating ? styles.btnSpinning : ''}`}>
                                <RefreshCw size={14} className={recalculating ? 'spin' : ''} /> {recalculating ? 'Reanalyzing...' : 'Reanalyze'}
                            </button>


                            {role !== 'caretaker' && (
                                <button onClick={handleDelete} className={styles.deleteActionBtn}><Trash2 size={14} /></button>
                            )}
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
                            <Gauge size={16} /> Weight (kg)
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
                                        <span className={styles.helpText}>Normal range: {animal.limits ? `${animal.limits.min_temp_c}-${animal.limits.max_temp_c}°C` : '38.0-39.0°C'}</span>
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.label}>Heart Rate (bpm) *</label>
                                        <input type="number" name="heartRate" value={formData.heartRate} onChange={handleChange} placeholder="e.g., 70" className={styles.input} required />
                                        <span className={styles.helpText}>Normal range: {animal.limits ? `${animal.limits.min_hr}-${animal.limits.max_hr} bpm` : '60-80 bpm'}</span>
                                    </div>
                                </div>

                                <div className={styles.formGrid}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.label}>SpO2 (%)</label>
                                        <input type="number" name="spo2" value={formData.spo2} onChange={handleChange} placeholder="e.g., 98" className={styles.input} />
                                        <span className={styles.helpText}>Normal range: {animal.limits ? `${animal.limits.min_spo2}-${animal.limits.max_spo2}%` : '95-100%'}</span>
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.label}>Resp Rate (breaths/min)</label>
                                        <input type="number" name="respiratoryRate" value={formData.respiratoryRate} onChange={handleChange} placeholder="e.g., 20" className={styles.input} />
                                        <span className={styles.helpText}>Normal range: {animal.limits ? `${animal.limits.min_rr}-${animal.limits.max_rr}` : '15-30'}</span>
                                    </div>
                                </div>
                                <div className={styles.formGrid}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.label}>Ambient Temp (°C)</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            name="ambientTemperature"
                                            value={formData.ambientTemperature}
                                            onChange={handleChange}
                                            placeholder="e.g., 22.0"
                                            className={styles.input}
                                            disabled={animal.syncRealTime}
                                            style={{ backgroundColor: animal.syncRealTime ? '#f8fafc' : 'white', cursor: animal.syncRealTime ? 'not-allowed' : 'text' }}
                                        />
                                        <span className={styles.helpText}>
                                            {animal.syncRealTime ? '🔒 Auto-synced with real-time station' : 'Manual input for surrounding temperature'}
                                        </span>
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.label} style={{ marginBottom: '8px' }}>Activity Level: {formData.activityLevel}/5</label>
                                        <input type="range" name="activityLevel" min="1" max="5" value={formData.activityLevel} onChange={handleChange} className={styles.rangeSlider} style={{ marginTop: '4px' }} />
                                        <div className={styles.rangeLabels} style={{ marginTop: '8px' }}><span>Very Low</span><span>Very High</span></div>
                                    </div>
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
                                <input type="file" ref={fileInputRef} onChange={handleImportCSV} style={{ display: 'none' }} accept=".csv" />
                            </div>

                            {healthLogs.length === 0 ? (
                                <div className={styles.emptyStateV2}>No logs found for this animal.</div>
                            ) : (
                                <React.Fragment>
                                    <div className={styles.tableWrapper}>
                                        <table className={styles.healthTable}>
                                            <thead>
                                                <tr>
                                                    <th>Date</th>
                                                    <th>Type</th>
                                                    <th>Breed</th>
                                                    <th>Gen</th>
                                                    <th>Temp</th>
                                                    <th>HR</th>
                                                    <th>SpO2</th>
                                                    <th>RR</th>
                                                    <th>Amb Temp</th>
                                                    <th>Activity</th>
                                                    <th>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {healthLogs.slice((currentPage - 1) * logsPerPage, currentPage * logsPerPage).map(log => (
                                                    <tr key={log._id}>
                                                        <td>
                                                            <div>{new Date(log.createdAt).toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' })}</div>
                                                            <div style={{ fontSize: '0.8em', color: '#94a3b8' }}>{new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
                                                        </td>
                                                        <td>{animal.category}</td>
                                                        <td>{animal.breed}</td>
                                                        <td>{animal.gender ? animal.gender.charAt(0).toUpperCase() : '—'}</td>
                                                        <td>{log.temperature}</td>
                                                        <td>{log.heartRate}</td>
                                                        <td>{log.spo2 || '—'}</td>
                                                        <td>{log.respiratoryRate || '—'}</td>
                                                        <td>{log.ambientTemperature ? log.ambientTemperature + '°C' : '—'}</td>
                                                        <td>{log.activityLevel || 3}/5</td>
                                                        <td>
                                                            <span className={`${styles.statusBadge} ${styles[`status${normalizeStatus(calculateLogStatus(log, healthLogs.indexOf(log), healthLogs, animal.limits))}`]}`}>
                                                                <div className={styles.statusDot}></div>
                                                                {calculateLogStatus(log, healthLogs.indexOf(log), healthLogs, animal.limits)}
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
                                                <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#166534" stopOpacity={0.1} /><stop offset="95%" stopColor="#166534" stopOpacity={0} /></linearGradient>
                                                <linearGradient id="colorHR" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.1} /><stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} /></linearGradient>
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

                                    {userProfile && (
                                        <div style={{ marginTop: '0.8rem', padding: '10px 16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '15px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <HardDrive size={14} style={{ color: '#64748b' }} />
                                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>STORAGE USAGE</span>
                                            </div>
                                            <div style={{ flex: 1, height: '4px', background: '#e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                                                <div style={{
                                                    height: '100%',
                                                    width: `${userProfile.limits?.medicalVaultStorageMB === -1 ? 0 : Math.min(((userProfile.usage?.storageBytes || 0) / (1024 * 1024) / userProfile.limits?.medicalVaultStorageMB) * 100, 100)}%`,
                                                    background: 'var(--primary)',
                                                    transition: 'width 0.5s ease-out'
                                                }} />
                                            </div>
                                            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--primary)', whiteSpace: 'nowrap' }}>
                                                {((userProfile.usage?.storageBytes || 0) / (1024 * 1024)).toFixed(2)} MB <span style={{ color: '#94a3b8' }}>/ {userProfile.limits?.medicalVaultStorageMB === -1 ? '∞' : `${userProfile.limits?.medicalVaultStorageMB} MB`}</span>
                                            </span>
                                        </div>
                                    )}
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
                {...confirmConfig}
                onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
            />

            <AnimatePresence>
                {showVaccineModal && (
                    <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && setShowVaccineModal(false)}>
                        <motion.div
                            className={styles.vaccineModal}
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        >
                            <div className={styles.modalHeader}>
                                <div className={styles.modalTitleGroup}>
                                    <h2>Arion CareCycle</h2>
                                    <p className={styles.modalSubtitle}>{animal.breed} • {vaccineSchedule.length} vaccines</p>
                                </div>
                                <div className={styles.modalActions}>
                                    <button className={styles.resetBtn} onClick={handleResetCareCycle} disabled={isFetchingVaccines || isSavingVaccines}>
                                        <RotateCcw size={12} /> Reset
                                    </button>
                                    <button className={styles.regenerateBtn} onClick={handleRegenerateCareCycle} disabled={isFetchingVaccines || isSavingVaccines}>
                                        <RefreshCw size={12} /> Regenerate
                                    </button>
                                </div>
                                <button className={styles.closeModalBtn} onClick={() => setShowVaccineModal(false)}>
                                    <X size={18} />
                                </button>
                            </div>

                            <div className={styles.modalContent}>
                                {isFetchingVaccines ? (
                                    <div className={styles.loadingState}>
                                        <div className={styles.loaderFlash}>
                                            <Zap size={28} strokeWidth={2.5} />
                                        </div>
                                        <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>Generating CareCycle roadmap...</div>
                                        <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Analyzing {animal.breed} lifecycle</div>
                                    </div>
                                ) : (
                                    <div className={styles.vxList}>
                                        {vaccineSchedule.length > 0 ? (
                                            <>
                                                {aiConclusion && (
                                                    <div className={styles.vxBrief}>{aiConclusion}</div>
                                                )}
                                                {vaccineSchedule.map((v, idx) => (
                                                    <VaccineItem
                                                        key={`v-${idx}`} v={v} idx={idx}
                                                        toggleVaccineStatus={toggleVaccineStatus}
                                                        handleVaccineDateChange={handleVaccineDateChange}
                                                    />
                                                ))}
                                            </>
                                        ) : (
                                            <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem', fontSize: '0.85rem' }}>No recommendations found.</p>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className={styles.modalFooter}>
                                <span className={styles.footerNote}>{vaccineSchedule.filter(v => v.status === 'Completed').length}/{vaccineSchedule.length} completed</span>
                                <button className={styles.saveBtn} onClick={handleSaveVaccinations} disabled={isSavingVaccines || isFetchingVaccines}>
                                    {isSavingVaccines ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </React.Fragment>

    );
}
