# Admin Billing System - GUI Design
**URL:** legal.org.ua (admin panel integrated into lexwebapp)
**Purpose:** Административная панель для управления биллингом всех пользователей MCP сервера

---

## 1. Общая структура

### Навигация (Sidebar)

```
┌─────────────────────────────┐
│ SecondLayer Admin           │
│ ───────────────────────────│
│ 📊 Dashboard                │
│ 👥 Users                    │
│ 💳 Transactions             │
│ 💰 Pricing & Tiers          │
│ 📈 Analytics                │
│ 🔑 API Keys                 │
│ ⚙️  Settings                │
│ ───────────────────────────│
│ 🔔 Alerts (3)               │
│ 📤 Export Data              │
│ 👤 Admin: admin@legal.org.ua│
│ 🚪 Logout                   │
└─────────────────────────────┘
```

### Топ бар

```
┌────────────────────────────────────────────────────────────────┐
│ [≡ Toggle] SecondLayer Admin Billing  [🔍 Search users/txn]   │
│                                    [🔔 3] [👤] [⚙️] [English ▾]│
└────────────────────────────────────────────────────────────────┘
```

---

## 2. Dashboard (Главная страница)

### 2.1 Метрики (Top Row)

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ Total Revenue│ Active Users │ Avg. Revenue │ Profit Margin│
│              │              │  per User    │              │
│ $12,450.00   │   342        │  $36.40      │    31.2%     │
│ +18.5% ↑     │   +23 ↑      │  +5.2% ↑     │  +2.1% ↑     │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

### 2.2 Revenue Chart (Большой график)

```
┌────────────────────────────────────────────────────────────┐
│ Revenue Over Time                          [Day|Week|Month]│
│                                                             │
│ $500                                            ╱╲          │
│                                         ╱╲    ╱  ╲         │
│ $400                             ╱╲   ╱  ╲  ╱    ╲        │
│                               ╱╲╱  ╲╱    ╲╱      ╲       │
│ $300                       ╱╲╱                     ╲╱╲    │
│                         ╱╲╱                           ╲   │
│ $200              ╱╲  ╱                                 ╲  │
│              ╱╲╱  ╲╱                                      │
│ $100    ╱╲╱╱                                              │
│    ╱╲╱╱                                                   │
│ $0 ─────────────────────────────────────────────────────  │
│   Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct  Nov  │
│                                                             │
│ ■ Revenue  ■ Costs  ■ Profit                              │
└────────────────────────────────────────────────────────────┘
```

### 2.3 Pricing Tier Distribution (Pie Chart)

```
┌───────────────────────────────┬────────────────────────────┐
│ Users by Pricing Tier          │ Recent Transactions       │
│                                │                           │
│        ┌──────┐                │ ✓ $25.50  User #1234     │
│      ╱        ╲                │ ✓ $10.00  User #5678     │
│    ╱    30%    ╲  Startup      │ ⚠ $0.50   User #9012     │
│   │            │                │ ✓ $150.00 User #3456     │
│   │   50%      │  Business      │ ✓ $5.00   User #7890     │
│    ╲  15%     ╱   Free          │                           │
│      ╲  5%  ╱     Enterprise    │ [View All →]             │
│        └────┘                    │                           │
│                                │                           │
│ Total: 342 users               │                           │
└───────────────────────────────┴────────────────────────────┘
```

### 2.4 Alerts & Warnings

```
┌────────────────────────────────────────────────────────────┐
│ ⚠️ Alerts & Warnings                         [Dismiss All] │
│                                                             │
│ 🔴 3 users with negative balance                           │
│    → john@example.com (-$5.25)                             │
│    → mary@test.com (-$2.10)                                │
│    [View All]                                               │
│                                                             │
│ 🟡 15 users approaching daily limit (>90%)                 │
│    [View Details]                                           │
│                                                             │
│ 🟢 Payment webhook success rate: 99.2% (Good)              │
└────────────────────────────────────────────────────────────┘
```

---

## 3. Users Management

