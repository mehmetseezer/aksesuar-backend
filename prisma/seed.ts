// prisma/seed.ts
import { PrismaClient, Role, EmployeeStatus } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🗑️ Veritabanı tamamen temizleniyor...');

  // Tüm tabloları foreign key sırasına göre sil (en çok bağımlı olandan en az bağımlı olana)
  await prisma.supplierReturnItem.deleteMany();
  await prisma.supplierReturn.deleteMany();
  await prisma.returnItem.deleteMany();
  await prisma.return.deleteMany();
  await prisma.trade.deleteMany();
  await prisma.commission.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.purchaseItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.cashTransaction.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.income.deleteMany();
  await prisma.commissionRule.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.cashRegister.deleteMany();
  await prisma.singleDevice.deleteMany();
  await prisma.bulkProduct.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.company.deleteMany();

  console.log('🌱 Sadece Aksesuar Dünyası ve admin kullanıcı oluşturuluyor...');

  const hashedPassword = await bcrypt.hash('123456', 10);

  // 1. Şirket oluştur
  const company = await prisma.company.create({
    data: {
      name: 'Aksesuar Dünyası',
      subdomain: 'aksesuar',
    },
  });

  // 2. Kasa kaydı (bakiye 0)
  await prisma.cashRegister.create({
    data: {
      company_id: company.id,
      balance: 0,
    },
  });

  // 3. Admin çalışanı oluştur
  await prisma.employee.create({
    data: {
      name: 'Aksesuar Admin',
      email: 'admin@aksesuar.com',
      password_hash: hashedPassword,
      role: Role.ADMIN,
      status: EmployeeStatus.ACTIVE,
      company_id: company.id,
    },
  });

  console.log('✅ Seed tamamlandı. Yalnızca: admin@aksesuar.com / 123456');
}

main()
  .catch((e) => {
    console.error('❌ Seed hatası:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });