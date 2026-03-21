import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { CreditCard, Check, Zap } from 'lucide-react';
import axios from 'axios';
import styles from './Billing.module.css';

export default function Billing() {
    const navigate = useNavigate();
    const { user } = useOutletContext();
    const [prices, setPrices] = useState({ plans: [] });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchPricing = async () => {
            try {
                const token = localStorage.getItem('token');
                const config = { headers: { Authorization: `Bearer ${token}` } };
                const res = await axios.get('/api/plans', config);
                
                const mappedPlans = res.data.map(dbPlan => {
                    let f = [];
                    f.push(dbPlan.maxAnimals === -1 ? 'Unlimited Animals' : `${dbPlan.maxAnimals} Animal Capacity`);
                    f.push(dbPlan.dailyChatMessages === -1 ? 'Unlimited AI Pings' : `${dbPlan.dailyChatMessages} AI Pings / day`);
                    f.push(dbPlan.medicalVaultStorageMB === -1 ? 'Unlimited Vault' : `${dbPlan.medicalVaultStorageMB} MB Vault Storage`);
                    if (dbPlan.maxCareCircleMembers === -1) f.push('Unlimited Care Circle');
                    else f.push(`${dbPlan.maxCareCircleMembers} Care Circle Members`);
                    if (dbPlan.allowExport) f.push('Digital Data Export');
                    if (dbPlan.allowBulkImport) f.push('Bulk CSV Import');
                    if (dbPlan.allowAdvancedAI) f.push('Advanced AI Models');
                    
                    const isCurrent = user?.plan === dbPlan.code || (dbPlan.isDefault && !user?.plan);
                    
                    return {
                        id: dbPlan._id,
                        code: dbPlan.code,
                        name: dbPlan.name,
                        price: dbPlan.price.toString(),
                        isRecommended: dbPlan.isRecommended,
                        features: f.join('\n'),
                        cta: isCurrent ? 'Current Plan' : (dbPlan.price === 0 ? 'Select Plan' : 'Upgrade to this Plan'),
                        isCurrent
                    };
                });
                setPrices({ plans: mappedPlans });
            } catch (err) {
                console.error("Failed to fetch platform pricing:", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchPricing();
    }, [user]);

    return (
        <div className={`container ${styles.pageContainer} animate-fade-in`}>
            <div className={styles.pageHeader}>
                <h1 className={styles.pageTitle}>Billing</h1>
                <p className={styles.pageSubtitle}>Manage your billing and subscription</p>
            </div>

            <div className={styles.plansGrid}>
                {isLoading ? (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem', color: '#64748b', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: '2rem', height: '2rem', border: '3px solid #e2e8f0', borderTopColor: '#166534', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '1rem' }} />
                        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                        <span>Loading billing plans...</span>
                    </div>
                ) : (
                    prices.plans.map((plan) => (
                        <div key={plan.id} className={`${styles.planCard} ${plan.isRecommended ? styles.recommended : ''}`}>
                            {plan.isRecommended && <div className={styles.recommendedBadge}>Recommended</div>}
                            <div className={styles.planName}>{plan.name}</div>
                            <div className={styles.planPrice}>
                                {plan.price === '0' ? 'FREE' : `₹${plan.price}`}
                                {plan.price !== '0' && <span className={styles.month}>/month</span>}
                            </div>

                            <ul className={styles.featureList}>
                                {plan.features.split('\n').filter(f => f.trim()).map((feature, i) => (
                                    <li key={i} className={styles.featureItem}>
                                        <Check className={styles.featureIcon} size={18} /> {feature}
                                    </li>
                                ))}
                            </ul>

                            <button
                                className={`${styles.btnPlan} ${plan.isRecommended ? styles.btnPro : (plan.isCurrent ? styles.btnCurrent : styles.btnEnterprise)}`}
                                disabled={plan.isCurrent}
                            >
                                {plan.price !== '0' && !plan.isCurrent && <Zap size={16} />} {plan.cta}
                            </button>
                        </div>
                    )))}
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