### 3.1 Users List

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Users Management                                        [+ Add User]       │
│                                                                             │
│ [🔍 Search] [Filter: All ▾] [Tier: All ▾] [Sort: Recent ▾] [Export CSV]  │
│                                                                             │
│ ┌──────────────────────────────────────────────────────────────────────┐  │
│ │ Email             │ Tier    │ Balance  │ Spent  │ Requests │ Status  │  │
│ ├──────────────────────────────────────────────────────────────────────┤  │
│ │ john@example.com  │ Startup │ $25.50   │$125.00 │  432    │ ● Active │  │
│ │ mary@test.com     │ Business│ $150.00  │$450.00 │  1,234  │ ● Active │  │
│ │ bob@startup.io    │ Free    │ $0.00    │ $5.25  │   23    │ ● Active │  │
│ │ alice@corp.com    │Enterprise│$1,500.00│$5,200  │  3,456  │ ● Active │  │
│ │ charlie@dev.org   │ Startup │ -$2.10   │ $87.50 │  234    │ 🔴 Neg.  │  │
│ │                   │         │          │        │         │          │  │
│ └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│ Showing 1-5 of 342 users               [< Prev] [1] [2] [3] ... [Next >] │
└────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 User Detail Page (Modal/Page)

```
┌────────────────────────────────────────────────────────────┐
│ User Details: john@example.com                    [× Close]│
│                                                             │
│ ┌─ Account Info ───────────────────────────────────────┐  │
│ │ Email: john@example.com                              │  │
│ │ Name: John Doe                                       │  │
│ │ User ID: uuid-1234-5678                              │  │
│ │ Created: 2026-01-15                                  │  │
│ │ Last Request: 2026-01-29 12:45:00                    │  │
│ │ Status: ● Active  [Disable Account]                  │  │
│ └───────────────────────────────────────────────────────┘  │
│                                                             │
│ ┌─ Billing Info ────────────────────────────────────────┐  │
│ │ Pricing Tier: [Startup ▾]        [Change Tier]       │  │
│ │ Balance: $25.50                  [Adjust Balance]    │  │
│ │ Total Spent: $125.00                                 │  │
│ │ Total Requests: 432                                  │  │
│ │                                                       │  │
│ │ Daily Limit: $10.00     [Edit]                       │  │
│ │ Monthly Limit: $100.00  [Edit]                       │  │
│ │                                                       │  │
│ │ Today's Spending: $3.25 / $10.00  [████──────] 33%  │  │
│ │ Month's Spending: $45.00 / $100.00 [████████──] 45% │  │
│ └───────────────────────────────────────────────────────┘  │
│                                                             │
│ ┌─ Request Preferences ─────────────────────────────────┐  │
│ │ Preset: Balanced                                      │  │
│ │ Reasoning Budget: Standard                            │  │
│ │ Max Search Results: 10                                │  │
│ │ Max Analysis Depth: 2                                 │  │
│ │ Semantic Search: ✓ Enabled                            │  │
│ │ Auto Citations: ✓ Enabled                             │  │
│ │                                         [Edit Settings]│  │
│ └───────────────────────────────────────────────────────┘  │
│                                                             │
│ ┌─ Recent Transactions ─────────────────────────────────┐  │
│ │ Date       │ Type   │ Amount  │ Balance After         │  │
│ │ 2026-01-29 │ Charge │ -$0.15  │ $25.50               │  │
│ │ 2026-01-29 │ Charge │ -$0.23  │ $25.65               │  │
│ │ 2026-01-28 │ Top-up │ +$50.00 │ $25.88               │  │
│ │                              [View All Transactions →]│  │
│ └───────────────────────────────────────────────────────┘  │
│                                                             │
│ ┌─ Actions ──────────────────────────────────────────────┐  │
│ │ [💰 Manual Top-up] [💸 Refund] [📧 Send Email]        │  │
│ │ [🔒 Suspend Account] [🗑️ Delete Account]              │  │
│ └───────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### 3.3 Quick Actions (Toolbar)

```
┌────────────────────────────────────────────────────────────┐
│ Bulk Actions:                                               │
│ [☑ Select All]  [Change Tier ▾]  [Adjust Balance]         │
│                 [Export Selected]  [Send Email Blast]      │
└────────────────────────────────────────────────────────────┘
```

---

## 4. Transactions

### 4.1 Transaction List

```
┌────────────────────────────────────────────────────────────────────────────┐
│ All Transactions                                                            │
│                                                                             │
│ [Date Range: Last 30 days ▾] [Type: All ▾] [User: All ▾] [Export CSV]     │
│                                                                             │
│ ┌──────────────────────────────────────────────────────────────────────┐  │
│ │ Date/Time      │ User          │ Type   │ Amount  │ Balance │ Details │  │
│ ├──────────────────────────────────────────────────────────────────────┤  │
│ │ 2026-01-29     │ john@...      │ Charge │ -$0.15  │ $25.50  │ [View] │  │
│ │ 12:45:00       │               │        │         │         │        │  │
│ │                                                                       │  │
│ │ 2026-01-29     │ mary@...      │ Top-up │+$100.00 │$250.00  │ [View] │  │
│ │ 11:30:22       │               │ (Stripe)│        │         │        │  │
│ │                                                                       │  │
│ │ 2026-01-29     │ bob@...       │ Charge │ -$0.08  │ $0.42   │ [View] │  │
│ │ 10:15:33       │               │        │         │         │        │  │
│ │                                                                       │  │
│ │ 2026-01-28     │ alice@...     │ Refund │ +$5.00  │$1505.00 │ [View] │  │
│ │ 16:20:10       │               │ (Admin)│         │         │        │  │
│ │                                                                       │  │
│ └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│ Summary: 1,234 transactions | Total: -$5,432.10 (charges) +$12,890 (topups)│
│                                                                             │
│ Showing 1-20 of 1,234                  [< Prev] [1] [2] [3] ... [Next >]  │
└────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Transaction Detail Modal

