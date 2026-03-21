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

export default function EditAnimalDialog({ isOpen, onClose, onUpdate, animal }) {
    const [name, setName] = useState('');
    const [category, setCategory] = useState('');
    const [breed, setBreed] = useState('');
    const [gender, setGender] = useState('');
    const [birthYear, setBirthYear] = useState('');
    const [birthMonth, setBirthMonth] = useState('');
    const [vaccinated, setVaccinated] = useState('');
    const [dynamicCategories, setDynamicCategories] = useState(categoryBreeds);

    useEffect(() => {
        if (isOpen && animal) {
            setName(animal.name || '');
            setCategory(animal.category || '');
            setBreed(animal.breed || '');
            setGender(animal.gender || '');
            setVaccinated(animal.vaccinated ? 'true' : 'false');
            
            if (animal.dob) {
                const date = new Date(animal.dob);
                setBirthYear(date.getFullYear().toString());
                setBirthMonth((date.getMonth() + 1).toString());
            }
        }
    }, [isOpen, animal]);

    useEffect(() => {
        if (!isOpen) return;
        fetch('/api/settings')
            .then(r => r.json())
            .then(data => {
                if (data?.animal_categories && Object.keys(data.animal_categories).length > 0) {
                    setDynamicCategories(data.animal_categories);
                }
            })
            .catch(() => {});
    }, [isOpen]);

    const handleSubmit = () => {
        if (!name.trim() || !category || !breed || !gender || vaccinated === '') return;

        const d = new Date(animal.dob || Date.now());
        if (birthYear) d.setFullYear(parseInt(birthYear));
        if (birthMonth) d.setMonth(parseInt(birthMonth) - 1);

        onUpdate({ 
            name: name.trim(), 
            category, 
            breed, 
            dob: d.toISOString(), 
            vaccinated: vaccinated === 'true', 
            gender 
        });
        onClose();
    };

    const modalContent = (
        <AnimatePresence>
            {isOpen && (
                <div className={styles.overlay} onClick={onClose}>
                    <motion.div
                        onClick={(e) => e.stopPropagation()}
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className={styles.modal}
                    >
                        <div className={styles.header}>
                            <h2 className={styles.title}>Edit Aranya Details</h2>
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
                                            setBreed('');
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
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>Is your Aranya vaccinated?</label>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <div
                                        className={`${styles.radioCard} ${vaccinated === 'true' ? styles.radioCardSelectedYes : ''}`}
                                        onClick={() => setVaccinated('true')}
                                    >
                                        <div className={styles.radioRadio}>
                                            {vaccinated === 'true' && <motion.div layoutId="radioInnerEdit" className={styles.radioInner} />}
                                        </div>
                                        <span>Yes</span>
                                    </div>
                                    <div
                                        className={`${styles.radioCard} ${vaccinated === 'false' ? styles.radioCardSelectedNo : ''}`}
                                        onClick={() => setVaccinated('false')}
                                    >
                                        <div className={styles.radioRadio}>
                                            {vaccinated === 'false' && <motion.div layoutId="radioInnerEdit" className={styles.radioInner} />}
                                        </div>
                                        <span>No</span>
                                    </div>
                                </div>
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
                                Save Changes
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );

    return createPortal(modalContent, document.body);
}
