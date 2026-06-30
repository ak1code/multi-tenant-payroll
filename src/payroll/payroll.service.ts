import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Model, Types, isValidObjectId } from 'mongoose';
import { Queue } from 'bullmq';
import { createHash } from 'crypto';
import { parse } from 'csv-parse/sync';
import { ConfigService } from '@nestjs/config';
import { Batch, BatchDocument } from './batch.schema';
import { DisbursementRecord, DisbursementRecordDocument } from './disbursement-record.schema';
import { EmployeesService } from '../employees/employees.service';
import { AuthUser } from '../auth/interfaces/jwt-payload.interface';
import { SearchPayrollDto } from './dto/search-payroll.dto';
import {
  BatchStatus,
  DisbursementStatus,
  PAYROLL_QUEUE,
  UserRole,
} from '../common/constants';
import {
  CsvRow,
  computeBatchStatus,
  isDuplicateKeyError,
  validateRow,
} from './payroll.utils';
import { parsePayPeriod } from '../common/helpers/pay-period.helper';

export interface PayrollJobData {
  disbursementRecordId: string;
  tenantId: string;
  batchId: string;
  employeeId: string;
  amount: number;
  payPeriod: string;
}

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(
    @InjectModel(Batch.name) private readonly batchModel: Model<BatchDocument>,
    @InjectModel(DisbursementRecord.name)
    private readonly disbursementModel: Model<DisbursementRecordDocument>,
    @InjectQueue(PAYROLL_QUEUE) private readonly payrollQueue: Queue<PayrollJobData>,
    private readonly employeesService: EmployeesService,
    private readonly configService: ConfigService,
  ) {}

  async uploadCsv(file: Express.Multer.File, user: AuthUser) {
    if (!file.originalname.toLowerCase().endsWith('.csv')) {
      throw new BadRequestException('Only CSV files are allowed');
    }

    const fileHash = createHash('sha256').update(file.buffer).digest('hex');
    let rows: CsvRow[];
    try {
      rows = parse(file.buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as CsvRow[];
    } catch {
      throw new BadRequestException('Invalid or malformed CSV file');
    }

    let batch: BatchDocument;
    try {
      batch = await this.batchModel.create({
        tenantId: new Types.ObjectId(user.tenantId),
        uploadedBy: new Types.ObjectId(user.userId),
        fileName: file.originalname,
        fileHash,
        totalRows: rows.length,
        pending: 0,
        processing: 0,
        succeeded: 0,
        retrying: 0,
        deadLettered: 0,
        invalid: 0,
        status: BatchStatus.PROCESSING,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException('Duplicate upload');
      }
      throw error;
    }

    setImmediate(() => {
      void this.processRowsInBackground(batch._id.toString(), user.tenantId, rows).catch(
        (err: Error) => {
          this.logger.error(`Background row processing failed: ${err.message}`, err.stack);
        },
      );
    });

    return {
      batchId: batch._id.toString(),
      message: 'Upload accepted, processing started',
    };
  }

  async getBatchStatus(batchId: string, user: AuthUser) {
    if (!isValidObjectId(batchId)) {
      throw new BadRequestException('Invalid batch ID');
    }

    const batch = await this.batchModel
      .findOne({
        _id: new Types.ObjectId(batchId),
        tenantId: new Types.ObjectId(user.tenantId),
      })
      .exec();

    if (!batch) {
      throw new NotFoundException('Batch not found');
    }

    return {
      batchId: batch._id.toString(),
      totalRows: batch.totalRows,
      pending: batch.pending,
      processing: batch.processing,
      succeeded: batch.succeeded,
      retrying: batch.retrying,
      deadLettered: batch.deadLettered,
      invalid: batch.invalid,
      status: batch.status,
    };
  }

  async search(user: AuthUser, dto: SearchPayrollDto) {
    const query = this.buildQuery(user, dto);
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.disbursementModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.disbursementModel.countDocuments(query).exec(),
    ]);

    return {
      data: data.map((record) => ({
        id: record._id.toString(),
        batchId: record.batchId.toString(),
        employeeId: record.employeeId,
        employeeName: record.employeeName,
        amount: record.amount,
        payPeriod: record.payPeriod,
        status: record.status,
        invalidReason: record.invalidReason,
        failureReason: record.failureReason,
        attempts: record.attempts,
        processedAt: record.processedAt,
        createdAt: record.createdAt,
      })),
      total,
      page,
      limit,
    };
  }

  buildQuery(user: AuthUser, dto: SearchPayrollDto): Record<string, unknown> {
    const query: Record<string, unknown> = {
      tenantId: new Types.ObjectId(user.tenantId),
    };

    if (user.role === UserRole.SUPERVISOR) {
      query.supervisorId = new Types.ObjectId(user.userId);
    }

    if (dto.employeeName) {
      query.employeeName = { $regex: dto.employeeName, $options: 'i' };
    }

    if (dto.status) {
      query.status = dto.status;
    }

    if (dto.payPeriod) {
      const parsed = parsePayPeriod(dto.payPeriod);
      if (!parsed) {
        throw new BadRequestException('Invalid payPeriod format');
      }
      query.payPeriod = parsed.canonical;
    } else if (dto.payPeriodFrom || dto.payPeriodTo) {
      const range: Record<string, number> = {};
      if (dto.payPeriodFrom) {
        const parsedFrom = parsePayPeriod(dto.payPeriodFrom);
        if (!parsedFrom) {
          throw new BadRequestException('Invalid payPeriodFrom format');
        }
        range.$gte = parsedFrom.sortKey;
      }
      if (dto.payPeriodTo) {
        const parsedTo = parsePayPeriod(dto.payPeriodTo);
        if (!parsedTo) {
          throw new BadRequestException('Invalid payPeriodTo format');
        }
        range.$lte = parsedTo.sortKey;
      }
      query.payPeriodSort = range;
    }

    return query;
  }

  async recomputeBatchStatus(batchId: string): Promise<void> {
    const batch = await this.batchModel.findById(batchId).exec();
    if (!batch) {
      return;
    }

    const status = computeBatchStatus(batch);
    if (batch.status !== status) {
      batch.status = status as BatchStatus;
      await batch.save();
    }
  }

  private async processRowsInBackground(
    batchId: string,
    tenantId: string,
    rows: CsvRow[],
  ): Promise<void> {
    const seenKeys = new Set<string>();
    let pendingCount = 0;

    for (const row of rows) {
      const validation = await validateRow(row, {
        tenantId,
        seenKeys,
        employeeExists: async (employeeId) => {
          const employee = await this.employeesService.findByEmployeeId(tenantId, employeeId);
          return employee !== null;
        },
      });

      if (!validation.valid) {
        await this.disbursementModel.create({
          batchId: new Types.ObjectId(batchId),
          tenantId: new Types.ObjectId(tenantId),
          employeeId: row.employeeId?.trim() || 'UNKNOWN',
          status: DisbursementStatus.INVALID,
          invalidReason: validation.reason ?? 'Invalid row',
          attempts: 0,
          lastAttemptAt: null,
          processedAt: null,
        });
        await this.batchModel.findByIdAndUpdate(batchId, { $inc: { invalid: 1 } }).exec();
        continue;
      }

      const parsed = validation.parsed!;
      const employee = await this.employeesService.findByEmployeeId(tenantId, parsed.employeeId);
      if (!employee) {
        await this.disbursementModel.create({
          batchId: new Types.ObjectId(batchId),
          tenantId: new Types.ObjectId(tenantId),
          employeeId: parsed.employeeId,
          status: DisbursementStatus.INVALID,
          invalidReason: 'Employee not found',
          attempts: 0,
          lastAttemptAt: null,
          processedAt: null,
        });
        await this.batchModel.findByIdAndUpdate(batchId, { $inc: { invalid: 1 } }).exec();
        continue;
      }

      const record = await this.disbursementModel.create({
        batchId: new Types.ObjectId(batchId),
        tenantId: new Types.ObjectId(tenantId),
        employeeId: parsed.employeeId,
        employeeDbId: employee._id,
        employeeName: employee.name,
        supervisorId: employee.supervisorId,
        amount: parsed.amount,
        payPeriod: parsed.payPeriod,
        payPeriodSort: parsed.payPeriodSort,
        status: DisbursementStatus.PENDING,
        invalidReason: null,
        attempts: 0,
        lastAttemptAt: null,
        processedAt: null,
      });

      const maxAttempts = this.configService.get<number>('bull.maxAttempts') ?? 5;
      const backoffDelay = this.configService.get<number>('bull.backoffDelay') ?? 2000;

      await this.payrollQueue.add(
        'disburse',
        {
          disbursementRecordId: record._id.toString(),
          tenantId,
          batchId,
          employeeId: parsed.employeeId,
          amount: parsed.amount,
          payPeriod: parsed.payPeriod,
        },
        {
          attempts: maxAttempts,
          backoff: { type: 'exponential', delay: backoffDelay },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );

      pendingCount++;
    }

    if (pendingCount > 0) {
      await this.batchModel.findByIdAndUpdate(batchId, { $inc: { pending: pendingCount } }).exec();
    } else {
      await this.recomputeBatchStatus(batchId);
    }
  }

}