```
┌────────────────────────────────────────────────────────────┐
│ Transaction Details                               [× Close]│
│                                                             │
│ Transaction ID: txn_abc123def456                            │
│ Request ID: req_xyz789                                      │
│                                                             │
│ ┌─ Basic Info ──────────────────────────────────────────┐  │
│ │ Date/Time: 2026-01-29 12:45:00 UTC                    │  │
│ │ User: john@example.com (John Doe)                     │  │
│ │ Type: charge                                          │  │
│ │ Status: completed ✓                                   │  │
│ └───────────────────────────────────────────────────────┘  │
│                                                             │
│ ┌─ Financial Details ───────────────────────────────────┐  │
│ │ Base Cost:        $0.053450                           │  │
│ │ Markup (30%):    +$0.016035                           │  │
│ │ ──────────────────────────────                        │  │
│ │ Total Charged:    $0.069485                           │  │
│ │                                                       │  │
│ │ Balance Before:   $25.569485                          │  │
│ │ Balance After:    $25.500000                          │  │
│ └───────────────────────────────────────────────────────┘  │
│                                                             │
│ ┌─ Cost Breakdown ──────────────────────────────────────┐  │
│ │ OpenAI API:       $0.020225  (2031 tokens)            │  │
│ │ ZakonOnline:      $0.007140  (1 call)                 │  │
│ │ SecondLayer:      $0.000000  (0 docs)                 │  │
│ │                                                       │  │
│ │ Tool: get_legal_advice                                │  │
│ │ Tier: startup                                         │  │
│ │ Query: "Як оподатковуються криптопоступлення..."     │  │
│ └───────────────────────────────────────────────────────┘  │
│                                                             │
│ ┌─ Metadata ────────────────────────────────────────────┐  │
│ │ IP Address: 172.21.0.1                                │  │
│ │ User Agent: openai-mcp/1.0.0                          │  │
│ │ Execution Time: 32.6s                                 │  │
│ │ Model Used: gpt-4o                                    │  │
│ └───────────────────────────────────────────────────────┘  │
│                                                             │
│ [Refund Transaction] [Download Receipt] [Copy Link]        │
└────────────────────────────────────────────────────────────┘
```

---

## 5. Pricing & Tiers

### 5.1 Tier Configuration

