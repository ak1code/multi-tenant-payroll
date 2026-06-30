import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EmployeeDocument = Employee & Document;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Employee {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true })
  tenantId!: Types.ObjectId;

  @Prop({ required: true })
  employeeId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  supervisorId!: Types.ObjectId;
}

export const EmployeeSchema = SchemaFactory.createForClass(Employee);

EmployeeSchema.index({ tenantId: 1, employeeId: 1 }, { unique: true });
EmployeeSchema.index({ tenantId: 1, supervisorId: 1 });
