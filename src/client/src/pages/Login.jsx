import React, { useState, useEffect, useRef } from 'react';
import {
    Mail, Phone,
    Twitter, Linkedin, Facebook, Youtube, Github,
    ChevronRight, ArrowRight,
    Activity, Shield, Eye, EyeOff, Sparkles,
    Clock, Star, HardDrive, Syringe, Bot, FileText,
    Volume2
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

const API_BASE_URL = `/api/auth`;

/* ── Animation variants ── */
const stagger = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.15 } }
};
const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.25, 0.8, 0.25, 1] } }
};

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
    const [resendTimer, setResendTimer] = useState(0);
    const [expireTimer, setExpireTimer] = useState(0);

    // Forgot password states
    const [resetStep, setResetStep] = useState(1);
    const [newPassword, setNewPassword] = useState('');
    const [resetResendTimer, setResetResendTimer] = useState(0);
    const [resetExpireTimer, setResetExpireTimer] = useState(0);
    const [showNewPassword, setShowNewPassword] = useState(false);

    // Admin forgot password
    const [isAdminForgot, setIsAdminForgot] = useState(false);
    const [adminResetStep, setAdminResetStep] = useState(1);

    // Audio player
    const [loginAudio, setLoginAudio] = useState(null);
    const [audioPlaying, setAudioPlaying] = useState(false);
    const [audioReady, setAudioReady] = useState(false);
    const audioRef = useRef(null);

    const navigate = useNavigate();

    /* Timer logic */
    useEffect(() => {
        let interval = null;
        if (resendTimer > 0 || expireTimer > 0 || resetResendTimer > 0 || resetExpireTimer > 0) {
            interval = setInterval(() => {
                if (resendTimer > 0) setResendTimer(prev => prev - 1);
                if (resetResendTimer > 0) setResetResendTimer(prev => prev - 1);
                if (expireTimer > 0) setExpireTimer(prev => prev - 1);
                if (resetExpireTimer > 0) {
                    setResetExpireTimer(prev => {
                        if (prev === 1) setError('Reset code has expired. Please request a new one.');
                        return prev - 1;
                    });
                }
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [resendTimer, expireTimer, resetResendTimer, resetExpireTimer]);

    const resetState = () => {
        setError(''); setSuccessMsg(''); setShowOTP(false); setOtp('');
        setResetStep(1); setNewPassword(''); setResetResendTimer(0);
        setResetExpireTimer(0); setIsAdminForgot(false); setAdminResetStep(1);
    };

    useEffect(() => {
        const query = new URLSearchParams(window.location.search);
        if (query.get('expired')) {
            setError('Your session has expired or is invalid. Please log in again to continue.');
        }
    }, []);

    // Fetch login audio from system settings
    useEffect(() => {
        (async () => {
            try {
                const r = await axios.get('/api/settings');
                if (r.data?.login_audio?.url) setLoginAudio(r.data.login_audio);
            } catch { /* silently ignore */ }
        })();
    }, []);

    const toggleAudio = () => {
        if (!audioRef.current) return;
        if (audioPlaying) {
            audioRef.current.pause();
            setAudioPlaying(false);
        } else {
            audioRef.current.play().then(() => setAudioPlaying(true)).catch(() => setAudioPlaying(false));
        }
    };

    /* Google Login — User */
    const handleGoogleLogin = useGoogleLogin({
        onSuccess: async (tokenResponse) => {
            setIsLoading(true); setError('');
            try {
                const res = await axios.post(`${API_BASE_URL}/google`, { accessToken: tokenResponse.access_token });
                localStorage.setItem('token', res.data.token);
                localStorage.setItem('user', JSON.stringify(res.data.user));
                window.location.href = '/';
            } catch (err) {
                setError(err.response?.data?.message || 'Google authentication failed.');
            } finally { setIsLoading(false); }
        },
        onError: () => setError('Google sign-in was unsuccessful. Please try again.')
    });

    /* Google Login — Admin */
    const handleGoogleAdminLogin = useGoogleLogin({
        onSuccess: async (tokenResponse) => {
            setIsLoading(true); setError('');
            try {
                const res = await axios.post(`${API_BASE_URL}/google-admin`, { accessToken: tokenResponse.access_token });
                if (res.data.user?.role !== 'admin') { setError('Unauthorized. Only admin accounts.'); setIsLoading(false); return; }
                localStorage.setItem('token', res.data.token);
                localStorage.setItem('user', JSON.stringify(res.data.user));
                window.location.href = '/';
            } catch (err) {
                setError(err.response?.data?.message || 'Admin Google auth failed.');
            } finally { setIsLoading(false); }
        },
        onError: () => setError('Google sign-in was unsuccessful.')
    });

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
            setSuccessMsg('Verification code sent!');
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to send OTP');
        } finally { setIsLoading(false); }
    };

    /* Main submit */
    const handleSubmit = async (e) => {
        e.preventDefault(); setIsLoading(true); setError(''); setSuccessMsg('');

        // User forgot password
        if (isForgotPassword) {
            if (resetStep === 1) {
                try {
                    const res = await axios.post(`${API_BASE_URL}/forgot-password/request`, { email });
                    setSuccessMsg(res.data.message);
                    setResetStep(2); setResetResendTimer(60); setResetExpireTimer(90);
                } catch (err) { setError(err.response?.data?.message || 'Failed to send reset code.'); }
                finally { setIsLoading(false); }
                return;
            } else {
                try {
                    const res = await axios.post(`${API_BASE_URL}/forgot-password/reset`, { email, otp, newPassword });
                    setSuccessMsg(res.data.message);
                    setTimeout(() => { setIsForgotPassword(false); resetState(); }, 2500);
                } catch (err) { setError(err.response?.data?.message || 'Failed to reset password.'); }
                finally { setIsLoading(false); }
                return;
            }
        }

        // Admin portal
        if (isAdminPortal) {
            if (isAdminForgot) {
                if (adminResetStep === 1) {
                    try {
                        const res = await axios.post(`${API_BASE_URL}/forgot-password/admin/request`, { email });
                        setSuccessMsg(res.data.message);
                        setAdminResetStep(2); setResetResendTimer(60); setResetExpireTimer(90);
                    } catch (err) { setError(err.response?.data?.message || 'Failed to send reset code.'); }
                    finally { setIsLoading(false); }
                    return;
                } else {
                    try {
                        const res = await axios.post(`${API_BASE_URL}/forgot-password/admin/reset`, { email, otp, newPassword });
                        setSuccessMsg(res.data.message);
                        setTimeout(() => { setIsAdminForgot(false); setAdminResetStep(1); resetState(); }, 2500);
                    } catch (err) { setError(err.response?.data?.message || 'Failed to reset password.'); }
                    finally { setIsLoading(false); }
                    return;
                }
            }
            // Normal admin login
            try {
                const res = await axios.post(`${API_BASE_URL}/admin-login`, { email, password });
                if (res.data.user?.role !== 'admin') { setError('Access denied.'); setIsLoading(false); return; }
                localStorage.setItem('token', res.data.token);
                localStorage.setItem('user', JSON.stringify(res.data.user));
                navigate('/');
            } catch (err) {
                setError(!err.response ? 'Cannot connect to server.' : err.response.data?.message || 'Invalid admin credentials.');
            } finally { setIsLoading(false); }
            return;
        }

        // Regular user
        try {
            if ((loginType === 'mobile' || (isSignUp && loginType === 'mobile')) && !showOTP) {
                await handleRequestOTP(); return;
            }
            const endpoint = isSignUp ? `${API_BASE_URL}/register` : `${API_BASE_URL}/login`;
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

    return (
        <div className={styles.page}>
            {/* ══ AURORA BACKGROUND ══ */}
            <div className={styles.auroraBg}>
                <div className={styles.blob1} />
                <div className={styles.blob2} />
                <div className={styles.blob3} />
                <div className={styles.blob4} />
                <div className={styles.dotGrid} />
                <div className={styles.particles}>
                    {[...Array(8)].map((_, i) => <div key={i} className={styles.particle} />)}
                </div>
                <div className={styles.scanLine} />
            </div>

            <div className={styles.mainContainer}>
                <div className={styles.splitRow}>
                    {/* ─── LEFT — VISUAL PANEL ─── */}
                    <div className={styles.leftPanel}>
                        <motion.div
                            initial={{ opacity: 0, x: -40 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.9, ease: [0.25, 0.8, 0.25, 1] }}
                            className={styles.visualContent}
                        >
                            <div className={styles.brandMark}>
                                <span className={styles.brandMarkText}>
                                    Aranya<span className={styles.brandMarkAi}>Ai</span>
                                </span>
                            </div>

                            <div className={styles.heroBlock}>
                                <h1>
                                    <span className={styles.heroLine1}>Because Instinct is Hidden.</span>
                                    <span className={styles.heroLine2}>Protect Every Life, Before it Fails.</span>
                                </h1>
                            </div>

                            <motion.div className={styles.bentoGrid} variants={stagger} initial="hidden" animate="show">
                                <motion.div variants={fadeUp} className={styles.bentoItem}>
                                    <div className={`${styles.bentoIcon} ${styles.bentoIcon1}`}><Clock size={20} strokeWidth={2.5} /></div>
                                    <span className={styles.bentoVal}>Advanced</span>
                                    <span className={styles.bentoLbl}>Predictive Warning System</span>
                                </motion.div>
                                <motion.div variants={fadeUp} className={styles.bentoItem}>
                                    <div className={`${styles.bentoIcon} ${styles.bentoIcon2}`}><Sparkles size={20} strokeWidth={2.5} /></div>
                                    <span className={styles.bentoVal}>Arion</span>
                                    <span className={styles.bentoLbl}>24/7 Personalised Health Assistant</span>
                                </motion.div>
                                <motion.div variants={fadeUp} className={styles.bentoItem}>
                                    <div className={`${styles.bentoIcon} ${styles.bentoIcon3}`}><Eye size={20} strokeWidth={2.5} /></div>
                                    <span className={styles.bentoVal}>Visual Scan</span>
                                    <span className={styles.bentoLbl}>Advanced Symptom Checker</span>
                                </motion.div>
                                <motion.div variants={fadeUp} className={styles.bentoItem}>
                                    <div className={`${styles.bentoIcon} ${styles.bentoIcon4}`}><Star size={20} strokeWidth={2.5} /></div>
                                    <span className={styles.bentoVal}>99.2%</span>
                                    <span className={styles.bentoLbl}>Diagnostic Rating</span>
                                </motion.div>
                            </motion.div>

                            {/* ── Audio Player Widget ── */}
                            {loginAudio && (
                                <motion.div
                                    className={`${styles.audioWidget} ${audioPlaying ? styles.audioWidgetActive : ''} ${styles.audioWidgetClickable}`}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
                                    onClick={toggleAudio}
                                    role="button"
                                    tabIndex={0}
                                >
                                    <audio
                                        ref={audioRef}
                                        src={loginAudio.url}
                                        loop
                                        preload="metadata"
                                        onEnded={() => setAudioPlaying(false)}
                                    />

                                    {/* Animated background waveform */}
                                    <div className={styles.audioBgWave}>
                                        {[...Array(12)].map((_, i) => (
                                            <span key={i} className={`${styles.audioBgBar} ${audioPlaying ? styles.audioBgBarActive : ''}`} style={{ animationDelay: `${i * 0.08}s` }} />
                                        ))}
                                    </div>

                                    {audioPlaying ? (
                                        /* ── PLAYING STATE ── */
                                        <>
                                            <div className={styles.audioLeft}>
                                                <div className={`${styles.audioIconCircle} ${styles.audioIconCircleActive}`}>
                                                    <div className={styles.audioEqualizer}>
                                                        <span /><span /><span /><span />
                                                    </div>
                                                </div>
                                                <div className={styles.audioMeta}>
                                                    <div className={styles.audioNowPlaying}>
                                                        <span className={styles.audioLiveDot} /> NOW PLAYING
                                                    </div>
                                                    <div className={styles.audioTrackName}>{loginAudio.title || 'Aranya AI'}</div>
                                                </div>
                                            </div>

                                            <div className={styles.audioCenter}>
                                                <div className={styles.audioWaveform}>
                                                    {[...Array(32)].map((_, i) => (
                                                        <span key={i} className={styles.audioBar} style={{ animationDelay: `${i * 0.05}s` }} />
                                                    ))}
                                                </div>
                                            </div>

                                            <button
                                                className={`${styles.audioStopBtn}`}
                                                onClick={(e) => { e.stopPropagation(); toggleAudio(); }}
                                                aria-label="Turn off ambient audio"
                                            >
                                                <Volume2 size={14} />
                                            </button>
                                        </>
                                    ) : (
                                        /* ── IDLE STATE — Designed to trigger curiosity ── */
                                        <>
                                            {/* Big Play Button */}
                                            <div className={styles.audioPlayCircle}>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                                            </div>

                                            {/* Info */}
                                            <div className={styles.audioMeta}>
                                                <div className={styles.audioIdleCta}>Listen to AranyaAI’s Inspiration</div>
                                                <div className={styles.audioIdleSub}>By Ayush, Anu, Keya & Ankit</div>
                                            </div>

                                            {/* Frozen waveform preview - synced to 32 bars */}
                                            <div className={styles.audioFrozenWave}>
                                                {[...Array(32)].map((_, i) => {
                                                    const waveHeight = 15 + Math.sin(i * 0.4) * 35 + Math.random() * 20;
                                                    return (
                                                        <span key={i} className={styles.audioFrozenBar} style={{ height: `${waveHeight}%` }} />
                                                    );
                                                })}
                                            </div>

                                            {/* Ready state indicator */}
                                            <div className={styles.audioReadyBadge}>
                                                <span className={styles.audioReadyDot} />
                                                <span>LISTEN NOW</span>
                                            </div>


                                        </>
                                    )}
                                </motion.div>
                            )}
                        </motion.div>
                    </div>

                    {/* ─── RIGHT — AUTH PANEL ─── */}
                    <div className={styles.rightPanel}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.6, ease: [0.25, 0.8, 0.25, 1] }}
                            className={styles.cardWrapper}
                        >
                            <div className={styles.glassCard}>
                                {/* Header */}
                                <div className={styles.formHead}>
                                    <h2 className={styles.formTitle}>
                                        {isAdminPortal
                                            ? (isAdminForgot ? 'Admin Recovery 🔑' : 'Admin Portal 🔐')
                                            : isForgotPassword
                                                ? (resetStep === 1 ? 'Recover Access 🛡️' : 'New Password ⚒️')
                                                : isSignUp ? 'Join Aranya ✨' : 'Welcome back 👋'}
                                    </h2>
                                    <p className={styles.formSub}>
                                        {isAdminPortal
                                            ? (isAdminForgot
                                                ? (adminResetStep === 1 ? 'Enter admin email for reset code' : 'Enter reset code & new password')
                                                : 'Authorize restricted access')
                                            : isForgotPassword
                                                ? (resetStep === 1 ? 'Enter your email for a reset code' : 'Check your inbox for the code')
                                                : isSignUp ? 'Start for free' : 'Sign in to your dashboard'}
                                    </p>
                                </div>

                                {/* Alerts */}
                                <AnimatePresence mode="wait">
                                    {error && (
                                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={styles.alertErr}>
                                            ⚠ {error}
                                        </motion.div>
                                    )}
                                    {successMsg && (
                                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={styles.alertOk}>
                                            ✓ {successMsg}
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Google SSO */}
                                {!isForgotPassword && !isAdminForgot && (
                                    <>
                                        <button type="button" className={styles.googleBtn}
                                            onClick={() => isAdminPortal ? handleGoogleAdminLogin() : handleGoogleLogin()}
                                            disabled={isLoading}>
                                            <GoogleIcon />
                                            <span>{isAdminPortal ? 'Authorize with Google' : isSignUp ? 'Sign up with Google' : 'Sign in with Google'}</span>
                                        </button>
                                        <div className={styles.divider}>
                                            <span>{isAdminPortal ? 'or authorize with credentials' : 'or continue with email'}</span>
                                        </div>
                                    </>
                                )}

                                {/* Email / Mobile toggle — for non-admin, non-forgot */}
                                {!isForgotPassword && !isAdminPortal && (
                                    <div className={styles.methodRow}>
                                        {['email', 'mobile'].map(t => (
                                            <button
                                                key={t} type="button"
                                                className={`${styles.methodBtn} ${loginType === t ? styles.methodActive : ''}`}
                                                onClick={() => { setLoginType(t); resetState(); }}
                                            >
                                                {t === 'email' ? <Mail size={14} /> : <Phone size={14} />}
                                                {t.charAt(0).toUpperCase() + t.slice(1)}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Form */}
                                <form onSubmit={handleSubmit} className={styles.fieldGroup}>
                                    {/* Full Name — sign up only */}
                                    <AnimatePresence>
                                        {isSignUp && (
                                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                                                <Field label="Full Name" type="text" value={fullName} onChange={e => setFullName(e.target.value)} required />
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* Email or Mobile */}
                                    {loginType === 'email' || isAdminPortal || isForgotPassword || isAdminForgot ? (
                                        <Field label={isAdminPortal ? 'Admin Email' : 'Email Address'} type="email"
                                            value={email} onChange={e => setEmail(e.target.value)} required disabled={showOTP} />
                                    ) : (
                                        <div className={styles.phoneRow}>
                                            <select value={countryCode} onChange={e => setCountryCode(e.target.value)} className={styles.countrySelect}>
                                                {COUNTRY_CODES.map(c => (
                                                    <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
                                                ))}
                                            </select>
                                            <Field label="Mobile Number" type="tel" value={mobile}
                                                onChange={e => {
                                                    const rawVal = e.target.value;
                                                    const cleanVal = rawVal.replace(/\D/g, '');
                                                    if (rawVal.startsWith('+')) {
                                                        const matched = COUNTRY_CODES.slice().sort((a, b) => b.code.length - a.code.length)
                                                            .find(c => rawVal.startsWith(c.code));
                                                        if (matched) { setCountryCode(matched.code); setMobile(rawVal.slice(matched.code.length).replace(/\D/g, '')); return; }
                                                    }
                                                    const matchedByDigits = COUNTRY_CODES.slice().sort((a, b) => b.code.length - a.code.length)
                                                        .find(c => { const cd = c.code.replace('+', ''); return cleanVal.startsWith(cd) && cleanVal.length > cd.length + 5; });
                                                    if (matchedByDigits) { const cd = matchedByDigits.code.replace('+', ''); setCountryCode(matchedByDigits.code); setMobile(cleanVal.slice(cd.length)); }
                                                    else { setMobile(cleanVal); }
                                                }}
                                                required disabled={showOTP} />
                                        </div>
                                    )}

                                    {/* Password — email login + admin (not forgot) */}
                                    {!showOTP && !isForgotPassword && !isAdminForgot && (loginType === 'email' || isAdminPortal) && (
                                        <Field label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} required={!isSignUp} />
                                    )}

                                    {/* OTP Field */}
                                    <AnimatePresence>
                                        {showOTP && (
                                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                                                <Field label="6-digit OTP" type="text" maxLength={6} value={otp} onChange={e => setOtp(e.target.value)} required isOTP progress={(expireTimer / 60) * 100} />
                                                <div className={styles.otpRow}>
                                                    <button type="button" className={styles.resendLink} onClick={handleRequestOTP} disabled={resendTimer > 0 || isLoading}>
                                                        {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend OTP'}
                                                    </button>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* Forgot Password Step 2: OTP + New Password */}
                                    <AnimatePresence>
                                        {isForgotPassword && resetStep === 2 && (
                                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                <Field label="6-digit Reset Code" type="text" maxLength={6} value={otp} onChange={e => setOtp(e.target.value)} required isOTP progress={(resetExpireTimer / 90) * 100} />
                                                <div className={styles.otpRow}>
                                                    <span style={{ fontSize: '0.78rem', color: resetExpireTimer <= 10 ? '#dc2626' : '#64748b' }}>
                                                        {resetExpireTimer > 0 ? `Expires in ${resetExpireTimer}s` : 'Code expired'}
                                                    </span>
                                                    <button type="button" className={styles.resendLink}
                                                        onClick={async () => {
                                                            if (resetResendTimer > 0) return;
                                                            try { setError(''); await axios.post(`${API_BASE_URL}/forgot-password/request`, { email }); setSuccessMsg('New reset code sent!'); setResetResendTimer(60); setResetExpireTimer(90); setOtp(''); }
                                                            catch (err) { setError(err.response?.data?.message || 'Failed to resend.'); }
                                                        }}
                                                        disabled={resetResendTimer > 0}>
                                                        {resetResendTimer > 0 ? `Resend in ${resetResendTimer}s` : 'Resend Code'}
                                                    </button>
                                                </div>
                                                <Field label="New Password (min 6 chars)" type={showNewPassword ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* Admin Forgot Step 2 */}
                                    <AnimatePresence>
                                        {isAdminForgot && adminResetStep === 2 && (
                                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                <Field label="6-digit Reset Code" type="text" maxLength={6} value={otp} onChange={e => setOtp(e.target.value)} required isOTP progress={(resetExpireTimer / 90) * 100} />
                                                <div className={styles.otpRow}>
                                                    <span style={{ fontSize: '0.78rem', color: resetExpireTimer <= 10 ? '#dc2626' : '#64748b' }}>
                                                        {resetExpireTimer > 0 ? `Expires in ${resetExpireTimer}s` : 'Code expired'}
                                                    </span>
                                                    <button type="button" className={styles.resendLink}
                                                        onClick={async () => {
                                                            if (resetResendTimer > 0) return;
                                                            try { setError(''); await axios.post(`${API_BASE_URL}/forgot-password/admin/request`, { email }); setSuccessMsg('New reset code sent!'); setResetResendTimer(60); setResetExpireTimer(90); setOtp(''); }
                                                            catch (err) { setError(err.response?.data?.message || 'Failed to resend.'); }
                                                        }}
                                                        disabled={resetResendTimer > 0}>
                                                        {resetResendTimer > 0 ? `Resend in ${resetResendTimer}s` : 'Resend Code'}
                                                    </button>
                                                </div>
                                                <Field label="New Password (min 6 chars)" type={showNewPassword ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* Forgot password link — User */}
                                    {!isSignUp && !isForgotPassword && !isAdminPortal && loginType === 'email' && !showOTP && (
                                        <div className={styles.forgotRow}>
                                            <button type="button" className={styles.forgotLink} onClick={() => { setIsForgotPassword(true); resetState(); }}>
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

                                    {/* Send OTP CTA — Required for Mobile or any Signup phase 1 */}
                                    {!isAdminPortal && (isSignUp || loginType === 'mobile') && !showOTP && (
                                        <motion.button type="button" className={styles.otpBtn}
                                            onClick={handleRequestOTP} disabled={isLoading}
                                            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                                            {isLoading ? <Spinner /> : null}
                                            {isLoading ? 'Sending...' : 'Send Verification Code'}
                                        </motion.button>
                                    )}

                                    {/* Primary CTA — Email Login or after OTP request */}
                                    {((loginType === 'email' && !isSignUp) || showOTP || isForgotPassword || isAdminPortal) && (
                                        <motion.button type="submit" className={styles.submitBtn}
                                            disabled={isLoading}
                                            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                                            <span style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                {isLoading ? <Spinner /> : null}
                                                <span>
                                                    {isLoading ? 'Processing…'
                                                        : isForgotPassword
                                                            ? (resetStep === 1 ? 'Send Reset Code' : 'Reset Password')
                                                            : isAdminPortal
                                                                ? (isAdminForgot
                                                                    ? (adminResetStep === 1 ? 'Send Reset Code' : 'Reset Password')
                                                                    : 'Authorize Access')
                                                                : isSignUp ? 'Create Account' : 'Sign In'}
                                                </span>
                                                {!isLoading && <ArrowRight size={17} />}
                                            </span>
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
                            </div>
                        </motion.div>
                    </div>
                </div>

                {/* ─── INFO SECTION ─── */}
                <section className={styles.infoSection}>
                    <motion.div
                        className={styles.infoContent}
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true, amount: 0.1 }}
                        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <motion.div
                            className={styles.infoBadge}
                            initial={{ opacity: 0, y: 15 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, amount: 0.5 }}
                            transition={{ duration: 0.6 }}
                        >
                            The Professional Standard
                        </motion.div>
                        <motion.h2
                            className={styles.infoTitle}
                            initial={{ opacity: 0, y: 15 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, amount: 0.5 }}
                            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                        >
                            Expert Intelligence at Scale.
                        </motion.h2>
                        <motion.p
                            className={styles.infoSummary}
                            initial={{ opacity: 0, y: 15 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, amount: 0.5 }}
                            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                        >
                            Aranya AI provides the specialized infrastructure required for modern animal care.
                            From individual pets to enterprise-scale herds, we ensure every life is protected.
                        </motion.p>

                        <div className={styles.infoGrid}>
                            <motion.div
                                className={styles.infoCard}
                                whileHover={{ y: -6 }}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, amount: 0.2 }}
                                transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                            >
                                <div className={styles.infoCardIcon}><HardDrive size={22} /></div>
                                <h3>Medical Vault</h3>
                                <p>A secure, encrypted archive for every lab report, prescription, and diagnostic scan. Access full health history, instantly.</p>
                            </motion.div>

                            <motion.div
                                className={styles.infoCard}
                                whileHover={{ y: -6 }}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, amount: 0.2 }}
                                transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                            >
                                <div className={styles.infoCardIcon}><Syringe size={22} /></div>
                                <h3>Arion CareCycle</h3>
                                <p>Stay ahead of outbreaks with personalized vaccination roadmaps. AI-driven schedule optimization based on age, breed, and risk factor.</p>
                            </motion.div>

                            <motion.div
                                className={styles.infoCard}
                                whileHover={{ y: -6 }}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, amount: 0.2 }}
                                transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                            >
                                <div className={styles.infoCardIcon}><Shield size={22} /></div>
                                <h3>Smart Health Guard</h3>
                                <p>Our 24/7 background monitoring system. Continuous vital analysis detects subtle physiological shifts before they manifest as illness.</p>
                            </motion.div>

                            <motion.div
                                className={styles.infoCard}
                                whileHover={{ y: -6 }}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, amount: 0.2 }}
                                transition={{ duration: 0.6, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
                            >
                                <div className={styles.infoCardIcon}><Bot size={22} /></div>
                                <h3>Chiron Mode</h3>
                                <p>Access professional-grade clinical insights from our verified animal-health knowledge base. Expert advice grounded in proven medical data.</p>
                            </motion.div>

                            <motion.div
                                className={styles.infoCard}
                                whileHover={{ y: -6 }}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, amount: 0.2 }}
                                transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                            >
                                <div className={styles.infoCardIcon}><Activity size={22} /></div>
                                <h3>Smart Meal Planner</h3>
                                <p>Feeding plans that change based on how your animal feels. We use real health data to suggest the best meals for energy, growth, and fast recovery.</p>
                            </motion.div>

                            <motion.div
                                className={styles.infoCard}
                                whileHover={{ y: -6 }}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, amount: 0.2 }}
                                transition={{ duration: 0.6, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
                            >
                                <div className={styles.infoCardIcon}><FileText size={22} /></div>
                                <h3>Rapid Health Reports</h3>
                                <p>Instantly create a full health summary when every second counts. Send detailed medical reports to your vet in one click during emergencies.</p>
                            </motion.div>
                        </div>
                    </motion.div>
                </section>

                {/* ══ MEGA FOOTER ══ */}
                <footer className={styles.megaFooter}>
                    <div className={styles.footerGrid}>
                        <motion.div
                            className={styles.footerBrandCol}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, amount: 0.1 }}
                            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                        >
                            <div className={styles.footerLogoWrap}>
                                <span className={styles.footerBrandText}>
                                    Aranya<span className={styles.brandMarkAi}>Ai</span>
                                </span>
                            </div>
                            <p className={styles.footerTagline}>
                                Caring for every animal, from farm to home.
                                Powered by our Arion Assistant and Smart Health Guard.
                            </p>
                            <div className={styles.footerSocials}>
                                <div className={styles.socialIcon}><Facebook size={18} /></div>
                                <div className={styles.socialIcon}><Twitter size={18} /></div>
                                <div className={styles.socialIcon}><Linkedin size={18} /></div>
                                <div className={styles.socialIcon}><Youtube size={18} /></div>
                                <div className={styles.socialIcon}><Github size={18} /></div>
                            </div>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, amount: 0.1 }}
                            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                        >
                            <h4 className={styles.footerColTitle}>Platform</h4>
                            <ul className={styles.footerList}>
                                <li>Animal Health Monitoring</li>
                                <li>Yield Prediction AI</li>
                                <li>Precision Breeding</li>
                                <li>IoT Device Sync</li>
                                <li>Disease Diagnostics</li>
                                <li className={styles.footerListAccent}>All Solutions <ChevronRight size={13} /></li>
                            </ul>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, amount: 0.1 }}
                            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                        >
                            <h4 className={styles.footerColTitle}>Industry</h4>
                            <ul className={styles.footerList}>
                                <li>Dairy Farming</li>
                                <li>Animal Export</li>
                                <li>Research Institutions</li>
                                <li>Government Oversight</li>
                                <li>Sustainable Agriculture</li>
                                <li className={styles.footerListAccent}>Use Cases <ChevronRight size={13} /></li>
                            </ul>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, amount: 0.1 }}
                            transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                        >
                            <h4 className={styles.footerColTitle}>Developers</h4>
                            <ul className={styles.footerList}>
                                <li>API Documentation</li>
                                <li>SDKs & Mock Data</li>
                                <li>Webhooks</li>
                                <li>Open Source</li>
                                <li>Status Page</li>
                                <li className={styles.footerListAccent}>All Docs <ChevronRight size={13} /></li>
                            </ul>
                        </motion.div>
                    </div>

                    <motion.div
                        className={styles.footerBottom}
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true, amount: 0.1 }}
                        transition={{ duration: 0.8, delay: 0.3 }}
                    >
                        <div className={styles.footerBottomLinks}>
                            <span>Privacy Policy</span>
                            <span>Terms of Service</span>
                            <span>Cookie Policy</span>
                            <span>Security</span>
                        </div>
                        <div className={styles.copyright}>
                            © 2026 Aranya AI Inc. All rights reserved.
                        </div>
                    </motion.div>
                </footer>
            </div>
        </div>
    );
}

/* ── Floating Label Field ── */
function Field({ label, type, isOTP, progress, ...props }) {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';

    return (
        <div className={styles.field}>
            <input
                className={styles.fieldInput}
                type={isPassword ? (showPassword ? 'text' : 'password') : type}
                placeholder=" "
                {...props}
            />
            <label className={styles.fieldLabel}>{label}</label>
            {isPassword && (
                <button type="button" className={styles.fieldViewBtn} onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
            )}
            {isOTP && progress > 0 && (
                <div className={styles.fieldProgressWrap}>
                    <motion.div className={styles.fieldProgress} initial={{ width: '100%' }} animate={{ width: `${progress}%` }}
                        style={{ background: progress < 30 ? '#ef4444' : progress < 60 ? '#f59e0b' : '#22c55e' }} />
                </div>
            )}
        </div>
    );
}

function Spinner() {
    return (
        <motion.span
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
            style={{ display: 'inline-block', width: 16, height: 16, border: '2.5px solid rgba(255,255,255,0.25)', borderTopColor: '#fff', borderRadius: '50%', flexShrink: 0 }}
        />
    );
}
