#!/usr/bin/env python3
"""Product catalog single source of truth + crawlable product pages.

Source:  content/products.json   (brand, categories, products[] with options[])
Outputs: js/data.js              (window.XUEAIOK_DATA for the SPA, GENERATED)
         product/<slug>.html     (SEO page that hydrates the SPA purchase UI)

Backend usage (future admin):
    import sys; sys.path.insert(0, "/var/www/xueaiok/tools")
    from products import save_products, regenerate_product_pages
    save_products(data)            # writes content/products.json atomically
    regenerate_product_pages()     # rebuilds data.js, product pages, sitemap
"""
import html, json, os, re, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://3388.hk"
E = html.escape
REGION_NAMES = {"hk": "香港", "tw": "台灣", "jp": "日本", "cn": "中國", "us": "美國", "sg": "新加坡", "my": "馬來西亞", "kr": "韓國"}


def products_path(root=None):
    return os.path.join(root or ROOT, "content", "products.json")


def load_products(root=None):
    with open(products_path(root), encoding="utf-8") as f:
        return json.load(f)


def save_products(data, root=None):
    p = products_path(root)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(p), suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, p)


def product_region(p):
    if p.get("region"):
        return p["region"]
    n = p.get("name", "")
    for pat, code in [(r"香港|港", "hk"), (r"台灣|台服|臺", "tw"), (r"日本|DMM", "jp"), (r"中國|大陸", "cn"), (r"美國", "us"), (r"新加坡|\(SG\)", "sg")]:
        if re.search(pat, n):
            return code
    return None


def write_data_js(data, root=None):
    out = "/* GENERATED from content/products.json by tools/products.py — do not edit by hand */\nwindow.XUEAIOK_DATA = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n"
    with open(os.path.join(root or ROOT, "js", "data.js"), "w", encoding="utf-8") as f:
        f.write(out)


def _money(v):
    v = float(v)
    return "HK$" + f"{v:,.2f}"


def _shell(root):
    with open(os.path.join(root, "index.html"), encoding="utf-8") as f:
        s = f.read()
    # absolute asset paths + send in-app hash links to the SPA root
    s = re.sub(r'(href|src)="(css|js|images)/', r'\1="/\2/', s)
    s = s.replace('href="#/', 'href="/#/')
    s = s.replace("location.hash='#/catalog", "location.href='/#/catalog")
    return s


