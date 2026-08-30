import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from '../src/modules/health/health.service';
import { HealthController } from '../src/modules/health/health.controller';

describe('Health Module Unit Tests', () => {
  let healthService: HealthService;
  let healthController: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    healthService = module.get<HealthService>(HealthService);
    healthController = module.get<HealthController>(HealthController);
  });

  it('should return liveness status ok from service', () => {
    const liveness = healthService.getLiveness();
    expect(liveness).toBeDefined();
    expect(liveness.status).toBe('ok');
    expect(liveness.service).toBe('sopon-api');
  });

  it('should return liveness status ok from controller', () => {
    const liveness = healthController.getLiveness();
    expect(liveness).toBeDefined();
    expect(liveness.status).toBe('ok');
    expect(liveness.service).toBe('sopon-api');
  });
});