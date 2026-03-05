import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Mail, Camera, Loader2, Check, X, Phone, ShieldCheck } from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './Profile.module.css';

// Helper to get auth headers
const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
});

export default function Profile() {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [fullName, setFullName] = useState('');
    const [mobile, setMobile] = useState('');
    const [email, setEmail] = useState('');
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

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            try {
                const parsed = JSON.parse(storedUser);
                setUser(parsed);
                setFullName(parsed.full_name || '');
                setMobile(parsed.mobile || '');
                setEmail(parsed.email || '');
            } catch (e) { }
        }
    }, []);

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
        window.dispatchEvent(new Event('storage'));
    };

    const handleImageSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setPendingImage(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handlePhotoSave = async () => {
        if (!pendingImage) return;

        const formData = new FormData();
        formData.append('profilePic', pendingImage);
        formData.append('email', user.email || '');
        formData.append('mobile', user.mobile || '');

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
        } catch (error) {
            console.error('Upload failed', error);
            alert('Failed to upload image.');
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

        // Save name immediately if changed
        if (nameChanged) {
            setIsSaving(true);
            try {
                const res = await axios.put('/api/auth/profile', {
                    email: user.email,
                    mobile: user.mobile,
                    full_name: fullName
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
            return; // Don't close editing yet
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
            return; // Don't close editing yet
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

    if (!user) return <div className="p-8">Loading profile...</div>;

    return (
        <div className={`container ${styles.pageContainer} animate-fade-in`}>
            <div className={styles.pageHeader}>
                <h1 className={styles.pageTitle}>Profile</h1>
                <p className={styles.pageSubtitle}>Manage your personal information</p>
            </div>

            <div className={styles.card}>
                <div className={styles.cardHeader}>
                    <User className={styles.cardIcon} size={28} />
                    <h2 className={styles.cardTitle}>Personal Information</h2>
                </div>

                {/* Avatar */}
                <div className={styles.avatarContainer}>
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
                                <Camera size={18} />
                            </button>
                        )}
                    </div>
                    <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        accept="image/*"
                        onChange={handleImageSelect}
                    />

                    <AnimatePresence>
                        {pendingImage && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 10 }}
                                className={styles.photoActionsOverlay}
                            >
                                <button
                                    className={styles.confirmPhotoBtn}
                                    onClick={handlePhotoSave}
                                    disabled={isUploading}
                                >
                                    {isUploading ? <Loader2 className="spin" size={16} /> : <Check size={18} />}
                                    <span>Save</span>
                                </button>
                                <button
                                    className={styles.cancelPhotoBtn}
                                    onClick={() => { setPendingImage(null); setPreviewUrl(''); }}
                                    disabled={isUploading}
                                >
                                    <X size={18} />
                                    <span>Cancel</span>
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Full Name */}
                <div className={styles.formGroup}>
                    <label className={styles.label}>Full Name</label>
                    <input
                        type="text"
                        className={styles.input}
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        disabled={!isEditing}
                    />
                </div>

                {/* Email */}
                <div className={styles.formGroup}>
                    <label className={styles.label}>
                        <Mail size={16} /> Email
                    </label>
                    <input
                        type="email"
                        className={styles.input}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={!isEditing}
                        placeholder="Add email address"
                    />
                    <span className={styles.helpText}>
                        {user.email ? 'Verified ✓ — Changing requires OTP verification' : 'Add an email to enable email login'}
                    </span>
                </div>

                {/* Mobile */}
                <div className={styles.formGroup}>
                    <label className={styles.label}>
                        <Phone size={16} /> Mobile Number
                    </label>
                    <input
                        type="tel"
                        className={styles.input}
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value)}
                        disabled={!isEditing}
                        placeholder="+91XXXXXXXXXX"
                    />
                    <span className={styles.helpText}>
                        {user.mobile ? 'Verified ✓ — Changing requires OTP verification' : 'Add a mobile number to enable mobile login'}
                    </span>
                </div>

                {/* Success / Error Messages */}
                {verifyMsg && !showMobileVerify && !showEmailVerify && (
                    <div className={styles.successMsg}>{verifyMsg}</div>
                )}

                {/* Mobile Verification Box */}
                <AnimatePresence>
                    {showMobileVerify && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className={styles.verifyBox}
                        >
                            <div className={styles.verifyHeader}>
                                <ShieldCheck size={20} />
                                <strong>Verify Mobile Number</strong>
                            </div>
                            <p className={styles.verifyText}>
                                We've sent a 6-digit code to <strong>{pendingMobile}</strong>. Enter it below to link this number.
                            </p>

                            {verifyMsg && <div className={styles.successMsg}>{verifyMsg}</div>}
                            {verifyError && <div className={styles.errorMsg}>{verifyError}</div>}

                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                <input
                                    type="text"
                                    className={styles.input}
                                    value={mobileOtp}
                                    onChange={(e) => setMobileOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="6-digit code"
                                    maxLength={6}
                                    style={{ flex: 1 }}
                                />
                                <button className={styles.saveBtn} onClick={handleVerifyMobileOtp}>
                                    Verify
                                </button>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                                <button
                                    className={styles.linkBtn}
                                    onClick={handleResendMobileOtp}
                                    disabled={resendTimer > 0}
                                >
                                    {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend Code'}
                                </button>
                                <button className={styles.linkBtn} onClick={cancelVerification}>
                                    Cancel
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Email Verification Box */}
                <AnimatePresence>
                    {showEmailVerify && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className={styles.verifyBox}
                        >
                            <div className={styles.verifyHeader}>
                                <ShieldCheck size={20} />
                                <strong>Verify Email Address</strong>
                            </div>
                            <p className={styles.verifyText}>
                                We've sent a 6-digit code to <strong>{pendingEmail}</strong>. Enter it below to link this email.
                            </p>

                            {verifyMsg && <div className={styles.successMsg}>{verifyMsg}</div>}
                            {verifyError && <div className={styles.errorMsg}>{verifyError}</div>}

                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                <input
                                    type="text"
                                    className={styles.input}
                                    value={emailOtp}
                                    onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="6-digit code"
                                    maxLength={6}
                                    style={{ flex: 1 }}
                                />
                                <button className={styles.saveBtn} onClick={handleVerifyEmailOtp}>
                                    Verify
                                </button>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                                <button
                                    className={styles.linkBtn}
                                    onClick={handleResendEmailOtp}
                                    disabled={resendTimer > 0}
                                >
                                    {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend Code'}
                                </button>
                                <button className={styles.linkBtn} onClick={cancelVerification}>
                                    Cancel
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Action Buttons */}
                <div className={styles.actionArea}>
                    {isEditing ? (
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button className={styles.saveBtn} onClick={handleSave} disabled={isSaving}>
                                {isSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                            <button
                                className="btn-secondary"
                                onClick={() => {
                                    setIsEditing(false);
                                    setFullName(user.full_name || '');
                                    setMobile(user.mobile || '');
                                    setEmail(user.email || '');
                                    cancelVerification();
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <button className={styles.saveBtn} onClick={() => setIsEditing(true)}>
                            Edit Profile
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
