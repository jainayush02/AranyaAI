import React, { useState, useEffect, useRef } from 'react';
import {
    Mail, Lock, User, Phone,
    Twitter, Linkedin, Facebook, Youtube, Github,
    ChevronRight, ArrowRight, ShieldCheck, Zap, BarChart3,
    CheckCircle2, Activity, TrendingUp, Eye, EyeOff
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { useGoogleLogin } from '@react-oauth/google';
import styles from './Login.module.css';

/* ── Google SVG icon ── */
const GoogleIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
);

/* ── Carousel data ── */
const FEATURES = [
    {
        icon: BarChart3,
        title: 'Advanced AI Diagnostics',
        desc: 'Real-time vitals tracking with 99.2% diagnostic accuracy across 50K+ animals',
        stat: '99.2%',
        color: '#22c55e',
        tag: 'HEALTH AI',
    },
    {
        icon: Zap,
        title: 'Real-time IoT Sync',
        desc: 'Live sensor-to-cloud streaming with sub-10ms latency — zero data gaps',
        stat: '<10ms',
        color: '#f59e0b',
        tag: 'LOW LATENCY',
    },
    {
        icon: ShieldCheck,
        title: 'Predictive Diagnostics',
        desc: 'Detect critical illness 72 hours before visible symptoms appear',
        stat: '72hrs early',
        color: '#3b82f6',
        tag: 'PREDICTIVE',
    },
    {
        icon: TrendingUp,
        title: 'Yield Intelligence',
        desc: 'AI-driven breeding & feed optimization boosting farm yield by up to 31%',
        stat: '+31% yield',
        color: '#a78bfa',
        tag: 'OPTIMIZATION',
    },
];

const STATS = [
    { value: '50K+', label: 'Animals Monitored' },
    { value: '500+', label: 'Partner Farms' },
    { value: '99.9%', label: 'Uptime SLA' },
];

const COUNTRY_CODES = [
    { code: '+91', label: 'IN (+91)', flag: '🇮🇳' },
    { code: '+1', label: 'US (+1)', flag: '🇺🇸' },
    { code: '+44', label: 'GB (+44)', flag: '🇬🇧' },
    { code: '+971', label: 'UAE (+971)', flag: '🇦🇪' },
    { code: '+61', label: 'AU (+61)', flag: '🇦🇺' },
    { code: '+49', label: 'DE (+49)', flag: '🇩🇪' },
    { code: '+33', label: 'FR (+33)', flag: '🇫🇷' },
    { code: '+81', label: 'JP (+81)', flag: '🇯🇵' },
    { code: '+65', label: 'SG (+65)', flag: '🇸🇬' },
];

const CAROUSEL_INTERVAL = 4200;

// Dynamic API URL for mobile/network testing
const API_BASE_URL = `/api/auth`;

