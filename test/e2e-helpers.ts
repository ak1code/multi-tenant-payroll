import mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';

const BCRYPT_SALT_ROUNDS = 12;

export async function seedE2EDatabase(): Promise<void> {
  const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/payroll_system';
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }
  const tenantSchema = new mongoose.Schema({
    name: String,
    createdAt: { type: Date, default: Date.now },
  });
  const userSchema = new mongoose.Schema({
    tenantId: mongoose.Schema.Types.ObjectId,
    name: String,
    email: { type: String, unique: true },
    passwordHash: String,
    role: String,
    refreshToken: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  });
  const employeeSchema = new mongoose.Schema({
    tenantId: mongoose.Schema.Types.ObjectId,
    employeeId: String,
    name: String,
    supervisorId: mongoose.Schema.Types.ObjectId,
    createdAt: { type: Date, default: Date.now },
  });
  employeeSchema.index({ tenantId: 1, employeeId: 1 }, { unique: true });

  const Tenant = mongoose.models.Tenant ?? mongoose.model('Tenant', tenantSchema);
  const User = mongoose.models.User ?? mongoose.model('User', userSchema);
  const Employee = mongoose.models.Employee ?? mongoose.model('Employee', employeeSchema);

  await Promise.all([
    mongoose.connection.collection('batches').deleteMany({}),
    mongoose.connection.collection('disbursementrecords').deleteMany({}),
    mongoose.connection.collection('deadletterjobs').deleteMany({}),
    Employee.deleteMany({}),
    User.deleteMany({}),
    Tenant.deleteMany({}),
  ]);

  const tenants = [
    { name: 'Alpha Corp', domain: 'alpha.com' },
    { name: 'Beta Industries', domain: 'beta.com' },
  ];

  for (const tenantData of tenants) {
    const tenant = await Tenant.create({ name: tenantData.name });

    const users = [
      { name: 'Admin', email: `admin@${tenantData.domain}`, password: 'Admin@123', role: 'ADMIN' },
      { name: 'HR', email: `hr@${tenantData.domain}`, password: 'Hr@123', role: 'HR' },
      {
        name: 'Supervisor 1',
        email: `supervisor1@${tenantData.domain}`,
        password: 'Super@123',
        role: 'SUPERVISOR',
      },
      {
        name: 'Supervisor 2',
        email: `supervisor2@${tenantData.domain}`,
        password: 'Super@123',
        role: 'SUPERVISOR',
      },
    ];

    for (const u of users) {
      await User.create({
        tenantId: tenant._id,
        name: u.name,
        email: u.email,
        passwordHash: await bcrypt.hash(u.password, BCRYPT_SALT_ROUNDS),
        role: u.role,
        refreshToken: null,
      });
    }

    const supervisor1 = await User.findOne({ email: `supervisor1@${tenantData.domain}` });
    const supervisor2 = await User.findOne({ email: `supervisor2@${tenantData.domain}` });

    for (let i = 1; i <= 25; i++) {
      const empNum = String(i).padStart(3, '0');
      await Employee.create({
        tenantId: tenant._id,
        employeeId: `EMP${empNum}`,
        name: `${tenantData.name} Employee ${empNum}`,
        supervisorId: (i <= 12 ? supervisor1!._id : supervisor2!._id) as mongoose.Types.ObjectId,
      });
    }
  }
}
