import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

const AdvancedLoader = () => {
    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #f0fdf4 0%, #fafaf7 100%)',
            zIndex: 9999,
        }}>
            {/* Base Container - Balanced at 140px for clarity and elegance */}
            <div style={{ position: 'relative', width: '140px', height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

                {/* 1. Large Ambient Aura (Static position, pulsing scale) */}
                <motion.div
                    animate={{
                        scale: [1, 1.4, 1],
                        opacity: [0.1, 0.25, 0.1]
                    }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    style={{
                        position: 'absolute',
                        inset: '-20px',
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(45, 95, 63, 0.15) 0%, transparent 70%)',
                        filter: 'blur(25px)'
                    }}
                />

                {/* 2. Outer Dotted Orbit (Slow rotation) */}
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                    style={{
                        position: 'absolute',
                        inset: '0',
                        borderRadius: '50%',
                        border: '1.5px dashed rgba(45, 95, 63, 0.12)',
                    }}
                />

                {/* 3. Main Energy Ring (Medium speed) */}
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    style={{
                        position: 'absolute',
                        inset: '12px',
                        borderRadius: '50%',
                        border: '2.5px solid transparent',
                        borderTop: '2.5px solid #2d5f3f',
                        filter: 'drop-shadow(0 0 5px rgba(45, 95, 63, 0.2))'
                    }}
                />

                {/* 4. Inner Cyan Ring (Counter-rotating) */}
                <motion.div
                    animate={{ rotate: -360 }}
                    transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                    style={{
                        position: 'absolute',
                        inset: '30px',
                        borderRadius: '50%',
                        border: '1px solid rgba(48, 163, 230, 0.1)',
                        borderBottom: '2px solid #30a3e6'
                    }}
                />

                {/* 5. Central Symbolic Core */}
                <div style={{
                    position: 'absolute',
                    inset: '0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <motion.div
                        animate={{
                            scale: [0.95, 1.05, 0.95],
                            filter: [
                                'drop-shadow(0 0 2px rgba(45,95,63,0.2))',
                                'drop-shadow(0 0 12px rgba(45,95,63,0.5))',
                                'drop-shadow(0 0 2px rgba(45,95,63,0.2))'
                            ]
                        }}
                        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                    >
                        <Sparkles size={36} color="#2d5f3f" strokeWidth={2} />
                    </motion.div>
                </div>

                {/* 6. Satellite Particles (Elegant orbiting dots) */}
                {[...Array(3)].map((_, i) => (
                    <motion.div
                        key={i}
                        animate={{ rotate: 360 }}
                        transition={{ duration: 6 + (i * 2), repeat: Infinity, ease: "linear" }}
                        style={{
                            position: 'absolute',
                            inset: '0',
                            pointerEvents: 'none'
                        }}
                    >
                        <motion.div
                            animate={{ opacity: [0.4, 1, 0.4] }}
                            transition={{ duration: 2, repeat: Infinity, delay: i * 0.5 }}
                            style={{
                                position: 'absolute',
                                top: i === 1 ? '10%' : '5%',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: i === 1 ? '#30a3e6' : '#2d5f3f',
                                boxShadow: '0 0 8px rgba(0,0,0,0.1)'
                            }}
                        />
                    </motion.div>
                ))}
            </div>

            {/* Background Atmosphere (Very subtle floating embers) */}
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
                {[...Array(8)].map((_, i) => (
                    <motion.div
                        key={i}
                        initial={{
                            x: Math.random() * 100 + '%',
                            y: '110%'
                        }}
                        animate={{
                            y: '-10%',
                            opacity: [0, 0.15, 0]
                        }}
                        transition={{
                            duration: 7 + Math.random() * 5,
                            repeat: Infinity,
                            delay: Math.random() * 5
                        }}
                        style={{
                            position: 'absolute',
                            width: '3px',
                            height: '3px',
                            background: '#2d5f3f',
                            borderRadius: '50%',
                            filter: 'blur(1px)'
                        }}
                    />
                ))}
            </div>
        </div>
    );
};

export default AdvancedLoader;
