# 3388 商城（3388.HK）

寬屏 App Store 風格靜態前端 + Flask/SQLite 會員與訂單 API。

公司：HOGAME ONLINE ENTERTAINMENT LIMITED  
品牌／域名：3388 · 3388.HK

## 本機靜態預覽
```bash
python3 -m http.server 8765
```
註冊／訂單需連到已部署 API 的 VPS（同源 `/api`）。

## 會員路由
- `#/account` 會員中心
- `#/orders` 訂單記錄
- `#/orders/:id` 訂單詳情
- `#/account/password` 修改密碼
- `#/login` `#/register`

演示帳號：`DemoUser` / `demo1234`


## 平台新聞 / 靜態資訊頁（SEO）

靜態頁由 `tools/build_pages.py` 生成：`news/*.html`、`news/latest.json`（首頁最新 3 則）、`about.html`、`faq.html`、`terms.html`、`privacy.html`、`sitemap.xml`、`robots.txt`。

新增文章：
1. 複製 `content/news/mycard-topup-guide.json` 為 `content/news/<slug>.json`。
2. 修改 `slug`、`title`、`description`、`date`（YYYY-MM-DD）、`product`（商品 id，對應 `/#/product/<id>`）、`productName`、`body`（`["p", 文字]`、`["h2", 標題]`、`["ul"/"ol", [項目...]]`）。
3. 執行 `python3 tools/build_pages.py`，再把生成檔案部署到 VPS `/var/www/xueaiok/`。

注意：關於我們／使用條款／私隱條款為**草稿**，須經法律審閱；`【待填寫】` 為公司註冊編號、地址、電郵等待補資料。內容在 `tools/build_pages.py` 內修改。

## 商品資料（單一來源）及商品 SEO 頁

- 商品資料唯一來源：`content/products.json`（brand、categories、products[].options[]）。
- `js/data.js` 由 `tools/products.py` **自動生成**，請勿手改。
- 後端 `catalog_prices()` 直接讀 `content/products.json`（檔案更新即生效），訂單價格一律以此為準。
- 每個商品生成可被搜尋引擎抓取的 `/product/<slug>.html`（title、description、canonical、OG、JSON-LD Product/AggregateOffer + BreadcrumbList、伺服器端 H1/面額/價格），載入後由 SPA 接管購買介面。舊 `/#/product/<id>` 會自動轉到新網址。

修改商品後重建：
```bash
python3 tools/build_pages.py        # 全部靜態頁 + 商品頁 + sitemap
python3 tools/products.py           # 只重建 data.js + 商品頁 + sitemap 商品網址
```
日後管理後台：
```python
import sys; sys.path.insert(0, "/var/www/xueaiok/tools")
from products import load_products, save_products
data = load_products(); ...edit...; save_products(data)
# 然後在 backend/app.py 內呼叫 regenerate_product_pages()（已提供），會重建 data.js、商品頁及 sitemap，並清除價格快取。
```
注意：後端程序需對 `/var/www/xueaiok/{js,product,content,sitemap.xml}` 有寫入權限（目前檔案屬 www-data）。


## 網站背景（節日圖）

- 預設：溫暖淺灰漸層（無自訂圖時）。
- **臨時管理頁**（日後會移入正式後台）：登入管理員後開啟 `/admin/background.html` 上傳 JPG／PNG／WebP（≤5MB），或移除恢復預設。一般會員中心不顯示此功能。
- 設定存於 `content/site.json`，圖片在 `images/bg/custom.*`，並生成 `css/site-bg.css`。
- 管理員：環境變數 `ADMIN_USERNAMES`（逗號分隔，不區分大小寫），預設另含 `DemoUser`／`hogame`，以及電郵 `hogamehk@gmail.com` 的帳戶。
  例：在 systemd 加 `Environment=ADMIN_USERNAMES=hogame,alice`
