import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Employee, EmployeeSchema } from './employees.schema';
import { EmployeesService } from './employees.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Employee.name, schema: EmployeeSchema }])],
  providers: [EmployeesService],
  exports: [EmployeesService, MongooseModule],
})
export class EmployeesModule {}
