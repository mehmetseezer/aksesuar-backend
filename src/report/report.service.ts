import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, TransactionStatus, DeviceStatus } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginatedResult } from '../common/interfaces/pagination.interface';

@Injectable()
export class ReportService {
  constructor(private prisma: PrismaService) {}

  // ------------------- Dashboard Özet (Tarih Filtreli) -------------------
  async getDashboardSummary(
    companyId: number,
    startDate?: string,
    endDate?: string,
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const where: Prisma.SaleWhereInput = {
      company_id: companyId,
      status: { not: TransactionStatus.CANCELLED },
    };
    const purchaseWhere: Prisma.PurchaseWhereInput = {
      company_id: companyId,
      status: { not: TransactionStatus.CANCELLED },
    };
    const expenseWhere: Prisma.ExpenseWhereInput = {
      company_id: companyId,
      deleted_at: null,
    };

    if (startDate || endDate) {
      const dateFilter: any = {};
      if (startDate) {
        const s = new Date(startDate);
        s.setHours(0, 0, 0, 0);
        dateFilter.gte = s;
      }
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        dateFilter.lte = e;
      }

      where.created_at = dateFilter;
      purchaseWhere.created_at = dateFilter;
      expenseWhere.created_at = dateFilter;
    } else {
      // Varsayılan: Bugün
      where.created_at = { gte: today, lt: tomorrow };
      purchaseWhere.created_at = { gte: today, lt: tomorrow };
      expenseWhere.created_at = { gte: today, lt: tomorrow };
    }

    const [
      salesAgg,
      purchasesAgg,
      expensesAgg,
      incomesAgg,
      cashBalance,
      totalReceivable,
      totalPayable,
      lowStockCount,
      returnsAgg,
      supplierReturnsAgg,
    ] = await Promise.all([
      this.prisma.sale.aggregate({
        where,
        _sum: { total_amount: true, profit: true },
      }),
      this.prisma.purchase.aggregate({
        where: purchaseWhere,
        _sum: { total_amount: true },
      }),
      this.prisma.expense.aggregate({
        where: expenseWhere,
        _sum: { amount: true },
      }),
      this.prisma.income.aggregate({
        where: {
          company_id: companyId,
          created_at: where.created_at as any,
          deleted_at: null,
        },
        _sum: { amount: true },
      }),
      this.prisma.cashRegister.findUnique({
        where: { company_id: companyId },
        select: { balance: true },
      }),
      this.prisma.customer.aggregate({
        where: { company_id: companyId, deleted_at: null },
        _sum: { balance: true },
      }),
      this.prisma.supplier.aggregate({
        where: { company_id: companyId, deleted_at: null },
        _sum: { total_debt: true },
      }),
      this.prisma.bulkProduct.count({
        where: { company_id: companyId, deleted_at: null, quantity: { lt: 5 } },
      }),
      this.prisma.return.findMany({
        where: {
          company_id: companyId,
          created_at: where.created_at as any,
          status: { not: TransactionStatus.CANCELLED },
        },
        include: {
          items: {
            include: {
              bulkProduct: { select: { purchase_price: true } },
              singleDevice: { select: { purchase_price: true } },
            },
          },
        },
      }),
      this.prisma.supplierReturn.aggregate({
        where: {
          company_id: companyId,
          created_at: where.created_at as any,
          status: { not: TransactionStatus.CANCELLED },
        },
        _sum: { total_amount: true },
      }),
    ]);

    // İade kaynaklı kâr kaybını hesapla
    const returnLoss = 0;
    let returnsRefundTotal = 0;
    returnsAgg.forEach((ret) => {
      const refund = Number(ret.refund_amount);
      returnsRefundTotal += refund;

      let costOfReturnedItems = 0;
      ret.items.forEach((item) => {
        if (item.bulkProduct)
          costOfReturnedItems +=
            Number(item.bulkProduct.purchase_price) * item.quantity;
        else if (item.singleDevice)
          costOfReturnedItems += Number(item.singleDevice.purchase_price);
      });

      // Eğer müşteriye 60k'lık ürünü 55k iade ettiysek, aslında 5k kârda kalırız?
      // Hayır, satıştan 10k kâr etmiştik (60-50). 55 iade edince (60-55) = 5k net kâr kalır.
      // Yani kâr kaybı = (Satış Fiyatı - İade Fiyatı) gibi bir durum değil.
      // Gerçek Kâr Kaybı = (Orijinal Satış Kârı) - (İade sonrası kalan kâr)
      // Daha basiti: Kâr = (Toplam Satış Kârı) - (İadelerdeki Zarar/Fark)
    });

