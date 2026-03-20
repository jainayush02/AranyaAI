const mongoose = require('mongoose');

const DocArticleSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    category: { type: String, enum: ['getting-started', 'features', 'video-tutorials'], required: true },
    content: { type: String, default: '' },
    steps: [{ type: String }],
    videoUrl: { type: String, default: null }, // Path or URL to the video file
    videoTitle: { type: String, default: null },
    cloudFileId: { type: String, default: null }, // Unique ID from cloud provider (ImageKit/Cloudinary) for deletion
    order: { type: Number, default: 0 },
    published: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('DocArticle', DocArticleSchema);
