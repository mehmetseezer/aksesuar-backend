import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSingleDeviceDto } from './dto/create-single-device.dto';
import { UpdateSingleDeviceDto } from './dto/update-single-device.dto';
import { MovementType, DeviceStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginatedResult } from '../../common/interfaces/pagination.interface';

@Injectable()
export class SingleDeviceService {
  constructor(private prisma: PrismaService) { }

  async create(companyId: number, dto: CreateSingleDeviceDto) {
    const existing = await this.prisma.singleDevice.findUnique({
      where: {
        company_id_imei: {
          company_id: companyId,
          imei: dto.imei,
        },
      },
    });

    if (existing) {
      throw new ConflictException('Bu IMEI numarası zaten sistemde kayıtlı');
    }

    const product = await this.prisma.singleDevice.create({
      data: {
        ...dto,
        company: { connect: { id: companyId } },
      },
    } as any);

    if (product.status === DeviceStatus.IN_STOCK) {
      await this.prisma.stockMovement.create({
        data: {
          company_id: companyId,
          single_device_id: product.id,
          type: MovementType.IN,
          quantity: 1,
          reason: 'Ürün stoğa eklendi',
        },
      });
    }

    return product;
  }

  async findAll(
    companyId: number,
    pagination: PaginationDto,
    search?: string,
  ): Promise<PaginatedResult<any>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: any = {
      company_id: companyId,
      deleted_at: null,
    };

    if (search) {
      where.AND = [
        { company_id: companyId },
        { deleted_at: null },
        {
          OR: [
            { name: { contains: search } },
            { imei: { contains: search } },
          ],
        },
      ];
      delete where.company_id;
      delete where.deleted_at;
    }

    const [data, total, statsData] = await Promise.all([
      this.prisma.singleDevice.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.singleDevice.count({
        where,
      }),
      this.calculateStats(companyId),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      stats: statsData,
    };
  }

  private async calculateStats(companyId: number) {
    const [inStockData, totalSold] = await Promise.all([
      this.prisma.singleDevice.aggregate({
        where: {
          company_id: companyId,
          status: DeviceStatus.IN_STOCK,
          deleted_at: null,
        },
        _sum: { purchase_price: true },
        _count: { id: true },
      }),
      this.prisma.singleDevice.count({
        where: {
          company_id: companyId,
          status: DeviceStatus.SOLD,
          deleted_at: null,
        },
      }),
    ]);

    return {
      totalInStock: inStockData._count.id || 0,
      totalStockValue: Number(inStockData._sum.purchase_price || 0),
      totalSold: totalSold || 0,
    };
  }

  async findByStatus(
    companyId: number,
    status: DeviceStatus,
    pagination: PaginationDto,
    search?: string,
  ): Promise<PaginatedResult<any>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: any = {
      company_id: companyId,
      status,
      deleted_at: null,
    };

    if (search) {
      const orConditions: any[] = [
        { name: { contains: search } },
        { imei: { contains: search } },
      ];

      if (search.toUpperCase().startsWith('T') && /^\d+$/.test(search.substring(1))) {
        orConditions.push({ id: parseInt(search.substring(1)) });
      } else if (/^\d+$/.test(search) && search.length < 10) {
        orConditions.push({ id: parseInt(search) });
      }

      where.AND = [
        { company_id: companyId },
        { status },
        { deleted_at: null },
        {
          OR: orConditions,
        },
      ];
      delete where.company_id;
      delete where.status;
      delete where.deleted_at;
    }

    const [data, total, statsData] = await Promise.all([
      this.prisma.singleDevice.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.singleDevice.count({
        where,
      }),
      this.calculateStats(companyId),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      stats: statsData,
    };
  }