```
┌────────────────────────────────────────────────────────────────┐
│ Pricing Tier Management                                        │
│                                                                 │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ Free Tier                                    [Edit] [⋮]  │  │
│ │ ────────────────────────────────────────────────────────  │  │
│ │ Markup: 0%                                               │  │
│ │ Users: 52 (15% of total)                                 │  │
│ │ Revenue: $0.00/month                                     │  │
│ │                                                          │  │
│ │ Features:                                                │  │
│ │ • Full access to all tools                               │  │
│ │ • Cost pass-through (no markup)                          │  │
│ │ • Rate limits apply                                      │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ Startup Tier (Default)                       [Edit] [⋮]  │  │
│ │ ────────────────────────────────────────────────────────  │  │
│ │ Markup: 30% ← [Edit: 25|30|35]                          │  │
│ │ Users: 240 (70% of total) ← Majority here               │  │
│ │ Revenue: $8,640/month                                    │  │
│ │ Avg Spend: $36/user/month                                │  │
│ │                                                          │  │
│ │ Features:                                                │  │
│ │ • Full access to all tools                               │  │
│ │ • 30% markup on API costs                                │  │
│ │ • Email support (24-48h)                                 │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ Business Tier                                [Edit] [⋮]  │  │
│ │ ────────────────────────────────────────────────────────  │  │
│ │ Markup: 50%                                              │  │
│ │ Users: 35 (10% of total)                                 │  │
│ │ Revenue: $3,150/month                                    │  │
│ │ Avg Spend: $90/user/month                                │  │
│ │                                                          │  │
│ │ Features:                                                │  │
│ │ • 50% markup, priority support                           │  │
│ │ • Higher rate limits                                     │  │
│ │ • Account manager                                        │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ Enterprise Tier                              [Edit] [⋮]  │  │
│ │ ────────────────────────────────────────────────────────  │  │
│ │ Markup: 40% (customizable)                               │  │
│ │ Users: 15 (5% of total)                                  │  │
│ │ Revenue: $3,600/month                                    │  │
│ │ Avg Spend: $240/user/month                               │  │
│ │                                                          │  │
│ │ Features:                                                │  │
│ │ • Custom pricing, SLA, 24/7 support                      │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│ [+ Create New Tier]  [Import/Export Config]                   │
└────────────────────────────────────────────────────────────────┘
```

### 5.2 Volume Discounts

```
┌────────────────────────────────────────────────────────────┐
│ Volume Discount Rules                          [+ Add Rule]│
│                                                             │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ Spending Range  │ Discount │ Applies To  │ Active  │   │
│ ├─────────────────────────────────────────────────────┤   │
│ │ $250 - $499     │   5%     │ All tiers   │ ✓ Yes   │   │
│ │ $500 - $999     │  10%     │ All tiers   │ ✓ Yes   │   │
│ │ $1000+          │  15%     │ All tiers   │ ✓ Yes   │   │
│ └─────────────────────────────────────────────────────┘   │
│                                                             │
│ Impact: 23 users currently receiving discounts              │
│ Total discount given this month: $127.50                   │
└────────────────────────────────────────────────────────────┘
```

---

## 6. Analytics

### 6.1 Revenue Analytics

```
┌────────────────────────────────────────────────────────────────┐
│ Revenue Analytics                    [Date: Last 30 days ▾]   │
│                                                                 │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ Revenue Breakdown                                         │  │
│ │                                                           │  │
│ │ Total Revenue:    $15,390.00                             │  │
│ │ Total Costs:      $11,838.50                             │  │
│ │ Gross Profit:      $3,551.50  (23.1% margin)             │  │
│ │                                                           │  │
│ │ ┌─────────────────────────────────────────────────────┐  │  │
│ │ │ By Tier:                                            │  │  │
│ │ │                                                     │  │  │
│ │ │ Startup:    $8,640 (56%)  ████████████████░░░░     │  │  │
│ │ │ Business:   $3,150 (20%)  ██████░░░░░░░░░░░░░░     │  │  │
│ │ │ Enterprise: $3,600 (24%)  ███████░░░░░░░░░░░░░     │  │  │
│ │ │ Free:          $0 (0%)    ░░░░░░░░░░░░░░░░░░░░     │  │  │
│ │ └─────────────────────────────────────────────────────┘  │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ Cost Breakdown                                            │  │
│ │                                                           │  │
│ │ OpenAI API:      $8,234.50  (70%)  ██████████████░░░░   │  │
│ │ ZakonOnline:     $2,456.00  (21%)  ████░░░░░░░░░░░░░░   │  │
│ │ SecondLayer:     $1,148.00  (9%)   ██░░░░░░░░░░░░░░░░   │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ Top 10 Revenue Generators                                 │  │
│ │                                                           │  │
│ │ 1. alice@corp.com        $520.00  (Enterprise)           │  │
│ │ 2. bob@bigfirm.com       $450.00  (Business)             │  │
│ │ 3. charlie@startup.io    $320.00  (Startup)              │  │
│ │ 4. diana@legal.org       $280.00  (Business)             │  │
│ │ 5. evan@tech.com         $250.00  (Startup)              │  │
│ │ ...                                                       │  │
│ └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### 6.2 Usage Analytics

```
┌────────────────────────────────────────────────────────────────┐
│ Usage Analytics                                                 │
│                                                                 │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ Total Requests: 23,456 (Last 30 days)                     │  │
│ │ Avg per User: 68.5 requests/month                         │  │
│ │                                                           │  │
│ │ By Tool:                                                  │  │
│ │                                                           │  │
│ │ get_legal_advice        8,234  ██████████████░░░░ 35%    │  │
│ │ search_legal_precedents 6,789  ████████████░░░░░░ 29%    │  │
│ │ search_legislation      4,123  ████████░░░░░░░░░░ 18%    │  │
│ │ get_court_decision      2,890  ██████░░░░░░░░░░░░ 12%    │  │
│ │ Other tools             1,420  ███░░░░░░░░░░░░░░░  6%    │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ Request Preferences Distribution                          │  │
│ │                                                           │  │
│ │ Economy:   5,234  (22%)                                  │  │
│ │ Balanced: 14,567  (62%)  ← Most popular                  │  │
│ │ Quality:   3,655  (16%)                                  │  │
│ │                                                           │  │
│ │ Avg Cost per Request:                                     │  │
│ │ • Economy:  $0.012                                        │  │
│ │ • Balanced: $0.025                                        │  │
│ │ • Quality:  $0.068                                        │  │
│ └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### 6.3 Cohort Analysis

