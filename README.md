# XueAiOK 演示商城

乾淨明亮風格的遊戲充值／點卡電商演示站（繁體中文）。功能類似常見國際點卡站，但視覺獨立，**非 SEAGM 複刻**。

> 品牌名 **XueAiOK** 為正式暫定名；本專案僅供介面與下單流程演示，**沒有後端、不會真實扣款或發貨**。

## 如何預覽

在專案目錄啟動本地靜態伺服器：

```bash
cd /workspace/xueaiok-shop
python3 -m http.server 8765
```

瀏覽器開啟：

```
http://127.0.0.1:8765/
```

也可直接用瀏覽器打開 `index.html`（建議仍用 `http.server`，以確保路由與字型載入正常）。

## 已實作頁面／流程

| 路由 | 說明 |
|------|------|
| `#/` | 首頁：Hero、分類、精選商品、信任條（秒充／安全／客服） |
| `#/catalog` | 全部商品 |
| `#/catalog/giftcard` | 點卡禮品分類 |
| `#/catalog/mobile` | 手遊直充分類 |
| `#/product/:id` | 商品詳情：面額、數量、加入購物車 |
| `#/cart` | 購物車：改數量、移除、小計 |
| `#/checkout` | 結帳：電郵、UID／備註、FPS／PayMe／信用卡（演示） |
| `#/order` | 訂單確認：本機產生假訂單編號 |

購物車與最近一筆訂單存在瀏覽器 `localStorage`。

## 品牌色（暫定）

- 主色 Teal：`#0d9488` / hover `#0f766e`
- 輔助 Coral：`#f97316`（徽章、購物車數字）
- 背景：白／淺灰 `#f7f8fb`
- 字色：`#0f172a`

## 目錄結構

```
xueaiok-shop/
├── index.html
├── css/styles.css
├── js/data.js      # 商品目錄
├── js/app.js       # 路由、購物車、結帳
└── README.md
```

## 限制

- 純靜態前端，無庫存、無真實支付閘道
- 商品圖為色塊縮寫示意，非官方素材
- 結帳僅寫入本機訂單物件並清空購物車
- 未接客服／登入／訂單查詢後端

## 技術

HTML + 自訂 CSS + Vanilla JS（Hash SPA），Google Fonts：Noto Sans TC、Outfit。
