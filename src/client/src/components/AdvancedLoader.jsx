import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    BookOpen,
    User,
    HelpCircle,
    ShieldCheck,
    Home,
    PawPrint,
    Sparkles,
    Search,
    Fingerprint,
    Activity,
    Zap,
    Settings
} from 'lucide-react';

/**
 * AdvancedLoader: The definitive "Aranya Sanctuary" Experience.
 * Features a high-end animated mesh gradient background and context-aware spirit animals.
 */
const AdvancedLoader = ({ type = "default", fullScreen = false, compact = false }) => {

    const CONFIG = {
        docs: { color: "#2d5f3f", icon: BookOpen },
        profile: { color: "#2d5f3f", icon: User },
        help: { color: "#2d5f3f", icon: HelpCircle },
        admin: { color: "#2d5f3f", icon: ShieldCheck },
        activity: { color: "#2d5f3f", icon: Activity },
        pricing: { color: "#2d5f3f", icon: Zap },
        settings: { color: "#2d5f3f", icon: Settings },
        home: { color: "#2d5f3f", icon: Home },
        default: { color: "#2d5f3f", icon: PawPrint }
    };

    const theme = CONFIG[type] || CONFIG.default;
    const Icon = theme.icon || BookOpen;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
                position: fullScreen ? 'fixed' : 'relative',
                inset: fullScreen ? 0 : 'auto',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: fullScreen ? 'rgba(255,255,255,0.98)' : 'transparent',
                backdropFilter: fullScreen ? 'blur(12px)' : 'none',
                WebkitBackdropFilter: fullScreen ? 'blur(12px)' : 'none',
                zIndex: fullScreen ? 9999 : 1,
                padding: compact ? '2rem 1rem' : '4rem 1rem',
                minHeight: fullScreen ? '100vh' : compact ? '120px' : '65vh',
            }}
        >
            <div style={{
                position: 'relative',
                width: compact ? '44px' : '56px',
                height: compact ? '44px' : '56px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                {/* Single subtle aura ripple */}
                <motion.div
                    animate={{
                        scale: [1, 2.2],
                        opacity: [0.3, 0]
                    }}
                    transition={{
                        duration: 2.2,
                        repeat: Infinity,
                        ease: "easeOut"
                    }}
                    style={{
                        position: 'absolute',
                        width: '100%',
                        height: '100%',
                        border: `1.2px solid ${theme.color}25`,
                        borderRadius: '50%'
                    }}
                />

                {/* Core Spirit Icon */}
                <motion.div
                    animate={{
                        scale: [0.94, 1.06, 0.94],
                        opacity: [0.8, 1, 0.8]
                    }}
                    transition={{
                        duration: 2.5,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                >
                    <Icon
                        size={compact ? 24 : 32}
                        color={theme.color}
                        strokeWidth={1.5}
                    />
                </motion.div>
            </div>
        </motion.div>
    );
};

export default AdvancedLoader;
