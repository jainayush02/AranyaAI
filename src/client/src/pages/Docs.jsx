import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { BookOpen, Video, FileText, ChevronRight, ArrowLeft, Loader2, PlayCircle, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AdvancedLoader from '../components/AdvancedLoader';
import s from './Docs.module.css';

const CAT_INFO = {
    'getting-started': {
        title: "Getting Started",
        desc: "Learn the basics of setting up Aranya AI and managing profiles.",
        icon: BookOpen,
        colorClass: 'c_purple'
    },
    'video-tutorials': {
        title: "Video Tutorials",
        desc: "Watch step-by-step videos on navigating the platform.",
        icon: Video,
        colorClass: 'c_pink'
    },
    'features': {
        title: "Features",
        desc: "Detailed guides on our AI assistant and health metrics.",
        icon: FileText,
        colorClass: 'c_green'
    }
};

export default function Docs() {
    const navigate = useNavigate();
    const [docsQuery, setDocsQuery] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState(null);
    const [activeArticle, setActiveArticle] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [feedbackGiven, setFeedbackGiven] = useState(false);

    // Fallback if useOutletContext is missing or null
    let ctxRole = 'user';
    try {
        const context = useOutletContext();
        if (context && context.role) ctxRole = context.role;
    } catch (e) { }
    const role = ctxRole;

    useEffect(() => {
        axios.get('/api/docs')
            .then(res => {
                setDocsQuery(res.data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    // ── Helper functions for views
    const handleCategoryClick = (catKey) => {
        setActiveCategory(catKey);
        setActiveArticle(null);
        setFeedbackGiven(false);
    };

    const handleBack = () => {
        if (activeArticle) {
            setActiveArticle(null);
        } else if (activeCategory) {
            setActiveCategory(null);
        } else {
            navigate(-1);
        }
    };

    const handleVideoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('video', file);
        setUploading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.post(`/api/docs/${activeArticle._id}/upload-video`, formData, {
                headers: { 'Content-Type': 'multipart/form-data', 'Authorization': `Bearer ${token}` }
            });
            setActiveArticle(res.data.doc);
        } catch (err) {
            console.error(err);
        } finally {
            setUploading(false);
        }
    };

    if (loading) return <AdvancedLoader type="docs" />;

    return (
        <div className={s.page}>


            {(activeCategory || activeArticle) && (
                <button onClick={handleBack} className={s.backBtn} style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#fff', border: '1px solid #e2e8f0', padding: '0.6rem 1.25rem', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', transition: '0.2s', color: '#475569' }}>
                    <ArrowLeft size={18} /> Back {activeArticle ? 'to Articles' : 'to Guides'}
                </button>
            )}

            <AnimatePresence mode="wait">
                {/* ── TOP LEVEL: CATEGORIES ── */}
                {!activeCategory && !activeArticle && (
                    <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div className={s.hero}>
                            <h1>Documentation</h1>
                            <p>Comprehensive guides and tutorials to help you get the most out of Aranya AI</p>
                            <div style={{ position: 'absolute', top: '-50px', right: '-50px', opacity: 0.1, transform: 'rotate(15deg)' }}>
                                <BookOpen size={300} />
                            </div>
                        </div>

                        <div className={s.docGrid}>
                            {['getting-started', 'video-tutorials', 'features'].map((catKey, i) => {
                                const info = CAT_INFO[catKey];
                                const count = docsQuery?.[catKey]?.length || 0;
                                return (
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        className={s.docCard}
                                        key={catKey}
                                        onClick={() => handleCategoryClick(catKey)}
                                    >
                                        <div className={`${s.cardIcon} ${s[info.colorClass]}`}>
                                            <info.icon size={26} />
                                        </div>
                                        <div className={s.cardContent}>
                                            <h3>{info.title}</h3>
                                            <p>{info.desc}</p>
                                        </div>
                                        <div className={s.btnWrap}>
                                            View Articles <ChevronRight size={14} />
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </motion.div>
                )}

                {/* ── SECOND LEVEL: ARTICLE LIST IN CATEGORY ── */}
                {activeCategory && !activeArticle && (
                    <motion.div key="category" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                        <div className={s.hero}>
                            <h1>{CAT_INFO[activeCategory]?.title}</h1>
                            <p>Browse all available articles inside this collection</p>
                        </div>

                        <div className={s.articleList}>
                            {(!docsQuery?.[activeCategory] || docsQuery[activeCategory].length === 0) ? (
                                <div className={s.emptyMsg}>No articles published in this category yet.</div>
                            ) : (
                                docsQuery[activeCategory].map((doc, idx) => (
                                    <motion.div
                                        key={doc._id}
                                        initial={{ opacity: 0, y: 15 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.03 }}
                                        className={s.articleRow}
                                        onClick={() => setActiveArticle(doc)}
                                    >
                                        <div className={s.articleRowIcon}>
                                            {doc.videoUrl ? <PlayCircle size={20} color="#db2777" /> : <FileText size={20} color="#3b82f6" />}
                                        </div>
                                        <div className={s.articleRowContent}>
                                            <h4>{doc.title}</h4>
                                            <span className={s.dateTag}>Updated {new Date(doc.updatedAt).toLocaleDateString()}</span>
                                        </div>
                                        <ChevronRight size={18} color="#94a3b8" />
                                    </motion.div>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}

                {/* ── THIRD LEVEL: READER ── */}
                {activeArticle && (
                    <motion.div key="article" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }}>
                        <div className={s.readerSection}>
                            <h1 className={s.readerTitle}>{activeArticle.title}</h1>

                            {activeArticle.videoUrl ? (
                                <div className={s.videoWrap}>
                                    <video
                                        controls
                                        playsInline
                                        preload="metadata"
                                        crossOrigin="anonymous"
                                        src={activeArticle.videoUrl}
                                        className={s.videoPlayer}
                                        onError={(e) => {
                                            if (activeArticle.videoUrl?.startsWith('/uploads')) {
                                                e.target.style.display = 'none';
                                                e.target.nextSibling.style.display = 'flex';
                                                // Hide the title bar if it exists
                                                const titleBar = e.target.parentElement.querySelector('#video-title-bar');
                                                if (titleBar) titleBar.style.display = 'none';
                                            }
                                        }}
                                    />
                                    <div className={s.videoErrorFallback} style={{
                                        display: 'none',
                                        padding: '5rem 2rem',
                                        textAlign: 'center',
                                        background: '#fff',
                                        borderRadius: '24px',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '2rem'
                                    }}>
                                        <div style={{ padding: '1.5rem', borderRadius: '24px', background: '#fff1f2', color: '#f43f5e' }}>
                                            <Video size={36} />
                                        </div>
                                        <div style={{ maxWidth: '400px' }}>
                                            <h3 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a', marginBottom: '0.75rem', letterSpacing: '-0.02em' }}>Tutorial requires update</h3>
                                            <p style={{ fontSize: '1.05rem', color: '#64748b', lineHeight: '1.6' }}>
                                                This tutorial was saved locally. To view it on the cloud, please re-upload the file in the portal.
                                            </p>
                                        </div>
                                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                                            {role === 'admin' && (
                                                <button
                                                    onClick={() => navigate('/admin-portal?tab=docs')}
                                                    style={{
                                                        padding: '1rem 2.5rem',
                                                        background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                                                        color: '#fff',
                                                        borderRadius: '14px',
                                                        fontWeight: 800,
                                                        fontSize: '0.95rem',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        boxShadow: '0 10px 20px rgba(15, 23, 42, 0.1)'
                                                    }}
                                                >
                                                    Update in Admin Portal
                                                </button>
                                            )}
                                            <button
                                                onClick={handleBack}
                                                style={{
                                                    padding: '1rem 2.5rem',
                                                    background: '#fff',
                                                    color: '#0f172a',
                                                    borderRadius: '14px',
                                                    fontWeight: 800,
                                                    fontSize: '0.95rem',
                                                    border: '1px solid #e2e8f0',
                                                    cursor: 'pointer',
                                                    transition: '0.2s'
                                                }}
                                            >
                                                Back to Guides
                                            </button>
                                        </div>
                                    </div>
                                    {activeArticle.videoTitle && <p className={s.videoTitle} id="video-title-bar">{activeArticle.videoTitle}</p>}
                                </div>
                            ) : (
                                role === 'admin' && (
                                    <div className={s.videoUploadBox} onClick={() => navigate('/admin-portal?tab=docs')} style={{ cursor: 'pointer' }}>
                                        <Video size={30} color="#2d5f3f" style={{ marginBottom: '1rem' }} />
                                        <p style={{ fontWeight: 600 }}>No video tutorial attached.</p>
                                        <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '-10px' }}>Click here to manage your media in the Admin Portal</p>
                                    </div>
                                )
                            )}

                            {activeArticle.content && (
                                <div className={s.readerContent} dangerouslySetInnerHTML={{ __html: activeArticle.content }}></div>
                            )}

                            {activeArticle.steps && activeArticle.steps.length > 0 && (
                                <div className={s.readerSteps}>
                                    <h3 className={s.stepTitle}>How-to Steps:</h3>
                                    <div className={s.stepCards}>
                                        {activeArticle.steps.map((step, idx) => (
                                            <div key={idx} className={s.stepCard}>
                                                <div className={s.stepNumber}>{idx + 1}</div>
                                                <div className={s.stepText}>{step}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {!activeArticle.content && (!activeArticle.steps || activeArticle.steps.length === 0) && !activeArticle.videoUrl && (
                                <div className={s.emptyMsg}>This article has no content yet.</div>
                            )}

                            <div className={s.feedbackSection}>
                                {feedbackGiven ? (
                                    <span className={s.feedbackText} style={{ color: '#10b981' }}>Thanks for your feedback! ✨</span>
                                ) : (
                                    <>
                                        <span className={s.feedbackText}>Was this helpful?</span>
                                        <button className={s.feedbackBtn} onClick={() => setFeedbackGiven(true)}>Yes 👍</button>
                                        <button className={s.feedbackBtn} onClick={() => setFeedbackGiven(true)}>No 👎</button>
                                    </>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
