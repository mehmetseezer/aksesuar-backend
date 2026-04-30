import { Test, TestingModule } from '@nestjs/testing';
import { BulkProductController } from './bulk-product.controller';

describe('BulkProductController', () => {
  let controller: BulkProductController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BulkProductController],
    }).compile();

    controller = module.get<BulkProductController>(BulkProductController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
