import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import styles from './Toast.module.css';

const Toast = ({ id, message, type = 'success', onClose }) => {
    const icons = {
        success: <CheckCircle className={styles.successIcon} size={20} />,
        error: <AlertCircle className={styles.errorIcon} size={20} />,
        warning: <AlertTriangle className={styles.warningIcon} size={20} />,
        info: <Info className={styles.infoIcon} size={20} />
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 50, scale: 0.3 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
            className={`${styles.toast} ${styles[type]}`}
        >
            <div className={styles.icon}>
                {icons[type]}
            </div>
            <div className={styles.content}>
                <p className={styles.message}>{message}</p>
            </div>
            <button className={styles.closeBtn} onClick={() => onClose(id)}>
                <X size={16} />
            </button>
        </motion.div>
    );
};

export default Toast;
