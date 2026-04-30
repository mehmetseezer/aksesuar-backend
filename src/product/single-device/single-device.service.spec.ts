// src/product/single-device/single-device.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { SingleDeviceService } from './single-device.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { MovementType, DeviceStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

// PrismaService için mock
const mockPrismaService = () => ({
  singleDevice: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  stockMovement: {
    create: jest.fn(),
  },
});

describe('SingleDeviceService', () => {
  let service: SingleDeviceService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SingleDeviceService,
        { provide: PrismaService, useFactory: mockPrismaService },
      ],
    }).compile();

    service = module.get<SingleDeviceService>(SingleDeviceService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const companyId = 1;
    const dto = {
      imei: '123456789012345',
      name: 'Test Phone',
      purchase_price: 1000,
      selling_price: 1500,
      status: DeviceStatus.IN_STOCK,
    };

    it('should create a new used product and add stock movement if status is IN_STOCK', async () => {
      const createdProduct = { id: 1, ...dto, company_id: companyId };
      prisma.singleDevice.findUnique.mockResolvedValue(null);
      prisma.singleDevice.create.mockResolvedValue(createdProduct);
      prisma.stockMovement.create.mockResolvedValue({});

      const result = await service.create(companyId, dto as any);

      expect(prisma.singleDevice.findUnique).toHaveBeenCalledWith({
        where: { imei: dto.imei },
      });
      expect(prisma.singleDevice.create).toHaveBeenCalledWith({
        data: { company_id: companyId, ...dto },
      });
      expect(prisma.stockMovement.create).toHaveBeenCalledWith({
        data: {
          company_id: companyId,
          single_device_id: createdProduct.id,
          type: MovementType.IN,
          quantity: 1,
          reason: 'Ürün stoğa eklendi',
        },
      });
      expect(result).toEqual(createdProduct);
    });

    it('should throw ConflictException if IMEI already exists', async () => {
      prisma.singleDevice.findUnique.mockResolvedValue({ id: 1 });

      await expect(service.create(companyId, dto as any)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.singleDevice.create).not.toHaveBeenCalled();
    });

    it('should not create stock movement if status is not IN_STOCK', async () => {
      const dtoNotInStock = { ...dto, status: DeviceStatus.SOLD };
      prisma.singleDevice.findUnique.mockResolvedValue(null);
      prisma.singleDevice.create.mockResolvedValue({ id: 2, ...dtoNotInStock });

      await service.create(companyId, dtoNotInStock as any);

      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    const companyId = 1;
    const pagination: PaginationDto = { page: 2, limit: 5 };

    it('should return paginated results', async () => {
      const mockData = [{ id: 1, name: 'Product A' }];
      const mockTotal = 12;

      prisma.singleDevice.findMany.mockResolvedValue(mockData);
      prisma.singleDevice.count.mockResolvedValue(mockTotal);

      const result = await service.findAll(companyId, pagination);

      expect(prisma.singleDevice.findMany).toHaveBeenCalledWith({
        where: { company_id: companyId, deleted_at: null },
        orderBy: { name: 'asc' },
        skip: 5, // (2-1)*5
        take: 5,
      });
      expect(result).toEqual({
        data: mockData,
        meta: {
          total: mockTotal,
          page: 2,
          limit: 5,
          totalPages: 3,
        },
      });
    });
  });

  describe('findByStatus', () => {
    const companyId = 1;
    const status = DeviceStatus.IN_STOCK;
    const pagination: PaginationDto = { page: 1, limit: 10 };

    it('should return paginated products filtered by status', async () => {
      const mockData = [{ id: 1, name: 'Product A', status }];
      const mockTotal = 5;

      prisma.singleDevice.findMany.mockResolvedValue(mockData);
      prisma.singleDevice.count.mockResolvedValue(mockTotal);

      const result = await service.findByStatus(companyId, status, pagination);

      expect(prisma.singleDevice.findMany).toHaveBeenCalledWith({
        where: { company_id: companyId, status, deleted_at: null },
        orderBy: { name: 'asc' },
        skip: 0,
        take: 10,
      });
      expect(result.data).toEqual(mockData);
      expect(result.meta.total).toBe(mockTotal);
    });
  });

  describe('findOne', () => {
    const companyId = 1;
    const productId = 1;

    it('should return a product with stock movements', async () => {
      const mockProduct = { id: productId, name: 'Product' };
      prisma.singleDevice.findFirst.mockResolvedValue(mockProduct);

      const result = await service.findOne(companyId, productId);

      expect(prisma.singleDevice.findFirst).toHaveBeenCalledWith({
        where: { id: productId, company_id: companyId, deleted_at: null },
        include: {
          stockMovements: {
            orderBy: { created_at: 'desc' },
            take: 10,
          },
        },
      });
      expect(result).toEqual(mockProduct);
    });

    it('should throw NotFoundException if product not found', async () => {
      prisma.singleDevice.findFirst.mockResolvedValue(null);

      await expect(service.findOne(companyId, productId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    const companyId = 1;
    const productId = 1;
    const existingProduct = {
      id: productId,
      imei: '111',
      name: 'Old',
      status: DeviceStatus.IN_STOCK,
    };

    it('should update product and create stock movement when status changes', async () => {
      const dto = { status: DeviceStatus.SOLD };
      prisma.singleDevice.findFirst.mockResolvedValue(existingProduct);
      prisma.singleDevice.findUnique.mockResolvedValue(null); // IMEI çakışması yok
      prisma.singleDevice.update.mockResolvedValue({
        ...existingProduct,
        ...dto,
      });
      prisma.stockMovement.create.mockResolvedValue({});

      const result = await service.update(companyId, productId, dto as any);

      expect(prisma.singleDevice.update).toHaveBeenCalledWith({
        where: { id: productId },
        data: dto,
      });
      expect(prisma.stockMovement.create).toHaveBeenCalledWith({
        data: {
          company_id: companyId,
          single_device_id: productId,
          type: MovementType.OUT,
          quantity: 1,
          reason: `Ürün durumu değişti: ${DeviceStatus.SOLD}`,
        },
      });
      expect(result).toBeDefined();
    });

    it('should throw ConflictException if new IMEI already exists', async () => {
      const dto = { imei: '222' };
      prisma.singleDevice.findFirst.mockResolvedValue(existingProduct);
      prisma.singleDevice.findUnique.mockResolvedValue({ id: 2 });

      await expect(
        service.update(companyId, productId, dto as any),
      ).rejects.toThrow(ConflictException);
      expect(prisma.singleDevice.update).not.toHaveBeenCalled();
    });

    it('should update without stock movement if status unchanged', async () => {
      const dto = { name: 'New Name' };
      prisma.singleDevice.findFirst.mockResolvedValue(existingProduct);
      prisma.singleDevice.update.mockResolvedValue({
        ...existingProduct,
        ...dto,
      });

      await service.update(companyId, productId, dto as any);

      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    const companyId = 1;
    const productId = 1;

    it('should soft delete the product', async () => {
      prisma.singleDevice.findFirst.mockResolvedValue({ id: productId });
      prisma.singleDevice.update.mockResolvedValue({
        id: productId,
        deleted_at: new Date(),
      });

      const result = await service.remove(companyId, productId);

      expect(prisma.singleDevice.update).toHaveBeenCalledWith({
        where: { id: productId },
        data: { deleted_at: expect.any(Date) },
      });
      expect(result.deleted_at).toBeDefined();
    });

    it('should throw NotFoundException if product not found', async () => {
      prisma.singleDevice.findFirst.mockResolvedValue(null);

      await expect(service.remove(companyId, productId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
