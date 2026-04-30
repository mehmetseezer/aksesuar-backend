import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBulkProductDto } from './dto/create-bulk-product.dto';
import { UpdateBulkProductDto } from './dto/update-bulk-product.dto';
import { MovementType } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginatedResult } from '../../common/interfaces/pagination.interface';

@Injectable()
export class BulkProductService {
  constructor(private prisma: PrismaService) { }

  async create(companyId: number, dto: CreateBulkProductDto) {
    let barcode = dto.barcode;
    if (!barcode) {
      barcode = `868${Date.now()}`;
    }

    const existing = await this.prisma.bulkProduct.findFirst({
      where: {
        company_id: companyId,
        barcode: barcode,
        deleted_at: null,
      },
    });

    if (existing) {
      throw new ConflictException('Bu barkod zaten kayıtlı');
    }

    const product = await this.prisma.bulkProduct.create({
      data: {
        company_id: companyId,
        ...dto,
        barcode,
      },
    });

    if (product.quantity > 0) {
      await this.prisma.stockMovement.create({
        data: {
          company_id: companyId,
          bulk_product_id: product.id,
          type: MovementType.IN,
          quantity: product.quantity,
          reason: 'Başlangıç stoku',
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
      const orConditions: any[] = [
        { brand: { contains: search } },
        { model: { contains: search } },
        { barcode: { contains: search } },
      ];

      if (/^\d+$/.test(search) && search.length < 10) {
        orConditions.push({ id: parseInt(search) });
      }

      where.OR = orConditions;
    }

    const [data, total] = await Promise.all([
      this.prisma.bulkProduct.findMany({
        where,
        orderBy: [{ brand: 'asc' }, { model: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.bulkProduct.count({
        where,
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

  async findOne(companyId: number, id: number) {
    const product = await this.prisma.bulkProduct.findFirst({
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
          where: { bulk_product_id: id, purchase: { company_id: companyId } },
          include: {
            purchase: {
              include: { supplier: true, customer: true, employee: true },
            },
          },
        }),
        this.prisma.saleItem.findMany({
          where: { bulk_product_id: id, sale: { company_id: companyId } },
          include: { sale: { include: { customer: true, employee: true } } },
        }),
        this.prisma.returnItem.findMany({
          where: { bulk_product_id: id, return: { company_id: companyId } },
          include: { return: { include: { customer: true, employee: true } } },
        }),
        this.prisma.supplierReturnItem.findMany({
          where: {
            bulk_product_id: id,
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
        where: { bulk_product_id: id, company_id: companyId },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.stockMovement.count({
        where: { bulk_product_id: id, company_id: companyId },
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

  async update(companyId: number, id: number, dto: UpdateBulkProductDto) {
    const product = await this.prisma.bulkProduct.findFirst({
      where: { id, company_id: companyId, deleted_at: null },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    if (dto.barcode && dto.barcode !== product.barcode) {
      const existing = await this.prisma.bulkProduct.findFirst({
        where: {
          company_id: companyId,
          barcode: dto.barcode,
          deleted_at: null,
          NOT: { id },
        },
      });
      if (existing) {
        throw new ConflictException(
          'Bu barkod zaten başka bir üründe kullanılıyor',
        );
      }
    }

    const oldQuantity = product.quantity;
    const newQuantity = dto.quantity !== undefined ? dto.quantity : oldQuantity;

    const updated = await this.prisma.bulkProduct.update({
      where: { id },
      data: dto,
    });

    if (newQuantity !== oldQuantity) {
      const diff = newQuantity - oldQuantity;
      await this.prisma.stockMovement.create({
        data: {
          company_id: companyId,
          bulk_product_id: id,
          type: diff > 0 ? MovementType.IN : MovementType.OUT,
          quantity: Math.abs(diff),
          reason: 'Manuel stok düzeltmesi',
        },
      });
    }

    return updated;
  }

  async remove(companyId: number, id: number) {
    const product = await this.prisma.bulkProduct.findFirst({
      where: { id, company_id: companyId, deleted_at: null },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    return this.prisma.bulkProduct.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }
}
