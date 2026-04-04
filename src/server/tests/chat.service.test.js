const ChatService = require('../services/chat.service');
const ChatMessage = require('../models/ChatMessage');
const Conversation = require('../models/Conversation');
const Animal = require('../models/Animal');

jest.mock('../models/ChatMessage');
jest.mock('../models/Conversation');
jest.mock('../models/Animal');

describe('ChatService', () => {
    test('buildContextualPrompt - should inject pet profiles for matching query', async () => {
        const mockAnimals = [{ name: 'Rocky', breed: 'Beagle' }];
        Animal.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockAnimals) });
        
        const config = { systemPrompt: 'System!' };
        const result = await ChatService.buildContextualPrompt('u123', 'aranya', 'Tell me about Rocky', [], config);
        
        expect(result.systemPrompt).toContain('PET_PROFILES');
        expect(result.systemPrompt).toContain('Rocky');
    });

    test('saveConversation - should save AI message and potentially rename chat', async () => {
        const mockConv = { title: 'New Chat', save: jest.fn() };
        Conversation.findById.mockResolvedValue(mockConv);
        ChatMessage.prototype.save = jest.fn().mockResolvedValue({ _id: 'm123' });

        const result = await ChatService.saveConversation('u123', 'c123', 'First Message Here', 'AI Output', [], 'arion');
        expect(mockConv.title).toBe('First Message Here');
        expect(result._id).toBe('m123');
    });
});
