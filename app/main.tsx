import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDownLeft, ArrowUpRight, BookOpen, CalendarDays, ChevronDown, CirclePlus, CreditCard, LayoutDashboard, LogOut, Search, Settings2, Wallet, X } from 'lucide-react';
import { calculateCategoryBudgetSummaries, calculateMonthlySummary, filterTransactions, formatTwd, prioritizeCategoryBudgetSummaries } from '../src/finance';
import { dataStore, demoUsers, type Identity, type LedgerData, type EntryInput } from '../src/store';
import type { Category, CategoryBudgetSummary, CreatedLedgerInvitation, Ledger, LedgerInvitation, LedgerMember, MemberRole, PaymentMethod, Transaction, TransactionType } from '../src/types';
import './styles.css';
import './brand.css';
import './category-budget.css';
import './home-budget.css';
import './shared-ledger.css';
import './desktop-layout.css';

const today = new Date().toISOString().slice(0, 10);
const currentMonth = today.slice(0, 7);
type Page = 'overview' | 'records' | 'budget' | 'settings';

function App() {
  const [user, setUser] = useState<Identity | null>(null);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [ledgerId, setLedgerId] = useState('');
  const [data, setData] = useState<LedgerData | null>(null);
  const [page, setPage] = useState<Page>('overview');
  const [month, setMonth] = useState(currentMonth);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [entry, setEntry] = useState<Transaction | null | undefined>(undefined);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [members, setMembers] = useState<LedgerMember[]>([]);
  const [invitations, setInvitations] = useState<LedgerInvitation[]>([]);
  const [shareLink, setShareLink] = useState('');
  const [pendingInviteToken, setPendingInviteToken] = useState(() => new URLSearchParams(window.location.search).get('invite') ?? '');
  const inviteAttempt = useRef('');

  const reloadMembership = useCallback(async (id = ledgerId) => {
    if (dataStore.mode !== 'supabase') return;
    const [memberRows, invitationRows] = await Promise.all([dataStore.ledgerMembers(id), dataStore.ledgerInvitations(id)]);
    setMembers(memberRows);
    setInvitations(invitationRows);
  }, [ledgerId]);

  const reload = useCallback(async (id = ledgerId, selectedMonth = month) => {
    if (!id) return;
    const result = await dataStore.ledgerData(id, selectedMonth);
    setData(result);
  }, [ledgerId, month]);

  useEffect(() => { void dataStore.currentIdentity().then((identity) => setUser(identity)); }, []);
  useEffect(() => {
    if (!user) { setLedgers([]); setLedgerId(''); setData(null); return; }
    void dataStore.ledgers().then((items) => { setLedgers(items); if (items.length) setLedgerId((id) => items.some((item) => item.id === id) ? id : items[0].id); }).catch(showError);
  }, [user]);
  useEffect(() => { if (ledgerId) void reload(ledgerId, month).catch(showError); }, [ledgerId, month, reload]);
  useEffect(() => {
    if (!user || !pendingInviteToken) return;
    const attempt = `${user.id}:${pendingInviteToken}`;
    if (inviteAttempt.current === attempt) return;
    inviteAttempt.current = attempt;
    setBusy(true);
    setNotice('');
    void (async () => {
      try {
        const joinedLedgerId = await dataStore.acceptLedgerInvitation(pendingInviteToken);
        const items = await dataStore.ledgers();
        setLedgers(items);
        setLedgerId(joinedLedgerId);
        setPendingInviteToken('');
        window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash}`);
        setPage('overview');
        setNotice('已加入共用帳本');
      } catch (error) { showError(error); }
      finally { setBusy(false); }
    })();
  }, [user, pendingInviteToken]);
  useEffect(() => {
    if (!user || page !== 'settings' || !ledgerId || data?.ledger.id !== ledgerId || data.ledger.role !== 'owner' || dataStore.mode !== 'supabase') {
      setMembers([]); setInvitations([]); return;
    }
    void reloadMembership(ledgerId).catch(showError);
  }, [user, page, ledgerId, data?.ledger.id, data?.ledger.role, reloadMembership]);

  function showError(error: unknown) {
    if (error instanceof Error) { setNotice(error.message); return; }
    if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
      setNotice(error.message);
      return;
    }
    setNotice('操作失敗，請稍後再試');
  }
  async function run(action: () => Promise<void>, message?: string) {
    setBusy(true); setNotice('');
    try { await action(); if (message) setNotice(message); } catch (error) { showError(error); } finally { setBusy(false); }
  }
  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const email = String(form.get('email')); const password = String(form.get('password'));
    await run(async () => { const identity = authMode === 'login' ? await dataStore.signIn(email, password) : await dataStore.signUp(email, password); setUser(identity); }, '登入成功');
  }
  async function chooseDemo(which: 'a' | 'b') { await run(async () => setUser(await dataStore.demoSignIn(which)), `已登入：${demoUsers[which].displayName}`); }
  async function changeLedger(id: string) { setLedgerId(id); }
  async function addLedger() {
    const name = window.prompt('新帳本名稱'); if (!name?.trim()) return;
    await run(async () => { await dataStore.createLedger(name.trim()); const items = await dataStore.ledgers(); setLedgers(items); setLedgerId(items[items.length - 1]?.id ?? ''); }, '帳本已建立');
  }
  async function logout() { inviteAttempt.current = ''; await run(async () => { await dataStore.signOut(); setUser(null); setNotice('已登出'); }); }
  async function inviteMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const email = String(form.get('email')).trim(); const role = String(form.get('role')) as MemberRole;
    await run(async () => {
      const invitation: CreatedLedgerInvitation = await dataStore.createLedgerInvitation(ledgerId, email, role);
      const url = new URL(window.location.href); url.searchParams.set('invite', invitation.token);
      setShareLink(url.toString());
      await reloadMembership();
    }, '邀請已建立');
  }
  async function updateMemberRole(member: LedgerMember, role: MemberRole) {
    await run(async () => { await dataStore.setLedgerMemberRole(ledgerId, member.userId, role); await reloadMembership(); }, '成員權限已更新');
  }
  async function removeMember(member: LedgerMember) {
    if (!window.confirm(`確定移除 ${member.email}？`)) return;
    await run(async () => { await dataStore.removeLedgerMember(ledgerId, member.userId); await reloadMembership(); }, '成員已移除');
  }
  async function revokeInvitation(invitation: LedgerInvitation) {
    if (!window.confirm(`確定撤銷寄給 ${invitation.email} 的邀請？`)) return;
    await run(async () => { await dataStore.revokeLedgerInvitation(invitation.id); await reloadMembership(); }, '邀請已撤銷');
  }
  async function copyShareLink() {
    try { await navigator.clipboard.writeText(shareLink); setNotice('邀請連結已複製'); }
    catch { setNotice('無法自動複製，請手動複製邀請連結'); }
  }

  const summary = useMemo(() => calculateMonthlySummary(data?.transactions ?? [], month, data?.budget?.amount ?? 0), [data, month]);
  const categoryBudgetSummaries = useMemo(() => calculateCategoryBudgetSummaries(data?.categoryBudgets ?? [], data?.transactions ?? [], month), [data, month]);
  const homepageCategoryBudgets = useMemo(() => prioritizeCategoryBudgetSummaries(categoryBudgetSummaries), [categoryBudgetSummaries]);
  const availableBudgetCategories = useMemo(() => (data?.categories ?? []).filter((category) => category.type === 'expense' && category.active && !(data?.categoryBudgets ?? []).some((budget) => budget.month === month && budget.categoryId === category.id)), [data, month]);
  const filtered = useMemo(() => filterTransactions(data?.transactions ?? [], { month, query, type: typeFilter, categoryId: categoryFilter }), [data, month, query, typeFilter, categoryFilter]);
  async function saveTransaction(input: EntryInput, id?: string) { await run(async () => { await dataStore.saveEntry(ledgerId, input, id); setEntry(undefined); await reload(); }, id ? '明細已更新' : '明細已新增'); }
  async function removeTransaction(row: Transaction) { if (!window.confirm(`刪除「${row.description || row.categoryName}」？`)) return; await run(async () => { await dataStore.deleteEntry(row.id); await reload(); }, '明細已刪除'); }
  async function saveBudget(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const amount = Number(new FormData(event.currentTarget).get('amount')); await run(async () => { await dataStore.saveBudget(ledgerId, month, amount); await reload(); }, '預算已儲存'); }
  async function addCategoryBudget(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); const categoryId = String(values.get('categoryId')); const amount = Number(values.get('amount')); await run(async () => { await dataStore.saveCategoryBudget(ledgerId, month, categoryId, amount); await reload(); }, '分類預算已新增'); form.reset(); }
  async function saveCategoryBudget(categoryId: string, amount: number) { await run(async () => { await dataStore.saveCategoryBudget(ledgerId, month, categoryId, amount); await reload(); }, '分類預算已更新'); }
  async function removeCategoryBudget(categoryId: string) { if (!window.confirm('確定刪除此分類預算？')) return; await run(async () => { await dataStore.deleteCategoryBudget(ledgerId, month, categoryId); await reload(); }, '分類預算已刪除'); }

  if (!user) return <main className="auth-wrap"><section className="auth-card"><div className="logo-mark"><Wallet size={25} /></div><p className="eyebrow">YOUR MONEY, IN VIEW</p><h1>每月預算記帳本</h1><p className="muted">讓日常收支，回到清楚而安心的節奏。</p><div className="auth-tabs"><button className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>登入</button><button className={authMode === 'signup' ? 'active' : ''} onClick={() => setAuthMode('signup')}>建立帳號</button></div><form onSubmit={login} className="stack"><label>Email<input name="email" type="email" placeholder="you@example.com" required autoComplete="email" /></label><label>密碼<input name="password" type="password" required minLength={6} autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} /></label><button className="primary full" disabled={busy}>{authMode === 'login' ? '登入帳本' : '建立帳號'}</button></form>{dataStore.mode === 'demo' && <div className="demo-box"><span>本機示範模式・資料只存於此瀏覽器</span><div className="demo-actions"><button onClick={() => void chooseDemo('a')}>使用者 A</button><button onClick={() => void chooseDemo('b')}>使用者 B</button></div></div>}{notice && <p role="status" className="notice">{notice}</p>}</section></main>;

  const nav: { id: Page; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: '總覽', icon: <LayoutDashboard size={18} /> },
    { id: 'records', label: '收支明細', icon: <BookOpen size={18} /> },
    { id: 'budget', label: '月預算', icon: <CalendarDays size={18} /> },
    { id: 'settings', label: '帳本設定', icon: <Settings2 size={18} /> },
  ];
  return <div className="app-shell"><header className="topbar"><a className="brand" href="#overview"><span className="brand-title">每月預算記帳本</span><small className="brand-version">V2</small></a><div className="header-controls"><label className="ledger-select"><BookOpen size={16} /><select aria-label="選擇帳本" value={ledgerId} onChange={(e) => void changeLedger(e.target.value)}>{ledgers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={14} /></label><label className="month-select"><input aria-label="選擇月份" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label><span className="user-chip">{user.displayName}</span><button className="icon-button logout" aria-label="登出" title="登出" onClick={() => void logout()}><LogOut size={17} /></button></div></header><div className="layout"><aside className="sidebar"><p className="side-label">工作區</p>{nav.map((item) => <button key={item.id} className={`nav-item ${page === item.id ? 'selected' : ''}`} onClick={() => setPage(item.id)}>{item.icon}<span>{item.label}</span></button>)}<button className="nav-item add-ledger" onClick={() => void addLedger()}><CirclePlus size={18} /><span>新增帳本</span></button><div className="sidebar-foot"><span className="avatar">{user.displayName.slice(-1)}</span><div><b>{user.displayName}</b><small>{user.email}</small></div></div></aside><main className={`content content-${page}`}><div className="mobile-title"><span>每月預算記帳本</span><span>{user.displayName}</span></div>{notice && <div className="toast" role="status">{notice}<button aria-label="關閉通知" onClick={() => setNotice('')}><X size={15} /></button></div>}{!data ? ledgers.length === 0 ? <section className="panel empty first-ledger"><b>尚未建立帳本</b><small>先建立個人或共用帳本，即可開始記帳。</small><button className="primary" onClick={() => void addLedger()}>建立我的帳本</button></section> : <div className="loading">載入帳本中…</div> : <>
    {page === 'overview' && <><div className="page-heading"><div><p className="eyebrow">MONTHLY OVERVIEW</p><h1>收支總覽</h1><p className="muted">{month.replace('-', ' 年 ')} 月・{data.ledger.name}</p></div><button className="primary" onClick={() => setEntry(null)}><CirclePlus size={17} />新增明細</button></div><section className="summary-grid"><SummaryCard label="本月收入" amount={summary.income} icon={<ArrowDownLeft />} kind="income" /><SummaryCard label="本月支出" amount={summary.expense} icon={<ArrowUpRight />} kind="expense" /><SummaryCard label="結餘" amount={summary.balance} icon={<Wallet />} kind="balance" /></section><section className="overview-grid"><article className="panel budget-panel"><div className="panel-title"><div><span className="icon-tile purple"><CalendarDays size={18} /></span><div><h2>本月預算</h2><p className="muted">支出使用狀況</p></div></div><button className="text-button" onClick={() => setPage('budget')}>管理預算 ↗</button></div><div className="home-budget-totals"><div><small>總預算</small><b>{formatTwd(summary.budget)}</b></div><div><small>已支出</small><b>{formatTwd(summary.expense)}</b></div><div><small>剩餘</small><b className={summary.remaining < 0 ? 'negative' : ''}>{summary.remaining < 0 ? '超支 ' : ''}{formatTwd(Math.abs(summary.remaining))}</b></div><div><small>使用比例</small><b>{summary.budget > 0 ? `${summary.budgetUsedPercent}%` : '—'}</b></div></div><div className="progress" aria-label="本月總預算使用比例"><span style={{ width: `${summary.budget > 0 ? Math.min(summary.budgetUsedPercent, 100) : 0}%` }} /></div><div className="home-budget-category-heading"><b>分類預算摘要</b><small>已花 / 預算</small></div>{homepageCategoryBudgets.length === 0 ? <p className="home-budget-empty">尚未設定分類預算</p> : <div className="home-budget-category-list">{homepageCategoryBudgets.map((budget) => { const category = data.categories.find((item) => item.id === budget.categoryId); const over = budget.remaining < 0; const near = !over && budget.usedPercent !== null && budget.usedPercent >= 80; const status = over ? `已超支${budget.usedPercent === null ? '' : ` · ${budget.usedPercent}%`}` : near ? `接近上限 · ${budget.usedPercent}%` : budget.usedPercent === null ? '未使用' : `${budget.usedPercent}%`; return <div className="home-budget-category" key={`${budget.month}-${budget.categoryId}`}><div><b>{category?.name ?? '已移除分類'}</b><small>{formatTwd(budget.spent)} / {formatTwd(budget.amount)}</small></div><span className={`home-budget-status${over ? ' over' : near ? ' near' : ''}`}>{status}</span></div>; })}</div>}</article><article className="panel recent-panel"><div className="panel-title"><div><span className="icon-tile peach"><BookOpen size={18} /></span><div><h2>最近明細</h2><p className="muted">本月最新收支</p></div></div><button className="text-button" onClick={() => setPage('records')}>全部明細 ↗</button></div><TransactionList rows={filtered.slice(0, 4)} onEdit={(row) => setEntry(row)} onDelete={removeTransaction} /></article></section></>}
    {page === 'records' && <><div className="page-heading"><div><p className="eyebrow">TRANSACTIONS</p><h1>收支明細</h1><p className="muted">搜尋並管理帳本中的收支紀錄</p></div><button className="primary" onClick={() => setEntry(null)}><CirclePlus size={17} />新增明細</button></div><section className="panel records-panel"><div className="filters"><label className="search-field"><Search size={17} /><input aria-label="搜尋明細" placeholder="搜尋描述、分類或付款方式" value={query} onChange={(e) => setQuery(e.target.value)} /></label><select aria-label="收支類型" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as 'all' | TransactionType)}><option value="all">全部類型</option><option value="expense">支出</option><option value="income">收入</option></select><select aria-label="明細分類" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}><option value="all">全部分類</option>{data.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><TransactionList rows={filtered} onEdit={(row) => setEntry(row)} onDelete={removeTransaction} /></section></>}
    {page === 'budget' && <>
      <div className="page-heading"><div><p className="eyebrow">MONTHLY PLAN</p><h1>月預算</h1><p className="muted">設定 {month} 的支出目標</p></div></div>
      <section className="panel budget-editor"><span className="icon-tile purple"><CalendarDays size={19} /></span><h2>每月支出預算</h2><p className="muted">預算以帳本與月份分開保存，隨時可以調整。</p><div className="budget-highlight"><span>已支出</span><b>{formatTwd(summary.expense)}</b><span>剩餘 {formatTwd(summary.remaining)}</span></div><form onSubmit={saveBudget}><label>本月預算金額（TWD）<div className="amount-input"><span>$</span><input aria-label="本月預算金額" name="amount" type="number" min="0" step="1" defaultValue={data.budget?.amount ?? 0} required /></div></label><button className="primary" disabled={busy}>儲存預算</button></form></section>
      <section className="panel category-budget-panel">
        <div className="category-budget-heading"><div><p className="eyebrow">CATEGORY PLAN</p><h2>分類預算</h2><p className="muted">依本月支出明細計算各分類使用狀況。</p></div><span className="icon-tile purple"><CalendarDays size={19} /></span></div>
        {availableBudgetCategories.length > 0 && <form className="category-budget-add" onSubmit={addCategoryBudget}>
          <label>支出分類<select aria-label="預算分類" name="categoryId" defaultValue={availableBudgetCategories[0]?.id} required>{availableBudgetCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label>預算金額（TWD）<input aria-label="分類預算金額" name="amount" type="number" min="0" max="1000000000000" step="1" placeholder="0" required /></label>
          <button className="primary" type="submit" disabled={busy}>新增分類預算</button>
        </form>}
        {categoryBudgetSummaries.length === 0 ? <div className="category-budget-empty"><b>本月尚未設定分類預算</b><small>選擇支出分類並輸入金額，即可開始追蹤使用狀況。</small></div> : <div className="category-budget-list">{categoryBudgetSummaries.map((budget) => {
          const category = data.categories.find((item) => item.id === budget.categoryId);
          return category ? <CategoryBudgetRow key={`${budget.month}-${budget.categoryId}-${budget.amount}`} category={category} budget={budget} busy={busy} onSave={(amount) => saveCategoryBudget(category.id, amount)} onDelete={() => removeCategoryBudget(category.id)} /> : null;
        })}</div>}
      </section>
    </>}
    {page === 'settings' && <><div className="page-heading"><div><p className="eyebrow">LEDGER SETTINGS</p><h1>帳本設定</h1><p className="muted">管理分類與付款方式，停用後仍保留舊明細記錄</p></div></div><div className="settings-grid"><ConfigPanel title="收支分類" description="按收入或支出分類，可調整排序與啟用狀態" categoryMode categories={data.categories} methods={[]} onSaveCategory={(item, id) => run(async () => { await dataStore.saveCategory(ledgerId, item, id); await reload(); }, '分類已儲存')} onDeleteCategory={(id) => run(async () => { await dataStore.deleteCategory(id); await reload(); }, '分類已刪除')} /><ConfigPanel title="付款方式" description="管理現金、信用卡與其他付款方式" categoryMode={false} categories={[]} methods={data.methods} onSaveMethod={(item, id) => run(async () => { await dataStore.saveMethod(ledgerId, item, id); await reload(); }, '付款方式已儲存')} onDeleteMethod={(id) => run(async () => { await dataStore.deleteMethod(id); await reload(); }, '付款方式已刪除')} /></div>{data.ledger.role === 'owner' && <SharedLedgerPanel enabled={dataStore.mode === 'supabase'} members={members} invitations={invitations} shareLink={shareLink} busy={busy} onInvite={inviteMember} onRoleChange={updateMemberRole} onRemove={removeMember} onRevoke={revokeInvitation} onCopyLink={copyShareLink} />}<article className="panel ledger-info"><h2>帳本與成員</h2><p><b>{data.ledger.name}</b> <span className="role-pill">{data.ledger.role === 'owner' ? '擁有者' : data.ledger.role === 'editor' ? '編輯者' : '檢視者'}</span></p><p className="muted">幣別：新台幣（TWD）・成員權限由帳本擁有者管理</p></article></>}
    </>}</main></div><nav className="bottom-nav">{nav.map((item) => <button key={item.id} className={page === item.id ? 'selected' : ''} onClick={() => setPage(item.id)}>{item.icon}<span>{item.label}</span></button>)}</nav>{entry !== undefined && data && <EntryDialog row={entry} data={data} onClose={() => setEntry(undefined)} onSave={saveTransaction} />}</div>;
}

function SharedLedgerPanel({ enabled, members, invitations, shareLink, busy, onInvite, onRoleChange, onRemove, onRevoke, onCopyLink }: { enabled: boolean; members: LedgerMember[]; invitations: LedgerInvitation[]; shareLink: string; busy: boolean; onInvite: (event: React.FormEvent<HTMLFormElement>) => void; onRoleChange: (member: LedgerMember, role: MemberRole) => void; onRemove: (member: LedgerMember) => void; onRevoke: (invitation: LedgerInvitation) => void; onCopyLink: () => void }) {
  return <article className="panel shared-ledger-panel"><div className="shared-panel-heading"><div><h2>共用帳本成員</h2><p className="muted">建立邀請連結，並管理帳本成員與權限。</p></div><span className="role-pill">擁有者</span></div>{!enabled ? <p className="shared-disabled-note">邀請與成員管理需要連接 Local Supabase；示範模式不提供共用權限。</p> : <><form className="shared-invite-form" onSubmit={(event) => void onInvite(event)}><label>邀請 Email<input aria-label="邀請 Email" name="email" type="email" autoComplete="off" required placeholder="member@example.com" /></label><label>成員權限<select aria-label="邀請權限" name="role" defaultValue="editor"><option value="editor">編輯者</option><option value="viewer">檢視者</option></select></label><button className="primary" type="submit" disabled={busy}>建立邀請</button></form>{shareLink && <div className="shared-link-box"><label>共用邀請連結<input aria-label="共用邀請連結" value={shareLink} readOnly onFocus={(event) => event.currentTarget.select()} /></label><button className="secondary" type="button" onClick={onCopyLink}>複製連結</button><small>請將連結交給受邀者；連結 7 天後失效，且只能使用一次。</small></div>}<section className="shared-list-section"><h3>成員（{members.length}）</h3><div className="shared-member-list">{members.map((member) => <div className="shared-member-row" key={member.userId}><div className="shared-person"><b>{member.displayName || member.email}</b><small>{member.email}</small></div><select aria-label={`成員權限 ${member.email}`} value={member.role} disabled={busy || member.role === 'owner'} onChange={(event) => void onRoleChange(member, event.target.value as MemberRole)}><option value="owner">擁有者</option><option value="editor">編輯者</option><option value="viewer">檢視者</option></select>{member.role !== 'owner' && <button className="danger-button" type="button" aria-label={`移除成員 ${member.email}`} disabled={busy} onClick={() => void onRemove(member)}>移除</button>}</div>)}</div></section><section className="shared-list-section"><h3>待處理邀請（{invitations.length}）</h3>{invitations.length ? <div className="shared-invitation-list">{invitations.map((invitation) => <div className="shared-invitation-row" key={invitation.id}><div className="shared-person"><b>{invitation.email}</b><small>{invitation.role === 'editor' ? '編輯者' : '檢視者'}・到期 {new Date(invitation.expiresAt).toLocaleDateString('zh-TW')}</small></div><button className="danger-button" type="button" aria-label={`撤銷邀請 ${invitation.email}`} disabled={busy} onClick={() => void onRevoke(invitation)}>撤銷</button></div>)}</div> : <p className="muted">目前沒有待處理邀請。</p>}</section></>}</article>;
}

function SummaryCard({ label, amount, icon, kind }: { label: string; amount: number; icon: React.ReactNode; kind: string }) { return <article className={`summary-card ${kind}`}><div className="summary-top"><span>{label}</span><i>{icon}</i></div><strong>{formatTwd(amount)}</strong><small>{kind === 'income' ? '本月累計收入' : kind === 'expense' ? '本月累計支出' : '收入扣除支出'}</small></article>; }
function CategoryBudgetRow({ category, budget, busy, onSave, onDelete }: { category: Category; budget: CategoryBudgetSummary; busy: boolean; onSave: (amount: number) => void; onDelete: () => void }) {
  const [amount, setAmount] = useState(String(budget.amount));
  useEffect(() => setAmount(String(budget.amount)), [budget.amount]);
  const progress = Math.min(budget.usedPercent ?? 0, 100);
  return <article className="category-budget-item" data-testid={`category-budget-${category.id}`}>
    <div className="category-budget-item-heading"><div><b>{category.name}</b>{!category.active && <span className="category-budget-inactive">已停用分類</span>}</div><span className={`category-budget-usage ${budget.remaining < 0 ? 'negative' : ''}`}>{budget.usedPercent === null ? '—' : `${budget.usedPercent}%`}</span></div>
    <div className="category-budget-progress" role="progressbar" aria-label={`${category.name} 預算使用比例`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span className={budget.remaining < 0 ? 'over' : ''} style={{ width: `${progress}%` }} /></div>
    <div className="category-budget-stats"><div><small>預算額</small><b>{formatTwd(budget.amount)}</b></div><div><small>當月已花</small><b>{formatTwd(budget.spent)}</b></div><div><small>剩餘額</small><b className={budget.remaining < 0 ? 'negative' : ''}>{formatTwd(budget.remaining)}</b></div><div><small>使用比例</small><b>{budget.usedPercent === null ? '—' : `${budget.usedPercent}%`}</b></div></div>
    <form className="category-budget-edit" onSubmit={(event) => { event.preventDefault(); onSave(Number(new FormData(event.currentTarget).get('amount'))); }}>
      <label>修改預算<input aria-label={`分類預算金額 ${category.name}`} name="amount" type="number" min="0" max="1000000000000" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
      <button className="secondary" type="submit" disabled={busy}>儲存</button>
      <button className="danger-button" type="button" disabled={busy} onClick={onDelete}>刪除</button>
    </form>
  </article>;
}
function TransactionList({ rows, onEdit, onDelete }: { rows: Transaction[]; onEdit: (row: Transaction) => void; onDelete: (row: Transaction) => void }) { if (!rows.length) return <div className="empty"><span>✦</span><b>還沒有符合條件的明細</b><small>調整篩選條件，或新增一筆收支吧。</small></div>; return <div className="transaction-list">{rows.map((row) => <div className="transaction-row" key={row.id}><span className={`tx-icon ${row.type}`}>{row.type === 'expense' ? <ArrowUpRight size={17} /> : <ArrowDownLeft size={17} />}</span><div className="tx-main"><b>{row.description || row.categoryName}</b><small>{row.occurredOn}・{row.categoryName}・{row.paymentMethodName}</small></div><strong className={row.type === 'expense' ? 'expense-text' : 'income-text'}>{row.type === 'expense' ? '−' : '+'}{formatTwd(row.amount)}</strong><div className="row-actions"><button aria-label={`編輯 ${row.description || row.categoryName}`} onClick={() => onEdit(row)}>編輯</button><button aria-label={`刪除 ${row.description || row.categoryName}`} onClick={() => onDelete(row)}>刪除</button></div></div>)}</div>; }
function EntryDialog({ row, data, onClose, onSave }: { row: Transaction | null; data: LedgerData; onClose: () => void; onSave: (input: EntryInput, id?: string) => Promise<void> }) {
  const [type, setType] = useState<TransactionType>(row?.type ?? 'expense');
  const categories = data.categories.filter((item) => item.active && item.type === type);
  const methods = data.methods.filter((item) => item.active);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); await onSave({ amount: Number(form.get('amount')), type, occurredOn: String(form.get('occurredOn')), description: String(form.get('description')).trim(), categoryId: String(form.get('categoryId')), paymentMethodId: String(form.get('paymentMethodId')) }, row?.id); }
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="entry-title"><div className="modal-head"><div><p className="eyebrow">TRANSACTION</p><h2 id="entry-title">{row ? '編輯明細' : '新增明細'}</h2></div><button className="icon-button" aria-label="關閉" onClick={onClose}><X size={20} /></button></div><form onSubmit={submit} className="entry-form"><div className="type-switch"><button type="button" className={type === 'expense' ? 'selected expense' : ''} onClick={() => setType('expense')}>支出</button><button type="button" className={type === 'income' ? 'selected income' : ''} onClick={() => setType('income')}>收入</button></div><label>金額（TWD）<input aria-label="金額" name="amount" type="number" min="1" max="1000000000000" step="1" defaultValue={row?.amount ?? ''} placeholder="0" required /></label><label>日期<input aria-label="日期" name="occurredOn" type="date" defaultValue={row?.occurredOn ?? today} required /></label><label>分類<select aria-label="分類" name="categoryId" defaultValue={row?.categoryId ?? categories[0]?.id} required>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>付款方式<select aria-label="付款方式" name="paymentMethodId" defaultValue={row?.paymentMethodId ?? methods[0]?.id} required>{methods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>備註<input aria-label="備註" name="description" maxLength={240} defaultValue={row?.description ?? ''} placeholder="例如：午餐、薪資" /></label><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary" type="submit">{row ? '儲存變更' : '新增明細'}</button></div></form></section></div>;
}
function ConfigPanel({ title, description, categories, methods, categoryMode, onSaveCategory, onDeleteCategory, onSaveMethod, onDeleteMethod }: { title: string; description: string; categories: Category[]; methods: PaymentMethod[]; categoryMode: boolean; onSaveCategory?: (item: Omit<Category, 'id'>, id?: string) => Promise<void>; onDeleteCategory?: (id: string) => Promise<void>; onSaveMethod?: (item: Omit<PaymentMethod, 'id'>, id?: string) => Promise<void>; onDeleteMethod?: (id: string) => Promise<void> }) {
  const [name, setName] = useState(''); const [kind, setKind] = useState<TransactionType>('expense');
  const save = async () => { if (!name.trim()) return; if (categoryMode) await onSaveCategory?.({ name: name.trim(), type: kind, sortOrder: Math.max(0, ...categories.map((item) => item.sortOrder)) + 10, active: true }); else await onSaveMethod?.({ name: name.trim(), sortOrder: Math.max(0, ...methods.map((item) => item.sortOrder)) + 10, active: true }); setName(''); };
  return <article className="panel config-panel"><div className="config-heading"><div><h2>{title}</h2><p className="muted">{description}</p></div>{categoryMode ? <CreditCard size={19} /> : <Wallet size={19} />}</div><div className="config-items">{categories.map((item) => <ConfigItem key={item.id} name={item.name} active={item.active} sortOrder={item.sortOrder} type={item.type} onChange={(patch) => void onSaveCategory?.({ ...item, ...patch }, item.id)} onDelete={() => void onDeleteCategory?.(item.id)} />)}{methods.map((item) => <ConfigItem key={item.id} name={item.name} active={item.active} sortOrder={item.sortOrder} onChange={(patch) => void onSaveMethod?.({ ...item, ...patch }, item.id)} onDelete={() => void onDeleteMethod?.(item.id)} />)}</div><div className="config-add"><input aria-label={`新增${title}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="輸入名稱" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void save(); } }} />{categoryMode && <select aria-label="分類類型" value={kind} onChange={(e) => setKind(e.target.value as TransactionType)}><option value="expense">支出</option><option value="income">收入</option></select>}<button className="primary" onClick={() => void save()}>新增</button></div></article>;
}
function ConfigItem({ name, active, sortOrder, type, onChange, onDelete }: { name: string; active: boolean; sortOrder: number; type?: TransactionType; onChange: (patch: { name?: string; active?: boolean; sortOrder?: number }) => void; onDelete: () => void }) { const [draft, setDraft] = useState(name); return <div className={`config-item ${!active ? 'disabled' : ''}`}><input aria-label={`編輯名稱 ${name}`} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => { if (draft.trim() && draft !== name) onChange({ name: draft.trim() }); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} /><span className="kind-label">{type === 'income' ? '收入' : type === 'expense' ? '支出' : '付款'}</span><label className="sort-control" title="排序"><span>排序</span><input aria-label={`排序 ${name}`} type="number" value={sortOrder} onChange={(e) => onChange({ sortOrder: Number(e.target.value) })} /></label><button className={`status-toggle ${active ? 'on' : ''}`} aria-label={`${active ? '停用' : '啟用'} ${name}`} onClick={() => onChange({ active: !active })}>{active ? '使用中' : '已停用'}</button><button className="delete-config" aria-label={`刪除 ${name}`} onClick={() => onDelete()}>×</button></div>; }

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
