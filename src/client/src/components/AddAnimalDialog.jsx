import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronDown } from 'lucide-react';
import styles from './AddAnimalDialog.module.css';

const breeds = [
    "Holstein",
    "Jersey",
    "Gir",
    "Sahiwal",
    "redsindhi",
    "Tharparkar",
    "Rathi",
    "Hariana",
    "Kangayam"
];

export default function AddAnimalDialog({ isOpen, onClose, onAdd }) {
    const [name, setName] = useState('');
    const [breed, setBreed] = useState('');

    if (!isOpen) return null;

    const handleSubmit = () => {
        if (!name.trim() || !breed) return; // Basic validation
        onAdd({ name, breed });
        // Reset form
        setName('');
        setBreed('');
        onClose();
    };

    return (
        <AnimatePresence>
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
                        <h2 className={styles.title}>Add New Animal</h2>
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
                            <label className={styles.label}>Breed</label>
                            <div className={styles.selectContainer}>
                                <select
                                    className={styles.select}
                                    value={breed}
                                    onChange={(e) => setBreed(e.target.value)}
                                >
                                    <option value="" disabled>Select breed</option>
                                    {breeds.map(b => (
                                        <option key={b} value={b}>{b}</option>
                                    ))}
                                </select>
                                <div className={styles.selectIcon}>
                                    <ChevronDown size={20} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className={styles.footer}>
                        <button className={styles.cancelButton} onClick={onClose}>
                            Cancel
                        </button>
                        <button className={styles.submitButton} onClick={handleSubmit}>
                            Add Animal
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
