import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Employee, EmployeeDocument } from './employees.schema';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectModel(Employee.name) private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  findByEmployeeId(
    tenantId: string,
    employeeId: string,
  ): Promise<EmployeeDocument | null> {
    return this.employeeModel
      .findOne({ tenantId: new Types.ObjectId(tenantId), employeeId })
      .exec();
  }
}
