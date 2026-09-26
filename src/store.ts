import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { Budget, Category, CategoryBudget, CreatedLedgerInvitation, Ledger, LedgerInvitation, LedgerMember, MemberRole, PaymentMethod, Transaction, TransactionType } from './types';

export interface Identity { id: string; email: string; displayName: string }
export interface LedgerData { ledger: Ledger; categories: Category[]; methods: PaymentMethod[]; transactions: Transaction[]; budget: Budget | null; categoryBudgets: CategoryBudget[] }
export interface EntryInput { amount: number; type: TransactionType; occurredOn: string; description: string; categoryId: string; paymentMethodId: string }
export interface Store {
  readonly mode: 'demo' | 'supabase';
  currentIdentity(): Promise<Identity | null>;
  signIn(email: string, password: string): Promise<Identity>;
  signUp(email: string, password: string): Promise<Identity>;
  demoSignIn(user: 'a' | 'b'): Promise<Identity>;
  signOut(): Promise<void>;
  ledgers(): Promise<Ledger[]>;
  createLedger(name: string): Promise<void>;
  createLedgerInvitation(ledgerId: string, email: string, role: MemberRole): Promise<CreatedLedgerInvitation>;
  acceptLedgerInvitation(token: string): Promise<string>;
  ledgerMembers(ledgerId: string): Promise<LedgerMember[]>;
  ledgerInvitations(ledgerId: string): Promise<LedgerInvitation[]>;
  setLedgerMemberRole(ledgerId: string, userId: string, role: MemberRole): Promise<void>;
  removeLedgerMember(ledgerId: string, userId: string): Promise<void>;
  revokeLedgerInvitation(invitationId: string): Promise<void>;
  ledgerData(ledgerId: string, month: string): Promise<LedgerData>;
  saveEntry(ledgerId: string, input: EntryInput, id?: string): Promise<void>;
  deleteEntry(id: string): Promise<void>;
  saveBudget(ledgerId: string, month: string, amount: number): Promise<void>;
  saveCategoryBudget(ledgerId: string, month: string, categoryId: string, amount: number): Promise<void>;
  deleteCategoryBudget(ledgerId: string, month: string, categoryId: string): Promise<void>;
  saveCategory(ledgerId: string, category: Omit<Category, 'id'>, id?: string): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  saveMethod(ledgerId: string, method: Omit<PaymentMethod, 'id'>, id?: string): Promise<void>;
  deleteMethod(id: string): Promise<void>;
}

const DEMO_KEY = 'mbb-v2-demo-store';
const DEMO_SESSION = 'mbb-v2-demo-session';
const DEMO_USERS: Record<'a' | 'b', Identity> = {
  a: { id: 'synthetic-user-a', email: 'user-a@example.test', displayName: '示範使用者 A' },
  b: { id: 'synthetic-user-b', email: 'user-b@example.test', displayName: '示範使用者 B' },
};
type DemoDb = { ledgers: Ledger[]; owners: Record<string, string>; data: Record<string, Omit<LedgerData, 'ledger'>> };

function demoDb(): DemoDb {
  const existing = localStorage.getItem(DEMO_KEY);
  if (existing) {
    const db = JSON.parse(existing) as DemoDb & { owners?: Record<string, string> };
    db.owners ??= Object.fromEntries(db.ledgers.map((ledger) => [ledger.id, ledger.id.endsWith('-a') ? DEMO_USERS.a.id : ledger.id.endsWith('-b') ? DEMO_USERS.b.id : '']));
    return db as DemoDb;
  }
  const db: DemoDb = { ledgers: [], owners: {}, data: {} };
  for (const who of ['a', 'b'] as const) {
    const id = `synthetic-ledger-${who}`;
    const month = new Date().toISOString().slice(0, 7);
    db.ledgers.push({ id, name: who === 'a' ? '我的個人帳本' : '使用者 B 帳本', currency: 'TWD', role: 'owner' });
    db.owners[id] = DEMO_USERS[who].id;
    db.data[id] = {
      categories: [
        { id: `${who}-expense-food`, name: '餐飲', type: 'expense', sortOrder: 10, active: true },
        { id: `${who}-expense-transport`, name: '交通', type: 'expense', sortOrder: 20, active: true },
        { id: `${who}-expense-living`, name: '生活', type: 'expense', sortOrder: 30, active: true },
        { id: `${who}-income-salary`, name: '薪資', type: 'income', sortOrder: 10, active: true },
        { id: `${who}-income-other`, name: '其他收入', type: 'income', sortOrder: 20, active: true },
      ],
      methods: [{ id: `${who}-cash`, name: '現金', sortOrder: 10, active: true }, { id: `${who}-card`, name: '信用卡', sortOrder: 20, active: true }, { id: `${who}-bank`, name: '轉帳', sortOrder: 30, active: true }],
      transactions: [], budget: { month, amount: 20000 }, categoryBudgets: [],
    };
  }
  saveDemo(db);
  return db;
}
function saveDemo(db: DemoDb) { localStorage.setItem(DEMO_KEY, JSON.stringify(db)); }
function identity(user: User): Identity { return { id: user.id, email: user.email ?? '', displayName: user.user_metadata?.display_name ?? user.email ?? '' }; }

