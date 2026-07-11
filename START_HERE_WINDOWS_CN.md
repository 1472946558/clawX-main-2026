# canvasland Windows 测试启动说明

## 1. 直接安装测试

1. 双击 `canvasland-Windows-1.0.0.exe`。
2. 按安装向导完成安装。
3. 启动桌面上的 `canvasland`。
4. 打开左侧 `钱包管理`。
5. 检查以下内容：
   - 固定档位最低为 5 元。
   - 自定义充值金额最低为 0.1 元。
   - 充值规则为 `1 元 = 100 积分`。
   - 支付宝回调地址为 `https://apitoken.unihuax.com/payments/epay/notify`。
   - 微信回调地址为 `https://apitoken.unihuax.com/payments/blueocean/notify`。

## 2. 钱包支付测试

1. 选择一个充值档位。
2. 选择支付方式：微信支付或支付宝。
3. 点击生成二维码。
4. 用手机扫码完成支付。
5. 返回应用点击 `刷新余额`。
6. 检查充值余额、可用积分、积分流水是否更新。

如果支付成功但余额没有变化，优先检查：

- 支付平台后台订单是否成功。
- 支付平台是否向回调地址发送通知。
- 回调地址是否配置为 HTTPS 地址。

## 3. 开发版启动

需要先安装：

- Node.js 20
- pnpm 10.33.4

在源码目录执行：

```bash
corepack enable
corepack prepare pnpm@10.33.4 --activate
pnpm install
pnpm dev
```

## 4. Windows 打包

在源码目录执行：

```bash
pnpm run build:vite
node scripts/run-electron-builder.mjs --win --publish never
```

安装包会生成在：

```text
release/canvasland-Windows-1.0.0.exe
```

## 5. 服务端回调地址

当前正式回调域名：

```text
https://apitoken.unihuax.com
```

健康检查：

```text
https://apitoken.unihuax.com/health
```

钱包余额：

```text
https://apitoken.unihuax.com/api/wallet/balance
```

积分流水：

```text
https://apitoken.unihuax.com/api/wallet/records
```

支付下单接口：

```text
https://apitoken.unihuax.com/payments/blueocean/checkout
https://apitoken.unihuax.com/payments/epay/checkout
```

## 6. 当前版本信息

- 产品名：canvasland
- 版本：1.0.0
- 源码提交：d15e92a
- 正式自定义充值最低金额：0.1 元
- 积分规则：1 元 = 100 积分
