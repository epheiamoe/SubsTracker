# SubsTracker — 订阅管理与提醒系统

基于 Cloudflare Workers 的 SPA + PWA 订阅管理系统，帮助你跟踪各类订阅到期时间，通过多渠道发送提醒通知。

> 本项目 fork 自 [wangwangit/SubsTracker](https://github.com/wangwangit/SubsTracker)，并进行了一系列架构优化。

---

## 架构

```
┌──────────────────────────────────────────────────┐
│  Cloudflare Workers (单 Worker + DO + KV + Cron)  │
│                                                  │
│  ┌──────────┐  ┌────────┐  ┌──────────────────┐ │
│  │ SPA Shell │  │  /api/* │  │ /manifest.json  │ │
│  │ (app.html)│  │ (JSON) │  │ /sw.js /icon.svg│ │
│  └─────┬─────┘  └────┬───┘  └──────────────────┘ │
│        │              │                           │
│  ┌─────▼─────┐  ┌─────▼──────────────┐          │
│  │ Hash 路由  │  │ RateLimiterDO      │          │
│  │ #login    │  │ (登录限流 5次/分/IP) │          │
│  │ #dashboard│  │                    │          │
│  │ #list     │  │ SUBSCRIPTIONS_KV   │          │
│  │ #config   │  │ (配置 + 订阅数据)   │          │
│  └───────────┘  └────────────────────┘          │
│                                                  │
│  cron: 0 * * * *  →  每小时检查到期订阅          │
└──────────────────────────────────────────────────┘
```

**SPA (Single Page Application)**：所有页面共用一个 HTML Shell，通过 hash 路由切换视图。首屏之后零额外 HTML 请求，只通过 `/api/*` 交互 JSON，大幅节省 Worker CPU 时间。

**PWA (Progressive Web App)**：支持安装到桌面/手机主屏幕，Service Worker 缓存 CDN 资源和 Shell，提供离线访问能力。

**Durable Objects**：使用 DO 实现登录接口的强一致性限流，而非 KV 最终一致性方案。

---

## 功能特色

### 核心功能
- 订阅 CRUD：添加、编辑、删除、启用/停用订阅
- 智能提醒：自定义提前提醒天数与小时，自动续订计算
- 农历显示：1900-2100 年农历转换，通知中可包含农历信息
- 财务追踪：多币种记录（CNY/USD/HKD/JPY/EUR 等），自动汇率换算
- 手动续订：自定义金额、周期、备注、批量续订
- 仪表盘：月度/年度已付统计 + 年化成本估算 + 支出趋势/排行

### 多渠道通知
Telegram · NotifyX · Webhook · 企业微信机器人 · Resend 邮件 · Bark · Gotify · Server酱 · PushPlus

### 安全特性 (v3)
- **登录限流**：Durable Object 强一致性，每 IP 每分钟最多 5 次
- **请求体大小限制**：超过 1MB 返回 413
- **首次部署随机密码**：使用 `crypto.randomUUID()` 生成，不再默认 `password`
- **Debug 页面脱敏**：不暴露用户名和 JWT 信息
- `HttpOnly + SameSite=Strict` Cookie 鉴权

---

## 部署

### 前置条件
- Node.js LTS
- Cloudflare 账号（需 Workers Paid 计划以使用 Durable Objects 和 Cron）
- Wrangler CLI

### 1) 克隆项目

```bash
git clone https://github.com/epheiamoe/SubsTracker.git
cd SubsTracker
```

### 2) 登录 Wrangler

```bash
npx wrangler login
```

或使用 API Token：

```bash
# PowerShell
$env:CLOUDFLARE_API_TOKEN="你的token"
```

### 3) 部署

```bash
npm install
npm run setup       # 创建 KV 命名空间 + 回写 wrangler.toml
npm run deploy      # 部署到 Cloudflare Workers
```

也可一步到位：

```bash
npm run deploy:safe  # = npm run setup && npm run deploy
```

### 4) 绑定自定义域名（可选）

在 Cloudflare Dashboard 中为你的 Zone 添加 DNS 记录（需开启代理 / 橙色云）：

```
类型: CNAME   名称: subs   目标: @    代理: 开启
```

同时在 `wrangler.toml` 中配置 `routes`（部署时会自动绑定）。

---

## 首次登录

部署后访问 Worker 地址或绑定的自定义域名：

- 用户名：`admin`
- 密码：**随机生成**（首次部署时创建，可通过 `wrangler tail` 查看或从 KV 读取）

查看密码：

```bash
npx wrangler kv key get --binding=SUBSCRIPTIONS_KV --remote config
# 在输出中找到 "ADMIN_PASSWORD" 字段
```

登录后请立即在系统配置中修改密码。

---

## 通知渠道配置

### Telegram
- Bot Token：从 [@BotFather](https://t.me/BotFather) 获取
- Chat ID：从 [@userinfobot](https://t.me/userinfobot) 获取

### NotifyX
- API Key：从 [NotifyX 官网](https://www.notifyx.cn/) 获取

### 企业微信机器人
- 推送 URL：参考 [官方文档](https://developer.work.weixin.qq.com/document/path/91770) 获取

### Webhook
- URL：填写自建服务或第三方平台的 Webhook 地址
- 支持自定义请求方法（GET/POST/PUT）、请求头与消息模板
- 模板变量：`{{title}}`、`{{content}}`、`{{timestamp}}`

### Resend 邮件
- API Key：从 [Resend](https://resend.com/api-keys) 获取
- 发件人邮箱需为 Resend 已验证域名邮箱

### Bark (iOS)
- 设备 Key：在 Bark App 内获取
- 服务器地址：默认 `https://api.day.app`，支持自建

### Server酱 / PushPlus
- SendKey / Token 从各自官网获取

### 通知时段说明
- 后端调度与计算统一使用 **UTC**
- `notificationHours` 按 UTC 小时解释（留空 = 全天）
- 前端页面时间按当前设备时区显示

---

## 开发

```bash
# 本地开发（Worker + KV 本地模拟）
npx wrangler dev

# 部署到 staging 环境
npx wrangler deploy --env=staging

# 查看实时日志
npx wrangler tail
```

### 项目结构

```
src/
├── index.js             # Worker 入口：路由 + SPA Shell 分发
├── api/
│   ├── router.js        # /api/* 路由
│   ├── admin.js         # 兼容层（已简化为 SPA 架构）
│   ├── debug.js         # 调试页面
│   └── handlers/        # API 处理器
│       ├── auth.js      # 登录/登出/JWT + 限流
│       ├── config.js    # 系统配置 CRUD
│       ├── dashboard.js # 仪表盘统计
│       ├── notify.js    # 第三方通知接口
│       └── subscriptions.js # 订阅 CRUD + 续订
├── core/
│   ├── auth.js          # JWT 生成/验证
│   ├── currency.js      # 汇率换算 + 支出统计
│   ├── lunar.js         # 农历转换（后端）
│   ├── rate-limiter.js  # Durable Object 限流器
│   └── time.js          # 时区工具
├── data/
│   ├── config.js        # 配置存取（KV）
│   ├── kv.js            # KV 工具函数
│   └── subscriptions.js # 订阅数据存取（KV）
├── services/
│   ├── scheduler.js     # Cron 定时任务：到期检查 + 通知发送
│   └── notify/          # 各通知渠道实现
└── views/
    ├── app.html         # SPA Shell（唯一 HTML 页面）
    ├── app-client.js.txt # SPA 核心：路由/鉴权/仪表盘/登录
    ├── subscription-list.js.txt # 订阅列表视图（含农历日历）
    ├── config.js.txt    # 系统配置视图
    ├── pages.js         # 页面组装（注入主题 + PWA meta）
    └── theme-resources.* # 暗黑模式主题系统
```

---

## 子模块与自定义域名限流

推荐在 Cloudflare Dashboard 中为你的域名开启 **WAF → Rate Limiting Rules**，在请求到达 Worker 之前就拦截高频流量，不计入 Worker 计费。

---

## 许可证

MIT License

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=epheiamoe/SubsTracker&type=Date)](https://www.star-history.com/#epheiamoe/SubsTracker&Date)
