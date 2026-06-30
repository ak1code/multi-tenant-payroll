import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { DisbursementStatus } from '../common/constants';

export type DisbursementRecordDocument = DisbursementRecord & Document;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class DisbursementRecord {
  createdAt?: Date;
  @Prop({ type: Types.ObjectId, ref: 'Batch', required: true })
  batchId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true })
  tenantId!: Types.ObjectId;

  @Prop({ required: true })
  employeeId!: string;

  @Prop({ type: Types.ObjectId, ref: 'Employee' })
  employeeDbId?: Types.ObjectId;

  @Prop()
  employeeName?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  supervisorId?: Types.ObjectId;

  @Prop()
  amount?: number;

  @Prop()
  payPeriod?: string;

  @Prop()
  payPeriodSort?: number;

  @Prop({ required: true, enum: Object.values(DisbursementStatus), type: String })
  status!: DisbursementStatus;

  @Prop({ type: String, default: null })
  invalidReason!: string | null;

  @Prop({ type: String, default: null })
  failureReason!: string | null;

  @Prop({ default: 0 })
  attempts!: number;

  @Prop({ type: Date, default: null })
  lastAttemptAt!: Date | null;

  @Prop({ type: Date, default: null })
  processedAt!: Date | null;
}

export const DisbursementRecordSchema = SchemaFactory.createForClass(DisbursementRecord);

DisbursementRecordSchema.index({ tenantId: 1, status: 1 });
DisbursementRecordSchema.index({ tenantId: 1, payPeriodSort: 1 });
DisbursementRecordSchema.index({ tenantId: 1, payPeriod: 1 });
DisbursementRecordSchema.index({ tenantId: 1, employeeName: 'text' });
DisbursementRecordSchema.index({ supervisorId: 1, tenantId: 1 });
DisbursementRecordSchema.index({ batchId: 1 });
