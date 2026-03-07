import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { BookOpen, Video, FileText, ChevronRight, ArrowLeft, Loader2, PlayCircle, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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

    if (loading) {
        return (
            <div className={s.page}>
                <div className={s.hero}>
                    <h1>Documentation</h1>
                    <p>Fetching the latest guides and tutorials...</p>
                </div>
                <div className={s.skeletonGrid}>
                    {[1, 2, 3].map(i => <div key={i} className={s.skeletonCard} />)}
                </div>
            </div>
        );
    }

    return (
        <div className={s.page}>


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
                                    <video controls src={activeArticle.videoUrl} className={s.videoPlayer} />
                                    {activeArticle.videoTitle && <p className={s.videoTitle}>{activeArticle.videoTitle}</p>}
                                </div>
                            ) : (
                                role === 'admin' && (
                                    <div className={s.videoUploadBox}>
                                        <Video size={30} color="#475569" style={{ marginBottom: '1rem' }} />
                                        <p>No video attached. Upload a tutorial video:</p>
                                        <label className={s.uploadBtn}>
                                            {uploading ? <Loader2 className={s.spin} size={16} /> : <Upload size={16} />}
                                            Upload Video
                                            <input type="file" accept="video/*" hidden onChange={handleVideoUpload} />
                                        </label>
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
