import { Test, TestingModule } from '@nestjs/testing';
import { BulkProductService } from './bulk-product.service';

describe('BulkProductService', () => {
  let service: BulkProductService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BulkProductService],
    }).compile();

    service = module.get<BulkProductService>(BulkProductService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
