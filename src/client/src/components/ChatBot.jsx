import React, { useState, useRef, useEffect } from 'react';
import {
    MessageSquare, X, Send, Bot, Mic,
    Image as ImageIcon,
    Plus, History, Trash2, Edit3,
    Check, ChevronRight, ChevronLeft, Copy,
    CheckSquare, Square, StopCircle, Sparkles, CornerDownRight,
    MoreVertical, Search, Pin, Smile, ThumbsUp, 
    Globe, ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import ConfirmDialog from './ConfirmDialog';
import styles from './ChatBot.module.css';
import { Paperclip, FileText, ChevronDown, Menu } from 'lucide-react'; // Added Paperclip and FileText
import { useToast } from '../components/ToastProvider';

const AILogo = ({ size = 24, className }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${className || ''} ${styles.aiLogoAnimation}`}
    >
        <path
            d="M12 2L12.949 9.051L20 10L12.949 10.949L12 18L11.051 10.949L4 10L11.051 9.051L12 2Z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
        />
        <path
            d="M18.5 16L18.8163 18.1837L21 18.5L18.8163 18.8163L18.5 21L18.1837 18.8163L16 18.5L18.1837 18.1837L18.5 16Z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinejoin="round"
        />
        <path
            d="M5.5 17L5.65817 18.0918L6.75 18.25L5.65817 18.4082L5.5 19.5L5.34183 18.4082L4.25 18.25L5.34183 18.0918L5.5 17Z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinejoin="round"
        />
    </svg>
);


const parseMessage = (content, isStreaming = false) => {
    if (typeof content !== 'string') return { cleanContent: '' };
    
    let clean = content.replace(/<aranya-attachment name="([^"]+)">[\s\S]*?<\/aranya-attachment>/g, '📎 **$1**\n\n');

    clean = clean
        .replace(/\[SEARCH_NEEDED:[\s\S]*?\]/gi, '') 
        .replace(/\[SEARCH_NEEDED:[\s\S]*$/gi, '')  
        .replace(/\[SEARCH_NEEDED:?$/gi, '');       
    if (isStreaming) {
        
        const boldCount = (clean.match(/\*\*/g) || []).length;
        if (boldCount % 2 !== 0) {
            clean += clean.endsWith('*') && !clean.endsWith('**') ? '*' : '**';
        }
        const codeBlockCount = (clean.match(/```/g) || []).length;
        if (codeBlockCount % 2 !== 0) {
            if (clean.endsWith('``') && !clean.endsWith('```')) clean += '\n`';
            else if (clean.endsWith('`') && !clean.endsWith('``')) clean += '\n``';
            else clean += '\n```';
        }
        const inlineCodeCount = (clean.replace(/```/g, '').match(/`/g) || []).length;
        if (inlineCodeCount % 2 !== 0) {
            clean += '`';
        }
    }

    return { cleanContent: clean.trim() };
};

