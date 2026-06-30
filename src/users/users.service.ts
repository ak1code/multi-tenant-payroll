import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './users.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>) {}

  findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).exec();
  }

  findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async updateRefreshToken(userId: string, refreshTokenHash: string | null): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { refreshToken: refreshTokenHash }).exec();
  }
}
