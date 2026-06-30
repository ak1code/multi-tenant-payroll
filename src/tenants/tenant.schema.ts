import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TenantDocument = Tenant & Document;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Tenant {
  @Prop({ required: true })
  name!: string;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);
