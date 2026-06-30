import { writeFileSync } from 'fs';
import { resolve } from 'path';

const employeeIds = Array.from({ length: 25 }, (_, i) => `EMP${String(i + 1).padStart(3, '0')}`);

function randomAmount(): number {
  return Math.floor(Math.random() * 75000) + 5000;
}

function randomPayPeriod(): string {
  const now = new Date();
  const monthsAgo = Math.floor(Math.random() * 12);
  const date = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  return `${date.getFullYear()}-${date.getMonth() + 1}`;
}

function toCsvRow(employeeId: string, amount: string | number, payPeriod: string): string {
  return `${employeeId},${amount},${payPeriod}`;
}

const rows: string[] = ['employeeId,amount,payPeriod'];
const duplicateTracker: string[] = [];

for (let i = 0; i < 500; i++) {
  const employeeId = employeeIds[Math.floor(Math.random() * employeeIds.length)];
  const payPeriod = randomPayPeriod();
  rows.push(toCsvRow(employeeId, randomAmount(), payPeriod));
  if (i < 5) {
    duplicateTracker.push(toCsvRow(employeeId, randomAmount(), payPeriod));
  }
}

for (let i = 0; i < 10; i++) {
  rows.push(toCsvRow('', randomAmount(), randomPayPeriod()));
}

for (let i = 0; i < 5; i++) {
  rows.push(toCsvRow(employeeIds[i], '', randomPayPeriod()));
}

for (let i = 0; i < 5; i++) {
  const invalidAmounts = ['-500', 'abc', '0', '-1000', 'NaN'];
  rows.push(toCsvRow(employeeIds[i], invalidAmounts[i], randomPayPeriod()));
}

for (let i = 0; i < 5; i++) {
  const invalidPayPeriods = ['not-a-date', '2025-13', '2025-0', '2025-06-01', '2025/01/01'];
  rows.push(toCsvRow(employeeIds[i], randomAmount(), invalidPayPeriods[i]));
}

rows.push(...duplicateTracker);

const outputPath = resolve(__dirname, '../sample-payroll.csv');
writeFileSync(outputPath, rows.join('\n'), 'utf-8');

console.log(`Generated ${rows.length - 1} data rows at ${outputPath}`);
