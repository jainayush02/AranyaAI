import React, { useState, useRef, useEffect } from 'react';
import {
    MessageSquare, X, Send, Bot, Mic,
    Camera, Image as ImageIcon,
    Plus, History, Trash2, Edit3,
    Check, ChevronRight, ChevronLeft, Copy,
    CheckSquare, Square, StopCircle, Sparkles, CornerDownRight,
    MoreVertical, Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import ConfirmDialog from './ConfirmDialog';
import styles from './ChatBot.module.css';

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

const Typewriter = ({ text, speed = 5, onType, onFinish }) => {
    const [displayedText, setDisplayedText] = useState('');
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        if (currentIndex < text.length) {
            const timeout = setTimeout(() => {
                setDisplayedText(prev => prev + text[currentIndex]);
                setCurrentIndex(prev => prev + 1);
                if (onType) onType();
            }, speed);
            return () => clearTimeout(timeout);
        } else if (onFinish) {
            onFinish();
        }
    }, [currentIndex, text, speed, onType, onFinish]);

    return (
        <div className={styles.typewriterWrapper}>
            <div className={styles.markdownContent}>
                <ReactMarkdown>{displayedText}</ReactMarkdown>
            </div>
            {currentIndex < text.length && (
                <div className={styles.writingSpinnerWrapper}>
                    <div className={styles.typingDot}></div>
                    <div className={styles.typingDot}></div>
                    <div className={styles.typingDot}></div>
                </div>
            )}
        </div>
    );
};

const parseMessage = (content) => {
    if (typeof content !== 'string') return { cleanContent: '' };
    return { cleanContent: content.trim() };
};

