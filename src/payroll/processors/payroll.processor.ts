import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Job } from 'bullmq';
import { Model, Types } from 'mongoose';
import { Batch, BatchDocument } from '../batch.schema';
import { DisbursementRecord, DisbursementRecordDocument } from '../disbursement-record.schema';
import { DeadLetterJob, DeadLetterJobDocument } from '../dead-letter.schema';
import { mockDisbursementFunction } from '../mock/disbursement.mock';
import { PayrollJobData, PayrollService } from '../payroll.service';
import { DisbursementStatus, PAYROLL_QUEUE } from '../../common/constants';
import { shouldDeadLetter } from '../payroll.utils';

@Processor(PAYROLL_QUEUE)
export class PayrollProcessor extends WorkerHost {
  private readonly logger = new Logger(PayrollProcessor.name);

  constructor(
    @InjectModel(DisbursementRecord.name)
    private readonly disbursementModel: Model<DisbursementRecordDocument>,
    @InjectModel(Batch.name) private readonly batchModel: Model<BatchDocument>,
    @InjectModel(DeadLetterJob.name)
    private readonly deadLetterModel: Model<DeadLetterJobDocument>,
    private readonly payrollService: PayrollService,
  ) {
    super();
  }

  async process(job: Job<PayrollJobData>): Promise<void> {
    const { disbursementRecordId, batchId, employeeId, amount, payPeriod } = job.data;

    const record = await this.disbursementModel.findById(disbursementRecordId).exec();
    if (!record) {
      this.logger.warn(`Disbursement record ${disbursementRecordId} not found`);
      return;
    }

    const isFirstAttempt = record.status === DisbursementStatus.PENDING;
    const updates: Record<string, unknown> = {
      status: DisbursementStatus.PROCESSING,
      lastAttemptAt: new Date(),
    };

    await this.disbursementModel.findByIdAndUpdate(disbursementRecordId, {
      ...updates,
      $inc: { attempts: 1 },
    });

    const batchUpdate: Record<string, number> = { processing: 1 };
    if (isFirstAttempt) {
      batchUpdate.pending = -1;
    } else if (record.status === DisbursementStatus.RETRYING) {
      batchUpdate.retrying = -1;
    }

    await this.batchModel.findByIdAndUpdate(batchId, { $inc: batchUpdate }).exec();

    try {
      await mockDisbursementFunction({ employeeId, amount, payPeriod });

      await this.disbursementModel.findByIdAndUpdate(disbursementRecordId, {
        status: DisbursementStatus.SUCCEEDED,
        processedAt: new Date(),
      });

      await this.batchModel
        .findByIdAndUpdate(batchId, { $inc: { succeeded: 1, processing: -1 } })
        .exec();

      await this.payrollService.recomputeBatchStatus(batchId);
    } catch (error) {
      const maxAttempts = job.opts.attempts ?? 1;
      const isLastAttempt = shouldDeadLetter(job.attemptsMade + 1, maxAttempts);

      if (isLastAttempt) {
        throw error;
      }

      await this.disbursementModel.findByIdAndUpdate(disbursementRecordId, {
        status: DisbursementStatus.RETRYING,
        lastAttemptAt: new Date(),
      });

      await this.batchModel
        .findByIdAndUpdate(batchId, { $inc: { retrying: 1, processing: -1 } })
        .exec();

      throw error;
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<PayrollJobData> | undefined, error: Error): Promise<void> {
    if (!job) {
      return;
    }

    const maxAttempts = job.opts.attempts ?? 1;
    if (!shouldDeadLetter(job.attemptsMade, maxAttempts)) {
      return;
    }

    const { disbursementRecordId, batchId, tenantId, employeeId, amount, payPeriod } = job.data;

    const record = await this.disbursementModel.findById(disbursementRecordId).exec();
    if (!record) {
      return;
    }

    await this.disbursementModel.findByIdAndUpdate(disbursementRecordId, {
      status: DisbursementStatus.DEAD_LETTERED,
      failureReason: error.message,
      lastAttemptAt: new Date(),
    });

    await this.deadLetterModel.create({
      tenantId: new Types.ObjectId(tenantId),
      batchId: new Types.ObjectId(batchId),
      disbursementRecordId: new Types.ObjectId(disbursementRecordId),
      employeeId,
      amount,
      payPeriod,
      failureReason: error.message,
      attemptCount: record.attempts,
      failedAt: new Date(),
    });

    const batchInc: Record<string, number> = { deadLettered: 1 };
    if (record.status === DisbursementStatus.PROCESSING) {
      batchInc.processing = -1;
    } else if (record.status === DisbursementStatus.RETRYING) {
      batchInc.retrying = -1;
    }

    await this.batchModel.findByIdAndUpdate(batchId, { $inc: batchInc }).exec();
    await this.payrollService.recomputeBatchStatus(batchId);

    this.logger.warn(`Job ${job.id} dead-lettered: ${error.message}`);
  }
}
