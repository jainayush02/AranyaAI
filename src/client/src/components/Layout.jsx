import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Settings, User, LogOut, FileText, HelpCircle, MessageSquare, LayoutDashboard } from 'lucide-react';
import UserProfileMenu from './UserProfileMenu';
import ChatBot from './ChatBot';
import styles from './Layout.module.css';

export default function Layout() {
    const [role, setRole] = useState('user'); // Toggle between 'admin' and 'user'
    const [user, setUser] = useState(null);
    const navigate = useNavigate();

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
            <header className={styles.header}>
                <div className={`container ${styles.headerContainer}`}>

                    <Link to="/" className={styles.logoArea}>
                        {/* The user can replace this placeholder with their logo.png in the public folder */}
                        <img src="/logo.png" alt="AranyaAi" className={styles.logoImage} onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                        }} />
                        <span className="logo-text">
                            Aranya<span className="logo-text-ai">Ai</span>
                        </span>
                    </Link>

                    <nav className={styles.nav}>
                        {role === 'admin' ? (
                            <>
                                <Link to="/admin-portal" className={styles.navLink}><LayoutDashboard size={18} /> Administration</Link>
                            </>
                        ) : (
                            <>
                                <Link to="/" className={styles.navLink}><Home size={18} /> My Cattle</Link>
                                <Link to="/help" className={styles.navLink}><HelpCircle size={18} /> Help Center</Link>
                                <Link to="/docs" className={styles.navLink}><FileText size={18} /> Docs</Link>
                            </>
                        )}
                    </nav>

                    <div className={styles.actions}>
                        <UserProfileMenu user={user} onLogout={handleLogout} />
                    </div>
                </div>
            </header>

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