export default function Login() {
    const [isSignUp, setIsSignUp] = useState(false);
    const [isAdminPortal, setIsAdminPortal] = useState(false);
    const [isForgotPassword, setIsForgotPassword] = useState(false);
    const [email, setEmail] = useState('');
    const [countryCode, setCountryCode] = useState('+91');
    const [mobile, setMobile] = useState('');
    const [otp, setOtp] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [loginType, setLoginType] = useState('email');
    const [showOTP, setShowOTP] = useState(false);
    const [activeFeature, setActiveFeature] = useState(0);
    const [resendTimer, setResendTimer] = useState(0);
    const [expireTimer, setExpireTimer] = useState(0);
    const [showStatus, setShowStatus] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');

    // Forgot password states
    const [resetStep, setResetStep] = useState(1); // 1 = enter email, 2 = enter OTP + new password
    const [newPassword, setNewPassword] = useState('');
    const [resetResendTimer, setResetResendTimer] = useState(0);
    const [resetExpireTimer, setResetExpireTimer] = useState(0);
    const [showNewPassword, setShowNewPassword] = useState(false);

    // Admin forgot password
    const [isAdminForgot, setIsAdminForgot] = useState(false);
    const [adminResetStep, setAdminResetStep] = useState(1);

    const navigate = useNavigate();
    const timerRef = useRef(null);

    /* Auto-advance carousel */
    const startCarousel = () => {
        timerRef.current = setInterval(() =>
            setActiveFeature(p => (p + 1) % FEATURES.length), CAROUSEL_INTERVAL
        );
    };
    useEffect(() => {
        startCarousel();
        return () => clearInterval(timerRef.current);
    }, []);

    /* Handlers for OTP and Expiry Timers */
    useEffect(() => {
        let interval = null;
        if (resendTimer > 0 || expireTimer > 0 || resetResendTimer > 0 || resetExpireTimer > 0) {
            interval = setInterval(() => {
                if (resendTimer > 0) setResendTimer(prev => prev - 1);
                if (resetResendTimer > 0) setResetResendTimer(prev => prev - 1);
                if (expireTimer > 0) {
                    setExpireTimer(prev => {
                        if (prev === 1) {
                            setStatusMsg('Security code has expired.');
                            setShowStatus(true);
                            setTimeout(() => setShowStatus(false), 4000);
                        }
                        return prev - 1;
                    });
                }
                if (resetExpireTimer > 0) {
                    setResetExpireTimer(prev => {
                        if (prev === 1) {
                            setError('Reset code has expired. Please request a new one.');
                        }
                        return prev - 1;
                    });
                }
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [resendTimer, expireTimer, resetResendTimer, resetExpireTimer]);

    const pickFeature = (i) => {
        clearInterval(timerRef.current);
        setActiveFeature(i);
        startCarousel();
    };

    /* Google Login Handler — USER portal */
    const handleGoogleLogin = useGoogleLogin({
        onSuccess: async (tokenResponse) => {
            setIsLoading(true);
            setError('');
            try {
                const res = await axios.post(`${API_BASE_URL}/google`, {
                    accessToken: tokenResponse.access_token
                });
                localStorage.setItem('token', res.data.token);
                localStorage.setItem('user', JSON.stringify(res.data.user));
                setSuccessMsg('Signed in successfully with Google!');
                window.location.href = '/';
            } catch (err) {
                setError(err.response?.data?.message || 'Google authentication failed. Please try again.');
            } finally {
                setIsLoading(false);
            }
        },
        onError: () => setError('Google sign-in was unsuccessful. Please try again.')
    });

    /* Google Login Handler — ADMIN portal */
    const handleGoogleAdminLogin = useGoogleLogin({
        onSuccess: async (tokenResponse) => {
            setIsLoading(true);
            setError('');
            try {
                const res = await axios.post(`${API_BASE_URL}/google-admin`, {
                    accessToken: tokenResponse.access_token
                });
                if (res.data.user?.role !== 'admin') {
                    setError('Unauthorized. Only admin accounts can access this portal.');
                    setIsLoading(false);
                    return;
                }
                localStorage.setItem('token', res.data.token);
                localStorage.setItem('user', JSON.stringify(res.data.user));
                setSuccessMsg('Admin authenticated via Google!');
                window.location.href = '/';
            } catch (err) {
                setError(err.response?.data?.message || 'Unauthorized. Only admin accounts can access this portal.');
            } finally {
                setIsLoading(false);
            }
        },
        onError: () => setError('Google sign-in was unsuccessful. Please try again.')
    });

    const resetState = () => { setError(''); setSuccessMsg(''); setShowOTP(false); setOtp(''); setResetStep(1); setNewPassword(''); setResetResendTimer(0); setResetExpireTimer(0); setIsAdminForgot(false); setAdminResetStep(1); };

    /* OTP request */
    const handleRequestOTP = async () => {
        setIsLoading(true); setError('');
        const combinedMobile = mobile ? `${countryCode}${mobile.replace(/\D/g, '')}` : undefined;
        try {
            await axios.post(`${API_BASE_URL}/request-otp`, {
                email: loginType === 'email' ? email : undefined,
                mobile: combinedMobile,
                type: isSignUp ? 'register' : 'login',
            });
            setShowOTP(true);
            setResendTimer(60);
            setExpireTimer(60);
            setStatusMsg('New verification code sent successfully.');
            setShowStatus(true);
            setTimeout(() => setShowStatus(false), 3000);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to send OTP');
        } finally { setIsLoading(false); }
    };

    /* Main submit */
    const handleSubmit = async (e) => {
        e.preventDefault(); setIsLoading(true); setError(''); setSuccessMsg('');

        if (isForgotPassword) {
            if (resetStep === 1) {
                // Step 1: Request OTP
                try {
                    const res = await axios.post(`${API_BASE_URL}/forgot-password/request`, { email });
                    setSuccessMsg(res.data.message);
                    setResetStep(2);
                    setResetResendTimer(60);
                    setResetExpireTimer(90);
                } catch (err) {
                    setError(err.response?.data?.message || 'Failed to send reset code.');
                } finally { setIsLoading(false); }
                return;
            } else {
                // Step 2: Verify OTP + Reset Password
                try {
                    const res = await axios.post(`${API_BASE_URL}/forgot-password/reset`, {
                        email,
                        otp,
                        newPassword
                    });
                    setSuccessMsg(res.data.message);
                    // Go back to login after success
                    setTimeout(() => {
                        setIsForgotPassword(false);
                        resetState();
                    }, 2500);
                } catch (err) {
                    setError(err.response?.data?.message || 'Failed to reset password.');
                } finally { setIsLoading(false); }
                return;
            }
        }

        /* ── Hardened admin endpoint ── */
        if (isAdminPortal) {
            // Admin Forgot Password flow
            if (isAdminForgot) {
                if (adminResetStep === 1) {
                    try {
                        const res = await axios.post(`${API_BASE_URL}/forgot-password/admin/request`, { email });
                        setSuccessMsg(res.data.message);
                        setAdminResetStep(2);
                        setResetResendTimer(60);
                        setResetExpireTimer(90);
                    } catch (err) {
                        setError(err.response?.data?.message || 'Failed to send reset code.');
                    } finally { setIsLoading(false); }
                    return;
                } else {
                    try {
                        const res = await axios.post(`${API_BASE_URL}/forgot-password/admin/reset`, {
                            email, otp, newPassword
                        });
                        setSuccessMsg(res.data.message);
                        setTimeout(() => {
                            setIsAdminForgot(false);
                            setAdminResetStep(1);
                            resetState();
                        }, 2500);
                    } catch (err) {
                        setError(err.response?.data?.message || 'Failed to reset password.');
                    } finally { setIsLoading(false); }
                    return;
                }
            }
            // Normal admin login
            try {
                const res = await axios.post(`${API_BASE_URL}/admin-login`, { email, password });
                if (res.data.user?.role !== 'admin') {
                    setError('Access denied. Admin privileges required.'); setIsLoading(false); return;
                }
                localStorage.setItem('token', res.data.token);
                localStorage.setItem('user', JSON.stringify(res.data.user));
                navigate('/');
            } catch (err) {
                setError(!err.response ? 'Cannot connect to server.' : err.response.data?.message || 'Invalid admin credentials.');
            } finally { setIsLoading(false); }
            return;
        }

        /* ── Regular user ── */
        try {
            // Prevent accidental submit for mobile/OTP before OTP is requested
            if ((loginType === 'mobile' || (isSignUp && loginType === 'mobile')) && !showOTP) {
                // If they hit enter or submit button, trigger OTP request instead
                await handleRequestOTP();
                return;
            }

            const endpoint = isSignUp
                ? `${API_BASE_URL}/register`
                : `${API_BASE_URL}/login`;

            const combinedMobile = mobile ? `${countryCode}${mobile.replace(/\D/g, '')}` : undefined;

            const payload = isSignUp
                ? { email: loginType === 'email' ? email : undefined, mobile: combinedMobile, password, full_name: fullName, otp }
                : loginType === 'mobile' || showOTP
                    ? { mobile: combinedMobile, email: loginType === 'email' ? email : undefined, otp }
                    : { email, password };
            const res = await axios.post(endpoint, payload);
            localStorage.setItem('token', res.data.token);
            localStorage.setItem('user', JSON.stringify(res.data.user));
            window.location.href = '/';
        } catch (err) {
            setError(!err.response ? 'Cannot connect to server.' : err.response?.data?.message || 'Something went wrong.');
        } finally { setIsLoading(false); }
    };

    const feat = FEATURES[activeFeature];
    const FeatIcon = feat.icon;

    return (
        <div className={styles.page}>

            {/* ══════════════════════════════════════════════
                SPLIT ROW — Left brand + Right auth
            ══════════════════════════════════════════════ */}
            <div className={styles.splitRow}>

                {/* ─────────── LEFT — BRAND PANEL ─────────── */}
                <div className={styles.leftPanel}>
                    {/* Radial glow orbs */}
                    <div className={styles.orb1} aria-hidden="true" />
                    <div className={styles.orb2} aria-hidden="true" />
                    <div className={styles.orb3} aria-hidden="true" />
                    <div className={styles.gridMesh} aria-hidden="true" />

                    {/* Top Toast Notification */}
                    <AnimatePresence mode="wait">
                        {showStatus && (
                            <motion.div
                                className={styles.aranyaToast}
                                initial={{ y: -60, x: '-50%', opacity: 0, scale: 0.9 }}
                                animate={{ y: 24, x: '-50%', opacity: 1, scale: 1 }}
                                exit={{ y: -60, x: '-50%', opacity: 0, scale: 0.9 }}
                                transition={{ type: 'spring', damping: 20, stiffness: 200 }}
                            >
                                <Zap size={16} fill="#fbbf24" color="#fbbf24" />
                                <span>{statusMsg}</span>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Left Branding Panel */}
                    <div className={styles.leftContent}>

                        {/* Brand mark */}
                        <div className={styles.brandMark}>
                            <span className={styles.brandMarkText}>
                                Aranya<span className={styles.brandMarkAi}>Ai</span>
                            </span>
                        </div>

                        {/* Hero */}
                        <motion.div
                            initial={{ opacity: 0, y: 28 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.12, duration: 0.72 }}
                            className={styles.heroBlock}
                        >
                            <div className={styles.pill}>PRECISION ARANYA AI</div>
                            <h1 className={styles.heroH1}>
                                The Future of<br />
                                <span className={styles.heroGreen}>Herd Intelligence</span>
                            </h1>
                            <p className={styles.heroP}>
                                AI-powered diagnostics that catch critical health issues
                                before they happen — keeping your animals thriving.
                            </p>
                        </motion.div>

                        {/* Auto-rotating Feature Carousel */}
                        <div className={styles.featureStack}>
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={feat.title}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.38 }}
                                    className={`${styles.featureCard} ${styles.featureCardActive}`}
                                >
                                    <div
                                        className={styles.fIcon}
                                        style={{ background: `${feat.color}18`, color: feat.color }}
                                    >
                                        <FeatIcon size={20} />
                                    </div>
                                    <div className={styles.fText}>
                                        <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', color: feat.color, marginBottom: '0.2rem', display: 'block' }}>
                                            {feat.tag}
                                        </span>
                                        <strong>{feat.title}</strong>
                                        <span>{feat.desc}</span>
                                    </div>
                                    <span className={styles.fStat} style={{ color: feat.color }}>
                                        {feat.stat}
                                    </span>
                                </motion.div>
                            </AnimatePresence>

                            {/* Progress dots */}
                            <div className={styles.carouselDots}>
                                {FEATURES.map((_, i) => (
                                    <div
                                        key={i}
                                        className={`${styles.dot} ${activeFeature === i ? styles.dotActive : ''}`}
                                        style={{ width: activeFeature === i ? 24 : 8 }}
                                        onClick={() => pickFeature(i)}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Stats bar */}
                        <div className={styles.statsBar}>
                            {STATS.map(s => (
                                <div key={s.label} className={styles.statItem}>
                                    <span className={styles.statVal}>{s.value}</span>
                                    <span className={styles.statLbl}>{s.label}</span>
                                </div>
                            ))}
                        </div>

                        {/* Trust badge */}
                        <div className={styles.trustBadge}>
                            <CheckCircle2 size={15} color="#22c55e" style={{ flexShrink: 0 }} />
                            <span className={styles.trustBadgeText}>
                                Trusted by <strong>500+ High-Performance Farms</strong> · ISO 27001 · SOC 2 Type II
                            </span>
                        </div>

                    </div>
                </div>

                {/* ─────────── RIGHT — AUTH PANEL ─────────── */}
                <div className={styles.rightPanel}>
                    <div className={styles.dotGrid} aria-hidden="true" />

                    <div className={styles.formShell}>
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={
                                    isAdminPortal ? 'admin' :
                                        isForgotPassword ? 'forgot' :
                                            isSignUp ? 'signup' : 'login'
                                }
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -16 }}
                                transition={{ duration: 0.3 }}
                            >
                                {/* Form header */}
                                <div className={styles.formHead}>
                                    <p className={styles.formEyebrow}>
                                        {isAdminPortal
                                            ? (isAdminForgot ? '🔑 ADMIN RECOVERY' : '🔐 RESTRICTED ACCESS')
                                            : isForgotPassword ? '🔑 ACCOUNT RECOVERY'
                                                : isSignUp ? '✦ FREE · NO CREDIT CARD' : '👋 WELCOME BACK'}
                                    </p>
                                    <h2 className={styles.formTitle}>
                                        {isForgotPassword
                                            ? (resetStep === 1 ? 'Recover your access.' : 'Set your new password.')
                                            : isAdminPortal
                                                ? (isAdminForgot
                                                    ? (adminResetStep === 1 ? 'Recover admin access.' : 'Set new admin password.')
                                                    : 'Authorize access.')
                                                : isSignUp
                                                    ? 'Your herd deserves AI.'
                                                    : 'Good to see you again.'}
                                    </h2>
                                    {isAdminForgot && (
                                        <p className={styles.formSub}>
                                            {adminResetStep === 1
                                                ? 'Enter admin email to receive a reset code.'
                                                : 'Check your inbox for the admin reset code.'}
                                        </p>
                                    )}
                                    {isForgotPassword && (
                                        <p className={styles.formSub}>
                                            {resetStep === 1
                                                ? 'Enter your email and we\'ll send you a 6-digit reset code.'
                                                : 'Check your inbox for the reset code.'}
                                        </p>
                                    )}
                                    {!isForgotPassword && !isAdminPortal && (
                                        <p className={styles.formSub}>
                                            {isSignUp
                                                ? '500+ farms use our AI to prevent loss and boost yield.'
                                                : 'Your Aranya dashboard is ready when you are.'}
                                        </p>
                                    )}
                                </div>

                                {/* Alerts */}
                                <div style={{ minHeight: (error || successMsg) ? 'auto' : 0, marginBottom: (error || successMsg) ? '1rem' : 0, transition: '0.3s' }}>
                                    <AnimatePresence mode="wait">
                                        {error && (
                                            <motion.div
                                                key="err"
                                                initial={{ opacity: 0, y: -10, scale: 0.98 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: -10, scale: 0.98 }}
                                                transition={{ duration: 0.2 }}
                                                className={styles.alertErr}
                                            >
                                                ⚠ {error}
                                            </motion.div>
                                        )}
                                        {successMsg && (
                                            <motion.div
                                                key="ok"
                                                initial={{ opacity: 0, y: -10, scale: 0.98 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: -10, scale: 0.98 }}
                                                transition={{ duration: 0.2 }}
                                                className={styles.alertOk}
                                            >
                                                ✓ {successMsg}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {/* Google SSO — shown on main forms only */}
                                {!isForgotPassword && !isAdminPortal && (
                                    <>
                                        <motion.button
                                            type="button"
                                            className={styles.googleBtn}
                                            whileHover={{ y: -1 }}
                                            whileTap={{ scale: 0.99 }}
                                            onClick={() => handleGoogleLogin()}
                                            disabled={isLoading}
                                        >
                                            <GoogleIcon />
                                            <span>{isSignUp ? 'Sign up with Google' : 'Sign in with Google'}</span>
                                        </motion.button>
                                        <div className={styles.orRow}><span>or continue with email</span></div>
                                    </>
                                )}

                                {/* Google SSO — Admin Portal */}
                                {isAdminPortal && (
                                    <>
                                        <motion.button
                                            type="button"
                                            className={styles.googleBtn}
                                            whileHover={{ y: -1 }}
                                            whileTap={{ scale: 0.99 }}
                                            onClick={() => handleGoogleAdminLogin()}
                                            disabled={isLoading}
                                            style={{ borderColor: '#dc2626' }}
                                        >
                                            <GoogleIcon />
                                            <span>Authorize with Google</span>
                                        </motion.button>
                                        <div className={styles.orRow}><span>or authorize with credentials</span></div>
                                    </>
                                )}

                                {/* Email / Mobile toggle */}
                                {!isForgotPassword && !isAdminPortal && (
                                    <div className={styles.methodRow}>
                                        {['email', 'mobile'].map(t => (
                                            <button
                                                key={t}
                                                type="button"
                                                className={`${styles.methodBtn} ${loginType === t ? styles.methodActive : ''}`}
                                                onClick={() => { setLoginType(t); resetState(); }}
                                            >
                                                {t === 'email' ? <Mail size={13} /> : <Phone size={13} />}
                                                {t.charAt(0).toUpperCase() + t.slice(1)}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                <form onSubmit={handleSubmit} className={styles.form}>

                                    {/* Full Name — sign up only */}
                                    {isSignUp && (
                                        <Field icon={<User size={16} />} type="text" placeholder="Full Name"
                                            value={fullName} onChange={e => setFullName(e.target.value)} required />
                                    )}

                                    {/* Email or Mobile */}
                                    {loginType === 'email' || isAdminPortal ? (
                                        <Field icon={<Mail size={16} />} type="email"
                                            placeholder={isAdminPortal ? 'Admin Email' : 'Email Address'}
                                            value={email} onChange={e => setEmail(e.target.value)}
                                            required disabled={showOTP} />
                                    ) : (
                                        <Field
                                            icon={<Phone size={16} />}
                                            type="tel"
                                            placeholder="Mobile Number"
                                            value={mobile}
                                            onChange={e => {
                                                const rawVal = e.target.value;
                                                const cleanVal = rawVal.replace(/\D/g, ''); // Digits only

                                                // 1. Detect if it starts with '+'
                                                if (rawVal.startsWith('+')) {
                                                    const matched = COUNTRY_CODES
                                                        .slice()
                                                        .sort((a, b) => b.code.length - a.code.length)
                                                        .find(c => rawVal.startsWith(c.code));
                                                    if (matched) {
                                                        setCountryCode(matched.code);
                                                        setMobile(rawVal.slice(matched.code.length).replace(/\D/g, ''));
                                                        return;
                                                    }
                                                }

                                                // 2. Intelligent digit-based detection (no + sign)
                                                // Check if the number starts with a known country code (digits only)
                                                const matchedByDigits = COUNTRY_CODES
                                                    .slice()
                                                    .sort((a, b) => b.code.length - a.code.length)
                                                    .find(c => {
                                                        const codeDigits = c.code.replace('+', '');
                                                        // Only detect if it's longer than just the code (so we don't switch while they are typing)
                                                        return cleanVal.startsWith(codeDigits) && cleanVal.length > codeDigits.length + 5;
                                                    });

                                                if (matchedByDigits) {
                                                    const codeDigits = matchedByDigits.code.replace('+', '');
                                                    setCountryCode(matchedByDigits.code);
                                                    setMobile(cleanVal.slice(codeDigits.length));
                                                } else {
                                                    setMobile(cleanVal);
                                                }
                                            }}
                                            required
                                            disabled={showOTP}
                                            isPhone
                                            countryCode={countryCode}
                                            onCountryChange={e => setCountryCode(e.target.value)}
                                        />
                                    )}

                                    {/* Password — shown for email login + admin login (when NOT in forgot password) */}
                                    {!showOTP && !isForgotPassword && !isAdminForgot && (loginType === 'email' || isAdminPortal) && (
                                        <Field icon={<Lock size={16} />} type="password" placeholder="Password"
                                            value={password} onChange={e => setPassword(e.target.value)}
                                            required={!isSignUp} />
                                    )}

                                    {/* OTP */}
                                    {showOTP && (
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                                            <Field
                                                icon={<ShieldCheck size={16} />}
                                                type="text"
                                                maxLength={6}
                                                placeholder="6-digit OTP"
                                                value={otp}
                                                onChange={e => setOtp(e.target.value)}
                                                required
                                                isOTP
                                                progress={(expireTimer / 60) * 100}
                                            />
                                            <div className={styles.otpStatusRow} style={{ justifyContent: 'flex-end' }}>
                                                <button
                                                    type="button"
                                                    className={styles.resendLink}
                                                    onClick={handleRequestOTP}
                                                    disabled={resendTimer > 0 || isLoading}
                                                >
                                                    {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend OTP'}
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}

                                    {/* ── Forgot Password: Step 2 — OTP + New Password ── */}
                                    {isForgotPassword && resetStep === 2 && (
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                                            <Field
                                                icon={<ShieldCheck size={16} />}
                                                type="text"
                                                maxLength={6}
                                                placeholder="6-digit reset code"
                                                value={otp}
                                                onChange={e => setOtp(e.target.value)}
                                                required
                                                isOTP
                                                progress={(resetExpireTimer / 90) * 100}
                                            />
                                            <div className={styles.otpStatusRow} style={{ justifyContent: 'space-between' }}>
                                                <span style={{ fontSize: '0.78rem', color: resetExpireTimer <= 10 ? '#dc2626' : '#64748b' }}>
                                                    {resetExpireTimer > 0 ? `Expires in ${resetExpireTimer}s` : 'Code expired'}
                                                </span>
                                                <button
                                                    type="button"
                                                    className={styles.resendLink}
                                                    onClick={async () => {
                                                        if (resetResendTimer > 0) return;
                                                        try {
                                                            setError('');
                                                            await axios.post(`${API_BASE_URL}/forgot-password/request`, { email });
                                                            setSuccessMsg('New reset code sent!');
                                                            setResetResendTimer(60);
                                                            setResetExpireTimer(90);
                                                            setOtp('');
                                                        } catch (err) {
                                                            setError(err.response?.data?.message || 'Failed to resend.');
                                                        }
                                                    }}
                                                    disabled={resetResendTimer > 0}
                                                >
                                                    {resetResendTimer > 0 ? `Resend in ${resetResendTimer}s` : 'Resend Code'}
                                                </button>
                                            </div>
                                            <div style={{ position: 'relative', marginTop: '0.5rem' }}>
                                                <Field
                                                    icon={<Lock size={16} />}
                                                    type={showNewPassword ? 'text' : 'password'}
                                                    placeholder="New password (min 6 chars)"
                                                    value={newPassword}
                                                    onChange={e => setNewPassword(e.target.value)}
                                                    required
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowNewPassword(!showNewPassword)}
                                                    style={{
                                                        position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
                                                        background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px'
                                                    }}
                                                >
                                                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}

                                    {/* Forgot password link — User */}
                                    {!isSignUp && !isForgotPassword && !isAdminPortal && loginType === 'email' && !showOTP && (
                                        <div className={styles.forgotRow}>
                                            <button type="button" className={styles.forgotLink}
                                                onClick={() => { setIsForgotPassword(true); resetState(); }}>
                                                Forgot password?
                                            </button>
                                        </div>
                                    )}

                                    {/* Forgot password link — Admin */}
                                    {isAdminPortal && !isAdminForgot && (
                                        <div className={styles.forgotRow}>
                                            <button type="button" className={styles.forgotLink}
                                                onClick={() => { setIsAdminForgot(true); setAdminResetStep(1); setError(''); setSuccessMsg(''); setOtp(''); setNewPassword(''); }}>
                                                Forgot password?
                                            </button>
                                        </div>
                                    )}

                                    {/* Admin Forgot Password: Step 2 — OTP + New Password */}
                                    {isAdminForgot && adminResetStep === 2 && (
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                                            <Field
                                                icon={<ShieldCheck size={16} />}
                                                type="text"
                                                maxLength={6}
                                                placeholder="6-digit reset code"
                                                value={otp}
                                                onChange={e => setOtp(e.target.value)}
                                                required
                                                isOTP
                                                progress={(resetExpireTimer / 90) * 100}
                                            />
                                            <div className={styles.otpStatusRow} style={{ justifyContent: 'space-between' }}>
                                                <span style={{ fontSize: '0.78rem', color: resetExpireTimer <= 10 ? '#dc2626' : '#64748b' }}>
                                                    {resetExpireTimer > 0 ? `Expires in ${resetExpireTimer}s` : 'Code expired'}
                                                </span>
                                                <button
                                                    type="button"
                                                    className={styles.resendLink}
                                                    onClick={async () => {
                                                        if (resetResendTimer > 0) return;
                                                        try {
                                                            setError('');
                                                            await axios.post(`${API_BASE_URL}/forgot-password/admin/request`, { email });
                                                            setSuccessMsg('New reset code sent!');
                                                            setResetResendTimer(60);
                                                            setResetExpireTimer(90);
                                                            setOtp('');
                                                        } catch (err) {
                                                            setError(err.response?.data?.message || 'Failed to resend.');
                                                        }
                                                    }}
                                                    disabled={resetResendTimer > 0}
                                                >
                                                    {resetResendTimer > 0 ? `Resend in ${resetResendTimer}s` : 'Resend Code'}
                                                </button>
                                            </div>
                                            <div style={{ position: 'relative', marginTop: '0.5rem' }}>
                                                <Field
                                                    icon={<Lock size={16} />}
                                                    type={showNewPassword ? 'text' : 'password'}
                                                    placeholder="New password (min 6 chars)"
                                                    value={newPassword}
                                                    onChange={e => setNewPassword(e.target.value)}
                                                    required
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowNewPassword(!showNewPassword)}
                                                    style={{
                                                        position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
                                                        background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px'
                                                    }}
                                                >
                                                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}

                                    {/* Send OTP CTA */}
                                    {!isAdminPortal && (isSignUp || loginType === 'mobile') && !showOTP && (
                                        <motion.button type="button" className={styles.otpBtn}
                                            onClick={handleRequestOTP} disabled={isLoading}
                                            whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
                                            {isLoading ? <Spinner /> : null}
                                            {isLoading ? 'Sending...' : 'Send Verification Code'}
                                        </motion.button>
                                    )}

                                    {/* Primary CTA */}
                                    {(loginType === 'email' || showOTP || isForgotPassword || isAdminPortal) && (
                                        <motion.button type="submit" className={styles.primaryBtn}
                                            disabled={isLoading}
                                            whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
                                            {isLoading ? <Spinner /> : null}
                                            <span>
                                                {isLoading ? 'Processing…'
                                                    : isForgotPassword
                                                        ? (resetStep === 1 ? 'Send Reset Code' : 'Reset Password')
                                                        : isAdminPortal
                                                            ? (isAdminForgot
                                                                ? (adminResetStep === 1 ? 'Send Reset Code' : 'Reset Password')
                                                                : 'Authorize Access')
                                                            : isSignUp ? 'Create Account'
                                                                : 'Sign In'}
                                            </span>
                                            {!isLoading && <ArrowRight size={17} className={styles.btnArrow} />}
                                        </motion.button>
                                    )}
                                </form>

                                {/* Switch links */}
                                <div className={styles.switchRow}>
                                    {!isAdminPortal && (
                                        <span className={styles.switchTxt}>
                                            {isSignUp ? 'Already have an account? '
                                                : isForgotPassword ? 'Remembered it? '
                                                    : "Don't have an account? "}
                                            <button type="button" className={styles.switchBtn}
                                                onClick={() => { setIsSignUp(!isSignUp && !isForgotPassword); setIsForgotPassword(false); resetState(); }}>
                                                {isSignUp || isForgotPassword ? 'Sign In' : 'Sign Up Free'}
                                            </button>
                                        </span>
                                    )}
                                    <button type="button" className={styles.adminBtn}
                                        onClick={() => { setIsAdminPortal(!isAdminPortal); setLoginType('email'); setIsSignUp(false); setIsForgotPassword(false); resetState(); }}>
                                        {isAdminPortal ? '← Back to User Login' : 'Admin Portal →'}
                                    </button>
                                </div>

                            </motion.div>
                        </AnimatePresence>
                    </div>

                    <p className={styles.copyright}>© 2026 Aranya AI Inc. All rights reserved.</p>
                </div>

            </div>{/* end splitRow */}

            {/* ══════════════════════════════════════════════
                MEGA FOOTER — Twilio-inspired
            ══════════════════════════════════════════════ */}
            <footer className={styles.megaFooter}>
                <div className={styles.footerGrid}>

                    {/* Brand column */}
                    <div className={styles.footerBrandCol}>
                        <div className={styles.footerLogoWrap}>
                            <span className={styles.brandMarkText}>
                                Aranya<span className={styles.brandMarkAi}>Ai</span>
                            </span>
                        </div>
                        <p className={styles.footerTagline}>
                            AI-powered precision animal management trusted by 500+ high-performance farms across India.
                        </p>
                        <div className={styles.footerSocials}>
                            <Facebook size={18} /><Twitter size={18} /><Linkedin size={18} /><Youtube size={18} /><Github size={18} />
                        </div>
                    </div>

                    {/* Platform */}
                    <div>
                        <h4 className={styles.footerColTitle}>Platform</h4>
                        <ul className={styles.footerList}>
                            <li>Animal Health Monitoring</li>
                            <li>Yield Prediction AI</li>
                            <li>Precision Breeding</li>
                            <li>IoT Device Sync</li>
                            <li>Disease Diagnostics</li>
                            <li className={styles.footerListAccent}>All Solutions <ChevronRight size={13} /></li>
                        </ul>
                    </div>

                    {/* Industry */}
                    <div>
                        <h4 className={styles.footerColTitle}>Industry</h4>
                        <ul className={styles.footerList}>
                            <li>Dairy Farming</li>
                            <li>Animal Export</li>
                            <li>Research Institutions</li>
                            <li>Government Oversight</li>
                            <li>Sustainable Agriculture</li>
                            <li className={styles.footerListAccent}>Use Cases <ChevronRight size={13} /></li>
                        </ul>
                    </div>

                    {/* Developers */}
                    <div>
                        <h4 className={styles.footerColTitle}>Developers</h4>
                        <ul className={styles.footerList}>
                            <li>API Documentation</li>
                            <li>SDKs &amp; Mock Data</li>
                            <li>Webhooks</li>
                            <li>Open Source</li>
                            <li>Status Page</li>
                            <li className={styles.footerListAccent}>All Docs <ChevronRight size={13} /></li>
                        </ul>
                    </div>

                </div>

                <div className={styles.footerBottom}>
                    <div className={styles.footerBottomLinks}>
                        <span>Privacy Policy</span>
                        <span>Terms of Service</span>
                        <span>Cookie Policy</span>
                        <span>Security</span>
                    </div>
                    <span className={styles.footerCopyText}>© 2026 Aranya AI Inc. All rights reserved.</span>
                </div>
            </footer>

        </div >
    );
}


/* ── Reusable input field ── */
function Field({ icon, type, isPhone, countryCode, onCountryChange, isOTP, progress, ...props }) {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';

    return (
        <div className={`${styles.field} ${isPhone ? styles.fieldPhone : ''}`}>
            {isPhone ? (
                <div className={styles.countryPicker}>
                    <select value={countryCode} onChange={onCountryChange} className={styles.countrySelect}>
                        {COUNTRY_CODES.map(c => (
                            <option key={c.code} value={c.code}>
                                {c.flag} {c.code}
                            </option>
                        ))}
                    </select>
                </div>
            ) : (
                <span className={styles.fieldIcon}>{icon}</span>
            )}
            <input
                className={`${styles.fieldInput} ${isPhone ? styles.fieldInputPhone : ''}`}
                placeholder=" "
                type={isPassword ? (showPassword ? 'text' : 'password') : type}
                {...props}
            />
            {isPassword && (
                <button
                    type="button"
                    className={styles.fieldViewBtn}
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex="-1"
                >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
            )}

            {isOTP && progress > 0 && (
                <div className={styles.fieldProgressWrap}>
                    <motion.div
                        className={styles.fieldProgress}
                        initial={{ width: '100%' }}
                        animate={{ width: `${progress}%` }}
                        style={{
                            background: progress < 30 ? '#ef4444' : progress < 60 ? '#f59e0b' : '#22c55e'
                        }}
                    />
                </div>
            )}
        </div>
    );
}

/* ── Button spinner ── */
function Spinner() {
    return <span className={styles.spinner} />;
}
