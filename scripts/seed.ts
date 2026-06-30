import mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../.env') });

const BCRYPT_SALT_ROUNDS = 12;

const tenantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const userSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['ADMIN', 'HR', 'SUPERVISOR'], required: true },
  refreshToken: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

const employeeSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  employeeId: { type: String, required: true },
  name: { type: String, required: true },
  supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
});

employeeSchema.index({ tenantId: 1, employeeId: 1 }, { unique: true });

const Tenant = mongoose.model('Tenant', tenantSchema);
const User = mongoose.model('User', userSchema);
const Employee = mongoose.model('Employee', employeeSchema);

interface TenantSeed {
  name: string;
  domain: string;
  users: Array<{ name: string; email: string; password: string; role: string }>;
}

const tenants: TenantSeed[] = [
  {
    name: 'Alpha Corp',
    domain: 'alpha.com',
    users: [
      { name: 'Alpha Admin', email: 'admin@alpha.com', password: 'Admin@123', role: 'ADMIN' },
      { name: 'Alpha HR', email: 'hr@alpha.com', password: 'Hr@123', role: 'HR' },
      {
        name: 'Alpha Supervisor 1',
        email: 'supervisor1@alpha.com',
        password: 'Super@123',
        role: 'SUPERVISOR',
      },
      {
        name: 'Alpha Supervisor 2',
        email: 'supervisor2@alpha.com',
        password: 'Super@123',
        role: 'SUPERVISOR',
      },
    ],
  },
  {
    name: 'Beta Industries',
    domain: 'beta.com',
    users: [
      { name: 'Beta Admin', email: 'admin@beta.com', password: 'Admin@123', role: 'ADMIN' },
      { name: 'Beta HR', email: 'hr@beta.com', password: 'Hr@123', role: 'HR' },
      {
        name: 'Beta Supervisor 1',
        email: 'supervisor1@beta.com',
        password: 'Super@123',
        role: 'SUPERVISOR',
      },
      {
        name: 'Beta Supervisor 2',
        email: 'supervisor2@beta.com',
        password: 'Super@123',
        role: 'SUPERVISOR',
      },
    ],
  },
];

async function seed() {
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/payroll_system';
  await mongoose.connect(uri);

  await Promise.all([
    mongoose.connection.collection('batches').deleteMany({}),
    mongoose.connection.collection('disbursementrecords').deleteMany({}),
    mongoose.connection.collection('deadletterjobs').deleteMany({}),
    Employee.deleteMany({}),
    User.deleteMany({}),
    Tenant.deleteMany({}),
  ]);

  for (const tenantData of tenants) {
    const tenant = await Tenant.create({ name: tenantData.name });

    const userIds: Record<string, mongoose.Types.ObjectId> = {};
    for (const userData of tenantData.users) {
      const passwordHash = await bcrypt.hash(userData.password, BCRYPT_SALT_ROUNDS);
      const user = await User.create({
        tenantId: tenant._id,
        name: userData.name,
        email: userData.email,
        passwordHash,
        role: userData.role as 'ADMIN' | 'HR' | 'SUPERVISOR',
        refreshToken: null,
      });
      userIds[userData.email] = user._id as mongoose.Types.ObjectId;
    }

    const supervisor1 = await User.findOne({ email: `supervisor1@${tenantData.domain}` });
    const supervisor2 = await User.findOne({ email: `supervisor2@${tenantData.domain}` });

    if (!supervisor1 || !supervisor2) {
      throw new Error('Supervisors not found during seed');
    }

    for (let i = 1; i <= 25; i++) {
      const empNum = String(i).padStart(3, '0');
      const supervisor = i <= 12 ? supervisor1 : supervisor2;
      await Employee.create({
        tenantId: tenant._id,
        employeeId: `EMP${empNum}`,
        name: `${tenantData.name} Employee ${empNum}`,
        supervisorId: supervisor._id,
      });
    }

    console.log(`Seeded tenant: ${tenantData.name}`);
  }

  console.log('Seed completed successfully');
  await mongoose.disconnect();
}

seed().catch(async (error) => {
  console.error('Seed failed:', error);
  await mongoose.disconnect();
  process.exit(1);
});