  async findOne(companyId: number, id: number) {
    const product = await this.prisma.singleDevice.findFirst({
      where: {
        id,
        company_id: companyId,
        deleted_at: null,
      },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    return product;
  }

  async findByImei(companyId: number, imei: string) {
    const product = await this.prisma.singleDevice.findFirst({
      where: {
        imei,
        company_id: companyId,
        deleted_at: null,
      },
    });

    if (!product) {
      throw new NotFoundException('Bu IMEI numarasına ait ürün bulunamadı');
    }

    return product;
  }

  async getCommercialHistory(
    companyId: number,
    id: number,
    pagination: PaginationDto,
  ) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [purchaseItems, saleItems, returnItems, supplierReturnItems] =
      await Promise.all([
        this.prisma.purchaseItem.findMany({
          where: { single_device_id: id, purchase: { company_id: companyId } },
          include: {
            purchase: {
              include: { supplier: true, customer: true, employee: true },
            },
          },
        }),
        this.prisma.saleItem.findMany({
          where: { single_device_id: id, sale: { company_id: companyId } },
          include: { sale: { include: { customer: true, employee: true } } },
        }),
        this.prisma.returnItem.findMany({
          where: { single_device_id: id, return: { company_id: companyId } },
          include: { return: { include: { customer: true, employee: true } } },
        }),
        this.prisma.supplierReturnItem.findMany({
          where: {
            single_device_id: id,
            supplierReturn: { company_id: companyId },
          },
          include: {
            supplierReturn: { include: { supplier: true, employee: true } },
          },
        }),
      ]);

    const allItems = [
      ...purchaseItems.map((item) => ({
        ...item,
        type: 'PURCHASE',
        date: item.purchase.created_at,
      })),
      ...saleItems.map((item) => ({
        ...item,
        type: 'SALE',
        date: item.sale.created_at,
      })),
      ...returnItems.map((item) => ({
        ...item,
        type: 'RETURN',
        date: item.return.created_at,
      })),
      ...supplierReturnItems.map((item) => ({
        ...item,
        type: 'SUPPLIER_RETURN',
        date: item.supplierReturn.created_at,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const total = allItems.length;
    const data = allItems.slice(skip, skip + limit);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getStockMovements(
    companyId: number,
    id: number,
    pagination: PaginationDto,
  ) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where: { single_device_id: id, company_id: companyId },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.stockMovement.count({
        where: { single_device_id: id, company_id: companyId },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async update(companyId: number, id: number, dto: UpdateSingleDeviceDto) {
    const product = await this.prisma.singleDevice.findFirst({
      where: { id, company_id: companyId, deleted_at: null },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    if (dto.imei && dto.imei !== product.imei) {
      const existing = await this.prisma.singleDevice.findUnique({
        where: {
          company_id_imei: {
            company_id: companyId,
            imei: dto.imei,
          },
        },
      });
      if (existing) {
        throw new ConflictException('Bu IMEI numarası zaten sistemde kayıtlı');
      }
    }

    const oldStatus = product.status;
    const newStatus = dto.status !== undefined ? dto.status : oldStatus;

    const updated = await this.prisma.singleDevice.update({
      where: { id },
      data: dto,
    });

    if (newStatus !== oldStatus) {
      let movementType: MovementType | null = null;
      let reason = '';

      if (
        newStatus === DeviceStatus.IN_STOCK &&
        oldStatus !== DeviceStatus.IN_STOCK
      ) {
        movementType = MovementType.IN;
        reason = 'Ürün stoğa geri alındı';
      } else if (
        newStatus !== DeviceStatus.IN_STOCK &&
        oldStatus === DeviceStatus.IN_STOCK
      ) {
        movementType = MovementType.OUT;
        reason = `Ürün durumu değişti: ${newStatus}`;
      }

      if (movementType) {
        await this.prisma.stockMovement.create({
          data: {
            company_id: companyId,
            single_device_id: id,
            type: movementType,
            quantity: 1,
            reason,
          },
        });
      }
    }

    return updated;
  }

  async remove(companyId: number, id: number) {
    const product = await this.prisma.singleDevice.findFirst({
      where: { id, company_id: companyId, deleted_at: null },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    if (product.status !== DeviceStatus.IN_STOCK) {
      throw new BadRequestException(
        'Sadece stokta olan cihazlar silinebilir. Satılmış veya iade edilmiş cihazlar finansal kayıtlara bağlı olduğu için silinemez.',
      );
    }

    await this.prisma.stockMovement.create({
      data: {
        company_id: companyId,
        single_device_id: id,
        type: MovementType.OUT,
        quantity: 1,
        reason: 'Ürün sistemden silindi (Soft Delete)',
      },
    });

    return this.prisma.singleDevice.update({
      where: { id },
      data: { deleted_at: new Date(), status: DeviceStatus.SOLD }, // SOLD veya başka bir pasif durum
    });
  }
}
