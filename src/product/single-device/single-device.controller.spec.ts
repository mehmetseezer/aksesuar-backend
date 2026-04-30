/// <reference types="jest" />

import { Test, TestingModule } from '@nestjs/testing';
import { SingleDeviceController } from './single-device.controller';
import { SingleDeviceService } from './single-device.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateSingleDeviceDto } from './dto/create-single-device.dto';
import { UpdateSingleDeviceDto } from './dto/update-single-device.dto';
import { DeviceStatus } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { CompanyId } from '../../auth/decorators/company.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';

// Servis mock'u
const mockSingleDeviceService = () => ({
  create: jest.fn(),
  findAll: jest.fn(),
  findByStatus: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
});

describe('SingleDeviceController', () => {
  let controller: SingleDeviceController;
  let service: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SingleDeviceController],
      providers: [
        { provide: SingleDeviceService, useFactory: mockSingleDeviceService },
      ],
    })
      // Guard'ları bypass etmek için override
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SingleDeviceController>(SingleDeviceController);
    service = module.get<SingleDeviceService>(SingleDeviceService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a used product', async () => {
      const companyId = 1;
      const dto: CreateSingleDeviceDto = {
        imei: '123456789012345',
        name: 'Test Telefon',
        purchase_price: 1000,
        selling_price: 1500,
      };
      const expectedResult = { id: 1, ...dto, company_id: companyId };

      service.create.mockResolvedValue(expectedResult);

      // @CompanyId() dekoratörünü simüle etmek için controller metodunu doğrudan çağırıyoruz
      const result = await controller.create(companyId, dto);

      expect(service.create).toHaveBeenCalledWith(companyId, dto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('findAll', () => {
    it('should return paginated products when no status filter', async () => {
      const companyId = 1;
      const pagination: PaginationDto = { page: 1, limit: 10 };
      const expectedResult = {
        data: [],
        meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
      };

      service.findAll.mockResolvedValue(expectedResult);

      const result = await controller.findAll(companyId, pagination);

      expect(service.findAll).toHaveBeenCalledWith(companyId, pagination);
      expect(service.findByStatus).not.toHaveBeenCalled();
      expect(result).toEqual(expectedResult);
    });

    it('should filter by status when status query is provided', async () => {
      const companyId = 1;
      const pagination: PaginationDto = { page: 1, limit: 10 };
      const status = DeviceStatus.IN_STOCK;
      const expectedResult = {
        data: [],
        meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
      };

      service.findByStatus.mockResolvedValue(expectedResult);

      const result = await controller.findAll(companyId, pagination, status);

      expect(service.findByStatus).toHaveBeenCalledWith(
        companyId,
        status,
        pagination,
      );
      expect(service.findAll).not.toHaveBeenCalled();
      expect(result).toEqual(expectedResult);
    });
  });

  describe('findOne', () => {
    it('should return a single used product', async () => {
      const companyId = 1;
      const productId = 1;
      const expectedResult = { id: productId, name: 'Test' };

      service.findOne.mockResolvedValue(expectedResult);

      const result = await controller.findOne(companyId, productId);

      expect(service.findOne).toHaveBeenCalledWith(companyId, productId);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('update', () => {
    it('should update a used product', async () => {
      const companyId = 1;
      const productId = 1;
      const dto: UpdateSingleDeviceDto = { name: 'Güncellenmiş İsim' };
      const expectedResult = { id: productId, name: 'Güncellenmiş İsim' };

      service.update.mockResolvedValue(expectedResult);

      const result = await controller.update(companyId, productId, dto);

      expect(service.update).toHaveBeenCalledWith(companyId, productId, dto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('remove', () => {
    it('should soft delete a used product', async () => {
      const companyId = 1;
      const productId = 1;

      service.remove.mockResolvedValue(undefined);

      await controller.remove(companyId, productId);

      expect(service.remove).toHaveBeenCalledWith(companyId, productId);
    });
  });
});