class DemoStore implements Store {
  readonly mode = 'demo' as const;
  async currentIdentity() { const key = localStorage.getItem(DEMO_SESSION); return key === 'a' || key === 'b' ? DEMO_USERS[key] : null; }
  async signIn(email: string, _password: string) { const who = email.toLowerCase().includes('b') ? 'b' : 'a'; return this.demoSignIn(who); }
  async signUp(email: string, _password: string) { localStorage.setItem(DEMO_SESSION, 'a'); demoDb(); return { ...DEMO_USERS.a, email, displayName: email.split('@')[0] }; }
  async demoSignIn(user: 'a' | 'b') { localStorage.setItem(DEMO_SESSION, user); demoDb(); return DEMO_USERS[user]; }
  async signOut() { localStorage.removeItem(DEMO_SESSION); }
  async ledgers() { const me = await this.currentIdentity(); if (!me) throw new Error('請先登入'); const db = demoDb(); return db.ledgers.filter((ledger) => db.owners[ledger.id] === me.id); }
  async createLedger(name: string) {
    const me = await this.currentIdentity(); if (!me) throw new Error('請先登入');
    const db = demoDb(); const id = `demo-${crypto.randomUUID()}`;
    const ledger: Ledger = { id, name, currency: 'TWD', role: 'owner' };
    db.ledgers.push(ledger); db.owners[id] = me.id; db.data[id] = { categories: [{ id: `${id}-expense-food`, name: '餐飲', type: 'expense', sortOrder: 10, active: true }, { id: `${id}-income-other`, name: '其他收入', type: 'income', sortOrder: 10, active: true }], methods: [{ id: `${id}-cash`, name: '現金', sortOrder: 10, active: true }], transactions: [], budget: null, categoryBudgets: [] }; saveDemo(db);
  }
  async createLedgerInvitation(_ledgerId: string, _email: string, _role: MemberRole): Promise<CreatedLedgerInvitation> { throw new Error('共用帳本邀請需要連接 Local Supabase'); }
  async acceptLedgerInvitation(_token: string): Promise<string> { throw new Error('加入共用帳本需要連接 Local Supabase'); }
  async ledgerMembers(_ledgerId: string): Promise<LedgerMember[]> { throw new Error('成員管理需要連接 Local Supabase'); }
  async ledgerInvitations(_ledgerId: string): Promise<LedgerInvitation[]> { throw new Error('邀請管理需要連接 Local Supabase'); }
  async setLedgerMemberRole(_ledgerId: string, _userId: string, _role: MemberRole): Promise<void> { throw new Error('成員管理需要連接 Local Supabase'); }
  async removeLedgerMember(_ledgerId: string, _userId: string): Promise<void> { throw new Error('成員管理需要連接 Local Supabase'); }
  async revokeLedgerInvitation(_invitationId: string): Promise<void> { throw new Error('邀請管理需要連接 Local Supabase'); }
  async ledgerData(ledgerId: string, month: string) { const db = demoDb(); const ledger = db.ledgers.find((item) => item.id === ledgerId); const data = db.data[ledgerId]; if (!ledger || !data || !(await this.ledgers()).some((item) => item.id === ledgerId)) throw new Error('沒有此帳本的存取權'); return { ledger, ...data, budget: data.budget?.month === month ? data.budget : null, categoryBudgets: (data.categoryBudgets ?? []).filter((item) => item.month === month) }; }
  async saveEntry(ledgerId: string, input: EntryInput, id?: string) { const db = demoDb(); const data = db.data[ledgerId]; if (!data) throw new Error('帳本不存在'); const category = data.categories.find((item) => item.id === input.categoryId && item.active && item.type === input.type); const method = data.methods.find((item) => item.id === input.paymentMethodId && item.active); if (!category || !method) throw new Error('請選擇有效分類與付款方式'); const row: Transaction = { ...input, id: id ?? crypto.randomUUID(), ledgerId, categoryName: category.name, paymentMethodName: method.name }; const index = data.transactions.findIndex((item) => item.id === id); if (index >= 0) data.transactions[index] = row; else data.transactions.push(row); saveDemo(db); }
  async deleteEntry(id: string) { const db = demoDb(); for (const data of Object.values(db.data)) data.transactions = data.transactions.filter((row) => row.id !== id); saveDemo(db); }
  async saveBudget(ledgerId: string, month: string, amount: number) { const db = demoDb(); const data = db.data[ledgerId]; if (!data) throw new Error('帳本不存在'); data.budget = { month, amount }; saveDemo(db); }
  async saveCategoryBudget(ledgerId: string, month: string, categoryId: string, amount: number) { const db = demoDb(); const data = db.data[ledgerId]; if (!data) throw new Error('帳本不存在'); if (!data.categories.some((item) => item.id === categoryId && item.type === 'expense')) throw new Error('分類預算只適用於支出分類'); if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1_000_000_000_000) throw new Error('預算金額不正確'); const budgets = data.categoryBudgets ??= []; const index = budgets.findIndex((item) => item.month === month && item.categoryId === categoryId); const budget = { month, categoryId, amount }; if (index >= 0) budgets[index] = budget; else budgets.push(budget); saveDemo(db); }
  async deleteCategoryBudget(ledgerId: string, month: string, categoryId: string) { const db = demoDb(); const data = db.data[ledgerId]; if (!data) throw new Error('帳本不存在'); data.categoryBudgets = (data.categoryBudgets ?? []).filter((item) => item.month !== month || item.categoryId !== categoryId); saveDemo(db); }
  async saveCategory(ledgerId: string, category: Omit<Category, 'id'>, id?: string) { const db = demoDb(); const data = db.data[ledgerId]; if (!data) throw new Error('帳本不存在'); const existing = data.categories.find((item) => item.id === id); if (existing) Object.assign(existing, category); else data.categories.push({ ...category, id: crypto.randomUUID() }); saveDemo(db); }
  async deleteCategory(id: string) { const db = demoDb(); for (const data of Object.values(db.data)) { if (data.transactions.some((row) => row.categoryId === id)) throw new Error('分類已被明細使用，請停用而非刪除'); data.categories = data.categories.filter((item) => item.id !== id); } saveDemo(db); }
  async saveMethod(ledgerId: string, method: Omit<PaymentMethod, 'id'>, id?: string) { const db = demoDb(); const data = db.data[ledgerId]; if (!data) throw new Error('帳本不存在'); const existing = data.methods.find((item) => item.id === id); if (existing) Object.assign(existing, method); else data.methods.push({ ...method, id: crypto.randomUUID() }); saveDemo(db); }
  async deleteMethod(id: string) { const db = demoDb(); for (const data of Object.values(db.data)) { if (data.transactions.some((row) => row.paymentMethodId === id)) throw new Error('付款方式已被明細使用，請停用而非刪除'); data.methods = data.methods.filter((item) => item.id !== id); } saveDemo(db); }
}

