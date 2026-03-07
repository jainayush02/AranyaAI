import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Settings, FileText, HelpCircle, LayoutDashboard, ArrowLeft } from 'lucide-react';
import UserProfileMenu from './UserProfileMenu';
import ChatBot from './ChatBot';
import styles from './Layout.module.css';

export default function Layout() {
    const [role, setRole] = useState('user');
    const [user, setUser] = useState(null);
    const [isVisible, setIsVisible] = useState(true);
    const [lastScrollY, setLastScrollY] = useState(0);
    const navigate = useNavigate();
    const location = useLocation();

    // Home page detection
    // Home page detection: Only hide back button on landing / and basic /admin-portal page
    const isHome = location.pathname === '/' || (location.pathname === '/admin-portal' && !location.search);
    const isUserHome = location.pathname === '/';
    const isOverviewTab = location.pathname === '/admin-portal' && !location.search;
    const isDocsPage = location.pathname === '/docs';

    useEffect(() => {
        const handleScroll = () => {
            const currentScrollY = window.scrollY;
            if (currentScrollY > lastScrollY && currentScrollY > 80) {
                setIsVisible(false);
            } else {
                setIsVisible(true);
            }
            setLastScrollY(currentScrollY);
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [lastScrollY]);

    useEffect(() => {
        const syncUser = () => {
            const storedUser = localStorage.getItem('user');
            if (storedUser) {
                try {
                    const parsedUser = JSON.parse(storedUser);
                    setUser(parsedUser);
                    if (parsedUser.role) setRole(parsedUser.role);
                } catch (e) {
                    console.error(e);
                }
            }
        };

        syncUser();
        window.addEventListener('storage', syncUser);
        window.addEventListener('userUpdated', syncUser);
        return () => {
            window.removeEventListener('storage', syncUser);
            window.removeEventListener('userUpdated', syncUser);
        };
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
    };

    // Nav items for user portal
    const userNavItems = [
        { to: '/', label: 'Home', icon: Home, hideOnHome: true },
        { to: '/help', label: 'Help Center', icon: HelpCircle },
        { to: '/docs', label: 'Docs', icon: FileText },
    ];

    // Nav items for admin portal
    const adminNavItems = [
        { to: '/admin-portal', label: 'Administration', icon: LayoutDashboard, alwaysShow: true },
        { to: '/settings?tab=pricing', label: 'Settings', icon: Settings, alwaysShow: true },
    ];

    return (
        <div className={styles.layout}>
            <AnimatePresence>
                {!isHome && (
                    <motion.button
                        className={styles.globalBack}
                        onClick={() => navigate(-1)}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        whileHover={{ scale: 1.15 }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ type: 'spring', damping: 15, stiffness: 300 }}
                        title="Go Back"
                    >
                        <ArrowLeft size={18} />
                    </motion.button>
                )}
            </AnimatePresence>

            <motion.header
                className={styles.header}
                initial={{ y: 0 }}
                animate={{ y: isVisible ? 0 : -100 }}
                transition={{ duration: 0.35, ease: 'easeInOut' }}
            >
                <div className={`container ${styles.headerContainer}`}>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>

                        <Link to={role === 'admin' ? '/admin-portal' : '/'} className={styles.logoArea}>
                            <img src="/logo.png" alt="AranyaAi" className={styles.logoImage} onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'flex';
                            }} />
                            <span className="logo-text">
                                Aranya<span className="logo-text-ai">Ai</span>
                            </span>
                        </Link>
                    </div>

                    <nav className={styles.nav}>
                        <AnimatePresence mode="wait">
                            {role === 'admin' ? (
                                <motion.div
                                    key="admin-nav"
                                    initial={{ opacity: 0, y: -8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 8 }}
                                    className={styles.navGroup}
                                >
                                    {adminNavItems.map(({ to, label, icon: Icon }) => {
                                        const isActive = location.pathname + location.search === to ||
                                            (to === '/admin-portal' && isOverviewTab);
                                        return (
                                            <Link
                                                key={to}
                                                to={to}
                                                className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
                                            >
                                                {isActive && (
                                                    <motion.span
                                                        className={styles.navPill}
                                                        layoutId="admin-nav-pill"
                                                        transition={{ type: 'spring', damping: 22, stiffness: 280 }}
                                                    />
                                                )}
                                                <Icon size={16} />
                                                <span>{label}</span>
                                            </Link>
                                        );
                                    })}
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="user-nav"
                                    initial={{ opacity: 0, y: -8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 8 }}
                                    className={styles.navGroup}
                                >
                                    {userNavItems.map(({ to, label, icon: Icon, hideOnHome }) => {
                                        // Hide Home button on the home page
                                        if (hideOnHome && isUserHome) return null;
                                        const isActive = location.pathname === to;
                                        return (
                                            <AnimatePresence key={to}>
                                                <motion.div
                                                    initial={{ opacity: 0, x: -10, scale: 0.9 }}
                                                    animate={{ opacity: 1, x: 0, scale: 1 }}
                                                    exit={{ opacity: 0, x: -10, scale: 0.9 }}
                                                    transition={{ type: 'spring', damping: 20, stiffness: 200 }}
                                                >
                                                    <Link
                                                        to={to}
                                                        className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
                                                    >
                                                        {isActive && (
                                                            <motion.span
                                                                className={styles.navPill}
                                                                layoutId="user-nav-pill"
                                                                transition={{ type: 'spring', damping: 22, stiffness: 280 }}
                                                            />
                                                        )}
                                                        <Icon size={16} />
                                                        <span>{label}</span>
                                                    </Link>
                                                </motion.div>
                                            </AnimatePresence>
                                        );
                                    })}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </nav>

                    <div className={styles.actions}>
                        <UserProfileMenu user={user} onLogout={handleLogout} />
                    </div>
                </div>
            </motion.header>

            <motion.main
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4 }}
                className={styles.main}
            >
                <Outlet context={{ role, user }} />
            </motion.main>

            {/* Global AI Chatbot - Disabled for Admin */}
            {role !== 'admin' && <ChatBot />}

            <footer className={styles.footer}>
                <div className="container">
                    <p className={styles.copyright}>© 2026 Aranya AI. All Rights Reserved</p>
                </div>
            </footer>
        </div >
    );
}
