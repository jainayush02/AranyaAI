import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Check, Zap } from 'lucide-react';
import axios from 'axios';
import styles from './Billing.module.css';

export default function Billing() {
    const navigate = useNavigate();
    const [prices, setPrices] = useState({
        proPrice: 499,
        freeLimit: 5,
        plans: []
    });

    useEffect(() => {
        const fetchPricing = async () => {
            try {
                const res = await axios.get('/api/settings');
                // Ensure we handle numeric strings correctly
                if (res.data.proPrice) setPrices(prev => ({ ...prev, proPrice: Number(res.data.proPrice) }));
                if (res.data.freeLimit) setPrices(prev => ({ ...prev, freeLimit: Number(res.data.freeLimit) }));
                if (res.data.plans) setPrices(prev => ({ ...prev, plans: typeof res.data.plans === 'string' ? JSON.parse(res.data.plans) : res.data.plans }));

            } catch (err) {
                console.error("Failed to fetch platform pricing:", err);
            }
        };
        fetchPricing();
    }, []);

    return (
        <div className={`container ${styles.pageContainer} animate-fade-in`}>
            <div className={styles.pageHeader}>
                <h1 className={styles.pageTitle}>Billing</h1>
                <p className={styles.pageSubtitle}>Manage your billing and subscription</p>
            </div>

            <div className={styles.plansGrid}>
                {(prices.plans.length > 0 ? prices.plans : [
                    { id: 'free', name: 'Free Plan', price: '0', isRecommended: false, features: `Up to ${prices.freeLimit} animals\nBasic health tracking\nAI veterinary assistant\nWeekly reports`, cta: 'Current Plan' },
                    { id: 'pro', name: 'Pro Plan', price: prices.proPrice, isRecommended: true, features: 'Unlimited animals\nAdvanced analytics\nPriority support\nCustom reports\nMultiple users', cta: 'Upgrade to this Plan' },
                    { id: 'enterprise', name: 'Enterprise Plan', price: 'Custom', isRecommended: false, features: 'Everything in Pro\nDedicated support\nCustom integrations\nAPI access\nOn-site training', cta: 'Contact Sales' }
                ]).map((plan) => (
                    <div key={plan.id} className={`${styles.planCard} ${plan.isRecommended ? styles.recommended : ''}`}>
                        {plan.isRecommended && <div className={styles.recommendedBadge}>Recommended</div>}
                        <div className={styles.planName}>{plan.name}</div>
                        <div className={styles.planPrice}>
                            {isNaN(Number(plan.price)) ? plan.price : `₹${plan.price}`}
                            {!isNaN(Number(plan.price)) && <span className={styles.month}>/month</span>}
                        </div>

                        <ul className={styles.featureList}>
                            {plan.features.split('\n').filter(f => f.trim()).map((feature, i) => (
                                <li key={i} className={styles.featureItem}>
                                    <Check className={styles.featureIcon} size={18} /> {feature}
                                </li>
                            ))}
                        </ul>

                        <button
                            className={`${styles.btnPlan} ${plan.isRecommended ? styles.btnPro : (plan.price === '0' ? styles.btnCurrent : styles.btnEnterprise)}`}
                            disabled={plan.price === '0'}
                        >
                            {plan.price !== '0' && <Zap size={16} />} {plan.cta || 'Select Plan'}
                        </button>
                    </div>
                ))}
            </div>

            <div className={styles.card}>
                <div className={styles.cardHeader}>
                    <CreditCard className={styles.cardIcon} size={24} />
                    <h2 className={styles.cardTitle}>Payment Method</h2>
                </div>

                <p className={styles.paymentText}>
                    No payment method added yet
                </p>

                <button className={styles.addPaymentBtn}>
                    Add Payment Method
                </button>
            </div>
        </div>
    );
}
