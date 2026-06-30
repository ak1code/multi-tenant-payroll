import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { UserRole } from '../common/constants';

export type UserDocument = User & Document;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class User {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, unique: true })
  email!: string;

  @Prop({ required: true })
  passwordHash!: string;

  @Prop({ required: true, enum: Object.values(UserRole), type: String })
  role!: UserRole;

  @Prop({ type: String, default: null })
  refreshToken!: string | null;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ tenantId: 1, email: 1 }, { unique: true });