class SupabaseStore implements Store {
  readonly mode = 'supabase' as const;
  constructor(private client: SupabaseClient) {}
  async currentIdentity() { const { data, error } = await this.client.auth.getUser(); if (error || !data.user) return null; return identity(data.user); }
  async signIn(email: string, password: string) { const { data, error } = await this.client.auth.signInWithPassword({ email, password }); if (error) throw error; return identity(data.user); }
  async signUp(email: string, password: string) { const { data, error } = await this.client.auth.signUp({ email, password, options: { data: { display_name: email.split('@')[0] } } }); if (error) throw error; if (!data.user) throw new Error('註冊失敗'); return identity(data.user); }
  async demoSignIn(_user: 'a' | 'b'): Promise<Identity> { throw new Error('Supabase 模式不支援示範登入，請使用測試帳號登入'); }
  async signOut() { const { error } = await this.client.auth.signOut(); if (error) throw error; }
  async ledgers() {
    const { data: authData, error: authError } = await this.client.auth.getUser();
    if (authError) throw authError;
    if (!authData.user) throw new Error('請先登入');
    const { data: memberships, error: membershipError } = await this.client.from('ledger_members').select('ledger_id,role').eq('user_id', authData.user.id).order('joined_at');
    if (membershipError) throw membershipError;
    const rows = memberships ?? [];
    if (!rows.length) return [];
    const { data: ledgers, error: ledgerError } = await this.client.from('ledgers').select('id,name,currency').in('id', rows.map((row) => row.ledger_id));
    if (ledgerError) throw ledgerError;
    const ledgerById = new Map((ledgers ?? []).map((ledger) => [ledger.id, ledger]));
    return rows.flatMap((membership) => {
      const ledger = ledgerById.get(membership.ledger_id);
      return ledger ? [{ ...ledger, role: membership.role }] : [];
    });
  }
  async createLedger(name: string) { const { error } = await this.client.rpc('create_ledger', { p_name: name }); if (error) throw error; }
  async createLedgerInvitation(ledgerId: string, email: string, role: MemberRole): Promise<CreatedLedgerInvitation> {
    const { data, error } = await this.client.rpc('create_ledger_invitation', { p_ledger_id: ledgerId, p_email: email, p_role: role });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('邀請建立失敗');
    return { id: row.invitation_id, token: row.invite_token, expiresAt: row.expires_at };
  }
  async acceptLedgerInvitation(token: string): Promise<string> {
    const { data, error } = await this.client.rpc('accept_ledger_invitation', { p_token: token });
    if (error) throw error;
    if (typeof data !== 'string') throw new Error('加入共用帳本失敗');
    return data;
  }
  async ledgerMembers(ledgerId: string): Promise<LedgerMember[]> {
    const { data, error } = await this.client.rpc('list_ledger_members', { p_ledger_id: ledgerId });
    if (error) throw error;
    return (data ?? []).map((row: any) => ({ userId: row.user_id, email: row.email, displayName: row.display_name, role: row.role, joinedAt: row.joined_at }));
  }
  async ledgerInvitations(ledgerId: string): Promise<LedgerInvitation[]> {
    const { data, error } = await this.client.rpc('list_ledger_invitations', { p_ledger_id: ledgerId });
    if (error) throw error;
    return (data ?? []).map((row: any) => ({ id: row.invitation_id, email: row.email, role: row.role, createdAt: row.created_at, expiresAt: row.expires_at }));
  }
  async setLedgerMemberRole(ledgerId: string, userId: string, role: MemberRole) {
    const { error } = await this.client.rpc('set_ledger_member_role', { p_ledger_id: ledgerId, p_user_id: userId, p_role: role });
    if (error) throw error;
  }
  async removeLedgerMember(ledgerId: string, userId: string) {
    const { error } = await this.client.rpc('remove_ledger_member', { p_ledger_id: ledgerId, p_user_id: userId });
    if (error) throw error;
  }
  async revokeLedgerInvitation(invitationId: string) {
    const { error } = await this.client.rpc('revoke_ledger_invitation', { p_invitation_id: invitationId });
    if (error) throw error;
  }
  async ledgerData(ledgerId: string, month: string): Promise<LedgerData> {
    const { data: authData, error: authError } = await this.client.auth.getUser();
    if (authError) throw authError;
    if (!authData.user) throw new Error('請先登入');
    const [ledgerRes, membershipRes, catRes, methodRes, txRes, budgetRes, categoryBudgetRes] = await Promise.all([
      this.client.from('ledgers').select('id,name,currency').eq('id', ledgerId).single(),
      this.client.from('ledger_members').select('role').eq('ledger_id', ledgerId).eq('user_id', authData.user.id).maybeSingle(),
      this.client.from('categories').select('id,name,type,sort_order,is_active').eq('ledger_id', ledgerId).order('sort_order'),
      this.client.from('payment_methods').select('id,name,sort_order,is_active').eq('ledger_id', ledgerId).order('sort_order'),
      this.client.from('transactions').select('id,ledger_id,amount,type,occurred_on,description,category_id,payment_method_id,categories(name),payment_methods(name)').eq('ledger_id', ledgerId).gte('occurred_on', `${month}-01`).lt('occurred_on', nextMonth(month)).order('occurred_on', { ascending: false }),
      this.client.from('monthly_budgets').select('month,amount').eq('ledger_id', ledgerId).eq('month', `${month}-01`).maybeSingle(),
      this.client.from('category_monthly_budgets').select('month,category_id,amount').eq('ledger_id', ledgerId).eq('month', `${month}-01`).order('category_id'),
    ]);
    const error = ledgerRes.error ?? membershipRes.error ?? catRes.error ?? methodRes.error ?? txRes.error ?? budgetRes.error ?? categoryBudgetRes.error; if (error) throw error;
    if (!ledgerRes.data || !membershipRes.data) throw new Error('找不到帳本或沒有讀取權限');
    const ledger: Ledger = { id: ledgerRes.data.id, name: ledgerRes.data.name, currency: ledgerRes.data.currency, role: membershipRes.data.role };
    return { ledger, categories: (catRes.data ?? []).map((row: any) => ({ id: row.id, name: row.name, type: row.type, sortOrder: row.sort_order, active: row.is_active })), methods: (methodRes.data ?? []).map((row: any) => ({ id: row.id, name: row.name, sortOrder: row.sort_order, active: row.is_active })), transactions: (txRes.data ?? []).map((row: any) => ({ id: row.id, ledgerId: row.ledger_id, amount: Number(row.amount), type: row.type, occurredOn: row.occurred_on, description: row.description, categoryId: row.category_id, categoryName: row.categories?.name ?? '', paymentMethodId: row.payment_method_id, paymentMethodName: row.payment_methods?.name ?? '' })), budget: budgetRes.data ? { month, amount: Number(budgetRes.data.amount) } : null, categoryBudgets: (categoryBudgetRes.data ?? []).map((row: any) => ({ month: String(row.month).slice(0, 7), categoryId: row.category_id, amount: Number(row.amount) })) };
  }
  async saveEntry(ledgerId: string, input: EntryInput, id?: string) { const payload = { ledger_id: ledgerId, amount: input.amount, type: input.type, occurred_on: input.occurredOn, description: input.description, category_id: input.categoryId, payment_method_id: input.paymentMethodId }; const result = id ? await this.client.from('transactions').update(payload).eq('id', id) : await this.client.from('transactions').insert(payload); if (result.error) throw result.error; }
  async deleteEntry(id: string) { const { error } = await this.client.from('transactions').delete().eq('id', id); if (error) throw error; }
  async saveBudget(ledgerId: string, month: string, amount: number) { const { error } = await this.client.from('monthly_budgets').upsert({ ledger_id: ledgerId, month: `${month}-01`, amount }); if (error) throw error; }
  async saveCategoryBudget(ledgerId: string, month: string, categoryId: string, amount: number) { const { error } = await this.client.from('category_monthly_budgets').upsert({ ledger_id: ledgerId, month: `${month}-01`, category_id: categoryId, amount }, { onConflict: 'ledger_id,month,category_id' }); if (error) throw error; }
  async deleteCategoryBudget(ledgerId: string, month: string, categoryId: string) { const { error } = await this.client.from('category_monthly_budgets').delete().eq('ledger_id', ledgerId).eq('month', `${month}-01`).eq('category_id', categoryId); if (error) throw error; }
  async saveCategory(ledgerId: string, category: Omit<Category, 'id'>, id?: string) { const payload = { ledger_id: ledgerId, name: category.name, type: category.type, sort_order: category.sortOrder, is_active: category.active }; const result = id ? await this.client.from('categories').update(payload).eq('id', id) : await this.client.from('categories').insert(payload); if (result.error) throw result.error; }
  async deleteCategory(id: string) { const { error } = await this.client.from('categories').delete().eq('id', id); if (error) throw error; }
  async saveMethod(ledgerId: string, method: Omit<PaymentMethod, 'id'>, id?: string) { const payload = { ledger_id: ledgerId, name: method.name, sort_order: method.sortOrder, is_active: method.active }; const result = id ? await this.client.from('payment_methods').update(payload).eq('id', id) : await this.client.from('payment_methods').insert(payload); if (result.error) throw result.error; }
  async deleteMethod(id: string) { const { error } = await this.client.from('payment_methods').delete().eq('id', id); if (error) throw error; }
}

