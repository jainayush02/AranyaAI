import React, { useState, useEffect } from 'react';
import { User, Mail, Camera, Loader2, Check, X, Phone } from 'lucide-react';
import axios from 'axios';
import { motion } from 'framer-motion';
import styles from './Profile.module.css';

export default function Profile() {
    const [user, setUser] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [fullName, setFullName] = useState('');
    const [mobile, setMobile] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [pendingImage, setPendingImage] = useState(null);
    const [previewUrl, setPreviewUrl] = useState('');
    const [imgError, setImgError] = useState(false);
    const fileInputRef = React.useRef(null);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            try {
                const parsed = JSON.parse(storedUser);
                setUser(parsed);
                setFullName(parsed.full_name || '');
                setMobile(parsed.mobile || '');
            } catch (e) { }
        }
    }, []);

    const getInitials = (u) => {
        if (!u) return 'U';
        if (u.full_name) {
            const parts = u.full_name.split(' ');
            if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
            return u.full_name.substring(0, 2).toUpperCase();
        }
        return u.email?.substring(0, 2).toUpperCase() || u.mobile?.substring(0, 2).toUpperCase() || 'U';
    };

    const handleImageSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setPendingImage(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handlePhotoSave = async () => {
        if (!pendingImage) return;

        const formData = new FormData();
        formData.append('profilePic', pendingImage);
        formData.append('email', user.email || '');
        formData.append('mobile', user.mobile || '');

        setIsUploading(true);
        try {
            const res = await axios.post('/api/auth/profile/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            const updatedUser = res.data.user;
            localStorage.setItem('user', JSON.stringify(updatedUser));
            setUser(updatedUser);
            setPendingImage(null);
            setPreviewUrl('');

            // Sync header
            window.location.reload();
        } catch (error) {
            console.error('Upload failed', error);
            alert('Failed to upload image.');
        } finally {
            setIsUploading(false);
        }
    };

    const handleSave = async () => {
        if (!fullName.trim() && !mobile.trim()) {
            setIsEditing(false);
            return;
        }

        if (fullName === user.full_name && mobile === user.mobile) {
            setIsEditing(false);
            return;
        }

        setIsSaving(true);
        try {
            // Save to backend
            const res = await axios.put('/api/auth/profile', {
                email: user.email,
                mobile: user.mobile, // Existing identifier
                new_mobile: mobile,
                full_name: fullName
            });

            // Update local state
            const updatedUser = res.data.user;
            localStorage.setItem('user', JSON.stringify(updatedUser));
            setUser(updatedUser);
            setIsEditing(false);

            // Dispatch a storage event so Layout.jsx (the generic Header) can pick it up optionally, 
            // or just reload to resync the header avatar
            window.location.reload();
        } catch (error) {
            console.error('Failed to save profile', error);
            alert('Failed to save profile updates.');
        } finally {
            setIsSaving(false);
        }
    };

    if (!user) return <div className="p-8">Loading profile...</div>;

    return (
        <div className={`container ${styles.pageContainer} animate-fade-in`}>
            <div className={styles.pageHeader}>
                <h1 className={styles.pageTitle}>Profile</h1>
                <p className={styles.pageSubtitle}>Manage your personal information</p>
            </div>

            <div className={styles.card}>
                <div className={styles.cardHeader}>
                    <User className={styles.cardIcon} size={28} />
                    <h2 className={styles.cardTitle}>Personal Information</h2>
                </div>

                <div className={styles.avatarContainer}>
                    <div className={styles.avatarWrapper}>
                        <div className={styles.avatar}>
                            {previewUrl ? (
                                <img src={previewUrl} alt="Preview" className={styles.avatarImage} />
                            ) : (user.profilePic && !imgError) ? (
                                <img
                                    src={user.profilePic.startsWith('/uploads') ? `http://127.0.0.1:5000${user.profilePic}` : user.profilePic}
                                    alt="Profile"
                                    className={styles.avatarImage}
                                    onError={() => setImgError(true)}
                                />
                            ) : (
                                getInitials(user)
                            )}
                        </div>
                        <button
                            className={styles.uploadBtn}
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                        >
                            <Camera size={16} />
                        </button>
                    </div>
                    <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        accept="image/*"
                        onChange={handleImageSelect}
                    />

                    {pendingImage && (
                        <div className={styles.photoActionsOverlay}>
                            <motion.button
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className={styles.confirmPhotoBtn}
                                onClick={handlePhotoSave}
                                disabled={isUploading}
                                title="Confirm New Photo"
                            >
                                {isUploading ? <Loader2 className="spin" size={20} /> : <Check size={20} />}
                            </motion.button>
                            <motion.button
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.1 }}
                                className={styles.cancelPhotoBtn}
                                onClick={() => { setPendingImage(null); setPreviewUrl(''); }}
                                title="Cancel"
                            >
                                <X size={20} />
                            </motion.button>
                        </div>
                    )}
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.label}>Full Name</label>
                    <input
                        type="text"
                        className={styles.input}
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        disabled={!isEditing}
                    />
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.label}>
                        <Mail size={16} /> Email
                    </label>
                    <input
                        type="email"
                        className={styles.input}
                        value={user.email || ''}
                        placeholder="Not set"
                        disabled
                    />
                    <span className={styles.helpText}>Email cannot be changed</span>
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.label}>
                        <Phone size={16} /> Mobile Number
                    </label>
                    <input
                        type="tel"
                        className={styles.input}
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value)}
                        disabled={!isEditing}
                        placeholder="Not set"
                    />
                    <span className={styles.helpText}>Used for secure login</span>
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.label}>Role</label>
                    <div className={styles.roleBox}>
                        {user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'User'}
                    </div>
                </div>

                <div className={styles.actionArea}>
                    {isEditing ? (
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button className={styles.saveBtn} onClick={handleSave}>Save Changes</button>
                            <button
                                className="btn-secondary"
                                onClick={() => {
                                    setIsEditing(false);
                                    setFullName(user.full_name || '');
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <button className={styles.saveBtn} onClick={() => setIsEditing(true)}>
                            Edit Profile
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
