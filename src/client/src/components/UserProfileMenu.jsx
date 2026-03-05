import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    User,
    Settings,
    CreditCard,
    FileText,
    HelpCircle,
    Zap,
    LogOut,
    ChevronDown
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import styles from './UserProfileMenu.module.css';

export default function UserProfileMenu({ user, onLogout }) {
    const [isOpen, setIsOpen] = useState(false);
    const [imgError, setImgError] = useState(false);
    const menuRef = useRef(null);
    const navigate = useNavigate();

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Format initials
    const name = user?.full_name || user?.email?.split('@')[0] || user?.mobile || 'User';
    const identifier = user?.email || user?.mobile || '';

    let initials = '?';
    if (user?.full_name) {
        const parts = user.full_name.split(' ');
        if (parts.length >= 2) {
            initials = `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        } else {
            initials = parts[0].substring(0, 2).toUpperCase();
        }
    } else if (user?.email) {
        initials = user.email.substring(0, 2).toUpperCase();
    } else if (user?.mobile) {
        initials = user.mobile.substring(0, 2);
    }

    const handleSignOut = () => {
        setIsOpen(false);
        if (onLogout) onLogout();
    };

    const apiBase = import.meta.env.VITE_API_URL || '';
    const profilePicSrc = user?.profilePic?.startsWith('/uploads') ? `${apiBase}${user.profilePic}` : user?.profilePic;

    return (
        <div className={styles.menuContainer} ref={menuRef}>
            <button
                className={`${styles.triggerBtn} ${isOpen ? styles.open : ''}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className={styles.avatar}>
                    {user?.profilePic && !imgError ? (
                        <img
                            src={profilePicSrc}
                            alt="User"
                            className={styles.avatarImgSmall}
                            onError={() => setImgError(true)}
                        />
                    ) : (
                        <span className={styles.userInitials}>{initials}</span>
                    )}
                </div>
                <span className={styles.triggerName}>{name}</span>
                <ChevronDown size={16} className={styles.triggerIcon} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className={styles.dropdownCard}
                    >
                        <div className={styles.dropdownHeader}>
                            <div className={`${styles.avatar} ${styles.avatarLarge}`}>
                                {user?.profilePic && !imgError ? (
                                    <img
                                        src={profilePicSrc}
                                        alt="User"
                                        className={styles.avatarImgLarge}
                                        onError={() => setImgError(true)}
                                    />
                                ) : (
                                    <span className={styles.userInitials}>{initials}</span>
                                )}
                            </div>
                            <div className={styles.headerInfo}>
                                <span className={styles.headerName}>{name}</span>
                                <span className={styles.headerEmail} title={identifier}>{identifier}</span>
                            </div>
                        </div>

                        <div className={styles.menuList}>
                            <button className={styles.menuItem} onClick={() => { setIsOpen(false); navigate('/profile'); }}>
                                <User size={18} className={styles.menuIcon} />
                                <span>Profile</span>
                            </button>
                            <button className={styles.menuItem} onClick={() => { setIsOpen(false); navigate('/settings'); }}>
                                <Settings size={18} className={styles.menuIcon} />
                                <span>Settings</span>
                            </button>
                            {user?.role !== 'admin' && (
                                <>
                                    <button className={styles.menuItem} onClick={() => { setIsOpen(false); navigate('/billing'); }}>
                                        <CreditCard size={18} className={styles.menuIcon} />
                                        <span>Billing</span>
                                    </button>
                                    <button className={styles.menuItem} onClick={() => { setIsOpen(false); navigate('/docs'); }}>
                                        <FileText size={18} className={styles.menuIcon} />
                                        <span>Documentation</span>
                                    </button>
                                    <button className={styles.menuItem} onClick={() => { setIsOpen(false); navigate('/help'); }}>
                                        <HelpCircle size={18} className={styles.menuIcon} />
                                        <span>Help Center</span>
                                    </button>
                                </>
                            )}

                            <div className={styles.divider}></div>

                            {user?.role !== 'admin' && (
                                <>
                                    <button className={`${styles.menuItem} ${styles.upgradeItem}`} onClick={() => { setIsOpen(false); navigate('/billing'); }}>
                                        <Zap size={18} className={styles.menuIcon} />
                                        <span>Upgrade Plan</span>
                                    </button>
                                    <div className={styles.divider}></div>
                                </>
                            )}

                            <button className={`${styles.menuItem} ${styles.signOutItem}`} onClick={handleSignOut}>
                                <LogOut size={18} className={styles.menuIcon} />
                                <span>Sign Out</span>
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
