import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './GenerativeArt.module.css';

const silhouettes = [
    // Abstract Cow
    "M 150,150 Q 180,120 220,130 Q 250,150 240,180 Q 230,220 180,240 Q 140,240 100,210 Q 70,180 80,140 Q 100,100 150,150 M 120,130 Q 110,100 130,90 M 180,130 Q 190,100 170,90",
    // Abstract Sheep
    "M 150,120 Q 180,100 210,120 Q 240,150 210,180 Q 180,200 150,180 Q 120,200 90,180 Q 60,150 90,120 Q 120,100 150,120",
    // Abstract Goat
    "M 140,160 Q 160,140 180,160 Q 190,190 170,220 Q 140,240 110,220 Q 90,190 100,160 Q 120,140 140,160 M 130,150 Q 120,110 135,100 M 150,150 Q 160,110 145,100",
    // Abstract Pig/Swine
    "M 150,180 Q 190,180 210,150 Q 190,120 150,120 Q 110,120 90,150 Q 110,180 150,180 M 140,160 Q 150,170 160,160 M 100,140 Q 90,120 110,110 M 200,140 Q 210,120 190,110",
    // Abstract Rooster/Bird
    "M 150,160 Q 180,150 200,110 Q 170,110 150,130 Q 130,110 100,110 Q 120,150 150,160 M 150,100 L 150,80 M 140,90 L 130,80 M 160,90 L 170,80",
    // Abstract Plant/Nature (Aranya theme)
    "M 150,250 L 150,150 M 150,200 Q 120,170 100,180 Q 120,200 150,200 M 150,180 Q 180,150 200,160 Q 180,180 150,180"
];

const GenerativeArt = () => {
    const [index, setIndex] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setIndex((prev) => (prev + 1) % silhouettes.length);
        }, 5000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className={styles.minimalWrapper}>
            {/* Soft Ambient Glows */}
            <div className={styles.glowGroup}>
                <motion.div
                    animate={{
                        x: [0, 50, -50, 0],
                        y: [0, -30, 40, 0],
                        scale: [1, 1.2, 0.9, 1]
                    }}
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                    className={styles.softGlow1}
                />
                <motion.div
                    animate={{
                        x: [0, -40, 60, 0],
                        y: [0, 50, -20, 0],
                        scale: [1, 0.8, 1.3, 1]
                    }}
                    transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                    className={styles.softGlow2}
                />
            </div>

            {/* The Morphing Line Art */}
            <div className={styles.lineArtContainer}>
                <svg viewBox="0 0 300 300" className={styles.morphSvg}>
                    <defs>
                        <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.8" />
                            <stop offset="100%" stopColor="#16a34a" stopOpacity="0.4" />
                        </linearGradient>
                    </defs>
                    <motion.path
                        key={index}
                        d={silhouettes[index]}
                        fill="none"
                        stroke="url(#lineGrad)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: 1 }}
                        exit={{ pathLength: 0, opacity: 0 }}
                        transition={{
                            duration: 3,
                            ease: "easeInOut",
                            pathLength: { duration: 3, ease: "easeInOut" }
                        }}
                    />

                    {/* Very subtle floating nodes on the path */}
                    {[...Array(5)].map((_, i) => (
                        <motion.circle
                            key={`node-${index}-${i}`}
                            r="3"
                            fill="#16a34a"
                            initial={{ opacity: 0 }}
                            animate={{
                                opacity: [0, 0.8, 0],
                                scale: [1, 1.5, 1]
                            }}
                            transition={{
                                duration: 4,
                                repeat: Infinity,
                                delay: i * 0.8,
                                ease: "easeInOut"
                            }}
                            cx={150 + Math.sin(i) * 50}
                            cy={150 + Math.cos(i) * 50}
                        />
                    ))}
                </svg>
            </div>

            {/* Interactive Floating Particles (Very Sparse & Slow) */}
            <div className={styles.particleField}>
                {[...Array(12)].map((_, i) => (
                    <motion.div
                        key={i}
                        className={styles.sparseParticle}
                        animate={{
                            y: [0, -100, 0],
                            x: [0, Math.sin(i) * 30, 0],
                            opacity: [0.1, 0.3, 0.1]
                        }}
                        transition={{
                            duration: 10 + i * 2,
                            repeat: Infinity,
                            ease: "easeInOut"
                        }}
                        style={{
                            left: `${10 + (i * 8)}%`,
                            top: `${Math.random() * 100}%`,
                            width: `${Math.random() * 4 + 2}px`,
                            height: `${Math.random() * 4 + 2}px`,
                        }}
                    />
                ))}
            </div>
        </div>
    );
};

export default GenerativeArt;
