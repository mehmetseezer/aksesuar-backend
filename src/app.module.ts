import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PublicController } from './public.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CustomerModule } from './customer/customer.module';
import { SupplierModule } from './supplier/supplier.module';
import { ProductModule } from './product/product.module';
import { SaleModule } from './sale/sale.module';
import { PurchaseModule } from './purchase/purchase.module';
import { ExpenseModule } from './expense/expense.module';
import { ReportModule } from './report/report.module';
import { ReturnModule } from './return/return.module';
import { TradeModule } from './trade/trade.module';
import { EmployeeModule } from './employee/employee.module';
import { CommissionModule } from './commission/commission.module';
import { AuditModule } from './audit/audit.module';
import { SupplierReturnModule } from './supplier-return/supplier-return.module';
import { IncomeModule } from './income/income.module';
import { SuperAdminModule } from './super-admin/super-admin.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    CustomerModule,
    SupplierModule,
    ProductModule,
    SaleModule,
    PurchaseModule,
    ExpenseModule,
    ReportModule,
    ReturnModule,
    TradeModule,
    EmployeeModule,
    CommissionModule,
    AuditModule,
    SupplierReturnModule,
    IncomeModule,
    SuperAdminModule,
  ],
  controllers: [AppController, PublicController],
  providers: [AppService],
})
export class AppModule {}
