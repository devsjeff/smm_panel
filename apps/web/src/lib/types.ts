// Decimal values arrive from the API as strings.
export type Money = string;

export type Me = { id: string; email: string; name: string; role: 'USER' | 'ADMIN'; balance: Money; currency: string };

export type Paged<T> = { items: T[]; total: number; page: number; pages: number };

export type OrderStatus = 'PENDING' | 'PROCESSING' | 'IN_PROGRESS' | 'COMPLETED' | 'PARTIAL' | 'CANCELED' | 'FAILED';

export type Service = {
  id: number;
  name: string;
  type: string;
  rate: Money;
  min: number;
  max: number;
  refill: boolean;
  cancel: boolean;
};
export type Category = { id: string; name: string; services: Service[] };

export type Order = {
  id: number;
  link: string;
  quantity: number;
  charge: Money;
  refundedAmount: Money;
  status: OrderStatus;
  startCount: number | null;
  remains: number | null;
  createdAt: string;
  service: { id: number; name: string };
};

export type Transaction = {
  id: string;
  type: 'DEPOSIT' | 'ORDER' | 'REFUND' | 'ADJUSTMENT';
  amount: Money;
  balanceAfter: Money;
  note: string | null;
  orderId: number | null;
  createdAt: string;
};

export type Deposit = {
  id: string;
  amount: Money;
  method: string;
  reference: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  adminNote: string | null;
  createdAt: string;
};

export type Dashboard = {
  balance: Money;
  totalOrders: number;
  activeOrders: number;
  completedOrders: number;
  totalSpent: Money;
  recent: Order[];
};

export type Wallet = { balance: Money; transactions: Paged<Transaction>; deposits: Deposit[] };

// ---- admin ----

export type AdminProvider = {
  id: string;
  name: string;
  apiUrl: string;
  isActive: boolean;
  markupPercent: string | null;
  balance: Money | null;
  currency: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  _count: { services: number };
};

export type AdminService = Service & {
  providerRate: Money;
  customMarkupPercent: string | null;
  isActive: boolean;
  providerAvailable: boolean;
  providerServiceId: string;
  category: { name: string };
  provider: { name: string; markupPercent: string | null };
};

export type AdminOrder = Order & {
  cost: Money;
  providerOrderId: string | null;
  providerStatus: string | null;
  needsReview: boolean;
  error: string | null;
  attempts: number;
  user: { email: string };
  provider: { name: string };
};

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'BANNED';
  balance: Money;
  createdAt: string;
  _count: { orders: number };
};

export type AdminDeposit = Deposit & { user: { email: string } };

export type AdminStats = {
  users: number;
  orders: Partial<Record<OrderStatus, number>>;
  revenue: Money;
  completedProfit: Money;
  pendingDeposits: number;
  needsReview: number;
  providers: Pick<AdminProvider, 'id' | 'name' | 'balance' | 'currency' | 'isActive' | 'lastError'>[];
};
