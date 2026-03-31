# Chiron Intelligence - System Prompt Instructions

## Purpose
Chiron Intelligence is the Knowledge Base RAG mode. It retrieves information from ingested veterinary manuals and documents, then synthesizes personalized answers combined with the user's pet profile.

## When Active
- User toggles chat mode to **Chiron** (cyan/teal icon)
- System retrieves relevant documents from Pinecone vector DB
- Answers are grounded in actual veterinary knowledge + pet context

## System Prompt Template

```
[PET_PROFILES]
{User's pet information loaded from database}
[PET_PROFILES_END]

[CHIRON_KNOWLEDGE_BASE]
Use the following knowledge base documents to inform your answer. 
Synthesize a personalized response combining this knowledge with the pet's profile:

{Retrieved documents from Pinecone}
[CHIRON_KNOWLEDGE_BASE_END]

[CHIRON_MODE]
{Chiron prompt instruction}
[CHIRON_MODE_END]
```

## Default Chiron Prompt
```
You are Chiron Intelligence, an expert veterinary advisor powered by knowledge base documents.

Core Responsibilities:
1. **Ground Answers in Knowledge Base**: Always cite retrieved documents when providing advice
2. **Personalize to Pet Profile**: Consider the specific pet's age, breed, health status, and vital signs
3. **Extract Pet Name**: From user query (e.g., "My Rocky has..."), load Rocky's full profile
4. **Synthesize Knowledge**: Combine knowledge base insights with pet-specific context
5. **Cite Sources**: Include document sources in your response

Response Format:
- Lead with pet-specific advice
- Reference knowledge base documents: "[Source: document_name]"
- Provide actionable recommendations
- Suggest when professional veterinary care is needed
- Keep responses clear and avoid unnecessary medical jargon

Constraints:
- Never make up medical information not in knowledge base
- Always mention uncertainty or gaps in documentation
- Recommend professional vet consultation for serious conditions
- Respect documented diagnosis limitations
```

## Configuration in SystemSettings

The prompt can be customized in AdminPortal > Settings:

- **aranyaPrompt**: Personalized LLM mode (no knowledge base)
- **chironPrompt**: RAG mode with knowledge base (this one)
- **petContextInstruction**: Generic instruction for pet data formatting

## Document Retrieval Flow

1. User asks question in Chiron mode
2. Question is embedded using sentence-transformers (all-MiniLM-L6-v2, 384-dim vectors)
3. Query is sent to Pinecone with embedding
4. Top 5 most similar document chunks are retrieved
5. Chunks are injected into `[CHIRON_KNOWLEDGE_BASE]` block
6. LLM synthesizes answer using pet profile + knowledge base documents

## Example Query Flow

**User Input**: "My Rocky has a cough and seems lethargic"

**System Action**:
1. Extract pet name: "Rocky"
2. Load Rocky's profile: breed, age, health history, vitals
3. Query Pinecone: ["cough symptoms", "lethargy causes", "respiratory conditions"]
4. Retrieve top 5 chunks from ingested veterinary manuals
5. Construct prompt with pet context + knowledge base
6. LLM generates personalized response citing documents

**Expected Output**: 
- Discusses Rocky's specific breed predispositions
- References knowledge base documents on respiratory conditions
- Provides differential diagnoses
- Recommends whether professional vet visit is needed
- Cites sources from ingested documents

## Integration Points

**adminPortal.jsx**
- Chiron Intelligence tab for document ingestion
- Add, delete, manage knowledge base documents
- View ingestion statistics

**ChatBot.jsx**
- 3-mode cycling: search → aranya → chiron
- Cyan/teal icon indicates Chiron mode active
- Input placeholder: "Ask Chiron..."

**chat.js**
- Handles intelligenceType = 'chiron'
- Calls Pinecone via Python service (port 8006)
- Injects retrieved documents into system prompt

**chiron_embedding_service.py**
- Runs on port 8006
- POST /api/query: Takes user question, returns top 5 documents
- POST /api/ingest: Uploads documents (PDFs with OCR support)
- DELETE /api/delete-document: Removes from Pinecone

## Admin Configuration

Edit in AdminPortal > Settings > System Integrity & Protocol:

```javascript
{
  chironPrompt: "You are Chiron Intelligence, an expert veterinary advisor..."
}
```

Or in MongoDB SystemSettings collection:
```json
{
  "key": "chironPrompt",
  "value": "Your custom prompt here"
}
```

## Future Enhancements

- [ ] Fine-tuning on veterinary documents
- [ ] Multi-turn conversation with document memory
- [ ] Custom knowledge base per clinic/user
- [ ] Confidence scoring for retrieved documents
- [ ] Citation links to full document pages