function nextMonth(month: string) { const [year, value] = month.split('-').map(Number); return value === 12 ? `${year + 1}-01-01` : `${year}-${String(value + 1).padStart(2, '0')}-01`; }

const configuredUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const configuredKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const tailnetHost = import.meta.env.VITE_TAILNET_HOST as string | undefined;
const tailnetTestMode = import.meta.env.DEV && import.meta.env.VITE_TAILNET_TEST_MODE === 'true';
const useSupabase = import.meta.env.VITE_DEMO_MODE === 'false' && Boolean(configuredUrl && configuredKey);
let store: Store;
if (useSupabase) {
  const parsed = new URL(configuredUrl!);
  const isLoopback = ['127.0.0.1', 'localhost'].includes(parsed.hostname);
  const isTailnetProxy = tailnetTestMode && Boolean(tailnetHost)
    && parsed.hostname === tailnetHost
    && parsed.port === '5173'
    && parsed.pathname === '/supabase/';
  if (!isLoopback && !isTailnetProxy) throw new Error('安全限制：開發版僅允許連線至本機 Supabase；Tailnet 測試須明確啟用本機代理。');
  store = new SupabaseStore(createClient(configuredUrl!, configuredKey!));
} else store = new DemoStore();
export const dataStore = store;
export const demoUsers = DEMO_USERS;
