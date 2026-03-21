import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronDown } from 'lucide-react';
import styles from './AddAnimalDialog.module.css';

const categoryBreeds = {
    Cow: ["Holstein", "Jersey", "Gir", "Sahiwal", "Redsindhi"],
    Dog: ["Labrador", "German Shepherd", "Golden Retriever", "Beagle", "Bulldog"],
    Cat: ["Persian", "Maine Coon", "Siamese", "Ragdoll", "Bengal"],
    Horse: ["Arabian", "Thoroughbred", "Quarter Horse", "Appaloosa", "Paint Horse"]
};

export default function AddAnimalDialog({ isOpen, onClose, onAdd }) {
    const [name, setName] = useState('');
    const [category, setCategory] = useState('');
    const [breed, setBreed] = useState('');
    const [gender, setGender] = useState(''); // New state
    const [birthYear, setBirthYear] = useState('');
    const [birthMonth, setBirthMonth] = useState('');
    const [vaccinated, setVaccinated] = useState('');
    const [dynamicCategories, setDynamicCategories] = useState(categoryBreeds);

    useEffect(() => {
        if (!isOpen) return;
        fetch('/api/settings')
            .then(r => r.json())
            .then(data => {
                if (data?.animal_categories && Object.keys(data.animal_categories).length > 0) {
                    setDynamicCategories(data.animal_categories);
                }
            })
            .catch(() => {}); // silently fallback to hardcoded defaults
    }, [isOpen]);

    const handleSubmit = () => {
        if (!name.trim() || !category || !breed || !gender || vaccinated === '') return; // Basic validation

        const d = new Date();
        if (birthYear) d.setFullYear(parseInt(birthYear));
        if (birthMonth) d.setMonth(parseInt(birthMonth) - 1);

        onAdd({ name, category, breed, dob: d.toISOString(), vaccinated: vaccinated === 'true', gender });
        // Reset form
        setName('');
        setCategory('');
        setBreed('');
        setGender('');
        setBirthYear('');
        setBirthMonth('');
        setVaccinated('');
        onClose();
    };

    const modalContent = (
        <AnimatePresence>
            {isOpen && (
                <div className={styles.overlay} onClick={onClose}>
                    <motion.div
                        onClick={(e) => e.stopPropagation()} // Prevent clicking inside modal from closing it
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className={styles.modal}
                    >
                        <div className={styles.header}>
                            <h2 className={styles.title}>Add New Aranya</h2>
                            <button className={styles.closeButton} onClick={onClose}>
                                <X size={24} />
                            </button>
                        </div>

                        <div className={styles.body}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Animal Name or ID</label>
                                <input
                                    type="text"
                                    className={styles.input}
                                    placeholder="e.g., Cow-34 or Lakshmi"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>Category</label>
                                <div className={styles.selectContainer}>
                                    <select
                                        className={styles.select}
                                        value={category}
                                        onChange={(e) => {
                                            setCategory(e.target.value);
                                            setBreed(''); // Reset breed when category changes
                                        }}
                                    >
                                        <option value="" disabled>Select category</option>
                                        {Object.keys(dynamicCategories).map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                    <div className={styles.selectIcon}>
                                        <ChevronDown size={20} />
                                    </div>
                                </div>
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>Breed</label>
                                <div className={styles.selectContainer}>
                                    <select
                                        className={styles.select}
                                        value={breed}
                                        onChange={(e) => setBreed(e.target.value)}
                                        disabled={!category}
                                    >
                                        <option value="" disabled>{category ? 'Select breed' : 'Select a category first'}</option>
                                        {(dynamicCategories[category] || []).map(b => (
                                            <option key={b} value={b}>{b}</option>
                                        ))}
                                    </select>
                                    <div className={styles.selectIcon}>
                                        <ChevronDown size={20} />
                                    </div>
                                </div>
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>Gender</label>
                                <div className={styles.selectContainer}>
                                    <select
                                        className={styles.select}
                                        value={gender}
                                        onChange={(e) => setGender(e.target.value)}
                                    >
                                        <option value="" disabled>Select gender</option>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                    </select>
                                    <div className={styles.selectIcon}>
                                        <ChevronDown size={20} />
                                    </div>
                                </div>
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>Birth Month & Year</label>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <div style={{ flex: 1, position: 'relative' }}>
                                        <div className={styles.selectContainer}>
                                            <select
                                                className={styles.select}
                                                value={birthMonth}
                                                onChange={(e) => setBirthMonth(e.target.value)}
                                            >
                                                <option value="" disabled>Month</option>
                                                {Array.from({ length: 12 }, (_, i) => (
                                                    <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>
                                                ))}
                                            </select>
                                            <div className={styles.selectIcon}>
                                                <ChevronDown size={14} />
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ flex: 1.2, position: 'relative' }}>
                                        <input
                                            type="number"
                                            min="1980" max={new Date().getFullYear()}
                                            className={styles.input}
                                            placeholder="Year (YYYY)"
                                            value={birthYear}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                const currentYear = new Date().getFullYear();
                                                // Allow intermediate typing (like '2') but block invalid/future peaks
                                                if (val === '' || (parseInt(val) <= currentYear && val.length <= 4)) {
                                                    setBirthYear(val);
                                                }
                                            }}
                                            onBlur={(e) => {
                                                const val = parseInt(e.target.value);
                                                const currentYear = new Date().getFullYear();
                                                if (val < 1980) setBirthYear('1980');
                                                if (val > currentYear) setBirthYear(currentYear.toString());
                                            }}
                                        />
                                    </div>
                                </div>
                                <small style={{ color: '#64748b', marginTop: '4px', display: 'block' }}>Correct DOB is essential for Aranya growth models.</small>
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>Is your Aranya vaccinated?</label>

                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <div
                                        className={`${styles.radioCard} ${vaccinated === 'true' ? styles.radioCardSelectedYes : ''}`}
                                        onClick={() => setVaccinated('true')}
                                    >
                                        <div className={styles.radioRadio}>
                                            {vaccinated === 'true' && <motion.div layoutId="radioInner" className={styles.radioInner} />}
                                        </div>
                                        <span>Yes, vaccinated</span>
                                    </div>
                                    <div
                                        className={`${styles.radioCard} ${vaccinated === 'false' ? styles.radioCardSelectedNo : ''}`}
                                        onClick={() => setVaccinated('false')}
                                    >
                                        <div className={styles.radioRadio}>
                                            {vaccinated === 'false' && <motion.div layoutId="radioInner" className={styles.radioInner} />}
                                        </div>
                                        <span>No, not yet</span>
                                    </div>
                                </div>

                                <AnimatePresence mode="wait">
                                    {vaccinated === 'true' && (
                                        <motion.div
                                            key="vacc-yes"
                                            initial={{ opacity: 0, scale: 0.95, y: -5 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95, y: -5 }}
                                            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                                            style={{
                                                marginTop: '8px',
                                                padding: '8px 12px',
                                                backgroundColor: '#f0fdf4',
                                                borderLeft: '3px solid #22c55e',
                                                color: '#166534',
                                                borderRadius: '0 6px 6px 0',
                                                fontSize: '0.8rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px'
                                            }}
                                        >
                                            <div style={{ fontSize: '1rem' }}>🎉</div>
                                            <div style={{ lineHeight: '1.2' }}>
                                                <strong>Awesome.</strong> Vaccinated animals keep the herd safe.
                                            </div>
                                        </motion.div>
                                    )}
                                    {vaccinated === 'false' && (
                                        <motion.div
                                            key="vacc-no"
                                            initial={{ opacity: 0, scale: 0.95, y: -5 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95, y: -5 }}
                                            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                                            style={{
                                                marginTop: '8px',
                                                padding: '8px 12px',
                                                backgroundColor: '#fffbeb',
                                                borderLeft: '3px solid #f59e0b',
                                                color: '#b45309',
                                                borderRadius: '0 6px 6px 0',
                                                fontSize: '0.8rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px'
                                            }}
                                        >
                                            <div style={{ fontSize: '1rem' }}>💡</div>
                                            <div style={{ lineHeight: '1.2' }}>
                                                <strong>Heads up:</strong> Unvaccinated animals pose risks. Ask <strong>Arion</strong> for advice!
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        <div className={styles.footer}>
                            <button className={styles.cancelButton} onClick={onClose}>
                                Cancel
                            </button>
                            <button
                                className={styles.submitButton}
                                onClick={handleSubmit}
                                disabled={!name.trim() || !category || !breed || !gender || vaccinated === ''}
                                style={{ opacity: (!name.trim() || !category || !breed || !gender || vaccinated === '') ? 0.5 : 1, cursor: (!name.trim() || !category || !breed || !gender || vaccinated === '') ? 'not-allowed' : 'pointer' }}
                            >
                                Add Aranya
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );

    return createPortal(modalContent, document.body);
}