const SourceBadges = ({ sources }) => {
    const [open, setOpen] = React.useState(false);
    if (!sources || sources.length === 0) return null;

    const uniqueSources = [];
    const seenDomains = new Set();
    for (const s of sources) {
        if (uniqueSources.length < 3 && !seenDomains.has(s.domain)) {
            uniqueSources.push(s);
            seenDomains.add(s.domain);
        }
    }

    return (
        <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)',
                    borderRadius: '20px', padding: '4px 10px 4px 6px',
                    cursor: 'pointer', transition: '0.15s',
                    boxShadow: open ? '0 2px 8px rgba(0,0,0,0.10)' : 'none'
                }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(0,0,0,0.07)'}
                onMouseOut={e => e.currentTarget.style.background = open ? 'rgba(0,0,0,0.07)' : 'rgba(0,0,0,0.04)'}
            >
                {/* Stacked favicons */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    {uniqueSources.map((s, i) => (
                        <div
                            key={i}
                            title={s.domain}
                            style={{
                                width: '20px', height: '20px', borderRadius: '50%',
                                background: '#fff', border: '1.5px solid rgba(255,255,255,0.9)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                overflow: 'hidden',
                                marginLeft: i > 0 ? '-7px' : '0',
                                zIndex: 10 - i,
                                position: 'relative',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.15)'
                            }}
                        >
                            <img
                                src={`https://www.google.com/s2/favicons?domain=${s.domain}&sz=32`}
                                alt={s.domain}
                                style={{ width: '13px', height: '13px', objectFit: 'contain' }}
                                onError={e => { e.target.style.display = 'none'; }}
                            />
                        </div>
                    ))}
                </div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', userSelect: 'none' }}>
                    Sources
                </span>
            </button>

            {/* Dropdown panel with clickable links */}
            {open && (
                <div style={{
                    position: 'absolute', bottom: 'calc(100% + 8px)', left: 0,
                    background: '#fff', borderRadius: '14px',
                    border: '1px solid rgba(0,0,0,0.09)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    minWidth: '240px', maxWidth: '320px',
                    padding: '0.5rem', zIndex: 100,
                    animation: 'fadeInUp 0.15s ease'
                }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', padding: '0.25rem 0.5rem 0.5rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        Web Sources
                    </div>
                    {uniqueSources.map((s, i) => (
                        <a
                            key={i}
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                padding: '0.45rem 0.5rem', borderRadius: '10px',
                                textDecoration: 'none', color: '#1e293b',
                                transition: '0.15s'
                            }}
                            onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                        >
                            <div style={{
                                width: '24px', height: '24px', borderRadius: '6px',
                                background: '#f1f5f9', display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0
                            }}>
                                <img
                                    src={`https://www.google.com/s2/favicons?domain=${s.domain}&sz=32`}
                                    alt={s.domain}
                                    style={{ width: '14px', height: '14px', objectFit: 'contain' }}
                                    onError={e => { e.target.style.display = 'none'; }}
                                />
                            </div>
                            <div style={{ overflow: 'hidden' }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {s.title || s.domain}
                                </div>
                                <div style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 500 }}>
                                    {s.domain}
                                </div>
                            </div>
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
};

const ChironSourcesPanel = ({ sources }) => {
    if (!sources || sources.length === 0) return null;

    const seen = new Set();
    const unique = sources.filter(s => {
        const key = s.title || s.source;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    const getFileIcon = (fileType, fileName = '') => {
        const lowerName = fileName.toLowerCase();
        if (fileType === 'pdf' || lowerName.endsWith('.pdf')) return <FileText size={14} color="#ef4444" />;
        if (fileType === 'docx' || fileType === 'doc' || lowerName.endsWith('.doc') || lowerName.endsWith('.docx')) return <FileText size={14} color="#2563eb" />;
        if (fileType === 'url' || lowerName.startsWith('http')) return <Globe size={14} color="#10b981" />;
        return <FileText size={14} color="#94a3b8" />;
    };

    const handleClick = async (src) => {
        const label = src.title || src.source || '';
        const lowerLabel = label.toLowerCase();
        const isUrl = src.file_type === 'url' || !!src.source_url ||
            (!src.file_type && (lowerLabel.startsWith('http') || lowerLabel.startsWith('www')));
        const isPdf = src.file_type === 'pdf' || lowerLabel.endsWith('.pdf');
        const isWord = src.file_type === 'docx' || src.file_type === 'doc' ||
            lowerLabel.endsWith('.docx') || lowerLabel.endsWith('.doc');
        const isTxt = src.file_type === 'txt' || lowerLabel.endsWith('.txt');

        
        if (isUrl) {
            const url = src.source_url || (lowerLabel.startsWith('http') ? label : `https://${label}`);
            window.open(url, '_blank', 'noopener,noreferrer');
            return;
        }

       
        if (isPdf || isWord || isTxt) {
            const token = localStorage.getItem('token');
            const docId = src.document_id || null;

            try {
                let downloadRes;
                if (docId) {
                   
                    downloadRes = await fetch(`/api/chiron/file/${docId}?dl=1&token=${encodeURIComponent(token)}`);
                } else {
                    
                    const rawName = label.replace(/^.*[\\/]/, '').trim();
                    downloadRes = await fetch(`/api/chiron/download?name=${encodeURIComponent(rawName)}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                }

                if (!downloadRes.ok) {
                    const errJson = await downloadRes.json().catch(() => ({}));
                    throw new Error(errJson.msg || `Server error ${downloadRes.status}`);
                }

                const blob = await downloadRes.blob();
                const ext = isPdf ? 'pdf' : isWord ? (lowerLabel.endsWith('.doc') ? 'doc' : 'docx') : 'txt';
                const rawName = label.replace(/^.*[\\/]/, '').trim();
                const filename = lowerLabel.endsWith(`.${ext}`) ? rawName : `${rawName}.${ext}`;

                // Trigger browser download
                const dlUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = dlUrl;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setTimeout(() => URL.revokeObjectURL(dlUrl), 15000);

            } catch (err) {
                console.error('[Chiron Source Error]', err);
                alert(`Could not open file: ${err.message}`);
            }
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
            {unique.map((src, idx) => {
                const label = src.title || src.source || 'Evidence Document';
                const lowerLabel = label.toLowerCase();
                const isPdf = src.file_type === 'pdf' || lowerLabel.endsWith('.pdf');
                const isWord = src.file_type === 'doc' || src.file_type === 'docx' || lowerLabel.endsWith('.doc') || lowerLabel.endsWith('.docx');
                const isUrl = src.file_type === 'url' || !!src.source_url || (!isPdf && !isWord && (lowerLabel.startsWith('http') || lowerLabel.startsWith('www')));

                const typeLabel = isPdf ? 'PDF Ref' : isWord ? 'Doc Ref' : isUrl ? 'URL Ref' : 'Grounding Source';

                return (
                    <div
                        key={idx}
                        onClick={() => handleClick(src)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px 12px',
                            background: '#f8fafc',
                            borderRadius: '10px',
                            border: '1px solid #e2e8f0',
                            maxWidth: 'max-content',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.01)',
                            cursor: (isPdf || isWord || isUrl) ? 'pointer' : 'default',
                        }}
                    >
                        <div style={{
                            width: '24px', height: '24px', background: '#fff',
                            borderRadius: '6px', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', flexShrink: 0,
                            border: '1px solid #f1f5f9'
                        }}>
                            {getFileIcon(src.file_type, label)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                                fontSize: '0.72rem', fontWeight: 700, color: isUrl ? '#10b981' : '#1e293b',
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                textDecoration: isUrl ? 'underline' : 'none',
                            }}>
                                {label}
                            </div>
                            <div style={{ fontSize: '0.62rem', color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ color: isPdf ? '#ef4444' : isWord ? '#2563eb' : isUrl ? '#10b981' : '#64748b' }}>{typeLabel}</span>
                                <span>•</span>
                                <span>Grounding Source</span>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

const ThinkingPanel = React.memo(({ steps, reasoningText, isThinking, isGenerating, thinkingDuration }) => {
    const [isExpanded, setIsExpanded] = React.useState(true);
    const durationText = thinkingDuration ? `${(thinkingDuration / 1000).toFixed(1)}s` : null;

  
    React.useEffect(() => {
        if (!isThinking && !isGenerating && steps.length > 0) {
            const timer = setTimeout(() => setIsExpanded(false), 1500);
            return () => clearTimeout(timer);
        }
    }, [isThinking, isGenerating, steps.length]);

    if (!steps || steps.length === 0) return null;

    const getHeaderText = () => {
        if (isThinking) return 'Thinking...';
        if (isGenerating) return 'Writing...';
        return durationText ? `Thought for ${durationText}` : 'Thought';
    };

    return (
        <div className={styles.thinkingWrapper}>
            <AnimatePresence mode="wait">
                {!isExpanded ? (
                    <motion.button
                        key="badge"
                        onClick={() => setIsExpanded(true)}
                        className={styles.thinkingBadge}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                    >
                        {getHeaderText()}
                        <ChevronRight size={12} />
                    </motion.button>
                ) : (
                    <motion.div
                        key="panel"
                        className={styles.thinkingTimeline}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                    >
                        <button
                            className={styles.thinkingTimelineHeader}
                            onClick={() => !isThinking && !isGenerating && setIsExpanded(false)}
                        >
                            {isThinking || isGenerating ? (
                                <div className={styles.thinkingPulse} />
                            ) : (
                                <div className={styles.timelineDotDone} />
                            )}
                            <span className={styles.thinkingTimelineTitle}>{getHeaderText()}</span>
                            {(!isThinking && !isGenerating) && <ChevronDown size={13} style={{ color: '#94a3b8', marginLeft: 'auto' }} />}
                        </button>
                        <div className={styles.timelineBody}>
                            {reasoningText && (
                                <div className={styles.reasoningContentBlock}>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{reasoningText}</ReactMarkdown>
                                </div>
                            )}
                            {steps && steps.map((step, idx) => {
                                const isLast = idx === steps.length - 1;
                                const isCurrent = isLast && isThinking;
                                return (
                                    <div key={idx} className={styles.timelineStep}>
                                        <div className={styles.timelineTrack}>
                                            <div className={`${styles.timelineDot} ${isCurrent ? styles.timelineDotActive : ''}`} />
                                            {!isLast && <div className={styles.timelineLine} />}
                                        </div>
                                        <span className={`${styles.timelineStepText} ${isCurrent ? styles.timelineStepTextActive : ''}`}>{step}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
});


const IntelligenceBadge = ({ type, mode }) => {

    if (!type || type === 'arion') return null;

    const config = {
        web: { label: 'Web Enhanced', color: '#10b981', icon: <Globe size={11} /> }
    };
    const conf = config[type];
    if (!conf) return null;

    return (
        <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            background: `${conf.color}10`, color: conf.color,
            padding: '2px 8px', borderRadius: '12px',
            fontSize: '0.65rem', fontWeight: 600,
            border: `1px solid ${conf.color}30`,
            textTransform: 'uppercase', letterSpacing: '0.02em',
            marginTop: '8px', marginBottom: '4px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
        }}>
            {conf.icon} {conf.label}
        </div>
    );
};

export default function ChatBot() {
    const { showToast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
    const isMobile = windowWidth <= 992;

    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const [conversations, setConversations] = useState([]);

    const [activeChatId, setActiveChatId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [selectedImages, setSelectedImages] = useState([]);
    const [imagePreviews, setImagePreviews] = useState([]);
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editTitle, setEditTitle] = useState('');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isMobileHistoryOpen, setIsMobileHistoryOpen] = useState(false);
    const [selectedChatIds, setSelectedChatIds] = useState([]);
    const [menuOpenId, setMenuOpenId] = useState(null);
    const [chatMode, setChatMode] = useState('search');
    const [isModeSelectorOpen, setIsModeSelectorOpen] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    
    useEffect(() => {
        if (messages.length > 0 || activeChatId) {
            setActiveChatId(null);
            setMessages([]);
            console.log(`[Aranya_AI] Mode switched to "${chatMode}", starting new conversation.`);
        }
    }, [chatMode]);

    const recognitionRef = useRef(null);
    const silenceTimeoutRef = useRef(null);

    const [isGlobalSearch, setIsGlobalSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);

  
    const [activeReactionId, setActiveReactionId] = useState(null);

    const documentInputRef = useRef(null);
    const cameraInputRef = useRef(null);
    const [isExtractingText, setIsExtractingText] = useState(false);
    const [fileAttachments, setFileAttachments] = useState([]);
    const [isInputMenuOpen, setIsInputMenuOpen] = useState(false);

    useEffect(() => {
        const handleClickOutside = (e) => {
            setMenuOpenId(null);
            if (isInputMenuOpen && !e.target.closest(`.${styles.inputMenuContainer}`)) {
                setIsInputMenuOpen(false);
            }
            if (isModeSelectorOpen && !e.target.closest(`.${styles.modeSelectorContainer}`)) {
                setIsModeSelectorOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [menuOpenId, isInputMenuOpen, isModeSelectorOpen]);
    const [confirmConfig, setConfirmConfig] = useState({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => { },
        type: 'danger'
    });

    const [copiedId, setCopiedId] = useState(null);

    const handleVoiceRecord = () => {
        if (isRecording) {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
            if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
            setIsRecording(false);
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            showToast('Your browser does not support Speech Recognition.', 'error');
            return;
        }

        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        const stopRecording = () => {
            if (recognitionRef.current) recognitionRef.current.stop();
            setIsRecording(false);
        };

        recognition.onstart = () => {
            setIsRecording(true);
            if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = setTimeout(stopRecording, 4000);
        };

        recognition.onspeechstart = () => {
            if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            setInput((prev) => prev ? prev + ' ' + transcript : transcript);
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            if (event.error === 'no-speech') {
                stopRecording();
            } else {
                setIsRecording(false);
            }
        };

        recognition.onend = () => {
            setIsRecording(false);
            if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
        };

        recognition.start();
    };
    const [headerVisible, setHeaderVisible] = useState(true);
    const isAtBottomRef = useRef(true);
    const lastChatScrollRef = useRef(0);

    const handleChatScroll = (e) => {
        const { scrollTop, scrollHeight, clientHeight } = e.target;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
        isAtBottomRef.current = isNearBottom;

        if (scrollTop > lastChatScrollRef.current && scrollTop > 50) {
            setHeaderVisible(false);
        } else {
            setHeaderVisible(true);
        }
        lastChatScrollRef.current = scrollTop;
    };

    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const chatContainerRef = useRef(null);
    const abortControllerRef = useRef(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [feedback, setFeedback] = useState({});
    const [activeSourcesId, setActiveSourcesId] = useState(null);

    const scrollToBottom = (force = false) => {
        if (!chatContainerRef.current) return;
        if (isAtBottomRef.current || force) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    };

    const isSendingRef = useRef(false);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            fetchConversations();
            setActiveChatId(null);
            setMessages([]);
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    useEffect(() => {
        if (activeChatId && !isSendingRef.current) {
            fetchMessages(activeChatId).then(() => {
                setTimeout(() => scrollToBottom(true), 150);
            });
        }
    }, [activeChatId]);

    useEffect(() => {
        if (isGenerating) return;
        const timeoutId = setTimeout(() => {
            scrollToBottom();
        }, 100);
        return () => clearTimeout(timeoutId);
    }, [messages, isTyping, isGenerating]);

    const fetchConversations = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get('/api/chat/conversations', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setConversations(res.data);
        } catch (err) {
            console.error('Failed to fetch conversations', err);
        }
    };

    const fetchMessages = async (chatId) => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`/api/chat/conversations/${chatId}/messages`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setMessages(res.data);
        } catch (err) {
            console.error('Failed to fetch messages', err);
        }
    };

    const handleGlobalSearch = async (query) => {
        setSearchQuery(query);
        if (query.trim().length < 2) {
            setSearchResults([]);
            return;
        }
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`/api/chat/search?q=${encodeURIComponent(query)}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSearchResults(res.data);
        } catch (err) {
            console.error('Search failed', err);
        }
    };


    const handleTogglePin = async (msgId) => {
        try {
            const token = localStorage.getItem('token');
            await axios.put(`/api/chat/messages/${msgId}/pin`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setMessages(prev => prev.map(m =>
                m._id === msgId ? { ...m, isPinned: !m.isPinned } : m
            ));
        } catch (err) {
            console.error('Pin toggle failed', err);
        }
    };

    const handleToggleReaction = async (msgId, emoji) => {
        try {
            const token = localStorage.getItem('token');
            await axios.put(`/api/chat/messages/${msgId}/react`, { emoji }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setActiveReactionId(null);
            fetchMessages(activeChatId); 
        } catch (err) {
            console.error('Reaction toggle failed', err);
        }
    };

    const handleNewChat = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.post('/api/chat/conversations', {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setConversations([res.data, ...conversations]);
            setActiveChatId(res.data._id);
            return res.data._id;
        } catch (err) {
            console.error('Failed to create new chat', err);
            return null;
        }
    };

    const handleImageSelect = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;


        const remainingSlots = 4 - imagePreviews.length;
        const filesToProcess = files.slice(0, remainingSlots);

        if (files.length > remainingSlots) {
            showToast(`You can only upload up to 4 images. Added ${remainingSlots} images.`, 'warning');
        }

        setIsUploadingImage(true);

        const processFile = (file) => {
            return new Promise((resolve) => {
                if (!file.type.startsWith('image/')) {
                    resolve(null);
                    return;
                }

                const reader = new FileReader();
                reader.onloadend = () => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        let width = img.width;
                        let height = img.height;
                        const MAX_SIZE = 600; // Efficient size for multi-image

                        if (width > height) {
                            if (width > MAX_SIZE) {
                                height *= MAX_SIZE / width;
                                width = MAX_SIZE;
                            }
                        } else {
                            if (height > MAX_SIZE) {
                                width *= MAX_SIZE / height;
                                height = MAX_SIZE;
                            }
                        }

                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);

                        const optimizedBase64 = canvas.toDataURL('image/jpeg', 0.7);
                        resolve({ base64: optimizedBase64, file });
                    };
                    img.src = reader.result;
                };
                reader.readAsDataURL(file);
            });
        };

        try {
            const results = await Promise.all(filesToProcess.map(processFile));
            const validResults = results.filter(r => r !== null);

            setImagePreviews(prev => [...prev, ...validResults.map(r => r.base64)]);
            setSelectedImages(prev => [...prev, ...validResults.map(r => r.file)]);
        } catch (err) {
            console.error('Image processing failed', err);
        } finally {
            setIsUploadingImage(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            if (cameraInputRef.current) cameraInputRef.current.value = '';
        }
    };

    const handleDocumentSelect = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        setIsExtractingText(true);
        setIsUploadingImage(true);
        setIsInputMenuOpen(false);

        for (const file of files) {
            try {
                let extractedText = '';
                if (file.type === 'application/pdf') {
                    if (!window.pdfjsLib) {
                        await new Promise((resolve, reject) => {
                            const script = document.createElement('script');
                            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
                            script.onload = resolve;
                            script.onerror = reject;
                            document.head.appendChild(script);
                        });
                        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
                    }

                    const arrayBuffer = await file.arrayBuffer();
                    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        extractedText += textContent.items.map(item => item.str).join(' ') + '\n';
                    }
                } else {
                    extractedText = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (e) => resolve(e.target.result);
                        reader.onerror = reject;
                        reader.readAsText(file);
                    });
                }

                if (extractedText) {
                    setFileAttachments(prev => [...prev, {
                        id: Date.now() + Math.random(),
                        name: file.name,
                        text: extractedText
                    }]);
                }
            } catch (err) {
                console.error(`Failed to parse file ${file.name}:`, err);
                showToast(`Failed to parse ${file.name}. Ensure it is a valid text or PDF file.`, 'error');
            }
        }

        setIsExtractingText(false);
        setIsUploadingImage(false);
        if (documentInputRef.current) documentInputRef.current.value = '';
    };

    const removeImage = (index) => {
        setImagePreviews(prev => prev.filter((_, i) => i !== index));
        setSelectedImages(prev => prev.filter((_, i) => i !== index));
    };

    const handleDeleteChat = async (e, id) => {
        e.stopPropagation();

        setConfirmConfig({
            isOpen: true,
            title: 'Delete Chat',
            message: 'Are you sure you want to delete this chat history? This action cannot be undone.',
            type: 'danger',
            onConfirm: async () => {
                try {
                    const token = localStorage.getItem('token');
                    await axios.delete(`/api/chat/conversations/${id}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    setConversations(conversations.filter(c => c._id !== id));
                    if (activeChatId === id) {
                        setActiveChatId(null);
                    }
                } catch (err) {
                    console.error('Delete failed', err);
                }
            }
        });
    };

    const startRename = (e, chat) => {
        e.stopPropagation();
        setEditingId(chat._id);
        setEditTitle(chat.title);
    };

    const handleRename = async (id) => {
        try {
            const token = localStorage.getItem('token');
            await axios.put(`/api/chat/conversations/${id}`, { title: editTitle }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setConversations(conversations.map(c => c._id === id ? { ...c, title: editTitle } : c));
            setEditingId(null);
        } catch (err) {
            console.error('Rename failed', err);
        }
    };

    const handleDeleteMessage = (index) => {
        setMessages(prev => prev.filter((_, i) => i !== index));
    };

    const handleFeedback = (id, type) => {
        setFeedback(prev => ({ ...prev, [id]: prev[id] === type ? null : type }));
    };

    const handleExport = (content) => {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'arion_response.txt';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleRegenerate = (index) => {
        if (isGenerating) return;
        let prevUserMsg = 'Can you provide more details?';
        for (let j = index - 1; j >= 0; j--) {
            if (messages[j].role === 'user') {
                prevUserMsg = messages[j].content;
                break;
            }
        }
        handleSend(prevUserMsg);
    };

    const handleCopy = (content, id) => {
        navigator.clipboard.writeText(content);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleDownloadPDF = (content, title = 'Arion-Report') => {
        const doc = new jsPDF();
        const sanitize = (text) => {
            if (!text) return '';
            return text
                .replace(/<br\s*\/?>/gi, '\n') 
                .replace(/[\u200B-\u200D\uFEFF]/g, '') 
                .replace(/[^\x00-\x7F]/g, '') 
                .replace(/\*|_|`|~|#|\[|\]/g, '')
                .replace(/\s+/g, ' ') 
                .trim();
        };

        const lines = content.split('\n');
        let tables = [];
        let currentTable = null;

        lines.forEach(line => {
            if (line.includes('|') && line.includes('---')) return;
            if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
                const cells = line.split('|').map(c => sanitize(c)).filter(c => c !== '');
                if (cells.length > 0) {
                    if (!currentTable) {
                        currentTable = [cells];
                    } else {
                        currentTable.push(cells);
                    }
                }
            } else if (currentTable) {
                tables.push(currentTable);
                currentTable = null;
            }
        });
        if (currentTable) tables.push(currentTable);

        if (tables.length === 0) {
            showToast('No table found to export.', 'info');
            return;
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(22);
        doc.setTextColor(26, 74, 56);
        doc.text('Arion Health Assistant Report', 14, 22);

        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text(`Official Medical Schedule | ${new Date().toLocaleDateString()}`, 14, 30);
        doc.setDrawColor(226, 232, 240);
        doc.line(14, 34, 196, 34);

        tables.forEach((table, i) => {
            const head = [table[0]];
            const body = table.slice(1);

            autoTable(doc, {
                head: head,
                body: body,
                startY: doc.lastAutoTable ? doc.lastAutoTable.finalY + 15 : 40,
                theme: 'striped',
                styles: {
                    font: 'helvetica',
                    fontSize: 9,
                    cellPadding: 6,
                    textColor: [51, 65, 85],
                    overflow: 'linebreak'
                },
                headStyles: {
                    fillColor: [45, 95, 63],
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    fontSize: 10
                },
                alternateRowStyles: { fillColor: [248, 250, 248] },
                margin: { left: 14, right: 14 }
            });
        });

        doc.save(`${title.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`);
        showToast('Official PDF Report generated!', 'success');
    };

    const toggleSelectChat = (e, id) => {
        e.stopPropagation();
        setSelectedChatIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleSelectAll = (e) => {
        e.stopPropagation();
        if (selectedChatIds.length === conversations.length && conversations.length > 0) {
            setSelectedChatIds([]);
        } else {
            setSelectedChatIds(conversations.map(c => c._id));
        }
    };

    const handleDeleteSelected = () => {
        if (selectedChatIds.length === 0) return;

        setConfirmConfig({
            isOpen: true,
            title: 'Delete Selected Chats',
            message: `Are you sure you want to delete ${selectedChatIds.length} selected chats? This action cannot be undone.`,
            type: 'danger',
            onConfirm: async () => {
                try {
                    const token = localStorage.getItem('token');
                    await Promise.all(selectedChatIds.map(id =>
                        axios.delete(`/api/chat/conversations/${id}`, {
                            headers: { Authorization: `Bearer ${token}` }
                        })
                    ));
                    setConversations(conversations.filter(c => !selectedChatIds.includes(c._id)));
                    if (selectedChatIds.includes(activeChatId)) {
                        setActiveChatId(null);
                    }
                    setSelectedChatIds([]);
                } catch (err) {
                    console.error('Bulk delete failed', err);
                }
            }
        });
    };

    const handleSend = async (query = null) => {
        const messageText = query || input;

        let finalContent = messageText;
        if (fileAttachments.length > 0) {
            const attachmentsStr = fileAttachments.map(f => `<aranya-attachment name="${f.name}">\n${f.text}\n</aranya-attachment>`).join('\n\n');
            finalContent = (finalContent ? finalContent + '\n\n' : '') + attachmentsStr;
        }

        if (!finalContent.trim() && imagePreviews.length === 0) return;
        if (isSendingRef.current) {
            console.warn("Attempted to send message while another is in progress.");
            return;
        }

        isSendingRef.current = true;
        setIsTyping(true);
        setIsGenerating(true);
        abortControllerRef.current = new AbortController();

        let chatId = activeChatId;

        
        if (!chatId) {
            console.log("No active chat, attempting to create a new one.");
            chatId = await handleNewChat();
            if (!chatId) {
                console.error("Chat creation failed, cannot send message.");
                setIsTyping(false);
                setIsGenerating(false);
                isSendingRef.current = false;
                setInput('');
                setImagePreviews([]);
                setSelectedImages([]);
                setFileAttachments([]);
                return;
            }
            console.log(`New chat created with ID: ${chatId}`);
        }

        const tempMsgId = Date.now();
        const userMsg = {
            role: 'user',
            content: finalContent || 'Image Analysis',
            image_url: imagePreviews.length > 0 ? imagePreviews[0] : null, 
            image_urls: imagePreviews, 
            tempId: tempMsgId,
            createdAt: new Date()
        };

        setMessages(prev => [...prev, userMsg]);
        setTimeout(() => scrollToBottom(true), 50);
        setInput('');
        setImagePreviews([]);
        setSelectedImages([]);
        setFileAttachments([]);

        let displayContent = "";
        let tokenQueue = [];
        let isProcessingQueue = false;
        const signal = abortControllerRef.current.signal;
        const isAborted = () => signal.aborted;
        const handleAbort = () => {
            tokenQueue.length = 0;
            setMessages(prev => {
                const next = [...prev];
                const idx = next.length - 1;
                if (idx >= 0 && next[idx].isStreaming) {
                    next[idx] = { ...next[idx], isStreaming: false, isThinking: false, isNew: false };
                }
                return next;
            });
            setIsGenerating(false);
            setIsTyping(false);
        };
        signal.addEventListener('abort', handleAbort, { once: true });

        const processQueue = async () => {
            if (isProcessingQueue) return;
            isProcessingQueue = true;
            let lastUpdate = 0;
            
            while (tokenQueue.length > 0 && !isAborted()) {
                const char = tokenQueue.shift();
                displayContent += char;
                
                const now = Date.now();
                const isTableRowComplete = char === '\n' && displayContent.includes('|') && 
                                           displayContent.split('\n').slice(-2)[0]?.includes('|');        
                if (isTableRowComplete || now - lastUpdate > 40 || tokenQueue.length === 0) {
                    setMessages(prev => {
                        const next = [...prev];
                        const idx = next.length - 1;
                        if (idx >= 0 && next[idx].isStreaming) {                           
                            next[idx] = { ...next[idx], content: displayContent };
                        }
                        return next;
                    });                   
                    if (isAtBottomRef.current) {
                        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
                    }
                    lastUpdate = now;
                }                
                await new Promise(r => setTimeout(r, 2));
            }
            isProcessingQueue = false;
        };

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/chat/conversations/${chatId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ content: userMsg.content, image_urls: userMsg.image_urls, stream: true, chatMode }),
                signal: signal
            });

            if (!response.ok) throw new Error('Failed to send message');

            const aiMsgId = Date.now() + 1;
            const initialAiMsg = { _id: aiMsgId, role: 'ai', content: '', reasoningText: '', isStreaming: true, createdAt: new Date(), thinkingSteps: [], isThinking: true, thinkingDuration: null };
            setMessages(prev => [...prev.filter(m => m.tempId !== tempMsgId), userMsg, initialAiMsg]);
            setIsTyping(false);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done || isAborted()) {
                    while (tokenQueue.length > 0 && !isAborted()) await new Promise(r => setTimeout(r, 2));
                    break;
                }
                const chunk = decoder.decode(value, { stream: true });
                for (let line of chunk.split('\n')) {
                    line = line.trim();
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const data = JSON.parse(line.substring(6).trim());

                        // Chain of Thought: Handle thinking events
                        if (data.thinking && !isAborted()) {
                            setMessages(prev => {
                                const next = [...prev];
                                const idx = next.length - 1;
                                if (idx >= 0 && next[idx].isStreaming) {
                                    next[idx] = {
                                        ...next[idx],
                                        thinkingSteps: [...(next[idx].thinkingSteps || []), data.thinking],
                                        isThinking: true
                                    };
                                }
                                return next;
                            });
                        }
                        if (data.thinkingDone && !isAborted()) {
                            setMessages(prev => {
                                const next = [...prev];
                                const idx = next.length - 1;
                                if (idx >= 0 && next[idx].isStreaming) {
                                    next[idx] = {
                                        ...next[idx],
                                        isThinking: false,
                                        thinkingDuration: data.thinkingDuration || null
                                    };
                                }
                                return next;
                            });
                        }

                        if (data.thoughtToken && !isAborted()) {
                            setMessages(prev => {
                                const next = [...prev];
                                const idx = next.length - 1;
                                if (idx >= 0 && next[idx].isStreaming) {
                                    next[idx] = {
                                        ...next[idx],
                                        reasoningText: (next[idx].reasoningText || "") + data.thoughtToken,
                                        isThinking: true
                                    };
                                }
                                return next;
                            });
                        }

                        if (data.token && !isAborted()) {
                            tokenQueue.push(...data.token.split(''));
                            processQueue();
                        }
                        if (data.metadata && !isAborted()) {
                            setMessages(prev => {
                                const next = [...prev];
                                const idx = next.length - 1;
                                if (idx >= 0 && (next[idx].isStreaming || next[idx].role === 'ai')) {
                                    next[idx] = { 
                                        ...next[idx], 
                                        intelligenceType: data.metadata.intelligenceType,
                                        sources: data.metadata.sources
                                    };
                                }
                                return next;
                            });
                        }
                        if (data.done && !isAborted()) {
                            const finalizeInterval = setInterval(() => {
                                if (tokenQueue.length === 0 || isAborted()) {
                                    clearInterval(finalizeInterval);
                                    if (isAborted()) return;
                                    setMessages(prev => {
                                        const newMsgs = [...prev];
                                        const last = newMsgs[newMsgs.length - 1];
                                        if (last && last.isStreaming) {
                                            last._id = data.messageId;
                                            last.isStreaming = false;
                                            last.isNew = false;
                                        }
                                        return newMsgs;
                                    });
                                }
                            }, 50);
                        }
                    } catch (e) { }
                }
            }
            fetchConversations();
            setIsGenerating(false);
        } catch (err) {
            if (err.name === 'AbortError' || err.message === 'AbortError' || isAborted()) {
                console.log('Interrupted');
                setMessages(prev => {
                    const newMsgs = [...prev];
                    const last = newMsgs[newMsgs.length - 1];
                    if (last && last.isStreaming) { 
                        last.isStreaming = false; 
                        last.isNew = false; 
                    }
                    return newMsgs;
                });
            } else {
                console.error('Streaming fail:', err);
                showToast(err.message || 'Connection failed', 'error');
                setMessages(prev => prev.filter(m => m.tempId !== tempMsgId && !m.isStreaming));
            }
            setIsGenerating(false);
        } finally {
            signal.removeEventListener('abort', handleAbort);
            setIsTyping(false);
            isSendingRef.current = false;
        }
    };

    const handleStopGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        setIsTyping(false);
        setIsGenerating(false);
        // FORCE UI Cleanup: Immediately set isStreaming/isThinking to false to show controls and hide indicators
        setMessages(prev => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'ai') {
                next[next.length - 1] = { ...last, isStreaming: false, isThinking: false, isNew: false };
            }
            return next;
        });
    };

    const ImageGrid = ({ images }) => {
        if (!images || images.length === 0) return null;

        const count = images.length;
        if (count === 1) {
            return <img src={images[0]} alt="attachment" className={styles.messageImage} />;
        }

        return (
            <div className={`${styles.imageGrid} ${styles[`grid-${count}`]}`}>
                {images.map((img, i) => (
                    <div key={i} className={styles.gridItem}>
                        <img src={img} alt={`attachment-${i}`} />
                    </div>
                ))}
            </div>
        );
    };

    return (
        <React.Fragment>
            <AnimatePresence>
                {isOpen && (
                    <div className={styles.overlay}>
                        <motion.div
                            className={`${styles.chatWrapper} ${isMobileHistoryOpen ? styles.mobileHistoryOpen : ''}`}
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                        >
                            {/* Backdrop for mobile history - Animated via AnimatePresence */}
                            <AnimatePresence>
                                {isMobile && isMobileHistoryOpen && (
                                    <motion.div 
                                        key="mobile-backdrop"
                                        className={styles.sidebarBackdrop} 
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        onClick={() => setIsMobileHistoryOpen(false)}
                                    />
                                )}
                            </AnimatePresence>

                            {/* Sidebar */}
                            <motion.aside
                                className={`${styles.sidebar} ${(!isSidebarOpen && !isMobileHistoryOpen) ? styles.sidebarCollapsed : ''} ${isMobileHistoryOpen ? styles.sidebarMobileOpen : ''}`}
                                initial={false}
                                animate={isMobile 
                                    ? (isMobileHistoryOpen ? { x: 0, opacity: 1, visibility: 'visible' } : { x: '-100%', opacity: 1, visibility: 'visible' })
                                    : { x: 0, opacity: 1, visibility: 'visible' }
                                }
                                transition={{ type: 'spring', damping: 28, stiffness: 240 }}
                            >
                                <div className={styles.sidebarHeader} style={isMobileHistoryOpen ? { display: 'flex', gap: '8px' } : {}}>
                                    <button
                                        className={styles.newChatBtn}
                                        style={isMobileHistoryOpen ? { flex: 1, width: 'auto' } : {}}
                                        onClick={handleNewChat}
                                        title="New Chat"
                                    >
                                        <Plus size={20} strokeWidth={2.5} />
                                        <span className={styles.newChatText}>New Chat</span>
                                    </button>
                                    
                                    {isMobileHistoryOpen && (
                                        <button 
                                            onClick={() => setIsMobileHistoryOpen(false)}
                                            style={{
                                                background: 'rgba(0,0,0,0.04)', border: 'none', color: '#0f172a', cursor: 'pointer',
                                                padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                borderRadius: '12px', flexShrink: 0
                                            }}
                                            title="Close Menu"
                                        >
                                            <X size={20} strokeWidth={2} />
                                        </button>
                                    )}
                                </div>

                                <div className={styles.sidebarContent}>
                                    <div className={styles.historyLabelRow}>
                                            <div className={styles.historyLabel}>Your Chat</div>
                                            {conversations.length > 0 && (
                                                <div className={styles.bulkActionsHeader}>
                                                    <div
                                                        className={`${styles.checkbox} ${selectedChatIds.length === conversations.length && conversations.length > 0 ? styles.checkboxChecked : ''}`}
                                                        onClick={handleSelectAll}
                                                        title={selectedChatIds.length === conversations.length ? "Deselect All" : "Select All"}
                                                        style={{ cursor: 'pointer' }}
                                                    >
                                                        {selectedChatIds.length === conversations.length && conversations.length > 0 && <Check size={10} strokeWidth={4} />}
                                                    </div>
                                                    {selectedChatIds.length > 0 && (
                                                        <button
                                                            className={`${styles.bulkActionBtn} ${styles.bulkDeleteIcon}`}
                                                            onClick={handleDeleteSelected}
                                                            title="Delete Selected"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className={styles.historyList}>
                                            {conversations.map(chat => (
                                                <div
                                                    key={chat._id}
                                                    className={`${styles.historyItem} ${activeChatId === chat._id ? styles.historyItemActive : ''}`}
                                                    onClick={() => { setActiveChatId(chat._id); setIsMobileHistoryOpen(false); }}
                                                >
                                                    <div className={styles.chatItemContent}>
                                                        {selectedChatIds.includes(chat._id) && (
                                                            <div
                                                                className={`${styles.checkbox} ${styles.checkboxChecked}`}
                                                                onClick={(e) => toggleSelectChat(e, chat._id)}
                                                            >
                                                                <Check size={10} strokeWidth={4} />
                                                            </div>
                                                        )}
                                                        <MessageSquare size={16} className={styles.chatListIcon} />

                                                        {editingId === chat._id ? (
                                                            <input
                                                                autoFocus
                                                                className={styles.renameInput}
                                                                value={editTitle}
                                                                onChange={(e) => setEditTitle(e.target.value)}
                                                                onBlur={() => handleRename(chat._id)}
                                                                onKeyPress={(e) => e.key === 'Enter' && handleRename(chat._id)}
                                                                onClick={(e) => e.stopPropagation()}
                                                            />
                                                        ) : (
                                                            <span className={styles.chatTitle}>{chat.title}</span>
                                                        )}
                                                    </div>

                                                    <div className={styles.moreMenuWrapper} onClick={(e) => e.stopPropagation()}>
                                                        <button
                                                            className={`${styles.moreBtn} ${menuOpenId === chat._id ? styles.moreBtnOpen : ''}`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setMenuOpenId(menuOpenId === chat._id ? null : chat._id);
                                                            }}
                                                        >
                                                            <MoreVertical size={16} />
                                                        </button>

                                                        <AnimatePresence>
                                                            {menuOpenId === chat._id && (
                                                                <motion.div
                                                                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                                                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                                                    className={styles.dropdownMenu}
                                                                >
                                                                    <button className={styles.dropdownItem} onClick={(e) => { startRename(e, chat); setMenuOpenId(null); }}>
                                                                        <Edit3 size={14} />
                                                                        <span>Rename</span>
                                                                    </button>
                                                                    <button className={styles.dropdownItem} onClick={(e) => { toggleSelectChat(e, chat._id); setMenuOpenId(null); }}>
                                                                        {selectedChatIds.includes(chat._id) ? <Square size={14} /> : <CheckSquare size={14} />}
                                                                        <span>{selectedChatIds.includes(chat._id) ? 'Deselect' : 'Select'}</span>
                                                                    </button>
                                                                    <div className={styles.dropdownDivider} />
                                                                    <button className={`${styles.dropdownItem} ${styles.dropdownItemDelete}`} onClick={(e) => { handleDeleteChat(e, chat._id); setMenuOpenId(null); }}>
                                                                        <Trash2 size={14} />
                                                                        <span>Delete</span>
                                                                    </button>
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                            </motion.aside>
                            <button
                                className={`${styles.toggleSidebarBtn} ${!isSidebarOpen ? styles.toggleSidebarBtnCollapsed : ''} ${styles.hideOnMobile}`}
                                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            >
                                {isSidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                            </button>

                            {/* Main Chat Area */}
                            <main className={styles.mainChat}>
                                <div className={`${styles.modeGlow} ${chatMode === 'search' ? styles.searchActiveGlow : chatMode === 'aranya' ? styles.aranyaActiveGlow : styles.chironActiveGlow}`} />
                                <header
                                    className={`${styles.chatHeader} ${!headerVisible ? styles.chatHeaderCompact : ''}`}
                                >
                                    <div className={styles.headerInfo}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <button
                                                className={styles.mobileMenuToggleBtn}
                                                onClick={() => setIsMobileHistoryOpen(!isMobileHistoryOpen)}
                                            >
                                                <Menu size={24} />
                                            </button>
                                            <h2>
                                                {isGlobalSearch ? 'Search Results'
                                                    : activeChatId
                                                        ? conversations.find(c => c._id === activeChatId)?.title
                                                        : 'Aranya Assistant'}
                                            </h2>
                                        </div>
                                        {isGlobalSearch ? (
                                            <input
                                                className={styles.searchHeaderInput}
                                                type="text"
                                                placeholder="Search across all chats..."
                                                value={searchQuery}
                                                onChange={(e) => handleGlobalSearch(e.target.value)}
                                                autoFocus
                                            />
                                        ) : (
                                            <p className={styles.headerSubtitle}>Veterinary AI • Deep Diagnostics Enabled</p>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button
                                            className={styles.closeMainBtn}
                                            onClick={() => {
                                                if (isGlobalSearch) {
                                                    setIsGlobalSearch(false);
                                                    setSearchQuery('');
                                                } else {
                                                    setIsGlobalSearch(true);
                                                    setSearchResults([]);
                                                }
                                            }}
                                            title={isGlobalSearch ? "Close Search" : "Search Messages"}
                                        >
                                            <Search size={20} color={isGlobalSearch ? "var(--primary)" : "currentColor"} />
                                        </button>
                                        <button className={styles.closeMainBtn} onClick={() => setIsOpen(false)}>
                                            <X size={20} />
                                        </button>
                                    </div>
                                </header>

                                <div className={styles.chatMessages} ref={chatContainerRef} onScroll={handleChatScroll}>
                                    {messages.length === 0 && (
                                        <div className={styles.emptyContent}>
                                            <div className={styles.emptyState}>
                                                <div className={styles.botGlow}>
                                                    <AILogo size={32} />
                                                </div>
                                                <h3>How can I help today?</h3>
                                                <div className={styles.modeTextWrapper}>
                                                    <AnimatePresence mode="wait">
                                                        <motion.p
                                                            key={chatMode}
                                                            initial={{ opacity: 0, y: 10 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0, y: -10 }}
                                                            transition={{ duration: 0.3 }}
                                                        >
                                                            {chatMode === 'aranya'
                                                                ? <>I am in <strong>Aranya AI Mode</strong> — I can access your pet profiles and give personalized health advice.</>
                                                                : chatMode === 'chiron'
                                                                ? <>I am in <strong>Chiron Intelligence</strong> — I'll search your knowledge base and pet profiles for grounded answers.</>
                                                                : <>I am in <strong>Search Mode</strong> for general veterinary answers.</>
                                                            }
                                                        </motion.p>
                                                    </AnimatePresence>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {(isGlobalSearch ? searchResults : messages).map((msg, i) => (
                                        <div key={i} className={`${styles.messageRow} ${msg.role === 'user' ? styles.userRow : styles.aiRow}`}>
                                            {msg.role === 'ai' && (
                                                <div className={styles.minimalLogoWrapper}>
                                                    <AILogo size={20} />
                                                </div>
                                            )}
                                            <div className={`${styles.bubble} ${msg.role === 'user' ? styles.userBubble : styles.aiBubble} ${msg.isPinned ? styles.pinnedBubble : ''}`}>

                                                {msg.isPinned && (
                                                    <div className={styles.pinnedIndicator}>
                                                        <Pin size={12} fill="currentColor" />
                                                        <span>Pinned</span>
                                                    </div>
                                                )}

                                                <div className={styles.messageContent}>
                                                    {/* Chain of Thought Panel */}
                                                    {msg.role === 'ai' && ((msg.thinkingSteps && msg.thinkingSteps.length > 0) || msg.reasoningText) && (
                                                        <ThinkingPanel
                                                            steps={msg.thinkingSteps}
                                                            reasoningText={msg.reasoningText}
                                                            isThinking={msg.isThinking}
                                                            isGenerating={msg.isStreaming}
                                                            thinkingDuration={msg.thinkingDuration}
                                                        />
                                                    )}
                                                    {isGlobalSearch && (
                                                        <div className={styles.searchContextInfo}>
                                                            Found in: <strong>{msg.conversationTitle}</strong>
                                                        </div>
                                                    )}
                                                    <ImageGrid images={msg.image_urls || (msg.image_url ? [msg.image_url] : [])} />
                                                    {(() => {
                                                        const { cleanContent } = parseMessage(msg.content, msg.isStreaming);
                                                        return (
                                                            <div className={styles.markdownContent}>
                                                                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{cleanContent}</ReactMarkdown>
                                                            </div>
                                                        );
                                                    })()}

                                                    {msg.reactions && msg.reactions.length > 0 && (
                                                        <div className={styles.reactionDisplayRow}>
                                                            {Array.from(new Set(msg.reactions.map(r => r.emoji))).map(emoji => (
                                                                <span key={emoji} className={styles.reactionBadge}>
                                                                    {emoji} {msg.reactions.filter(r => r.emoji === emoji).length}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}


                                                    {msg.role === 'ai' && !msg.isNew && !msg.isStreaming && !isGlobalSearch && (
                                                        <div className={styles.messageActionRow}>
                                                            <button
                                                                className={styles.messageActionBtn}
                                                                onClick={() => handleCopy(msg.content, msg._id || i)}
                                                                title="Copy to clipboard"
                                                            >
                                                                {copiedId === (msg._id || i) ? <Check size={14} color="#10b981" /> : <Copy size={16} />}
                                                            </button>

                                                            <div className={styles.reactionPickerContainer}>
                                                                <button
                                                                    className={`${styles.messageActionBtn} ${activeReactionId === (msg._id || i) ? styles.actionBtnActive : ''}`}
                                                                    onClick={() => setActiveReactionId(activeReactionId === (msg._id || i) ? null : (msg._id || i))}
                                                                    title="React"
                                                                >
                                                                    <Smile size={16} />
                                                                </button>
                                                                {activeReactionId === (msg._id || i) && (
                                                                    <div className={styles.reactionPopup}>
                                                                        {['🐾', '❤️', '👍', '🔥', '💡'].map(emoji => (
                                                                            <button
                                                                                key={emoji}
                                                                                className={styles.reactionOptionBtn}
                                                                                onClick={() => handleToggleReaction(msg._id, emoji)}
                                                                            >
                                                                                {emoji}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <button
                                                                className={`${styles.messageActionBtn} ${msg.isPinned ? styles.pinBtnActive : ''}`}
                                                                onClick={() => handleTogglePin(msg._id)}
                                                                title={msg.isPinned ? "Unpin" : "Pin Message"}
                                                            >
                                                                <Pin size={16} fill={msg.isPinned ? "currentColor" : "none"} />
                                                            </button>

                                                            <div className={styles.actionDivider} />
                                                            <button className={styles.messageActionBtn} onClick={() => handleExport(msg.content)} title="Export TXT">
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                                                            </button>

                                                            {msg.content.includes('|') && (
                                                                <button
                                                                    className={`${styles.messageActionBtn} ${styles.pdfDownloadBtn}`}
                                                                    onClick={() => handleDownloadPDF(msg.content, msg.conversationTitle || 'Arion-Report')}
                                                                    title="Download Official PDF Report"
                                                                >
                                                                    <FileText size={14} />
                                                                    <span className={styles.pdfBtnLabel}>PDF</span>
                                                                </button>
                                                            )}

                                                            <button className={styles.messageActionBtn} onClick={() => handleRegenerate(i)} disabled={isGenerating} title="Regenerate">
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"></polyline><polyline points="23 20 23 14 17 14"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path></svg>
                                                            </button>

                                                            {msg.role === 'ai' && msg.intelligenceType === 'web' && (
                                                                <>
                                                                    <div className={styles.actionDivider} />
                                                                    <button
                                                                        className={`${styles.messageActionBtn} ${activeSourcesId === (msg._id || i) ? styles.actionBtnActive : ''}`}
                                                                        onClick={() => setActiveSourcesId(activeSourcesId === (msg._id || i) ? null : (msg._id || i))}
                                                                        title="View Search Sources"
                                                                        style={{ 
                                                                            width: 'auto', 
                                                                            padding: '0 8px', 
                                                                            fontSize: '0.75rem', 
                                                                            fontWeight: 600, 
                                                                            color: activeSourcesId === (msg._id || i) ? '#10b981' : '#64748b' 
                                                                        }}
                                                                    >
                                                                        <Globe size={12} style={{ marginRight: '4px' }} /> Sources
                                                                    </button>
                                                                </>
                                                            )}
                                                                {msg.role === 'ai' && msg.intelligenceType === 'chiron' && msg.sources && msg.sources.length > 0 && (
                                                                <>
                                                                <div className={styles.actionDivider} />
                                                                <button
                                                                className={`${styles.messageActionBtn} ${activeSourcesId === (msg._id || i) ? styles.actionBtnActive : ''}`}
                                                                onClick={() => setActiveSourcesId(activeSourcesId === (msg._id || i) ? null : (msg._id || i))}
                                                                title="View Knowledge Base Sources"
                                                                style={{
                                                                    width: 'auto',
                                                                    padding: '0 8px',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: 600,
                                                                    color: activeSourcesId === (msg._id || i) ? '#6366f1' : '#64748b'
                                                                 }}
                                                                  >
                                                                   <Globe size={12} style={{ marginRight: '4px' }} /> Sources
                                                                    </button>
                                                                    </>
                                                                    )}
                                                            
                                                                    </div>
                                                                    )}

                                                    {/* AI Enhanced Sources Panel (Gemini Style) */}
                                                    <AnimatePresence>
                                                        {msg.role === 'ai' && msg.intelligenceType === 'web' && activeSourcesId === (msg._id || i) && (
                                                            <motion.div 
                                                                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                                                                animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                                                                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                                                                transition={{ duration: 0.2, ease: "easeOut" }}
                                                                style={{ borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}
                                                            >
                                                                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', marginBottom: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                    <Search size={10} strokeWidth={3} /> Verified Search Sources
                                                                </div>
                                                                {msg.sources && msg.sources.length > 0 ? (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                        {msg.sources.map((src, idx) => (
                                                                            <a 
                                                                                key={idx} 
                                                                                href={src.url} 
                                                                                target="_blank" 
                                                                                rel="noopener noreferrer"
                                                                                style={{ 
                                                                                    display: 'flex', 
                                                                                    alignItems: 'center', 
                                                                                    gap: '12px', 
                                                                                    padding: '10px 12px', 
                                                                                    background: '#f8fafc', 
                                                                                    borderRadius: '12px', 
                                                                                    textDecoration: 'none',
                                                                                    border: '1px solid #f1f5f9',
                                                                                    transition: '0.2s transform'
                                                                                }}
                                                                                onMouseOver={e => e.currentTarget.style.transform = 'translateX(2px)'}
                                                                                onMouseOut={e => e.currentTarget.style.transform = 'translateX(0)'}
                                                                            >
                                                                                <div style={{ width: '32px', height: '32px', background: '#fff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.03)', flexShrink: 0 }}>
                                                                                    <img src={`https://www.google.com/s2/favicons?domain=${src.domain}&sz=32`} alt="favicon" style={{ width: '16px', height: '16px' }} onError={e => e.target.style.display = 'none'} />
                                                                                </div>
                                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{src.title || 'Web Result'}</div>
                                                                                    <div style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 600 }}>{src.domain}</div>
                                                                                </div>
                                                                                <ExternalLink size={14} color="#94a3b8" />
                                                                            </a>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic', padding: '10px' }}>
                                                                        Synthesized from latest background crawl and internal medical training. No specific external URLs to list.
                                                                    </div>
                                                                )}
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>

                                                    {/* Chiron RAG Sources Panel */}
                                                    <AnimatePresence>
                                                        {msg.role === 'ai' && msg.intelligenceType === 'chiron' && msg.sources && msg.sources.length > 0 && activeSourcesId === (msg._id || i) && (
                                                            <motion.div
                                                            initial={{ opacity: 0, height: 0, marginTop: 0 }}
                                                            animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                                                            exit={{ opacity: 0, height: 0, marginTop: 0 }}
                                                            transition={{ duration: 0.2, ease: 'easeOut' }}
                                                            style={{ borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}
                                                            >
                                                                <div style={{
                                                                    fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8',
                                                                    marginBottom: '10px', letterSpacing: '0.08em', textTransform: 'uppercase',
                                                                    display: 'flex', alignItems: 'center', gap: '6px'
                                                                    }}>
                                                                        <Globe size={10} strokeWidth={3} /> Verified Search Sources
                                                                        </div>
                                                                        <ChironSourcesPanel sources={msg.sources} />
                                                                        </motion.div>
                                                                    )}
                                                                    </AnimatePresence>
                                                    {/* AI Enhanced Sources Panel (Gemini Style) */}
                                                    
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    <div ref={messagesEndRef} />
                                </div>

                                <footer className={styles.chatFooter}>
                                    {(imagePreviews.length > 0 || fileAttachments.length > 0) && (
                                        <div className={styles.previewBar}>
                                            {fileAttachments.map((file) => (
                                                <div key={file.id} className={styles.previewContainer} style={{ background: 'rgba(0,0,0,0.05)', padding: '6px 12px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>
                                                    <Paperclip size={14} color="#64748b" />
                                                    <span style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px', fontWeight: '500' }}>{file.name}</span>
                                                    <div className={styles.previewActions}>
                                                        <button
                                                            className={`${styles.previewActionBtn} ${styles.removeBtn}`}
                                                            onClick={() => setFileAttachments(prev => prev.filter(f => f.id !== file.id))}
                                                            title="Remove file"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            {imagePreviews.map((preview, idx) => (
                                                <div key={idx} className={styles.previewContainer}>
                                                    <img src={preview} alt="upload" className={styles.previewThumb} />
                                                    <div className={styles.previewActions}>
                                                        <button
                                                            className={`${styles.previewActionBtn} ${styles.removeBtn}`}
                                                            onClick={() => removeImage(idx)}
                                                            title="Remove image"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            {isUploadingImage && (
                                                <div className={styles.imageLoadingContainer}>
                                                    <div className={styles.imageLoaderSpinner}></div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {!imagePreviews.length && !fileAttachments.length && isUploadingImage && (
                                        <div className={styles.previewBar}>
                                            <div className={styles.imageLoadingContainer}>
                                                <div className={styles.imageLoaderSpinner}></div>
                                                <span className={styles.imageLoadingText}>Optimizing...</span>
                                            </div>
                                        </div>
                                    )}



                                    <div className={`${styles.inputWrapper} ${chatMode === 'search' ? styles.inputWrapperSearch : chatMode === 'aranya' ? styles.inputWrapperAranya : styles.inputWrapperChiron}`}>
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            style={{ display: 'none' }}
                                            accept="image/*"
                                            multiple
                                            onChange={handleImageSelect}
                                        />
                                        <div className={styles.inputLeftActions}>
                                            <input
                                                type="file"
                                                ref={cameraInputRef}
                                                style={{ display: 'none' }}
                                                accept="image/*"
                                                capture="environment"
                                                onChange={handleImageSelect}
                                            />
                                            <input
                                                type="file"
                                                ref={documentInputRef}
                                                style={{ display: 'none' }}
                                                accept=".pdf,.txt,.csv,.md,.json"
                                                multiple
                                                onChange={handleDocumentSelect}
                                            />

                                            <div className={styles.inputMenuContainer}>
                                                <button
                                                    className={`${styles.actionIcon} ${isInputMenuOpen ? styles.actionIconActive : ''}`}
                                                    onClick={() => setIsInputMenuOpen(!isInputMenuOpen)}
                                                    title="Add attachment"
                                                    disabled={isExtractingText}
                                                >
                                                    <Plus size={20} className={isExtractingText ? styles.pulsingIcon : ''} />
                                                </button>

                                                <AnimatePresence>
                                                    {isInputMenuOpen && (
                                                        <motion.div
                                                            className={styles.addMenuPopup}
                                                            initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                                            exit={{ opacity: 0, scale: 0.9, y: 10 }}
                                                            transition={{ duration: 0.15 }}
                                                        >
                                                            <button
                                                                className={styles.addMenuOption}
                                                                onClick={() => {
                                                                    setIsInputMenuOpen(false);
                                                                    documentInputRef.current?.click();
                                                                }}
                                                            >
                                                                <div className={styles.addMenuIcon} style={{ color: '#8b5cf6', background: 'rgba(139, 92, 246, 0.1)' }}>
                                                                    <Paperclip size={16} />
                                                                </div>
                                                                <span>Document</span>
                                                            </button>

                                                            <button
                                                                className={styles.addMenuOption}
                                                                onClick={() => {
                                                                    setIsInputMenuOpen(false);
                                                                    fileInputRef.current?.click();
                                                                }}
                                                            >
                                                                <div className={styles.addMenuIcon} style={{ color: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)' }}>
                                                                    <ImageIcon size={16} />
                                                                </div>
                                                                <span>Image</span>
                                                            </button>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>

                                            <div className={styles.modeSelectorContainer}>
                                                <button
                                                    className={`${styles.inlineModeBtn} ${chatMode === 'search' ? styles.modeSearchActive : chatMode === 'aranya' ? styles.modeAranyaActive : styles.modeChironActive}`}
                                                    onClick={() => setIsModeSelectorOpen(!isModeSelectorOpen)}
                                                    title="Switch Intelligence Mode"
                                                >
                                                    <AnimatePresence mode="wait">
                                                        <motion.div
                                                            key={chatMode}
                                                            className={styles.modeSwitchContent}
                                                            initial={{ opacity: 0, x: -10 }}
                                                            animate={{ opacity: 1, x: 0 }}
                                                            exit={{ opacity: 0, x: 10 }}
                                                            transition={{ duration: 0.2 }}
                                                        >
                                                            {chatMode === 'aranya' ? <Sparkles size={16} /> : chatMode === 'chiron' ? <Bot size={16} /> : <Search size={16} />}
                                                            <span className={styles.modeLabelText}>
                                                                {chatMode === 'aranya' ? 'Aranya AI' : chatMode === 'chiron' ? 'Chiron' : 'Search'}
                                                            </span>
                                                            <ChevronDown size={14} className={`${styles.dropdownChevron} ${isModeSelectorOpen ? styles.chevronRotated : ''}`} />
                                                        </motion.div>
                                                    </AnimatePresence>
                                                </button>

                                                <AnimatePresence>
                                                    {isModeSelectorOpen && (
                                                        <motion.div 
                                                            className={styles.modeDropdown}
                                                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                        >
                                                            {[
                                                                { id: 'search', icon: <Search size={16} />, label: 'Search' },
                                                                { id: 'aranya', icon: <Sparkles size={16} />, label: 'Aranya AI' },
                                                                { id: 'chiron', icon: <Bot size={16} />, label: 'Chiron' }
                                                            ].map(mode => (
                                                                <button
                                                                    key={mode.id}
                                                                    className={`${styles.modeOption} ${chatMode === mode.id ? styles.modeOptionActive : ''}`}
                                                                    onClick={() => {
                                                                        setChatMode(mode.id);
                                                                        setIsModeSelectorOpen(false);
                                                                    }}
                                                                >
                                                                    <div className={`${styles.modeOptionIcon} ${styles['icon' + mode.id.charAt(0).toUpperCase() + mode.id.slice(1)]}`}>
                                                                        {mode.icon}
                                                                    </div>
                                                                    <div className={styles.modeOptionInfo}>
                                                                        <div className={styles.modeOptionLabel}>{mode.label}</div>
                                                                    </div>
                                                                    {chatMode === mode.id && <div className={styles.activeCheck}>●</div>}
                                                                </button>
                                                            ))}
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        </div>

                                        {isRecording ? (
                                            <div className={styles.recordingContainer} onClick={handleVoiceRecord}>
                                                <div className={styles.soundWave}>
                                                    <div className={styles.bar}></div>
                                                    <div className={styles.bar}></div>
                                                    <div className={styles.bar}></div>
                                                    <div className={styles.bar}></div>
                                                    <div className={styles.bar}></div>
                                                </div>
                                            </div>
                                        ) : (
                                            <input
                                                type="text"
                                                className={styles.inputField}
                                                placeholder={chatMode === 'search' ? "Search and ask anything..." : chatMode === 'aranya' ? "Message Aranya AI..." : "Ask Chiron..."}
                                                value={input}
                                                onChange={(e) => {
                                                    setInput(e.target.value);
                                                    scrollToBottom();
                                                }}
                                                onFocus={() => scrollToBottom(true)}
                                                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                                            />
                                        )}
                                        <div className={styles.inputActions}>
                                            <button
                                                className={`${styles.actionIcon} ${isRecording ? styles.recordingIconActive : ''}`}
                                                onClick={handleVoiceRecord}
                                                title={isRecording ? "Stop Recording" : "Voice Input"}
                                            >
                                                <Mic size={18} />
                                            </button>
                                            {isGenerating ? (
                                                <button
                                                    className={styles.stopBtnInInput}
                                                    onClick={handleStopGeneration}
                                                    title="Stop generating"
                                                >
                                                    <StopCircle size={16} />
                                                </button>
                                            ) : (
                                                <button
                                                    className={`${styles.sendBtn} ${chatMode === 'search' ? styles.sendBtnSearch : chatMode === 'aranya' ? styles.sendBtnAranya : styles.sendBtnChiron}`}
                                                    onClick={() => handleSend()}
                                                    disabled={!input.trim() && imagePreviews.length === 0}
                                                >
                                                    <Send size={18} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className={styles.disclaimerText}>
                                        <span className={styles.pingEffect}></span>
                                        Arion is an artificial intelligence and can make mistakes. Please consult a licensed veterinarian for confirmation.
                                    </div>
                                </footer>
                            </main>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <button className={styles.chatToggle} onClick={() => setIsOpen(true)}>
                <span className={styles.chatToggleIcon}>
                    <AILogo size={22} />
                </span>
                <span className={styles.chatToggleLabel}>
                    <span className={styles.chatToggleName}>Arion</span>
                    <span className={styles.chatToggleDot} />
                </span>
            </button>

            <ConfirmDialog {...confirmConfig} onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))} />
        </React.Fragment>
    );
}


