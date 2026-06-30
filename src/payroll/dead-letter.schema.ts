import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DeadLetterJobDocument = DeadLetterJob & Document;

@Schema({ timestamps: false })
export class DeadLetterJob {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Batch', required: true })
  batchId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'DisbursementRecord', required: true })
  disbursementRecordId!: Types.ObjectId;

  @Prop({ required: true })
  employeeId!: string;

  @Prop({ required: true })
  amount!: number;

  @Prop({ required: true })
  payPeriod!: string;

  @Prop({ required: true })
  failureReason!: string;

  @Prop({ required: true })
  attemptCount!: number;

  @Prop({ required: true, default: () => new Date() })
  failedAt!: Date;
}

export const DeadLetterJobSchema = SchemaFactory.createForClass(DeadLetterJob);

DeadLetterJobSchema.index({ tenantId: 1, batchId: 1 });
