import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Mail, Camera, Loader2, Check, X, Phone, ShieldCheck, Calendar, Users as UsersIcon, CheckCircle, RotateCcw, Plus, Minus } from 'lucide-react';
import Cropper from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { getCroppedImgFile } from '../utils/cropImage';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import AdvancedLoader from '../components/AdvancedLoader';
import styles from './Profile.module.css';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/ToastProvider';

// Helper to get auth headers
const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
});

// Auto-calculate age from DOB
const calcAge = (dob) => {
    if (!dob) return '';
    const birth = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age > 0 ? age : '';
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString() : 'N/A';

export default function Profile() {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [user, setUser] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [fullName, setFullName] = useState('');
    const [mobile, setMobile] = useState('');
    const [email, setEmail] = useState('');
    const [gender, setGender] = useState('');
    const [dateOfBirth, setDateOfBirth] = useState('');
    const [age, setAge] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [pendingImage, setPendingImage] = useState(null);
    const [previewUrl, setPreviewUrl] = useState('');
    const [imgError, setImgError] = useState(false);
    const fileInputRef = React.useRef(null);

    // Mobile verification state
    const [mobileOtp, setMobileOtp] = useState('');
    const [showMobileVerify, setShowMobileVerify] = useState(false);
    const [pendingMobile, setPendingMobile] = useState('');

    // Email verification state
    const [emailOtp, setEmailOtp] = useState('');
    const [showEmailVerify, setShowEmailVerify] = useState(false);
    const [pendingEmail, setPendingEmail] = useState('');

    // Shared messages
    const [verifyMsg, setVerifyMsg] = useState('');
    const [verifyError, setVerifyError] = useState('');
    const [resendTimer, setResendTimer] = useState(0);

    // Delete account state
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Cropping states
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
    const [isCropping, setIsCropping] = useState(false);

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await axios.get('/api/auth/profile', getAuthHeaders());
                if (res.data) {
                    syncUser(res.data);
                }
            } catch (err) {
                console.error('Real-time sync failed:', err);
            }
        };

        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            try {
                const parsed = JSON.parse(storedUser);
                setUser(parsed);
                setFullName(parsed.full_name || '');
                setMobile(parsed.mobile || '');
                setEmail(parsed.email || '');
                setGender(parsed.gender || '');
                const dob = parsed.dateOfBirth ? new Date(parsed.dateOfBirth).toISOString().split('T')[0] : '';
                setDateOfBirth(dob);
                setAge(parsed.age || calcAge(dob) || '');
            } catch (e) { }
        }
        fetchProfile();
    }, []);

    // Auto-calculate age when DOB changes
    useEffect(() => {
        if (dateOfBirth) {
            const calculated = calcAge(dateOfBirth);
            if (calculated) setAge(calculated);
        }
    }, [dateOfBirth]);

    // Resend timer countdown
    useEffect(() => {
        if (resendTimer <= 0) return;
        const interval = setInterval(() => setResendTimer(p => p - 1), 1000);
        return () => clearInterval(interval);
    }, [resendTimer]);

    const getInitials = (u) => {
        if (!u) return 'U';
        if (u.full_name) {
            const parts = u.full_name.split(' ');
            if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
            return u.full_name.substring(0, 2).toUpperCase();
        }
        return u.email?.substring(0, 2).toUpperCase() || u.mobile?.substring(0, 2).toUpperCase() || 'U';
    };

    const syncUser = (updatedUser) => {
        localStorage.setItem('user', JSON.stringify(updatedUser));
        setUser(updatedUser);
        setMobile(updatedUser.mobile || '');
        setEmail(updatedUser.email || '');
        setGender(updatedUser.gender || '');
        const dob = updatedUser.dateOfBirth ? new Date(updatedUser.dateOfBirth).toISOString().split('T')[0] : '';
        setDateOfBirth(dob);
        setAge(updatedUser.age || calcAge(dob) || '');

        // Dispatch combined signal for total sync
        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new Event('userUpdated'));
    };

    const onCropComplete = (croppedArea, croppedAreaPixels) => {
        setCroppedAreaPixels(croppedAreaPixels);
    };

    const handleImageSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setPendingImage(file);
            setPreviewUrl(URL.createObjectURL(file));
            setIsCropping(true);
            setZoom(1);
            setCrop({ x: 0, y: 0 });
        }
    };

    const handleApplyCrop = async () => {
        try {
            const croppedImageBlob = await getCroppedImgFile(previewUrl, croppedAreaPixels);
            const croppedFile = new File([croppedImageBlob], pendingImage.name, { type: 'image/jpeg' });
            
            setPendingImage(croppedFile);
            setPreviewUrl(URL.createObjectURL(croppedImageBlob));
            setIsCropping(false);
        } catch (e) {
            console.error(e);
            showToast("Failed to crop image.", "error");
        }
    };

    const cancelCrop = () => {
        setIsCropping(false);
        setPendingImage(null);
        setPreviewUrl('');
    };

    const handlePhotoSave = async () => {
        if (!pendingImage) return;

        // Frontend validation: 2MB limit
        if (pendingImage.size > 2 * 1024 * 1024) {
            showToast('Image size exceeds 2MB limit.', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('profilePic', pendingImage);

        setIsUploading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.post('/api/auth/profile/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    Authorization: `Bearer ${token}`
                }
            });
            syncUser(res.data.user);
            setPendingImage(null);
            setPreviewUrl('');
            showToast('Profile picture updated successfully!', 'success');
        } catch (error) {
            console.error('Upload failed', error);
            const msg = error.response?.data?.message || 'Failed to upload image.';
            showToast(msg, 'error');
        } finally {
            setIsUploading(false);
        }
    };

    const handleSave = async () => {
        if (!fullName.trim() && !mobile.trim() && !email.trim()) {
            setIsEditing(false);
            return;
        }

        const mobileChanged = mobile !== (user.mobile || '') && mobile.trim().length > 0;
        const emailChanged = email !== (user.email || '') && email.trim().length > 0;
        const nameChanged = fullName !== (user.full_name || '');
        const genderChanged = gender !== (user.gender || '');
        const dobChanged = dateOfBirth !== (user.dateOfBirth ? new Date(user.dateOfBirth).toISOString().split('T')[0] : '');
        const ageChanged = String(age) !== String(user.age || '');

        // Save name + personal info if changed
        if (nameChanged || genderChanged || dobChanged || ageChanged) {
            setIsSaving(true);
            try {
                const res = await axios.put('/api/auth/profile', {
                    email: user.email,
                    mobile: user.mobile,
                    full_name: fullName,
                    gender,
                    dateOfBirth: dateOfBirth || null,
                    age: age ? Number(age) : null
                }, getAuthHeaders());
                syncUser(res.data.user);
            } catch (_) { }
            setIsSaving(false);
        }

        // Mobile changed → start verification
        if (mobileChanged) {
            setPendingMobile(mobile);
            setShowMobileVerify(true);
            setShowEmailVerify(false);
            setVerifyError('');
            setVerifyMsg('');
            try {
                const res = await axios.post('/api/auth/verify-mobile/request', { mobile }, getAuthHeaders());
                setVerifyMsg(res.data.message);
                setResendTimer(60);
            } catch (err) {
                setVerifyError(err.response?.data?.message || 'Failed to send verification code.');
            }
            return;
        }

        // Email changed → start verification
        if (emailChanged) {
            setPendingEmail(email);
            setShowEmailVerify(true);
            setShowMobileVerify(false);
            setVerifyError('');
            setVerifyMsg('');
            try {
                const res = await axios.post('/api/auth/verify-email/request', { email }, getAuthHeaders());
                setVerifyMsg(res.data.message);
                setResendTimer(60);
            } catch (err) {
                setVerifyError(err.response?.data?.message || 'Failed to send verification code.');
            }
            return;
        }

        // No verification needed, just close
        if (!mobileChanged && !emailChanged) {
            setIsEditing(false);
        }
    };

    // ── Mobile OTP Verify ──
    const handleVerifyMobileOtp = async () => {
        if (!mobileOtp || mobileOtp.length !== 6) {
            setVerifyError('Please enter a 6-digit code.');
            return;
        }
        try {
            const res = await axios.post('/api/auth/verify-mobile/confirm', {
                mobile: pendingMobile,
                otp: mobileOtp
            }, getAuthHeaders());

            syncUser(res.data.user);
            setShowMobileVerify(false);
            setMobileOtp('');
            setIsEditing(false);
            setVerifyMsg('✅ Mobile number verified and linked!');
            setTimeout(() => setVerifyMsg(''), 4000);
        } catch (err) {
            setVerifyError(err.response?.data?.message || 'Verification failed.');
        }
    };

    // ── Email OTP Verify ──
    const handleVerifyEmailOtp = async () => {
        if (!emailOtp || emailOtp.length !== 6) {
            setVerifyError('Please enter a 6-digit code.');
            return;
        }
        try {
            const res = await axios.post('/api/auth/verify-email/confirm', {
                email: pendingEmail,
                otp: emailOtp
            }, getAuthHeaders());

            syncUser(res.data.user);
            setShowEmailVerify(false);
            setEmailOtp('');
            setIsEditing(false);
            setVerifyMsg('✅ Email verified and linked!');
            setTimeout(() => setVerifyMsg(''), 4000);
        } catch (err) {
            setVerifyError(err.response?.data?.message || 'Verification failed.');
        }
    };

    // ── Resend handlers ──
    const handleResendMobileOtp = async () => {
        if (resendTimer > 0) return;
        try {
            const res = await axios.post('/api/auth/verify-mobile/request', { mobile: pendingMobile }, getAuthHeaders());
            setVerifyMsg(res.data.message);
            setVerifyError('');
            setResendTimer(60);
        } catch (err) {
            setVerifyError(err.response?.data?.message || 'Failed to resend code.');
        }
    };

    const handleResendEmailOtp = async () => {
        if (resendTimer > 0) return;
        try {
            const res = await axios.post('/api/auth/verify-email/request', { email: pendingEmail }, getAuthHeaders());
            setVerifyMsg(res.data.message);
            setVerifyError('');
            setResendTimer(60);
        } catch (err) {
            setVerifyError(err.response?.data?.message || 'Failed to resend code.');
        }
    };

    const cancelVerification = () => {
        setShowMobileVerify(false);
        setShowEmailVerify(false);
        setMobileOtp('');
        setEmailOtp('');
        setVerifyError('');
        setVerifyMsg('');
        setMobile(user.mobile || '');
        setEmail(user.email || '');
    };

    const handleDeleteAccount = async () => {
        try {
            setIsDeleting(true);
            const res = await axios.delete('/api/auth/profile', getAuthHeaders());
            
            // Success! Clear local storage and redirect to login
            localStorage.clear();
            showToast(res.data.message || 'Your account has been deleted permanently.', 'success');
            navigate('/login');
        } catch (err) {
            console.error('Account deletion failed', err);
            showToast(err.response?.data?.message || 'Failed to delete account. Please try again.', 'error');
        } finally {
            setIsDeleting(false);
            setShowDeleteConfirm(false);
        }
    };

    const genderLabel = (g) => {
        const map = { male: 'Male', female: 'Female', prefer_not_to_say: 'Prefer not to say', '': '—' };
        return map[g] || '—';
    };

    if (!user) return <AdvancedLoader type="profile" />;

    const roleLabel = user.role === 'admin' ? 'System Administrator' : 'Platform User';

    return (
        <div className={styles.pageContainer}>
            <div className={styles.profileLayout}>

                {/* ── LEFT SIDEBAR: PROFILE SUMMARY ── */}
                <aside className={styles.summaryCard}>
                    <div className={styles.avatarWrapper}>
                        <div className={styles.avatar}>
                            {previewUrl ? (
                                <img src={previewUrl} alt="Preview" className={styles.avatarImage} />
                            ) : (user.profilePic && !imgError) ? (
                                <img
                                    src={user.profilePic.startsWith('/uploads') ? `${import.meta.env.VITE_API_URL || ''}${user.profilePic}` : user.profilePic}
                                    alt="Profile"
                                    className={styles.avatarImage}
                                    onError={() => setImgError(true)}
                                />
                            ) : (
                                getInitials(user)
                            )}
                        </div>
                        {!pendingImage && (
                            <button
                                className={styles.uploadBtn}
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploading}
                                title="Change Photo"
                            >
                                <Camera size={20} />
                            </button>
                        )}

                        <AnimatePresence>
                            {pendingImage && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    className={styles.photoActionsOverlay}
                                >
                                    <button className={styles.confirmPhotoBtn} onClick={handlePhotoSave} disabled={isUploading}>
                                        {isUploading ? <Loader2 className={styles.spin} size={18} /> : <Check size={20} />}
                                    </button>
                                    <button className={styles.cancelPhotoBtn} onClick={() => { setPendingImage(null); setPreviewUrl(''); }} disabled={isUploading}>
                                        <X size={20} />
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <h2 className={styles.userName}>
                        {fullName || 'Unnamed User'}
                        <AnimatePresence>
                            {user?.isVerified && (
                                <motion.span
                                    initial={{ opacity: 0, scale: 0.5, x: 5 }}
                                    animate={{ opacity: 1, scale: 1, x: 0 }}
                                    exit={{ opacity: 0, scale: 0.5, x: 5 }}
                                    transition={{ type: 'spring', damping: 15 }}
                                    style={{ display: 'inline-flex', alignItems: 'center' }}
                                >
                                    <CheckCircle size={18} className={styles.verifiedIcon} />
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </h2>
                    <div className={styles.userRole}>{roleLabel}</div>

                    <div className={styles.highlightsArea}>
                        <div className={styles.highlightPill}>
                            <span className={styles.pillLabel}>Membership</span>
                            <span className={styles.pillValue}>
                                {user.planName || user.plan || 'Free Starter'}
                                <span className={styles.pillSubtext}>Account Plan</span>
                            </span>
                        </div>
                        <div className={styles.highlightPill}>
                            <span className={styles.pillLabel}>Aranya Legacy</span>
                            <span className={styles.pillValue}>
                                {(() => {
                                    const created = user?.createdAt ? new Date(user.createdAt) : new Date();
                                    const diff = new Date() - created;
                                    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                                    return isNaN(days) ? 1 : Math.max(1, days);
                                })()} Days
                                <span className={styles.pillSubtext}>Journey Together</span>
                            </span>
                        </div>
                    </div>

                    <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleImageSelect} />
                </aside>

                {/* ── MAIN CONTENT: EDITABLE FORMS ── */}
                <main className={styles.mainContent}>

                    {/* section 1: Account Identification */}
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <User className={styles.cardIcon} size={22} />
                            <h3 className={styles.cardTitle}>Account Identity</h3>
                        </div>

                        <div className={styles.formGrid}>
                            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                                <label className={styles.label}>Display Name</label>
                                <input
                                    type="text"
                                    className={styles.input}
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    disabled={!isEditing}
                                    placeholder="Enter your full name"
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}><Mail size={14} /> Email Address</label>
                                <input
                                    type="email"
                                    className={styles.input}
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={!isEditing}
                                    placeholder="email@example.com"
                                />
                                {user.email && <span className={styles.helpText}>Identity verified ✓</span>}
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}><Phone size={14} /> Mobile Number</label>
                                <input
                                    type="tel"
                                    className={styles.input}
                                    value={mobile}
                                    onChange={(e) => setMobile(e.target.value)}
                                    disabled={!isEditing}
                                    placeholder="+91 XXX XXX XXXX"
                                />
                                {user.mobile && <span className={styles.helpText}>Contact verified ✓</span>}
                            </div>
                        </div>

                        {/* Verification Modals within the column */}
                        <AnimatePresence>
                            {showMobileVerify && (
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className={styles.verifyBox}>
                                    <div className={styles.verifyHeader}><ShieldCheck size={18} /> Verify Phone</div>
                                    <p className={styles.verifyText}>Enter the 6-digit code sent to <strong>{pendingMobile}</strong></p>
                                    {verifyError && <div className={styles.errorMsg}>{verifyError}</div>}
                                    <input
                                        type="text"
                                        className={styles.otpInput}
                                        value={mobileOtp}
                                        onChange={(e) => setMobileOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        placeholder="000000"
                                    />
                                    <div className={styles.verifyActions}>
                                        <button className={styles.saveBtn} style={{ padding: '0.6rem 1.5rem' }} onClick={handleVerifyMobileOtp}>Submit</button>
                                        <button className={styles.linkBtn} onClick={handleResendMobileOtp} disabled={resendTimer > 0}>
                                            {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend Code'}
                                        </button>
                                        <button className={styles.linkBtn} onClick={cancelVerification}>Cancel</button>
                                    </div>
                                </motion.div>
                            )}
                            {showEmailVerify && (
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className={styles.verifyBox}>
                                    <div className={styles.verifyHeader}><ShieldCheck size={18} /> Verify Email</div>
                                    <p className={styles.verifyText}>Enter the 6-digit code sent to <strong>{pendingEmail}</strong></p>
                                    {verifyError && <div className={styles.errorMsg}>{verifyError}</div>}
                                    <input
                                        type="text"
                                        className={styles.otpInput}
                                        value={emailOtp}
                                        onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        placeholder="000000"
                                    />
                                    <div className={styles.verifyActions}>
                                        <button className={styles.saveBtn} style={{ padding: '0.6rem 1.5rem' }} onClick={handleVerifyEmailOtp}>Submit</button>
                                        <button className={styles.linkBtn} onClick={handleResendEmailOtp} disabled={resendTimer > 0}>
                                            {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend Code'}
                                        </button>
                                        <button className={styles.linkBtn} onClick={cancelVerification}>Cancel</button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* section 2: Profile Metrics */}
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <UsersIcon className={styles.cardIcon} size={22} />
                            <h3 className={styles.cardTitle}>Personal Details</h3>
                        </div>

                        <div className={styles.formGrid}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Gender</label>
                                <select className={styles.select} value={gender} onChange={(e) => setGender(e.target.value)} disabled={!isEditing}>
                                    <option value="">Choose...</option>
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                    <option value="prefer_not_to_say">Private</option>
                                </select>
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}><Calendar size={14} /> Birth Date</label>
                                <input
                                    type="date"
                                    className={styles.input}
                                    value={dateOfBirth}
                                    onChange={(e) => setDateOfBirth(e.target.value)}
                                    disabled={!isEditing}
                                    max={new Date().toISOString().split('T')[0]}
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>Age (Final)</label>
                                <input
                                    type="number"
                                    className={styles.input}
                                    value={age}
                                    onChange={(e) => setAge(e.target.value)}
                                    disabled={!isEditing}
                                    placeholder="Calculated automatically"
                                />
                            </div>
                        </div>

                        {/* Save / Edit Button Area */}
                        <div className={styles.actionArea}>
                            {isEditing ? (
                                <>
                                    <button className={styles.cancelBtn} onClick={() => setIsEditing(false)}>Discard</button>
                                    <button className={styles.saveBtn} onClick={handleSave} disabled={isSaving}>
                                        {isSaving ? <Loader2 className={styles.spin} size={16} /> : 'Save Profile'}
                                    </button>
                                </>
                            ) : (
                                <button className={styles.saveBtn} onClick={() => setIsEditing(true)}>Update Profile Details</button>
                            )}
                        </div>
                    </div>
                        {/* section 3: Security & Danger Zone */}
                        <div className={`${styles.card} ${styles.dangerZone}`}>
                            <div className={styles.cardHeader}>
                                <ShieldCheck className={styles.cardIcon} size={22} style={{ color: '#ef4444' }} />
                                <h3 className={styles.cardTitle} style={{ color: '#ef4444' }}>Danger Zone</h3>
                            </div>
                            <div className={styles.dangerContent}>
                                <div className={styles.dangerInfo}>
                                    <h4 className={styles.dangerTitle}>Delete Account</h4>
                                    <p className={styles.dangerDesc}>Permanently remove your account and all associated data (animals, health logs, etc.). This action cannot be undone.</p>
                                </div>
                                <button 
                                    className={styles.deleteAccountBtn} 
                                    onClick={() => setShowDeleteConfirm(true)}
                                    disabled={isDeleting}
                                >
                                    {isDeleting ? <Loader2 className={styles.spin} size={18} /> : 'Delete Permanently'}
                                </button>
                            </div>
                        </div>
                    </main>
                </div>

                <ConfirmDialog
                    isOpen={showDeleteConfirm}
                    onClose={() => setShowDeleteConfirm(false)}
                    onConfirm={handleDeleteAccount}
                    title="Delete Account Permanently"
                    message="Are you absolutely sure you want to delete your Aranya account? This will erase all your animals, records, and preferences. This action is IRREVERSIBLE."
                    confirmText={isDeleting ? "Deleting..." : "Yes, Delete Everything"}
                    type="danger"
                />

                {/* ── IMAGE CROP MODAL ── */}
                <AnimatePresence>
                    {isCropping && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className={styles.cropOverlay}
                        >
                            <div className={styles.cropModalContainer}>
                                <div className={styles.cropHeader}>
                                    <button className={styles.cropHeaderBtn} onClick={cancelCrop}>
                                        <X size={20} />
                                    </button>
                                    <span className={styles.cropTitle}>Drag to adjust</span>
                                    <button className={styles.cropHeaderBtn} onClick={() => fileInputRef.current?.click()}>
                                        <RotateCcw size={18} /> Upload
                                    </button>
                                </div>

                                <div className={styles.cropperContainer}>
                                    <Cropper
                                        image={previewUrl}
                                        crop={crop}
                                        zoom={zoom}
                                        aspect={1}
                                        cropShape="round"
                                        showGrid={false}
                                        onCropChange={setCrop}
                                        onCropComplete={onCropComplete}
                                        onZoomChange={setZoom}
                                    />

                                    <div className={styles.cropControls}>
                                        <button className={styles.controlBtn} onClick={() => setZoom(z => Math.min(3, z + 0.2))}>
                                            <Plus size={20} />
                                        </button>
                                        <button className={styles.controlBtn} onClick={() => setZoom(z => Math.max(1, z - 0.2))}>
                                            <Minus size={20} />
                                        </button>
                                    </div>
                                </div>

                                <div className={styles.cropFooter}>
                                    <button className={styles.applyCropBtn} onClick={handleApplyCrop}>
                                        <Check size={32} />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
    );
}