def _head(p, cat_name, region_name, url):
    soon = bool(p.get("comingSoon") or not p.get("options"))
    crumbs = [
        {"@type": "ListItem", "position": 1, "name": "首頁", "item": SITE + "/"},
        {"@type": "ListItem", "position": 2, "name": cat_name, "item": SITE + "/#/catalog/" + p["category"]},
        {"@type": "ListItem", "position": 3, "name": p["name"], "item": url},
    ]
    if soon:
        title = f'{p["name"]} 即將上架 | 3388.HK'
        desc = f'{p["name"]}：{p.get("desc") or "即將上架，敬請期待。"} 分類：{cat_name}。'
        offer = {"@type": "Offer", "priceCurrency": "HKD", "availability": "https://schema.org/PreOrder",
                 "url": url, "seller": {"@type": "Organization", "name": "3388.HK"}}
        price_meta = ""
    else:
        sales = [o["sale"] for o in p["options"]]
        title = f'{p["name"]} {"直充" if p.get("needsUid") else "點卡充值"} | 3388.HK'
        desc = (f'{p["name"]}：{p.get("desc", "")} 面額 {p["options"][0]["label"]} 起，'
                f'售價 {_money(min(sales))} 起，港幣結算，支援 FPS、PayMe、AlipayHK、WeChat Pay。')
        offer = {"@type": "AggregateOffer", "priceCurrency": "HKD", "lowPrice": f"{min(sales):.2f}",
                 "highPrice": f"{max(sales):.2f}", "offerCount": len(p["options"]),
                 "availability": "https://schema.org/InStock", "url": url,
                 "seller": {"@type": "Organization", "name": "3388.HK"}}
        price_meta = (f'  <meta property="product:price:amount" content="{min(sales):.2f}" />\n'
                      f'  <meta property="product:price:currency" content="HKD" />\n')
    ld = [
        {"@context": "https://schema.org", "@type": "Product", "name": p["name"], "description": p.get("desc", ""),
         "sku": p["id"], "url": url, "image": SITE + "/images/logo-header.png",
         "brand": {"@type": "Brand", "name": p["name"]}, "category": cat_name, "offers": offer},
        {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": crumbs},
    ]
    head = (
        f'<meta name="description" content="{E(desc)}" />\n'
        f'  <link rel="canonical" href="{url}" />\n'
        f'  <meta property="og:type" content="product" />\n'
        f'  <meta property="og:site_name" content="3388.HK" />\n'
        f'  <meta property="og:locale" content="zh_HK" />\n'
        f'  <meta property="og:title" content="{E(title)}" />\n'
        f'  <meta property="og:description" content="{E(desc)}" />\n'
        f'  <meta property="og:url" content="{url}" />\n'
        f'  <meta property="og:image" content="{SITE}/images/logo-header.png" />\n'
        f'{price_meta}'
        f'  <script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>'
    )
    return title, desc, head


def _body(p, cat_name, region_name):
    soon = bool(p.get("comingSoon") or not p.get("options"))
    meta_extra = (region_name + "區 · ") if region_name else ""
    crumb = (
        f'<div class="breadcrumb pdp-crumb"><a href="/#/">首頁</a> / '
        f'<a href="/#/catalog/{E(p["category"])}">{E(cat_name)}</a> / '
        f'<span>{E(p["name"])}</span></div>'
    )
    if soon:
        return (
            f'<div class="container pdp seo-pdp">\n'
            f'      {crumb}\n'
            f'      <article class="info-card">\n'
            f'        <h1>{E(p["name"])}</h1>\n'
            f'        <p class="info-meta">{E(meta_extra)}{E(cat_name)} · 即將上架</p>\n'
            f'        <p>{E(p.get("desc") or "此商品即將上架，敬請期待。")}</p>\n'
            f'        <p><a class="btn btn-accent" href="/#/catalog/{E(p["category"])}">返回分類</a></p>\n'
            f'      </article>\n'
            f'    </div>'
        )
    uid = p.get("needsUid")
    rows = "".join(
        f'<li><span>{E(o["label"])}</span><b>{_money(o["sale"])}</b>'
        + (f'<s>{_money(o["list"])}</s>' if o.get("list", 0) > o["sale"] else "")
        + "</li>"
        for o in p["options"]
    )
    steps = (["輸入玩家 ID 及伺服器"] if uid else []) + [
        "選擇面額及數量",
        "選擇付款方式（港幣 HKD）",
        "按「立即購買」或「加入購物車」，到購物車結帳",
        "系統自動直充到帳" if uid else "付款成功後卡密發送到會員中心",
    ]
    return (
        f'<div class="container pdp seo-pdp">\n'
        f'      {crumb}\n'
        f'      <article class="info-card">\n'
        f'        <h1>{E(p["name"])}</h1>\n'
        f'        <p class="info-meta">{E(meta_extra)}{E(cat_name)} · 即時發貨</p>\n'
        f'        <p>{E(p.get("desc", ""))}</p>\n'
        f'        <h2>面額及價格（港幣）</h2>\n'
        f'        <ul class="seo-denoms">{rows}</ul>\n'
        f'        <h2>購買步驟</h2>\n'
        f'        <ol>{"".join(f"<li>{E(s)}</li>" for s in steps)}</ol>\n'
        f'        <h2>付款及發貨</h2>\n'
        f'        <p>支援 AlipayHK、Boost、Touch\'n Go（Antom）及 FPS 轉數快、PayMe、WeChat Pay（QFPay），'
        f'行政費於結帳時列明；QFPay 單筆上限 HK$2000。未付款訂單 30 分鐘後自動取消。</p>\n'
        f'      </article>\n'
        f'    </div>'
    )


def regenerate_product_pages(root=None, data=None):
    """Rebuild js/data.js and every /product/<slug>.html from content/products.json.
    Returns the list of product URL paths (for sitemap)."""
    root = root or ROOT
    data = data or load_products(root)
    write_data_js(data, root)
    shell = _shell(root)
    cats = {c["id"]: c["name"] for c in data.get("categories", [])}
    os.makedirs(os.path.join(root, "product"), exist_ok=True)
    paths, keep = [], set()
    for p in data["products"]:
        slug = p.get("slug") or p["id"]
        path = f"/product/{slug}.html"
        url = SITE + path
        cat_name = cats.get(p.get("category"), "商品")
        rc = product_region(p)
        region_name = REGION_NAMES.get(rc, "") if rc else ""
        title, desc, head = _head(p, cat_name, region_name, url)
        s = shell
        s = re.sub(r'<meta name="description"[^>]*/>\s*<link rel="canonical"[^>]*/>.*?</script>', lambda m: head, s, count=1, flags=re.S)
        s = re.sub(r"<title>.*?</title>", f"<title>{E(title)}</title>", s, count=1, flags=re.S)
        s = s.replace('<main id="app"></main>', f'<main id="app">{_body(p, cat_name, region_name)}</main>\n  <script>window.__PRODUCT_ID = {json.dumps(p["id"])};</script>', 1)
        with open(os.path.join(root, "product", slug + ".html"), "w", encoding="utf-8") as f:
            f.write(s)
        keep.add(slug + ".html")
        paths.append(path)
    for fn in os.listdir(os.path.join(root, "product")):  # drop pages of deleted products
        if fn.endswith(".html") and fn not in keep:
            os.remove(os.path.join(root, "product", fn))
    try:  # refresh sitemap with product URLs
        sm = os.path.join(root, "sitemap.xml")
        txt = open(sm, encoding="utf-8").read()
        txt = re.sub(r"\s*<url><loc>[^<]*/product/[^<]*</loc>.*?</url>", "", txt)
        add = "".join(f"  <url><loc>{SITE}{u}</loc></url>\n" for u in paths)
        txt = txt.replace("</urlset>", add + "</urlset>")
        open(sm, "w", encoding="utf-8").write(txt)
    except FileNotFoundError:
        pass
    return paths


if __name__ == "__main__":
    print("\n".join(regenerate_product_pages()))
