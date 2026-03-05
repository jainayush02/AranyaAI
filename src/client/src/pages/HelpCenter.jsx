import React, { useState, useEffect } from 'react';
import { Search, HelpCircle, ChevronDown, MessageCircle, BookOpen, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useOutletContext, useNavigate } from 'react-router-dom';
import axios from 'axios';
import styles from './HelpCenter.module.css';

export default function HelpCenter() {
    const { role } = useOutletContext() || { role: 'user' };
    const isAdmin = role === 'admin';
    const navigate = useNavigate();

    const [faqs, setFaqs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [openId, setOpenId] = useState(null);
    const [activeCategory, setActiveCategory] = useState('All');

    useEffect(() => {
        axios.get('/api/admin/faqs/public')
            .then(r => { setFaqs(r.data); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    const categories = ['All', ...new Set(faqs.map(f => f.category).filter(Boolean))];

    const filtered = faqs.filter(f => {
        const matchSearch = f.question.toLowerCase().includes(search.toLowerCase()) ||
            f.answer.toLowerCase().includes(search.toLowerCase());
        const matchCat = activeCategory === 'All' || f.category === activeCategory;
        return matchSearch && matchCat;
    });

    return (
        <div className={styles.page}>
            {/* Hero */}
            <div className={styles.hero}>
                <div className={styles.heroIcon}><HelpCircle size={32} color="#fff" /></div>
                <h1>Help Center</h1>
                <p>Find answers, tips, and guides for using Aranya AI</p>
                <div className={styles.searchWrap}>
                    <Search size={18} className={styles.searchIcon} />
                    <input
                        className={styles.searchInput}
                        type="text"
                        placeholder="Search questions..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className={styles.container}>
                {/* Category filter tabs */}
                {!loading && categories.length > 1 && (
                    <div className={styles.catTabs}>
                        {categories.map(cat => (
                            <button
                                key={cat}
                                className={`${styles.catTab} ${activeCategory === cat ? styles.catActive : ''}`}
                                onClick={() => setActiveCategory(cat)}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                )}

                {/* FAQ list */}
                <div className={styles.faqSection}>
                    <h2 className={styles.sectionTitle}>Frequently Asked Questions</h2>

                    {loading ? (
                        <div className={styles.loading}><Loader2 size={24} className={styles.spin} /> Loading FAQs...</div>
                    ) : filtered.length === 0 ? (
                        <div className={styles.empty}>
                            <HelpCircle size={40} color="#cbd5e1" />
                            <p>No FAQs found{search ? ` for "${search}"` : ''}.</p>
                        </div>
                    ) : (
                        <div className={styles.faqList}>
                            {filtered.map(faq => (
                                <motion.div key={faq._id} className={styles.faqItem} layout>
                                    <button
                                        className={styles.faqHeader}
                                        onClick={() => setOpenId(openId === faq._id ? null : faq._id)}
                                    >
                                        <span className={styles.faqQ}>
                                            <HelpCircle size={18} className={styles.qIcon} />
                                            {faq.question}
                                        </span>
                                        <ChevronDown
                                            size={18}
                                            className={`${styles.chevron} ${openId === faq._id ? styles.open : ''}`}
                                        />
                                    </button>
                                    <AnimatePresence>
                                        {openId === faq._id && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.2 }}
                                            >
                                                <div className={styles.faqAnswer}>{faq.answer}</div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>

                {/* CTA Cards */}
                <div className={styles.ctaGrid}>
                    <Link to="/docs" className={styles.ctaCard}>
                        <BookOpen size={26} color="#7c3aed" />
                        <div>
                            <strong>Documentation</strong>
                            <p>Step-by-step guides and video tutorials for all features</p>
                        </div>
                    </Link>
                    <div className={styles.ctaCard} style={{ cursor: 'default' }}>
                        <MessageCircle size={26} color="#2d5f3f" />
                        <div>
                            <strong>AI Assistant</strong>
                            <p>Click the chat icon (bottom-right) to ask the AI anything, anytime</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