```
┌────────────────────────────────────────────────────────────────┐
│ User Cohorts (by Sign-up Month)                                │
│                                                                 │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ Month  │Users│ Month 1 │ Month 2 │ Month 3 │ Retention  │  │
│ ├──────────────────────────────────────────────────────────┤  │
│ │ Oct'25 │ 120 │  100%   │   85%   │   72%   │   72%      │  │
│ │ Nov'25 │ 95  │  100%   │   82%   │   68%   │   68%      │  │
│ │ Dec'25 │ 87  │  100%   │   88%   │   -     │   88%      │  │
│ │ Jan'26 │ 40  │  100%   │   -     │   -     │  100%      │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│ Average 3-month retention: 71%                                 │
│ Churn rate: 29%                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 7. API Keys Management

### 7.1 API Keys List

```
┌────────────────────────────────────────────────────────────────┐
│ API Keys                                        [+ Create Key] │
│                                                                 │
│ [🔍 Search] [User: All ▾] [Status: All ▾] [Sort: Recent ▾]    │
│                                                                 │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ Key Name      │ User        │ Created    │ Requests │ ⋮  │  │
│ ├──────────────────────────────────────────────────────────┤  │
│ │ Production    │ john@...    │ 2026-01-15 │  2,345  │[⋮] │  │
│ │ sk_prod_abc...│             │            │         │    │  │
│ │ ● Active      │ Rate: 1000/day│ Last used: 2m ago    │    │  │
│ │                                                          │  │
│ │ Development   │ mary@...    │ 2026-01-20 │   432   │[⋮] │  │
│ │ sk_dev_xyz... │             │            │         │    │  │
│ │ ● Active      │ Rate: 500/day │ Last used: 1h ago    │    │  │
│ │                                                          │  │
│ │ Test Key      │ bob@...     │ 2025-12-10 │     0   │[⋮] │  │
│ │ sk_test_123...│             │            │         │    │  │
│ │ ○ Revoked     │ Rate: 100/day │ Never used           │    │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│ Total: 234 active keys | 1,234,567 requests this month         │
└────────────────────────────────────────────────────────────────┘
```

### 7.2 Create API Key Modal

```
┌────────────────────────────────────────────────────────────┐
│ Create New API Key                            [× Close]    │
│                                                             │
│ User: [john@example.com ▾]                                 │
│                                                             │
│ Key Name: [_________________________]                      │
│           (e.g., "Production API Key")                     │
│                                                             │
│ Rate Limit: [1000] requests per [day ▾]                    │
│                                                             │
│ Permissions:                                                │
│ ☑ All MCP tools                                             │
│ ☐ Read-only (no charges)                                    │
│                                                             │
│ Expires: [Never ▾] or [Custom Date]                        │
│                                                             │
│ ⚠️ The API key will be shown only once after creation      │
│                                                             │
│ [Cancel] [Create API Key]                                  │
└────────────────────────────────────────────────────────────┘
```

---

## 8. Settings

### 8.1 System Settings

```
┌────────────────────────────────────────────────────────────────┐
│ System Settings                                                 │
│                                                                 │
│ ┌─ General ─────────────────────────────────────────────────┐  │
│ │                                                           │  │
│ │ Platform Name: [SecondLayer MCP]                          │  │
│ │ Admin Email: [admin@legal.org.ua]                         │  │
│ │ Support Email: [support@legal.org.ua]                     │  │
│ │ Default Currency: [USD ▾]                                 │  │
│ │                                                           │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│ ┌─ Billing Defaults ────────────────────────────────────────┐  │
│ │                                                           │  │
│ │ New User Tier: [Startup ▾]                                │  │
│ │ Default Balance: [$0.00]                                  │  │
│ │ Default Daily Limit: [$10.00]                             │  │
│ │ Default Monthly Limit: [$100.00]                          │  │
│ │                                                           │  │
│ │ Auto-disable on negative balance: ☑ Yes  ☐ No            │  │
│ │ Grace period (hours): [24]                                │  │
│ │                                                           │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│ ┌─ Payment Providers ───────────────────────────────────────┐  │
│ │                                                           │  │
│ │ Stripe:                                                   │  │
│ │ Status: ✓ Connected                                       │  │
│ │ Mode: [Production ▾]                                      │  │
│ │ Webhook: https://mcp.legal.org.ua/webhooks/stripe        │  │
│ │ [Configure]                                               │  │
│ │                                                           │  │
│ │ Fondy:                                                    │  │
│ │ Status: ✓ Connected                                       │  │
│ │ Mode: [Production ▾]                                      │  │
│ │ Webhook: https://mcp.legal.org.ua/webhooks/fondy         │  │
│ │ [Configure]                                               │  │
│ │                                                           │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│ ┌─ Email Notifications ─────────────────────────────────────┐  │
│ │                                                           │  │
│ │ ☑ Send low balance alerts                                │  │
│ │ ☑ Send payment confirmations                              │  │
│ │ ☑ Send weekly usage reports                               │  │
│ │ ☑ Alert on negative balance                               │  │
│ │ ☑ Alert on daily limit exceeded                           │  │
│ │                                                           │  │
│ │ Admin Alerts:                                             │  │
│ │ ☑ Daily revenue report                                    │  │
│ │ ☑ Payment failures                                        │  │
│ │ ☑ Unusual activity                                        │  │
│ │                                                           │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│ [Save Changes] [Reset to Defaults]                             │
└────────────────────────────────────────────────────────────────┘
```

### 8.2 Audit Log

```
┌────────────────────────────────────────────────────────────────┐
│ Audit Log                                                       │
│                                                                 │
│ [Date Range] [Admin: All ▾] [Action: All ▾] [Export]          │
│                                                                 │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ Time       │ Admin    │ Action               │ Details   │  │
│ ├──────────────────────────────────────────────────────────┤  │
│ │ 12:45 PM   │ admin@...│ Changed user tier    │ john@...  │  │
│ │ 2026-01-29 │          │ Startup → Business   │           │  │
│ │                                                          │  │
│ │ 11:30 AM   │ admin@...│ Manual balance adj   │ mary@...  │  │
│ │ 2026-01-29 │          │ Added $50.00         │ Refund    │  │
│ │                                                          │  │
│ │ 10:15 AM   │ admin@...│ Created API key      │ bob@...   │  │
│ │ 2026-01-29 │          │ sk_prod_xyz123       │           │  │
│ └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

