export async function mockDisbursementFunction(data: {
  employeeId: string;
  amount: number;
  payPeriod: string;
}): Promise<{ transactionId: string }> {
  const delay = Math.floor(Math.random() * 1300) + 200;
  await new Promise((resolve) => setTimeout(resolve, delay));

  if (Math.random() < 0.2) {
    throw new Error(
      `Disbursement failed for employee ${data.employeeId}: downstream payment gateway error`,
    );
  }

  return { transactionId: `TXN-${Date.now()}-${data.employeeId}` };
}
