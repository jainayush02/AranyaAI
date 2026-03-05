import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Settings, User, LogOut, FileText, HelpCircle, MessageSquare, LayoutDashboard, ArrowLeft } from 'lucide-react';
import UserProfileMenu from './UserProfileMenu';
import ChatBot from './ChatBot';
import styles from './Layout.module.css';

export default function Layout() {
    const [role, setRole] = useState('user'); // Toggle between 'admin' and 'user'
    const [user, setUser] = useState(null);
    const [isVisible, setIsVisible] = useState(true);
    const [lastScrollY, setLastScrollY] = useState(0);
    const navigate = useNavigate();
    const location = useLocation();

    // Don't show global back button on main dashboard/portal pages
    const isHome = location.pathname === '/' || location.pathname === '/admin-portal';

    useEffect(() => {
        const handleScroll = () => {
            const currentScrollY = window.scrollY;
            if (currentScrollY > lastScrollY && currentScrollY > 80) {
                setIsVisible(false); // Scrolling down - hide
            } else {
                setIsVisible(true);  // Scrolling up - show
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
        return () => window.removeEventListener('storage', syncUser);
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
    };

    return (
        <div className={styles.layout}>
            <AnimatePresence>
                {!isHome && (
                    <motion.button
                        className={styles.globalBack}
                        onClick={() => navigate(-1)}
                        initial={{ opacity: 0, x: -20, scale: 0.8 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: -25, scale: 0.8 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 150 }}
                        whileHover={{ scale: 1.15 }}
                        whileTap={{ scale: 0.95 }}
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

                    <Link to="/" className={`${styles.logoArea} ${!isHome ? styles.hasBack : ''}`}>
                        {/* Logo handling */}
                        <img src="/logo.png" alt="AranyaAi" className={styles.logoImage} onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                        }} />
                        <span className="logo-text">
                            Aranya<span className="logo-text-ai">Ai</span>
                        </span>
                    </Link>

                    <nav className={styles.nav}>
                        <AnimatePresence mode="wait">
                            {role === 'admin' ? (
                                <motion.div
                                    key="admin-nav"
                                    initial={{ opacity: 0, x: 10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -10 }}
                                    className={styles.navGroup}
                                >
                                    <Link to="/admin-portal" className={styles.navLink}><LayoutDashboard size={18} /> Administration</Link>
                                    <Link to="/settings?tab=pricing" className={styles.navLink}><Settings size={18} /> Settings</Link>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="user-nav"
                                    initial={{ opacity: 0, x: 10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -10 }}
                                    className={styles.navGroup}
                                >
                                    <Link to="/" className={styles.navLink}><Home size={18} /> Home</Link>
                                    <Link to="/help" className={styles.navLink}><HelpCircle size={18} /> Help Center</Link>
                                    <Link to="/docs" className={styles.navLink}><FileText size={18} /> Docs</Link>
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
                {/* Pass the role and user to child components via Outlet context */}
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
