import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Batch, BatchSchema } from './batch.schema';
import { DisbursementRecord, DisbursementRecordSchema } from './disbursement-record.schema';
import { DeadLetterJob, DeadLetterJobSchema } from './dead-letter.schema';
import { PayrollService } from './payroll.service';
import { PayrollController } from './payroll.controller';
import { PayrollProcessor } from './processors/payroll.processor';
import { EmployeesModule } from '../employees/employees.module';
import { PAYROLL_QUEUE } from '../common/constants';
import { TenantContext } from '../common/context/tenant.context';

@Module({
  imports: [
    EmployeesModule,
    MongooseModule.forFeature([
      { name: Batch.name, schema: BatchSchema },
      { name: DisbursementRecord.name, schema: DisbursementRecordSchema },
      { name: DeadLetterJob.name, schema: DeadLetterJobSchema },
    ]),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
        },
      }),
    }),
    BullModule.registerQueue({ name: PAYROLL_QUEUE }),
  ],
  controllers: [PayrollController],
  providers: [PayrollService, PayrollProcessor, TenantContext],
  exports: [PayrollService],
})
export class PayrollModule {}