export default function ChatBot() {
    const [isOpen, setIsOpen] = useState(false);
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
    const [chatMode, setChatMode] = useState('search'); // Default to Search mode for general answers
    const [isRecording, setIsRecording] = useState(false);
    const recognitionRef = useRef(null);
    const silenceTimeoutRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = () => setMenuOpenId(null);
        if (menuOpenId) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [menuOpenId]);
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
            alert('Your browser does not support Speech Recognition.');
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
            // 4 seconds delay if no sound detected at all
            if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = setTimeout(stopRecording, 4000);
        };

        recognition.onspeechstart = () => {
             // Clear the timeout once they start speaking
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

    // Header Animation States
    const [headerVisible, setHeaderVisible] = useState(true);
    const [lastChatScroll, setLastChatScroll] = useState(0);

    const handleChatScroll = (e) => {
        const currentScroll = e.target.scrollTop;
        if (currentScroll > lastChatScroll && currentScroll > 50) {
            setHeaderVisible(false); // Scrolling down
        } else {
            setHeaderVisible(true);  // Scrolling up
        }
        setLastChatScroll(currentScroll);
    };

    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const chatContainerRef = useRef(null);
    const abortControllerRef = useRef(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [feedback, setFeedback] = useState({});

    const scrollToBottom = (force = false) => {
        if (!chatContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;

        if (isNearBottom || force) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    };

    const isSendingRef = useRef(false);

    useEffect(() => {
        if (isOpen) {
            fetchConversations();
            setActiveChatId(null);
            setMessages([]);
        }
    }, [isOpen]);

    useEffect(() => {
        if (activeChatId && !isSendingRef.current) {
            fetchMessages(activeChatId).then(() => {
                setTimeout(() => scrollToBottom(true), 150);
            });
        }
    }, [activeChatId]);

    useEffect(() => {
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

        // Limit to 4 images total
        const remainingSlots = 4 - imagePreviews.length;
        const filesToProcess = files.slice(0, remainingSlots);

        if (files.length > remainingSlots) {
            alert(`You can only upload up to 4 images. Added ${remainingSlots} images.`);
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
        }
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
        if (!messageText.trim() && imagePreviews.length === 0) return;
        if (isSendingRef.current) {
            console.warn("Attempted to send message while another is in progress.");
            return;
        }

        isSendingRef.current = true;
        setIsTyping(true);
        setIsGenerating(true);
        abortControllerRef.current = new AbortController();

        let chatId = activeChatId;

        // Auto-create chat if none exists
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
                return;
            }
            console.log(`New chat created with ID: ${chatId}`);
        }

        const tempMsgId = Date.now();
        const userMsg = {
            role: 'user',
            content: messageText || 'Image Analysis',
            image_url: imagePreviews.length > 0 ? imagePreviews[0] : null, // Fallback for single image_url
            image_urls: imagePreviews, // New field for multiple images
            tempId: tempMsgId,
            createdAt: new Date()
        };

        setMessages(prev => [...prev, userMsg]);
        setTimeout(() => scrollToBottom(true), 50);
        setInput('');
        setImagePreviews([]);
        setSelectedImages([]);

        try {
            const token = localStorage.getItem('token');
            const res = await axios.post(`/api/chat/conversations/${chatId}/messages`, {
                content: userMsg.content,
                image_url: userMsg.image_url,
                image_urls: userMsg.image_urls
            }, {
                headers: { Authorization: `Bearer ${token}` },
                signal: abortControllerRef.current.signal
            });

            const aiMsg = { ...res.data.aiMessage, isNew: true };
            setMessages(prev => {
                // Remove the optimistic message and replace with official ones
                return [...prev.filter(m => m.tempId !== tempMsgId), res.data.userMessage, aiMsg];
            });

            fetchConversations();
            // setIsGenerating(false); // DO NOT set here, let Typewriter.onFinish handle it
        } catch (err) {
            if (axios.isCancel(err)) {
                console.log('Request canceled');
            } else {
                console.error('Send failed', err);
            }
            setIsGenerating(false); // Set to false only on error
        } finally {
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
        // Also remove the "isNew" flag from the last message to stop typewriter
        setMessages(prev => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg && lastMsg.role === 'ai') {
                return [...prev.slice(0, -1), { ...lastMsg, isNew: false }];
            }
            return prev;
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


                            {/* Sidebar */}
                            <aside
                                className={`${styles.sidebar} ${!isSidebarOpen ? styles.sidebarCollapsed : ''}`}
                            >
                                <div className={styles.sidebarHeader}>
                                    <button
                                        className={styles.newChatBtn}
                                        onClick={handleNewChat}
                                        title="New Chat"
                                    >
                                        <Plus size={18} />
                                        <span className={styles.newChatText}>New Chat</span>
                                    </button>
                                </div>

                                {isSidebarOpen && (
                                    <>
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
                                    </>
                                )}
                                <button
                                    className={styles.toggleSidebarBtn}
                                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                                >
                                    {isSidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
                                </button>
                            </aside>

                            {/* Main Chat Area */}
                            <main className={styles.mainChat}>
                                <header
                                    className={`${styles.chatHeader} ${!headerVisible ? styles.chatHeaderCompact : ''}`}
                                >
                                    <div className={styles.headerInfo}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <button
                                                className={styles.mobileOnly}
                                                style={{
                                                    display: 'none',
                                                    background: 'none',
                                                    border: 'none',
                                                    padding: '5px',
                                                    color: '#64748b'
                                                }}
                                                onClick={() => setIsMobileHistoryOpen(!isMobileHistoryOpen)}
                                            >
                                                <History size={20} />
                                            </button>
                                            <h2>
                                                {activeChatId
                                                    ? conversations.find(c => c._id === activeChatId)?.title
                                                    : 'Aranya Assistant'}
                                            </h2>
                                        </div>
                                        <p className={styles.headerSubtitle}>Veterinary AI • Deep Diagnostics Enabled</p>
                                    </div>
                                    <button className={styles.closeMainBtn} onClick={() => setIsOpen(false)}>
                                        <X size={20} />
                                    </button>
                                </header>

                                <div className={styles.chatMessages} ref={chatContainerRef} onScroll={handleChatScroll}>
                                    {messages.length === 0 && (
                                        <div className={styles.emptyContent}>
                                            <div className={styles.emptyState}>
                                                <div className={styles.botGlow}>
                                                    <AILogo size={32} />
                                                </div>
                                                <h3>How can I help today?</h3>
                                                <p>I am in <strong>Search Mode</strong> for general answers. Aranya AI (Animal Data) mode is coming soon!</p>
                                            </div>
                                        </div>
                                    )}
                                    {messages.map((msg, i) => (
                                        <div key={i} className={`${styles.messageRow} ${msg.role === 'user' ? styles.userRow : styles.aiRow}`}>
                                            {msg.role === 'ai' && (
                                                <div className={styles.minimalLogoWrapper}>
                                                    <AILogo size={20} />
                                                </div>
                                            )}
                                            <div className={`${styles.bubble} ${msg.role === 'user' ? styles.userBubble : styles.aiBubble}`}>
                                                <div className={styles.messageContent}>
                                                    <ImageGrid images={msg.image_urls || (msg.image_url ? [msg.image_url] : [])} />
                                                    {(() => {
                                                        const { cleanContent } = parseMessage(msg.content);
                                                        return (
                                                            <>
                                                                {msg.role === 'ai' && msg.isNew ? (
                                                                    <Typewriter
                                                                        text={cleanContent}
                                                                        onType={scrollToBottom}
                                                                        onFinish={() => {
                                                                            setIsGenerating(false);
                                                                            setMessages(prev => {
                                                                                const newMsgs = [...prev];
                                                                                const targetIndex = newMsgs.findIndex(m => m === msg);
                                                                                if (targetIndex !== -1) {
                                                                                    newMsgs[targetIndex] = { ...msg, isNew: false };
                                                                                }
                                                                                return newMsgs;
                                                                            });
                                                                        }}
                                                                    />
                                                                ) : (
                                                                    <div className={styles.markdownContent}>
                                                                        <ReactMarkdown>{cleanContent}</ReactMarkdown>
                                                                    </div>
                                                                )}
                                                            </>
                                                        );
                                                    })()}

                                                    {msg.role === 'ai' && !msg.isNew && (
                                                        <div className={styles.messageActionRow}>
                                                            <button
                                                                className={styles.messageActionBtn}
                                                                onClick={() => handleCopy(msg.content, msg._id || i)}
                                                                title="Copy to clipboard"
                                                            >
                                                                {copiedId === (msg._id || i) ? <Check size={14} color="#10b981" /> : <Copy size={16} />}
                                                            </button>
                                                            <button
                                                                className={`${styles.messageActionBtn} ${feedback[msg._id || i] === 'helpful' ? styles.actionBtnActive : ''}`}
                                                                onClick={() => handleFeedback(msg._id || i, 'helpful')}
                                                                title="Helpful response"
                                                            >
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill={feedback[msg._id || i] === 'helpful' ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>
                                                            </button>
                                                            <button
                                                                className={`${styles.messageActionBtn} ${feedback[msg._id || i] === 'unhelpful' ? styles.actionBtnActive : ''}`}
                                                                onClick={() => handleFeedback(msg._id || i, 'unhelpful')}
                                                                title="Not helpful"
                                                            >
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill={feedback[msg._id || i] === 'unhelpful' ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path></svg>
                                                            </button>
                                                            <div className={styles.actionDivider} />
                                                            <button className={styles.messageActionBtn} onClick={() => handleExport(msg.content)} title="Export">
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                                                            </button>
                                                            <button className={styles.messageActionBtn} onClick={() => handleRegenerate(i)} disabled={isGenerating} title="Regenerate">
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"></polyline><polyline points="23 20 23 14 17 14"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path></svg>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    <div ref={messagesEndRef} />
                                </div>

                                <footer className={styles.chatFooter}>
                                    {imagePreviews.length > 0 && (
                                        <div className={styles.previewBar}>
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

                                    {!imagePreviews.length && isUploadingImage && (
                                        <div className={styles.previewBar}>
                                            <div className={styles.imageLoadingContainer}>
                                                <div className={styles.imageLoaderSpinner}></div>
                                                <span className={styles.imageLoadingText}>Optimizing...</span>
                                            </div>
                                        </div>
                                    )}

                                    {isTyping && (
                                        <div className={styles.globalTypingContainer}>
                                            <AILogo size={18} className={styles.typingLogoGlobal} />
                                            <div className={styles.typingTextContainerGlobal}>
                                                <span className={styles.typingTextGlobal}></span>
                                                <span className={styles.typingDotsGlobal}>...</span>
                                            </div>
                                        </div>
                                    )}


                                    <div className={styles.inputWrapper}>
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            style={{ display: 'none' }}
                                            accept="image/*"
                                            multiple
                                            onChange={handleImageSelect}
                                        />
                                        <div className={styles.inputLeftActions}>
                                            <button
                                                className={styles.actionIcon}
                                                onClick={() => fileInputRef.current?.click()}
                                                title="Upload Image"
                                            >
                                                <ImageIcon size={20} />
                                            </button>

                                            <button
                                                className={`${styles.inlineModeBtn} ${chatMode === 'search' ? styles.modeSearchActive : styles.modeAranyaActive}`}
                                                onClick={() => setChatMode(chatMode === 'aranya' ? 'search' : 'aranya')}
                                                title={`Switch to ${chatMode === 'aranya' ? 'Search' : 'Aranya AI'} mode`}
                                            >
                                                {chatMode === 'aranya' ? <Sparkles size={16} /> : <Search size={16} />}
                                                <span>{chatMode === 'aranya' ? 'Aranya AI' : 'Search'}</span>
                                            </button>
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
                                                placeholder={chatMode === 'search' ? "Search and ask anything..." : "Message Aranya AI..."}
                                                value={input}
                                                onChange={(e) => {
                                                    setInput(e.target.value);
                                                    scrollToBottom();
                                                }}
                                                onFocus={() => scrollToBottom(true)}
                                                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
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
                                                    <span>Stop</span>
                                                </button>
                                            ) : (
                                                <button
                                                    className={styles.sendBtn}
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

            <ConfirmDialog
                isOpen={confirmConfig.isOpen}
                onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmConfig.onConfirm}
                title={confirmConfig.title}
                message={confirmConfig.message}
                type={confirmConfig.type}
                confirmText="Delete"
            />
        </React.Fragment>
    );
}
