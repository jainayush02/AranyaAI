import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import styles from './ConfirmDialog.module.css';

const ConfirmDialog = ({
    isOpen,
    onClose,
    onConfirm,
    title = "Confirm Action",
    message = "Are you sure you want to proceed?",
    confirmText = "Confirm",
    cancelText = "Cancel",
    type = "danger" // danger, warning, info
}) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className={styles.overlay}>
                    <motion.div
                        className={styles.modal}
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    >
                        <button className={styles.closeBtn} onClick={onClose}>
                            <X size={20} />
                        </button>

                        <div className={styles.content}>
                            <div className={`${styles.iconWrapper} ${styles[type]}`}>
                                {type === 'danger' && <AlertTriangle size={24} />}
                                {type === 'warning' && <AlertTriangle size={24} />}
                            </div>

                            <h3 className={styles.title}>{title}</h3>
                            <p className={styles.message}>{message}</p>
                        </div>

                        <div className={styles.footer}>
                            <button className={styles.cancelBtn} onClick={onClose}>
                                {cancelText}
                            </button>
                            <button
                                className={`${styles.confirmBtn} ${styles[type + 'Btn']}`}
                                onClick={() => {
                                    onConfirm();
                                    onClose();
                                }}
                            >
                                {confirmText}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default ConfirmDialog;
