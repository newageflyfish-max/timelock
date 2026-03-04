const VOLTAGE_API_KEY = process.env.VOLTAGE_API_KEY ?? "";
const VOLTAGE_NODE_ID = process.env.VOLTAGE_NODE_ID ?? "";
const VOLTAGE_BASE_URL = "https://api.voltage.cloud";
const LIGHTNING_ENABLED = process.env.LIGHTNING_ENABLED === "true";

interface CreateInvoiceResponse {
  invoice: string;
  paymentHash: string;
  expiryAt: Date;
}

interface CheckInvoiceResponse {
  paid: boolean;
  settledAt?: Date;
}

interface PayInvoiceResponse {
  success: boolean;
  paymentHash?: string;
  error?: string;
}

interface NodeBalanceResponse {
  confirmedBalance: number;
  unconfirmedBalance: number;
}

class VoltageError extends Error {
  constructor(
    message: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "VoltageError";
  }
}

function isLightningEnabled(): boolean {
  return LIGHTNING_ENABLED && !!VOLTAGE_API_KEY && !!VOLTAGE_NODE_ID;
}

async function voltageRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const url = `${VOLTAGE_BASE_URL}/v1/node/${VOLTAGE_NODE_ID}${path}`;

  console.log(`[LIGHTNING] ${method} ${path}`);

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VOLTAGE_API_KEY,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (err) {
    console.log("[LIGHTNING] Network error:", (err as Error).message);
    throw new VoltageError("Lightning service unavailable");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    console.log(`[LIGHTNING] API error ${res.status}: ${text}`);

    if (res.status === 503 || res.status === 502) {
      throw new VoltageError("Lightning service unavailable", res.status);
    }
    throw new VoltageError(
      `Lightning API error: ${res.status}`,
      res.status
    );
  }

  return res.json() as Promise<T>;
}

// --- Mock implementations (used when LIGHTNING_ENABLED=false) ---

function mockCreateInvoice(
  amountSats: number,
  taskId: string,
  expirySeconds: number
): CreateInvoiceResponse {
  const mockHash = taskId.replace(/-/g, "").slice(0, 32).padEnd(32, "0");
  const invoice = `lnbc${amountSats}mock${mockHash.slice(0, 16)}`;
  console.log(
    `[LIGHTNING MOCK] Created invoice for ${amountSats} sats (task: ${taskId.slice(0, 8)})`
  );
  return {
    invoice,
    paymentHash: mockHash,
    expiryAt: new Date(Date.now() + expirySeconds * 1000),
  };
}

function mockCheckInvoice(): CheckInvoiceResponse {
  console.log("[LIGHTNING MOCK] Checking invoice — returning unpaid");
  return { paid: false };
}

function mockPayInvoice(
  invoice: string,
  amountSats: number
): PayInvoiceResponse {
  const mockHash = `mock_pay_${Date.now().toString(16)}`;
  console.log(
    `[LIGHTNING MOCK] Paid ${amountSats} sats to ${invoice.slice(0, 20)}...`
  );
  return { success: true, paymentHash: mockHash };
}

function mockGetBalance(): NodeBalanceResponse {
  console.log("[LIGHTNING MOCK] Returning mock balance");
  return { confirmedBalance: 1_000_000, unconfirmedBalance: 0 };
}

// --- Public API ---

export async function createHoldInvoice(
  amountSats: number,
  taskId: string,
  expirySeconds: number = 3600
): Promise<CreateInvoiceResponse> {
  if (!isLightningEnabled()) {
    return mockCreateInvoice(amountSats, taskId, expirySeconds);
  }

  const data = await voltageRequest<{
    payment_request: string;
    r_hash: string;
  }>("POST", "/payments/createinvoice", {
    value: amountSats,
    memo: `Timelock escrow: ${taskId}`,
    expiry: expirySeconds,
  });

  console.log(
    `[LIGHTNING] Invoice created for ${amountSats} sats (task: ${taskId.slice(0, 8)}, hash: ${data.r_hash.slice(0, 16)})`
  );

  return {
    invoice: data.payment_request,
    paymentHash: data.r_hash,
    expiryAt: new Date(Date.now() + expirySeconds * 1000),
  };
}

export async function checkInvoicePaid(
  paymentHash: string
): Promise<CheckInvoiceResponse> {
  if (!isLightningEnabled()) {
    return mockCheckInvoice();
  }

  const data = await voltageRequest<{
    settled: boolean;
    settle_date: number;
  }>("GET", `/payments/invoice/${paymentHash}`);

  console.log(
    `[LIGHTNING] Invoice ${paymentHash.slice(0, 16)} settled: ${data.settled}`
  );

  return {
    paid: data.settled,
    ...(data.settled && data.settle_date > 0
      ? { settledAt: new Date(data.settle_date * 1000) }
      : {}),
  };
}

export async function payInvoice(
  invoice: string,
  amountSats: number
): Promise<PayInvoiceResponse> {
  if (!isLightningEnabled()) {
    return mockPayInvoice(invoice, amountSats);
  }

  try {
    const data = await voltageRequest<{
      payment_hash: string;
      status: string;
    }>("POST", "/payments/payinvoice", {
      payment_request: invoice,
      amt: amountSats,
    });

    console.log(
      `[LIGHTNING] Payment sent: ${amountSats} sats (hash: ${data.payment_hash.slice(0, 16)}, status: ${data.status})`
    );

    if (data.status === "FAILED") {
      return { success: false, error: "Payment failed" };
    }

    return { success: true, paymentHash: data.payment_hash };
  } catch (err) {
    const message = err instanceof VoltageError ? err.message : "Payment failed";
    console.log(`[LIGHTNING] Payment error: ${message}`);
    return { success: false, error: message };
  }
}

export async function getNodeBalance(): Promise<NodeBalanceResponse> {
  if (!isLightningEnabled()) {
    return mockGetBalance();
  }

  const data = await voltageRequest<{
    confirmed_balance: number;
    unconfirmed_balance: number;
  }>("GET", "/balance");

  console.log(
    `[LIGHTNING] Balance: ${data.confirmed_balance} confirmed, ${data.unconfirmed_balance} unconfirmed`
  );

  return {
    confirmedBalance: data.confirmed_balance,
    unconfirmedBalance: data.unconfirmed_balance,
  };
}

export { VoltageError, isLightningEnabled };
