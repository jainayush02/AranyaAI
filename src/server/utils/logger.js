const ActivityLog = require('../models/ActivityLog');

/**
 * Logs an activity to the database
 * @param {string} type - 'admin', 'user', 'system', etc.
 * @param {object} user - The user object performing the action
 * @param {string} detail - Description of the action
 */
const logActivity = async (type, user, detail) => {
    try {
        await ActivityLog.create({
            type,
            user: user?.full_name || user?.email || 'Unknown',
            userId: user?._id || user?.id,
            detail
        });
    } catch (err) {
        console.error('Logging failed:', err.message);
    }
};

module.exports = { logActivity };
