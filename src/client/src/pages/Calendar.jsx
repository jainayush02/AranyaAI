import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Clock, CheckCircle, AlertCircle, Plus, 
    Calendar as CalIcon, User, Layers, Info, Sparkles 
} from 'lucide-react';
import axios from 'axios';
import styles from './Calendar.module.css';
import AdvancedLoader from '../components/AdvancedLoader';

export default function Calendar() {
    const [animals, setAnimals] = useState([]);
    const [userEvents, setUserEvents] = useState([]); // Manual user plans
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [showAddEvent, setShowAddEvent] = useState(false);
    const [newEvent, setNewEvent] = useState({ title: '', type: 'work' });

    useEffect(() => {
        fetchData();
        // Load saved user events from local storage or DB
        const saved = localStorage.getItem('aranya_user_events');
        if (saved) setUserEvents(JSON.parse(saved));
    }, []);

    const fetchData = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get('/api/animals', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setAnimals(res.data);
            setLoading(false);
        } catch (err) {
            setLoading(false);
        }
    };

    const handleAddUserEvent = () => {
        if (!newEvent.title) return;
        const event = {
            id: Date.now(),
            date: selectedDate.toDateString(),
            ...newEvent
        };
        const updated = [...userEvents, event];
        setUserEvents(updated);
        localStorage.setItem('aranya_user_events', JSON.stringify(updated));
        setNewEvent({ title: '', type: 'work' });
        setShowAddEvent(false);
    };

    const dateStrip = useMemo(() => {
        const dates = [];
        const start = new Date();
        start.setDate(start.getDate() - 2);
        for (let i = 0; i < 10; i++) {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            dates.push(d);
        }
        return dates;
    }, []);

    const getDayContent = (date) => {
        const day = date.getDate();
        const month = date.getMonth();
        const items = [];

        // 1. Auto Animal Tasks
        animals.forEach(a => {
            const dob = new Date(a.dob);
            if (dob.getDate() === day && dob.getMonth() === month) {
                items.push({ type: 'animal', title: `${a.name}'s Routine`, category: 'health' });
            }
        });

        // 2. User Personal Plans
        userEvents.forEach(e => {
            if (e.date === date.toDateString()) {
                items.push({ type: 'user', title: e.title, category: e.type });
            }
        });

        return items;
    };

    if (loading) return <AdvancedLoader type="calendar" />;

    const activeItems = getDayContent(selectedDate);
    const hasConflict = activeItems.filter(i => i.type === 'user').length > 0 && activeItems.filter(i => i.type === 'animal').length > 0;

    return (
        <div className={styles.minimalPlanner}>
            <header className={styles.topBar}>
                <div className={styles.dateTrack}>
                    {dateStrip.map((d, i) => {
                        const active = d.toDateString() === selectedDate.toDateString();
                        return (
                            <div key={i} className={`${styles.dateBtn} ${active ? styles.active : ''}`} onClick={() => setSelectedDate(d)}>
                                <span className={styles.dName}>{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                                <span className={styles.dNum}>{d.getDate()}</span>
                            </div>
                        );
                    })}
                </div>
                <button className={styles.addBtn} onClick={() => setShowAddEvent(true)}>
                    <Plus size={14} /> Plan My Day
                </button>
            </header>

            <main className={styles.content}>
                <section className={styles.briefing}>
                    <div className={styles.briefHeader}>
                        <Sparkles size={14} color="var(--primary)" />
                        <span>Arion Intelligent Sync</span>
                    </div>
                    {hasConflict ? (
                        <div className={styles.conflictAlert}>
                            <AlertCircle size={14} />
                            <p>Schedule Overlap: Your personal plan matches an animal routine. Consider delegating to a member of your Care Circle.</p>
                        </div>
                    ) : (
                        <p className={styles.briefText}>Your human schedule and animal needs are currently synchronized.</p>
                    )}
                </section>

                <div className={styles.agenda}>
                    <h2 className={styles.agendaTitle}>Agenda for {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</h2>
                    <div className={styles.itemList}>
                        {activeItems.length === 0 ? (
                            <p className={styles.empty}>No activities scheduled.</p>
                        ) : (
                            activeItems.map((item, idx) => (
                                <div key={idx} className={`${styles.item} ${styles[item.type]}`}>
                                    <div className={styles.itemIcon}>
                                        {item.type === 'user' ? <User size={12} /> : <Layers size={12} />}
                                    </div>
                                    <div className={styles.itemInfo}>
                                        <h4>{item.title}</h4>
                                        <span>{item.type === 'user' ? 'Personal Plan' : 'Automated Task'}</span>
                                    </div>
                                    <button className={styles.done}><CheckCircle size={14} /></button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </main>

            <AnimatePresence>
                {showAddEvent && (
                    <div className={styles.modalOverlay}>
                        <motion.div className={styles.modal} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                            <h3>Add to My Plan</h3>
                            <input 
                                type="text" 
                                placeholder="e.g. Traveling to Market, Vet Visit..." 
                                value={newEvent.title}
                                onChange={(e) => setNewEvent({...newEvent, title: e.target.value})}
                                autoFocus
                            />
                            <div className={styles.modalActions}>
                                <button onClick={() => setShowAddEvent(false)}>Cancel</button>
                                <button className={styles.confirm} onClick={handleAddUserEvent}>Save to Plan</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
