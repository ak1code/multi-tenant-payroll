import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BatchStatus } from '../common/constants';

export type BatchDocument = Batch & Document;

@Schema({ timestamps: true })
export class Batch {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  uploadedBy!: Types.ObjectId;

  @Prop({ required: true })
  fileName!: string;

  @Prop({ required: true })
  fileHash!: string;

  @Prop({ required: true, default: 0 })
  totalRows!: number;

  @Prop({ required: true, default: 0 })
  pending!: number;

  @Prop({ required: true, default: 0 })
  processing!: number;

  @Prop({ required: true, default: 0 })
  succeeded!: number;

  @Prop({ required: true, default: 0 })
  retrying!: number;

  @Prop({ required: true, default: 0 })
  deadLettered!: number;

  @Prop({ required: true, default: 0 })
  invalid!: number;

  @Prop({ required: true, enum: Object.values(BatchStatus), type: String, default: BatchStatus.PROCESSING })
  status!: BatchStatus;
}

export const BatchSchema = SchemaFactory.createForClass(Batch);

BatchSchema.index({ tenantId: 1, createdAt: -1 });
BatchSchema.index({ fileHash: 1 }, { unique: true });