---

## 9. Export & Reports

### 9.1 Report Generator

```
┌────────────────────────────────────────────────────────────┐
│ Generate Report                               [× Close]    │
│                                                             │
│ Report Type:                                                │
│ ○ Revenue Report                                            │
│ ● User Activity Report                                      │
│ ○ Transaction Report                                        │
│ ○ Cost Analysis Report                                      │
│                                                             │
│ Date Range:                                                 │
│ From: [2026-01-01] To: [2026-01-31]                        │
│                                                             │
│ Format:                                                     │
│ ○ PDF  ● Excel  ○ CSV  ○ JSON                              │
│                                                             │
│ Include:                                                    │
│ ☑ Summary Statistics                                        │
│ ☑ Detailed Breakdown                                        │
│ ☑ Charts & Graphs                                           │
│ ☐ User PII (requires extra permission)                      │
│                                                             │
│ Send to: [admin@legal.org.ua]                              │
│                                                             │
│ [Cancel] [Generate & Download]                              │
└────────────────────────────────────────────────────────────┘
```

---

## 10. Mobile View (Responsive)

### 10.1 Mobile Dashboard

```
┌──────────────────────┐
│ ☰  SecondLayer Admin │
│                      │
│ Total Revenue        │
│ $12,450.00           │
│ +18.5% ↑             │
│                      │
│ Active Users         │
│ 342                  │
│ +23 ↑                │
│                      │
│ ⚠️ Alerts (3)        │
│ • 3 negative balance │
│   [View]             │
│                      │
│ Recent Transactions  │
│ ──────────────────── │
│ $25.50  john@...     │
│ $10.00  mary@...     │
│ [View All]           │
│                      │
│ [Users] [Analytics]  │
│ [Settings]           │
└──────────────────────┘
```

