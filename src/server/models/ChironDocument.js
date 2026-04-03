const mongoose = require('mongoose');

const ChironDocumentSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    document_name: {
        type: String,
        required: true
    },
    original_filename: {
        type: String,
        required: true
    },
    file_type: {
        type: String,
        enum: ['pdf', 'docx', 'txt', 'png', 'jpg', 'jpeg'],
        required: true
    },
    file_size_kb: {
        type: Number,
        required: true
    },
    uploaded_at: {
        type: Date,
        default: Date.now
    },
    chunks_count: {
        type: Number,
        default: 0
    },
    entities_count: {
        type: Number,
        default: 0
    },
    relationships_count: {
        type: Number,
        default: 0
    },
    embedding_model: {
        type: String,
        default: 'sentence-transformers/all-MiniLM-L6-v2'
    },
    vector_db_refs: [{
        type: String  // Qdrant vector IDs
    }],
    lightrag_doc_id: {
        type: String  // Reference in LightRAG graph
    },
    source_url: {
        type: String,  // If ingested from URL
        default: null
    },
    status: {
        type: String,
        enum: ['pending', 'ingesting', 'complete', 'failed'],
        default: 'pending'
    },
    error_message: {
        type: String,
        default: null
    },
    ingestion_time_ms: {
        type: Number,
        default: 0
    },
    metadata: {
        pages: Number,
        language: String,
        summary: String
    }
}, { timestamps: true });
ChironDocumentSchema.index({ user_id: 1, uploaded_at: -1 });

module.exports = mongoose.model('ChironDocument', ChironDocumentSchema);
