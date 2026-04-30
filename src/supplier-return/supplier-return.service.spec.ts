import { Test, TestingModule } from '@nestjs/testing';
import { SupplierReturnService } from './supplier-return.service';

describe('SupplierReturnService', () => {
  let service: SupplierReturnService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SupplierReturnService],
    }).compile();

    service = module.get<SupplierReturnService>(SupplierReturnService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