---

## 11. Technical Implementation

### 11.1 Tech Stack

```
Frontend:
- React 18 + TypeScript
- Tailwind CSS + shadcn/ui
- Recharts (graphs)
- React Query (data fetching)
- React Router (navigation)

Backend API:
- Existing Express routes
- New endpoints in /api/admin/*
- JWT authentication (admin role required)

Database:
- Existing PostgreSQL schema
- New views for admin analytics
```

### 11.2 Required API Endpoints

```
Admin Dashboard:
GET  /api/admin/stats/overview
GET  /api/admin/stats/revenue
GET  /api/admin/stats/users-by-tier
GET  /api/admin/stats/alerts

User Management:
GET  /api/admin/users
GET  /api/admin/users/:userId
PUT  /api/admin/users/:userId/tier
POST /api/admin/users/:userId/adjust-balance
PUT  /api/admin/users/:userId/limits
POST /api/admin/users/:userId/disable

Transactions:
GET  /api/admin/transactions
GET  /api/admin/transactions/:txnId
POST /api/admin/transactions/:txnId/refund

Pricing:
GET  /api/admin/pricing/tiers
PUT  /api/admin/pricing/tiers/:tierName
GET  /api/admin/pricing/volume-discounts
POST /api/admin/pricing/volume-discounts

Analytics:
GET  /api/admin/analytics/revenue
GET  /api/admin/analytics/usage
GET  /api/admin/analytics/cohorts
GET  /api/admin/analytics/top-users

API Keys:
GET  /api/admin/api-keys
POST /api/admin/api-keys
DELETE /api/admin/api-keys/:keyId
PUT /api/admin/api-keys/:keyId/revoke

Settings:
GET  /api/admin/settings
PUT  /api/admin/settings
GET  /api/admin/audit-log

Reports:
POST /api/admin/reports/generate
GET  /api/admin/reports/:reportId/download
```

### 11.3 Access Control

```typescript
// Middleware for admin routes
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Apply to all admin routes
app.use('/api/admin/*', requireJWT, requireAdmin);
```

---

## 12. Color Scheme & Branding

```
Primary: #667eea (Purple-blue gradient)
Secondary: #764ba2 (Deep purple)
Success: #10b981 (Green)
Warning: #f59e0b (Orange)
Error: #ef4444 (Red)
Background: #f9fafb (Light gray)
Text: #111827 (Dark gray)
```

---

## 13. Key Features Summary

✅ **Dashboard** - Real-time metrics, revenue charts, alerts
✅ **User Management** - Full CRUD, tier changes, balance adjustments
✅ **Transactions** - Detailed history, refunds, cost breakdown
✅ **Pricing Control** - Tier management, volume discounts
✅ **Analytics** - Revenue, usage, cohorts, top users
✅ **API Keys** - Create, revoke, monitor usage
✅ **Settings** - System config, payment providers, notifications
✅ **Audit Log** - Track all admin actions
✅ **Reports** - Generate custom reports (PDF, Excel, CSV)
✅ **Responsive** - Mobile-friendly design
✅ **Real-time Updates** - WebSocket for live data

---

**URL:** legal.org.ua (admin section integrated into main app)

**Authentication:** Google OAuth2 + Role-based access (admin only)
**Security:** HTTPS, JWT tokens, CORS, rate limiting