    // Senior Yaklaşım: Net Kâr = (Satış Kârları) - (İade Kayıpları) - (Genel Giderler - Alım Giderleri)
    // Not: Expense tablosunda ALIM giderleri de var, onları kârdan düşmemeliyiz çünkü zaten Sale.profit içinde maliyet düşülüyor.

    const generalExpenses = await this.prisma.expense.aggregate({
      where: {
        ...expenseWhere,
        category: { not: 'ALIM' },
      },
      _sum: { amount: true },
    });

    const salesProfit = Number(salesAgg._sum.profit || 0);
    const returnRefunds = returnsAgg.reduce(
      (s, r) => s + Number(r.refund_amount),
      0,
    );

    // İade edilen ürünlerin toplam maliyetini bul (kâra geri eklemek için, çünkü satış kârından düştük)
    // Aslında iade mantığı: Satış kârından iade edilen kalemin kârını düşmeliyiz.
    const totalReturnedProfit = 0;
    for (const ret of returnsAgg) {
      const sale = await this.prisma.sale.findUnique({
        where: { id: ret.sale_id },
        include: { items: true },
      });
      if (sale) {
        // Bu basit versiyon: İade edilen her kuruş kârdan düşer varsayalım (muhafazakar hesap)
        // Ama daha doğrusu iade kalemlerinin tek tek kârını bulup düşmektir.
      }
    }

    // Basitleştirilmiş ama doğru Net Kâr formülü:
    // Net Kâr = (Gelirler Toplamı) - (Giderler Toplamı - Alım Ödemeleri) - (Satılan Ürünlerin Maliyeti)

    const totalIncome = Number(incomesAgg._sum.amount || 0);
    const totalExpense = Number(expensesAgg._sum.amount || 0);
    const totalSupplierReturns = Number(
      supplierReturnsAgg?._sum?.total_amount || 0,
    );

    const salesTotalNet =
      Number(salesAgg._sum.total_amount || 0) - returnRefunds;
    const purchasesTotal =
      Number(purchasesAgg._sum.total_amount || 0) - totalSupplierReturns;

    // Dashboard'da gösterilecek "Kâr" -> Satışlardan gelen kâr (Satış - Maliyet)
    const netProfit = salesProfit;

    const salesCount = await this.prisma.sale.count({
      where: {
        ...where,
        status: {
          notIn: [TransactionStatus.RETURNED, TransactionStatus.CANCELLED],
        },
      },
    });
    const usedStockCount = await this.prisma.singleDevice.count({
      where: {
        company_id: companyId,
        deleted_at: null,
        status: DeviceStatus.IN_STOCK,
      },
    });

    const grossSales = Number(salesAgg._sum.total_amount || 0);

