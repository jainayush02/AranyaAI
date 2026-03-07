import React, { useState, useRef, useEffect } from 'react';
import {
    MessageSquare, X, Send, Bot,
    Camera, Image as ImageIcon,
    Plus, History, Trash2, Edit3,
    Check, ChevronRight, ChevronLeft, Copy,
    CheckSquare, Square
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
        className={`${className} ${styles.rotatingLogo}`}
    >
        <path
            d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
            stroke="currentColor"
            strokeWidth="1.2"
            opacity="0.15"
        />
        <path
            d="M12 16C14.2091 16 16 14.2091 16 12C16 9.79086 14.2091 8 12 8C9.79086 8 8 9.79086 8 12C8 14.2091 9.79086 16 12 16Z"
            stroke="currentColor"
            strokeWidth="1.5"
        />
        <path d="M12 2V5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M12 19V22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M22 12H19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M5 12H2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
);


export default function ChatBot() {
    const [isOpen, setIsOpen] = useState(false);
    const [conversations, setConversations] = useState([]);

    const [activeChatId, setActiveChatId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [editTitle, setEditTitle] = useState('');
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isMobileHistoryOpen, setIsMobileHistoryOpen] = useState(false);
    const [selectedChatIds, setSelectedChatIds] = useState([]);
    const [confirmConfig, setConfirmConfig] = useState({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => { },
        type: 'danger'
    });

    const [copiedId, setCopiedId] = useState(null);

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

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen) {
            fetchConversations();
        }
    }, [isOpen]);

    useEffect(() => {
        if (activeChatId) {
            fetchMessages(activeChatId);
        } else {
            setMessages([]);
        }
    }, [activeChatId]);

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

    const fetchConversations = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get('/api/chat/conversations', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setConversations(res.data);
            if (res.data.length > 0 && !activeChatId) {
                setActiveChatId(res.data[0]._id);
            }
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

    const handleImageSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setSelectedImage(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result);
            };
            reader.readAsDataURL(file);
        }
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
        if (!messageText.trim() && !imagePreview) return;

        let chatId = activeChatId;

        // Auto-create chat if none exists
        if (!chatId) {
            chatId = await handleNewChat();
            if (!chatId) return;
        }

        const userMsg = {
            role: 'user',
            content: messageText || 'Image Analysis',
            image_url: imagePreview,
            createdAt: new Date()
        };

        setMessages([...messages, userMsg]);
        setInput('');
        setImagePreview(null);
        setSelectedImage(null);
        setIsTyping(true);

        try {
            const token = localStorage.getItem('token');
            const res = await axios.post(`/api/chat/conversations/${chatId}/messages`, {
                content: userMsg.content,
                image_url: userMsg.image_url
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setMessages(prev => [...prev.filter(m => m.createdAt !== userMsg.createdAt), res.data.userMessage, res.data.aiMessage]);

            // Refresh conversation list for new titles/order
            fetchConversations();
        } catch (err) {
            console.error('Send failed', err);
        } finally {
            setIsTyping(false);
        }
    };

    return (
        <React.Fragment>
            <AnimatePresence>
                {isOpen && (
                    <div className={styles.overlay}>
                        <motion.div
                            className={`${styles.chatWrapper} ${isMobileHistoryOpen ? styles.mobileHistoryOpen : ''}`}
                            initial={{ opacity: 0, scale: 0.9, y: 30 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 30 }}
                        >


                            {/* Sidebar */}
                            <motion.aside
                                className={`${styles.sidebar} ${!isSidebarOpen ? styles.sidebarCollapsed : ''}`}
                                layout
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

                                <div className={styles.historyLabelRow}>
                                    <div className={styles.historyLabel}>History</div>
                                    {isSidebarOpen && conversations.length > 0 && (
                                        <div className={styles.bulkActionsHeader}>
                                            <button
                                                className={styles.bulkActionBtn}
                                                onClick={handleSelectAll}
                                                title={selectedChatIds.length === conversations.length ? "Deselect All" : "Select All"}
                                            >
                                                {selectedChatIds.length === conversations.length ? <CheckSquare size={14} /> : <Square size={14} />}
                                            </button>
                                            {selectedChatIds.length > 0 && (
                                                <button
                                                    className={`${styles.bulkActionBtn} ${styles.bulkDeleteIcon}`}
                                                    onClick={handleDeleteSelected}
                                                    title="Delete Selected"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className={styles.historyList}>
                                    {conversations.map(chat => (
                                        <div
                                            key={chat._id}
                                            className={`${styles.historyItem} ${activeChatId === chat._id ? styles.historyItemActive : ''} ${!isSidebarOpen ? styles.historyItemCollapsed : ''}`}
                                            onClick={() => { setActiveChatId(chat._id); setIsMobileHistoryOpen(false); }}
                                            title={!isSidebarOpen ? chat.title : ''}
                                        >
                                            <div className={styles.chatItemContent}>
                                                {isSidebarOpen && (
                                                    <div
                                                        className={`${styles.checkbox} ${selectedChatIds.includes(chat._id) ? styles.checkboxChecked : ''}`}
                                                        onClick={(e) => toggleSelectChat(e, chat._id)}
                                                    >
                                                        {selectedChatIds.includes(chat._id) ? <CheckSquare size={14} /> : <Square size={14} />}
                                                    </div>
                                                )}
                                                <MessageSquare size={16} className={styles.chatListIcon} />
                                                <MessageSquare size={20} className={styles.collapsedChatIcon} />
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

                                            <div className={styles.chatActions}>
                                                <button className={styles.actionIcon} onClick={(e) => startRename(e, chat)}>
                                                    <Edit3 size={14} />
                                                </button>
                                                <button className={`${styles.actionIcon} ${styles.deleteIcon}`} onClick={(e) => handleDeleteChat(e, chat._id)}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    className={styles.toggleSidebarBtn}
                                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                                >
                                    {isSidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
                                </button>
                            </motion.aside>

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
                                                    : 'Aranya AI Assistant'}
                                            </h2>
                                        </div>
                                        <p className={styles.headerSubtitle}>Veterinary AI • Deep Diagnostics Enabled</p>
                                    </div>
                                    <button className={styles.closeMainBtn} onClick={() => setIsOpen(false)}>
                                        <X size={20} />
                                    </button>
                                </header>

                                <div className={styles.chatMessages} onScroll={handleChatScroll}>
                                    {messages.length === 0 && (
                                        <div className={styles.emptyContent}>
                                            <div className={styles.emptyState}>
                                                <div className={styles.botGlow}>
                                                    <AILogo size={32} />
                                                </div>
                                                <h3>How can Aranya AI help today?</h3>
                                                <p>I can analyze symptoms, predict risks, and optimize livestock health.</p>
                                            </div>
                                        </div>
                                    )}
                                    {messages.map((msg, i) => (
                                        <div key={i} className={`${styles.messageRow} ${msg.role === 'user' ? styles.userRow : styles.aiRow}`}>
                                            <div className={`${styles.bubble} ${msg.role === 'user' ? styles.userBubble : styles.aiBubble}`}>
                                                {msg.image_url && <img src={msg.image_url} alt="upload" className={styles.msgImage} />}
                                                <div className={styles.messageContent}>
                                                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                                                    {msg.role === 'ai' && (
                                                        <button
                                                            className={styles.copyBtn}
                                                            onClick={() => handleCopy(msg.content, msg._id || i)}
                                                            title="Copy to clipboard"
                                                        >
                                                            {copiedId === (msg._id || i) ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {isTyping && (
                                        <div className={styles.aiRow}>
                                            <div className={`${styles.bubble} ${styles.aiBubble} ${styles.typing}`}>
                                                <span></span><span></span><span></span>
                                            </div>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                {imagePreview && (
                                    <div className={styles.previewBar}>
                                        <div style={{ position: 'relative', width: 'fit-content' }}>
                                            <img src={imagePreview} alt="upload" className={styles.previewThumb} />
                                            <button
                                                className={styles.removeImgBtn}
                                                onClick={() => { setImagePreview(null); setSelectedImage(null); }}
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <footer className={styles.chatFooter}>
                                    <div className={styles.inputWrapper}>
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            style={{ display: 'none' }}
                                            accept="image/*"
                                            onChange={handleImageSelect}
                                        />
                                        <button
                                            className={styles.actionIcon}
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            <ImageIcon size={20} />
                                        </button>
                                        <input
                                            type="text"
                                            className={styles.inputField}
                                            placeholder="Message Aranya AI..."
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                                        />
                                        <div className={styles.inputActions}>
                                            <button
                                                className={styles.sendBtn}
                                                onClick={handleSend}
                                                disabled={!input.trim() && !imagePreview}
                                            >
                                                <Send size={18} />
                                            </button>
                                        </div>
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
                    <span className={styles.chatToggleDot} />
                </span>
                <span className={styles.chatToggleLabel}>
                    <span className={styles.chatToggleName}>Aranya AI</span>
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
