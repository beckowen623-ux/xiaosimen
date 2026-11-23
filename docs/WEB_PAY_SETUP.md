# 网页直付配置指南（面包多 Pay / 爱发电）

代码框架已就绪（`functions/_pay.js` + `functions/_middleware.js` + 前端直付弹窗），**在配置环境变量前默认隐藏直付按钮，不影响现有闲鱼购买流程**。

## 路线 A：爱发电（免营业执照，最快当天上线）
1. 在爱发电电铺创建 3 个对应商品/方案（原价 ¥19.9、分享/好友价 ¥14.9、双题库套餐 ¥29.8）。
2. 在爱发电开发者后台设置 Webhook URL：
   `https://x4m.cc.cd/api/pay/webhook`
3. 在 Cloudflare Pages 项目后台 → **Settings → Environment variables** 添加：
   - `PAY_PROVIDER` = `afdian`
   - `AFDIAN_USER_ID` = 你的爱发电 `user_id`
   - `AFDIAN_TOKEN` = 你的爱发电 API Token
   - `AFDIAN_PLAN_FULL` = 19.9 商品/方案链接
   - `AFDIAN_PLAN_DISCOUNT` = 14.9 商品/方案链接
   - `AFDIAN_PLAN_BUNDLE` = 29.8 双题库商品/方案链接
4. 重新部署一次即可生效。

## 路线 B：面包多 Pay（免营业执照，费率 2% + ¥0.1，页内直付）
1. 在 [面包多 Pay](https://p.mbd.pub/) 提交个人闪电结算审核（约 1–2 个工作日）。
2. 在面包多控制台配置 Webhook URL：
   `https://x4m.cc.cd/api/pay/webhook`
3. 在 Cloudflare Pages 环境变量中添加：
   - `PAY_PROVIDER` = `mbd`
   - `MBD_APP_ID` = 你的 App ID
   - `MBD_APP_KEY` = 你的 App Key
   - （可选）`MBD_PAY_URL` = 如有自定义下单接口地址可覆盖默认值
4. 重新部署一次即可生效。

## 支付闭环说明
- 用户点「微信/支付宝直接买」→ `POST /api/pay/create` 在 D1 自动建表 `pay_orders` 并创建待支付订单；
- 付款后平台回调 `POST /api/pay/webhook` → 服务端验签/反查订单 → 自动在 `access_codes` 表生成专属兑换码（`X4M-XXXX-XXXX`）；
- 前端轮询 `GET /api/pay/status?orderId=...` → 检测到已支付后自动签发 `xiaosimen_access` Cookie 秒解锁，并把自动生成的兑换码展示给家长截图备份（方便在另外 2 台设备使用）。