    return {
      today: {
        salesTotal: salesTotalNet, // Net Satış (İadeler düşülmüş)
        salesCount,
        purchasesTotal: Number(purchasesAgg._sum.total_amount || 0),
        expensesTotal: totalExpense,
        incomeTotal: totalIncome,
        profit: salesProfit, // Satışlardan gelen brüt kâr (iadeler tx tarafından güncelleniyor)
        netProfit: salesProfit, // Kullanıcı isteği: Satış - Maliyet
        returnsTotal: returnRefunds,
        supplierReturnsTotal: totalSupplierReturns,
      },
      cashBalance: cashBalance ? Number(cashBalance.balance) : 0,
      totalReceivable: totalReceivable._sum.balance
        ? Number(totalReceivable._sum.balance)
        : 0,
      totalPayable: totalPayable._sum.total_debt
        ? Number(totalPayable._sum.total_debt)
        : 0,
      lowStockCount,
      usedStockCount,
    };
  }

  // ------------------- Gün Sonu Raporu -------------------
  async getEndOfDayReport(companyId: number, date?: string) {
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const where = {
      company_id: companyId,
      created_at: { gte: targetDate, lt: nextDay },
      status: { not: TransactionStatus.CANCELLED },
    };

    const incomeExpenseWhere = {
      company_id: companyId,
      created_at: { gte: targetDate, lt: nextDay },
      deleted_at: null,
    };

    const [sales, purchases, expenses, incomes, returns, trades, cashRegister] =
      await Promise.all([
        this.prisma.sale.findMany({
          where,
          include: {
            customer: {
              select: { name: true, identity_no: true, phone: true },
            },
            employee: { select: { name: true } },
            items: { include: { bulkProduct: true, singleDevice: true } },
          },
          orderBy: { created_at: 'desc' },
        }),
        this.prisma.purchase.findMany({
          where,
          include: {
            supplier: { select: { name: true, phone: true } },
            customer: {
              select: { name: true, identity_no: true, phone: true },
            },
            employee: { select: { name: true } },
            items: { include: { bulkProduct: true, singleDevice: true } },
          },
          orderBy: { created_at: 'desc' },
        }),
        this.prisma.expense.findMany({
          where: incomeExpenseWhere,
          include: { employee: { select: { name: true } } },
          orderBy: { created_at: 'desc' },
        }),
        this.prisma.income.findMany({
          where: incomeExpenseWhere,
          include: { employee: { select: { name: true } } },
          orderBy: { created_at: 'desc' },
        }),
        this.prisma.return.findMany({
          where,
          include: {
            customer: {
              select: { name: true, identity_no: true, phone: true },
            },
            employee: { select: { name: true } },
            items: { include: { bulkProduct: true, singleDevice: true } },
          },
          orderBy: { created_at: 'desc' },
        }),
        this.prisma.trade.findMany({
          where,
          include: {
            customer: {
              select: { name: true, identity_no: true, phone: true },
            },
            employee: { select: { name: true } },
            purchase: {
              include: {
                items: { include: { bulkProduct: true, singleDevice: true } },
              },
            },
            sale: {
              include: {
                items: { include: { bulkProduct: true, singleDevice: true } },
              },
            },
          },
          orderBy: { created_at: 'desc' },
        }),
        this.prisma.cashRegister.findUnique({
          where: { company_id: companyId },
        }),
      ]);

    const totalSales = sales.reduce((s, x) => s + Number(x.total_amount), 0);
    const totalPurchases = purchases.reduce(
      (s, x) => s + Number(x.total_amount),
      0,
    );
    const totalExpenses = expenses.reduce((s, x) => s + Number(x.amount), 0);
    const totalIncomes = incomes.reduce((s, x) => s + Number(x.amount), 0);
    const totalReturns = returns.reduce(
      (s, x) => s + Number(x.refund_amount),
      0,
    );
    const salesProfit = sales.reduce((s, x) => s + Number(x.profit), 0);
    const generalExpenses = expenses
      .filter((e) => e.category !== 'ALIM')
      .reduce((s, x) => s + Number(x.amount), 0);

    return {
      summary: {
        totalSales: totalSales - totalReturns,
        totalPurchases,
        totalExpenses,
        totalIncomes,
        totalReturns,
        salesProfit,
        netProfit: salesProfit, // Kullanıcı isteği: Satış - Maliyet
        netCash:
          totalSales +
          totalIncomes -
          totalPurchases -
          totalExpenses -
          totalReturns,
        cashBalance: cashRegister ? Number(cashRegister.balance) : 0,
      },
      details: {
        sales,
        purchases,
        expenses,
        incomes,
        returns,
        trades,
      },
    };
  }

  // ------------------- Satış Raporu (Sayfalama Destekli) -------------------
  async getSalesReport(
    companyId: number,
    pagination: PaginationDto,
    startDate?: string,
    endDate?: string,
  ): Promise<PaginatedResult<any> & { summary: any }> {
    const { page, limit } = pagination;
    const where: Prisma.SaleWhereInput = {
      company_id: companyId,
      status: { not: TransactionStatus.CANCELLED },
    };

    if (startDate) {
      const s = new Date(startDate);
      s.setHours(0, 0, 0, 0);
      where.created_at = { gte: s };
    }
    if (endDate) {
      const e = new Date(endDate);
      e.setHours(23, 59, 59, 999);
      where.created_at = {
        ...(where.created_at as object),
        lte: e,
      };
    }

    // Not: Günlük gruplama için salesItem üzerinden gidip created_at'i gün bazında gruplamak
    // veya tüm satışları çekip hafızada gruplamak gerekir.
    // Basitlik ve performans için burada tüm aralıktaki satışları çekip hafızada gruplayacağız.
    const sales = await this.prisma.sale.findMany({
      where,
      select: {
        created_at: true,
        total_amount: true,
        profit: true,
      },
      orderBy: { created_at: 'asc' },
    });

    const returns = await this.prisma.return.findMany({
      where: {
        company_id: companyId,
        created_at: where.created_at as any,
        status: { not: TransactionStatus.CANCELLED },
      },
      include: {
        items: {
          include: {
            bulkProduct: { select: { purchase_price: true } },
            singleDevice: { select: { purchase_price: true } },
          },
        },
      },
    });

    const aggregate = await this.prisma.sale.aggregate({
      where,
      _sum: { total_amount: true, paid_amount: true, profit: true },
      _count: true,
    });

    const returnsAgg = await this.prisma.return.aggregate({
      where: {
        company_id: companyId,
        created_at: where.created_at as any,
        status: { not: TransactionStatus.CANCELLED },
      },
      _sum: { refund_amount: true },
    });

    const dailyMap = new Map<
      string,
      { total: number; profit: number; count: number }
    >();
    sales.forEach((sale) => {
      const date = sale.created_at.toISOString().split('T')[0];
      const entry = dailyMap.get(date) || { total: 0, profit: 0, count: 0 };
      entry.total += Number(sale.total_amount);
      entry.profit += Number(sale.profit);
      entry.count += 1;
      dailyMap.set(date, entry);
    });

    returns.forEach((ret) => {
      const date = ret.created_at.toISOString().split('T')[0];
      const entry = dailyMap.get(date) || { total: 0, profit: 0, count: 0 };

      const refundAmt = Number(ret.refund_amount);
      let returnCost = 0;
      ret.items.forEach((item) => {
        if (item.bulkProduct)
          returnCost += Number(item.bulkProduct.purchase_price) * item.quantity;
        else if (item.singleDevice)
          returnCost += Number(item.singleDevice.purchase_price);
      });

      const profitLoss = refundAmt - returnCost;

      entry.total -= refundAmt;
      entry.profit -= profitLoss;
      // İade bir satış işlemi değildir, o yüzden count düşülmüyor (veya istenirse düşülebilir)
      dailyMap.set(date, entry);
    });

    const daily = Array.from(dailyMap.entries()).map(([date, val]) => ({
      date,
      ...val,
    }));

    const returnsSum = Number(returnsAgg?._sum?.refund_amount || 0);

    // Toplam kâr kaybını hesapla
    let totalReturnProfitLoss = 0;
    returns.forEach((ret) => {
      const refundAmt = Number(ret.refund_amount);
      let returnCost = 0;
      ret.items.forEach((item) => {
        if (item.bulkProduct)
          returnCost += Number(item.bulkProduct.purchase_price) * item.quantity;
        else if (item.singleDevice)
          returnCost += Number(item.singleDevice.purchase_price);
      });
      totalReturnProfitLoss += refundAmt - returnCost;
    });

    const totalSales =
      (aggregate._sum.total_amount ? Number(aggregate._sum.total_amount) : 0) -
      returnsSum;
    const totalProfit =
      (aggregate._sum.profit ? Number(aggregate._sum.profit) : 0) -
      totalReturnProfitLoss;
    const totalCount = aggregate._count;

    const totalDaily = daily.length;
    const skip = (page - 1) * limit;
    const paginatedDaily = daily.slice(skip, skip + limit);

    return {
      data: paginatedDaily,
      meta: {
        total: totalDaily,
        page,
        limit,
        totalPages: Math.ceil(totalDaily / limit),
      },
      summary: {
        totalSales,
        totalProfit,
        totalCount,
        averageTicket: totalCount ? totalSales / totalCount : 0,
      },
    };
  }

  // ------------------- En Çok Satan Ürünler (Sayfalama Destekli) -------------------
  // src/report/report.service.ts içinde getTopSellingProducts metodu

  async getTopSellingProducts(
    companyId: number,
    pagination: PaginationDto,
    startDate?: string,
    endDate?: string,
  ): Promise<PaginatedResult<any>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: any = {
      sale: { company_id: companyId },
    };

    if (startDate || endDate) {
      where.sale.created_at = {};
      if (startDate) {
        const s = new Date(startDate);
        s.setHours(0, 0, 0, 0);
        where.sale.created_at.gte = s;
      }
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        where.sale.created_at.lte = e;
      }
    }

    const bulkProducts = await this.prisma.saleItem.groupBy({
      by: ['bulk_product_id'],
      where: {
        ...where,
        bulk_product_id: { not: null },
      },
      _sum: { quantity: true, returned_quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
    });

    const singleDevices = await this.prisma.saleItem.groupBy({
      by: ['single_device_id'],
      where: {
        ...where,
        single_device_id: { not: null },
      },
      _count: true,
      orderBy: { _count: { single_device_id: 'desc' } },
    });

    const bulkProductIds = bulkProducts
      .map((p) => p.bulk_product_id)
      .filter((id): id is number => id !== null);
    const singleDeviceIds = singleDevices
      .map((p) => p.single_device_id)
      .filter((id): id is number => id !== null);

    const [newDetails, usedDetails] = await Promise.all([
      bulkProductIds.length > 0
        ? this.prisma.bulkProduct.findMany({
            where: { id: { in: bulkProductIds } },
            select: { id: true, brand: true, model: true },
          })
        : [],
      singleDeviceIds.length > 0
        ? this.prisma.singleDevice.findMany({
            where: { id: { in: singleDeviceIds } },
            select: { id: true, name: true, imei: true }, // ← brand/model yerine name
          })
        : [],
    ]);

    const topNew = bulkProducts
      .map((p) => {
        const detail = newDetails.find((d) => d.id === p.bulk_product_id);
        const totalSold = p._sum.quantity ?? 0;
        // İade miktarını bulmak için SaleItem'ları tekrar sorgulamak yerine net rakamı hesaplayabiliriz
        // Ancak groupBy içinde returned_quantity'yi de sum'layabiliriz
        return {
          type: 'new' as const,
          id: p.bulk_product_id,
          brand: detail?.brand,
          model: detail?.model,
          quantitySold:
            (p._sum.quantity ?? 0) - (p._sum.returned_quantity ?? 0),
        };
      })
      .filter((item) => item.quantitySold > 0);

    const topUsed = singleDevices
      .map((p) => {
        const detail = usedDetails.find((d) => d.id === p.single_device_id);
        return {
          type: 'used' as const,
          id: p.single_device_id,
          name: detail?.name, // ← brand/model yerine name
          imei: detail?.imei,
          quantitySold: p._count,
        };
      })
      .filter((item) => item.quantitySold > 0);

    const combined = [...topNew, ...topUsed].sort(
      (a, b) => b.quantitySold - a.quantitySold,
    );

    const total = combined.length;
    const paginatedData = combined.slice(skip, skip + limit);

    return {
      data: paginatedData,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ------------------- Nakit Akışı (Sayfalama Destekli) -------------------
  async getCashFlowSummary(
    companyId: number,
    pagination: PaginationDto,
    startDateStr?: string,
    endDateStr?: string,
  ): Promise<PaginatedResult<any> & { summary: any }> {
    const { page, limit } = pagination;

    const where: any = { company_id: companyId };
    if (startDateStr || endDateStr) {
      where.created_at = {};
      if (startDateStr) {
        const s = new Date(startDateStr);
        s.setHours(0, 0, 0, 0);
        where.created_at.gte = s;
      }
      if (endDateStr) {
        const e = new Date(endDateStr);
        e.setHours(23, 59, 59, 999);
        where.created_at.lte = e;
      }
    } else {
      // Default: Last 30 days
      const defaultStart = new Date();
      defaultStart.setDate(defaultStart.getDate() - 30);
      defaultStart.setHours(0, 0, 0, 0);
      where.created_at = { gte: defaultStart };
    }

    const transactions = await this.prisma.cashTransaction.groupBy({
      by: ['type', 'created_at'],
      where,
      _sum: { amount: true },
    });

    const dailyMap = new Map<string, { income: number; expense: number }>();

    transactions.forEach((t) => {
      const date = t.created_at.toISOString().split('T')[0];
      const entry = dailyMap.get(date) || { income: 0, expense: 0 };
      const amount = t._sum.amount ? Number(t._sum.amount) : 0;

      if (
        t.type === 'SALE_INCOME' ||
        t.type === 'CUSTOMER_PAYMENT' ||
        t.type === 'OTHER_INCOME'
      ) {
        entry.income += amount;
      } else if (
        t.type === 'PURCHASE_PAYMENT' ||
        t.type === 'EXPENSE_OUT' ||
        t.type === 'SUPPLIER_PAYMENT' ||
        t.type === 'REFUND_OUT'
      ) {
        entry.expense += amount;
      }

      dailyMap.set(date, entry);
    });

    const daily = Array.from(dailyMap.entries())
      .map(([date, values]) => ({
        date,
        income: values.income,
        expense: values.expense,
        net: values.income - values.expense,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalIncome = daily.reduce((sum, d) => sum + d.income, 0);
    const totalExpense = daily.reduce((sum, d) => sum + d.expense, 0);

    const totalDays = daily.length;
    const skip = (page - 1) * limit;
    const paginatedDaily = daily.slice(skip, skip + limit);

    return {
      data: paginatedDaily,
      meta: {
        total: totalDays,
        page,
        limit,
        totalPages: Math.ceil(totalDays / limit),
      },
      summary: {
        totalIncome,
        totalExpense,
        netCashFlow: totalIncome - totalExpense,
      },
    };
  }

  // ------------------- Stok Değeri (Sayfalama Yok) -------------------
  async getInventoryValue(companyId: number) {
    const bulkProductsData = await this.prisma.bulkProduct.findMany({
      where: { company_id: companyId, deleted_at: null },
      select: { quantity: true, purchase_price: true },
    });

    const singleDevicesData = await this.prisma.singleDevice.findMany({
      where: {
        company_id: companyId,
        deleted_at: null,
        status: 'IN_STOCK',
      },
      select: { purchase_price: true },
    });

    const newTotalCost = bulkProductsData.reduce(
      (sum, p) => sum + p.quantity * Number(p.purchase_price),
      0,
    );
    const usedTotalCost = singleDevicesData.reduce(
      (sum, p) => sum + Number(p.purchase_price),
      0,
    );

    const bulkProductCount = await this.prisma.bulkProduct.count({
      where: { company_id: companyId, deleted_at: null },
    });
    const singleDeviceCount = await this.prisma.singleDevice.count({
      where: { company_id: companyId, deleted_at: null, status: 'IN_STOCK' },
    });

    return {
      bulkProductCount,
      singleDeviceCount,
      bulkProductValue: newTotalCost,
      singleDeviceValue: usedTotalCost,
      totalInventoryValue: newTotalCost + usedTotalCost,
    };
  }

  // ------------------- Çalışan Verimliliği -------------------
  async getEmployeeProductivity(
    companyId: number,
    startDate?: string,
    endDate?: string,
  ) {
    const saleWhere: Prisma.SaleWhereInput = { company_id: companyId };
    if (startDate) {
      const s = new Date(startDate);
      s.setHours(0, 0, 0, 0);
      saleWhere.created_at = { gte: s };
    }
    if (endDate) {
      const e = new Date(endDate);
      e.setHours(23, 59, 59, 999);
      saleWhere.created_at = {
        ...(saleWhere.created_at as object),
        lte: e,
      };
    }

    const [sales, commissions] = await Promise.all([
      this.prisma.sale.groupBy({
        by: ['employee_id'],
        where: saleWhere,
        _sum: { total_amount: true, profit: true },
        _count: true,
      }),
      this.prisma.commission.groupBy({
        by: ['employee_id'],
        where: {
          sale: saleWhere,
        },
        _sum: { amount: true },
      }),
    ]);

    const employeeIds = sales
      .map((s) => s.employee_id)
      .filter((id): id is number => id !== null);

    const employees = await this.prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, name: true },
    });

    const returns = await this.prisma.return.findMany({
      where: { sale: saleWhere },
      select: { refund_amount: true, sale: { select: { employee_id: true } } },
    });

    const result = sales.map((s) => {
      const emp = employees.find((e) => e.id === s.employee_id);
      const comm = commissions.find((c) => c.employee_id === s.employee_id);

      const empReturns = returns.filter(
        (r) => r.sale?.employee_id === s.employee_id,
      );
      const totalRefunds = empReturns.reduce(
        (sum, r) => sum + Number(r.refund_amount),
        0,
      );

      return {
        employee_id: s.employee_id,
        employee_name: emp?.name || 'Bilinmiyor',
        totalSales: Number(s._sum.total_amount || 0) - totalRefunds,
        totalProfit: Number(s._sum.profit || 0),
        totalCommission: Number(comm?._sum.amount || 0),
        salesCount: s._count,
      };
    });

    return result.sort((a, b) => b.totalSales - a.totalSales);
  }
}
