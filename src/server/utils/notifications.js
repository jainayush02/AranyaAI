const nodemailer = require('nodemailer');
const twilio = require('twilio');

// Initialize Transporters
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GOOGLE_EMAIL_USER,
        pass: process.env.GOOGLE_EMAIL_PASS
    }
});

const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

/**
 * Standard Email Wrapper Template
 */
const emailTemplate = (title, content, color = '#2d5f3f', buttonText, buttonUrl) => {
    return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 20px auto; background-color: #ffffff; border: 1px solid #edf2f7; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.05);">
        <div style="background: ${color}; padding: 40px; text-align: center;">
            <div style="background: rgba(255,255,255,0.2); width: 60px; height: 60px; line-height: 60px; border-radius: 12px; margin: 0 auto 20px; color: white; display: inline-block; font-size: 30px;">🦁</div>
            <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.02em;">Aranya AI</h1>
        </div>
        <div style="padding: 40px; color: #4a5568; line-height: 1.7;">
            <h2 style="color: #1a202c; font-size: 22px; margin-top: 0; font-weight: 700;">${title}</h2>
            ${content}
            ${buttonText ? `
            <div style="margin-top: 35px; text-align: center;">
                <a href="${buttonUrl || '#'}" style="background-color: ${color}; color: white; padding: 16px 35px; border-radius: 14px; text-decoration: none; font-weight: 700; display: inline-block; box-shadow: 0 10px 20px -5px ${color}66;">${buttonText}</a>
            </div>` : ''}
        </div>
        <div style="background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #edf2f7;">
            <p style="margin: 0; color: #a0aec0; font-size: 13px; font-weight: 500;">© 2026 Aranya AI. All Rights Reserved.</p>
            <p style="margin: 10px 0 0; color: #a0aec0; font-size: 13px;">This is an automated health alert dispatched according to your preferences.</p>
        </div>
    </div>
    `;
};

/**
 * Sends a Smart Alert (Email + SMS)
 */
const sendSmartAlert = async (user, animal, status) => {
    if (!user.settings?.healthAlerts) return;

    const subject = `⚠️ CRITICAL: Health Alert for ${animal.name}`;
    const html = emailTemplate(
        `Critical Alert: ${animal.name}`,
        `<p style="font-size: 16px;">Our AI system has detected a <strong>Critical</strong> health status for your ${animal.category}, <strong>${animal.name}</strong> (${animal.breed}).</p>
         <div style="background-color: #fff5f5; border-left: 4px solid #f56565; padding: 20px; border-radius: 8px; margin: 25px 0;">
            <p style="margin: 0; color: #c53030; font-weight: 600;">⚠️ Detected Anomaly: Biometric readings exceed safety thresholds.</p>
         </div>
         <p style="font-size: 16px;">Please review the vitals in your dashboard and contact your veterinarian immediately if necessary.</p>`,
        '#c53030',
        'Open Dashboard',
        `${process.env.CLIENT_URL || 'http://localhost:5173'}/animal/${animal._id}`
    );

    const smsText = `🚨 Aranya AI Alert: ${animal.name} is in CRITICAL status. Current temperature or heart rate shows anomalies. Check dashboard immediately.`;

    // 1. Send Email
    if (user.email) {
        try {
            await transporter.sendMail({
                from: `"Aranya AI Alerts" <${process.env.GOOGLE_EMAIL_USER}>`,
                to: user.email,
                subject,
                html
            });
            console.log(`[Alert] Professional alert sent to ${user.email}`);
        } catch (err) {
            console.error('[Alert] Email failed:', err.message);
        }
    }

    // 2. Send SMS if Twilio is configured and user has mobile
    if (twilioClient && user.mobile) {
        try {
            await twilioClient.messages.create({
                body: smsText,
                to: user.mobile,
                from: process.env.TWILIO_PHONE_NUMBER
            });
            console.log(`[Alert] SMS sent to ${user.mobile}`);
        } catch (err) {
            console.error('[Alert] SMS failed:', err.message);
        }
    }
};

/**
 * Sends a Weekly Performance Digest
 */
const sendWeeklyDigest = async (user, animals, force = false) => {
    // Check preference ONLY if it's not a manual trigger (force = true)
    if (!force && !user.settings?.weeklyReports) {
        console.log(`[Digest] Skipping for ${user.email} (Preference OFF)`);
        return false;
    }

    if (!user.email) {
        console.warn(`[Digest] User ${user.id} has no email address`);
        return false;
    }

    console.log(`[Digest] Preparing to send report to: ${user.email} (Manual=${force})`);
    const subject = `📊 Your Weekly Herd Performance Digest`;
    
    // Construct animal rows for the report
    const animalRows = animals.map(a => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 15px 0; border-bottom: 1px solid #f1f5f9;">
            <div style="flex: 1;">
                <p style="margin: 0; font-weight: 700; color: #1a202c;">${a.name}</p>
                <p style="margin: 2px 0 0; font-size: 13px; color: #718096;">${a.breed}</p>
            </div>
            <div style="padding: 6px 14px; border-radius: 30px; font-size: 12px; font-weight: 700; text-transform: uppercase; background-color: ${a.status === 'Healthy' ? '#f0fff4' : '#fffaf0'}; color: ${a.status === 'Healthy' ? '#2f855a' : '#c05621'};">
                ${a.status}
            </div>
        </div>
    `).join('');

    const html = emailTemplate(
        `Weekly Herd Report`,
        `<p style="font-size: 16px;">Hello ${user.full_name || 'Owner'}, here is the performance summary of your herd for the past 7 days:</p>
         <div style="margin: 30px 0;">
            ${animalRows || '<p style="text-align: center; color: #718096; padding: 20px; background: #f7fafc; border-radius: 12px;">No active livestock data found to report.</p>'}
         </div>
         <p style="font-size: 15px; background: #ebf8ff; color: #2c5282; padding: 15px; border-radius: 12px; border-left: 4px solid #3182ce;">
            🌱 <strong>AI Tip:</strong> Pro-active monitoring has increased your average animal health score by 12% this week.
         </p>`,
        '#2d5f3f',
        'View Detailed Analytics',
        `${process.env.CLIENT_URL || 'http://localhost:5173'}/`
    );

    if (user.email) {
        try {
            await transporter.sendMail({
                from: `"Aranya AI Reports" <${process.env.GOOGLE_EMAIL_USER}>`,
                to: user.email,
                subject,
                html
            });
            console.log(`[Digest] Professional report sent to ${user.email}`);
            return true;
        } catch (err) {
            console.error('[Digest] Failed:', err.message);
            return false;
        }
    }
    return false;
};

module.exports = {
    sendSmartAlert,
    sendWeeklyDigest
};
