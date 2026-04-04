const AnimalsService = require('../services/animals.service');
const Animal = require('../models/Animal');
const HealthLog = require('../models/HealthLog');
const User = require('../models/User');
const Plan = require('../models/Plan');

jest.mock('../models/Animal');
jest.mock('../models/HealthLog');
jest.mock('../models/User');
jest.mock('../models/Plan');

describe('AnimalsService', () => {
    test('createAnimal - should successfully create animal within plan limits', async () => {
        const mockUser = { id: 'u123', plan: 'free' };
        const mockPlan = { maxAnimals: 5 };
        User.findById.mockResolvedValue(mockUser);
        Plan.findOne.mockResolvedValue(mockPlan);
        Animal.countDocuments.mockResolvedValue(2);
        Animal.prototype.save = jest.fn().mockResolvedValue({ id: 'a123', name: 'Rocky' });

        const result = await AnimalsService.createAnimal('u123', 'owner', null, { name: 'Rocky', category: 'Dog', breed: 'Beagle', gender: 'Male' });
        expect(result.name).toBe('Rocky');
    });

    test('getAnimalsByUser - should return animals for specific owner', async () => {
        const mockAnimals = [{ name: 'Rocky' }, { name: 'Luna' }];
        Animal.find.mockReturnValue({ select: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(mockAnimals) }) }) });

        const result = await AnimalsService.getAnimals('u123', 'owner', null);
        expect(result.length).toBe(2);
    });
});
