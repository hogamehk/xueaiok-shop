#!/usr/bin/env python3
"""Generate crawlable static pages: /news/*, /about.html, /faq.html, /terms.html,
/privacy.html, sitemap.xml, robots.txt, news/latest.json.
Usage: python3 tools/build_pages.py   (run from repo root, then deploy)
Add an article: copy content/news/<any>.json, edit fields, rerun."""
import json, html, glob, os
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://3388.hk"
V = "news1"
BRAND = "3388.HK"
CO = "HOGAME ONLINE ENTERTAINMENT LIMITED"
E = html.escape

SOCIAL_NAMES = [("facebook", "Facebook", ""), ("x", "X", ""), ("instagram", "Instagram", ""), ("youtube", "YouTube", "")]
SOCIAL_ICONS = {"facebook": "M14 8.5V6.8c0-.8.2-1.3 1.4-1.3H17V2.6c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.4-4 4.1v1.9H8v3.2h2.6V22H14V11.7h2.6l.4-3.2H14z", "x": "M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.2-8.3L1.9 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z", "instagram": "M12 2.2c3.2 0 3.6 0 4.8.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-3.3-.1-4.8-1.7-4.9-4.9C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8C2.4 3.9 3.9 2.4 7.2 2.3 8.4 2.2 8.8 2.2 12 2.2zm0 4.8a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4zm5.2-9.6a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z", "youtube": "M23 7.2s-.2-1.6-.9-2.3c-.9-.9-1.8-.9-2.3-1C16.6 3.6 12 3.6 12 3.6s-4.6 0-7.8.3c-.4.1-1.4.1-2.3 1C1.2 5.6 1 7.2 1 7.2S.8 9.1.8 11v1.8c0 1.9.2 3.8.2 3.8s.2 1.6.9 2.3c.9.9 2 .9 2.5 1 1.8.2 7.6.2 7.6.2s4.6 0 7.8-.3c.4-.1 1.4-.1 2.3-1 .7-.7.9-2.3.9-2.3s.2-1.9.2-3.8V11c0-1.9-.2-3.8-.2-3.8zM9.7 15.1V8.5l6.2 3.3-6.2 3.3z"}
def soc_svg(k):
    return f'<svg viewBox="0 0 24 24" width="20" height="20" fill="#fff" aria-hidden="true" focusable="false"><path d="{SOCIAL_ICONS[k]}"/></svg>'

try:
    SOCIAL = json.load(open(os.path.join(ROOT, "content/social.json"), encoding="utf-8"))
except Exception:
    SOCIAL = {}

def social_links(cls="ft-social"):
    items = [(k, n, ic) for k, n, ic in SOCIAL_NAMES if (SOCIAL.get(k) or "").strip()]
    if not items:
        return ""
    return f'<div class="{cls}">' + "".join(
        f'<a class="soc soc-{k}" href="{E(SOCIAL[k].strip())}" target="_blank" rel="noopener" aria-label="{n}" title="{n}">{soc_svg(k)}</a>' for k, n, ic in items) + "</div>"

def header():
    return f'''<header class="site-header">
    <div class="header-inner">
      <a class="logo" href="/#/" aria-label="3388 首頁"><img class="logo-img" src="/images/logo-header.png?v={V}" width="137" height="48" alt="3388.HK — 100%官方正品，即買即發" /></a>
      <nav class="nav-links" aria-label="主選單"><a href="/#/">首頁</a><a href="/#/catalog">全部</a><a href="/news/">最新消息</a><a href="/faq.html">常見問題</a></nav>
      <div class="header-actions"><a class="auth-link" href="/#/account">會員中心</a><a class="cart-btn" href="/#/cart" aria-label="購物車"><span aria-hidden="true">🛒</span><span class="cart-count" data-count="0"></span></a></div>
    </div>
  </header>'''

def footer():
    return f'''<footer class="site-footer ft">
    <div class="container">
      <div class="ft-pay"><span class="pl pl-fps">FPS</span><span class="pl pl-payme">PayMe</span><span class="pl pl-wechat">WeChat Pay</span><span class="pl pl-alipay">AlipayHK</span><span class="pl pl-boost">Boost</span><span class="pl pl-tng">Touch'n Go</span></div>
      {social_links()}
      <nav class="ft-links ft-info"><a href="/contact.html">聯絡我們</a><a href="/about.html">關於我們</a><a href="/news/">最新消息</a><a href="/faq.html">常見問題</a></nav>
      <div class="ft-bar">
        <div class="ft-left"><span>© 2026 {BRAND} · {CO}</span></div>
        <nav class="ft-links ft-legal"><a href="/terms.html">服務使用條款</a><a href="/privacy.html">私隱政策</a></nav>
      </div>
    </div>
  </footer>'''

def bottom_nav():
    return '''<nav class="bottom-nav" aria-label="底部導覽">
    <a href="/#/" data-nav="home"><span class="bn-icon" aria-hidden="true">🏠</span>首頁</a>
    <a href="/#/catalog" data-nav="catalog"><span class="bn-icon" aria-hidden="true">🎮</span>商店</a>
    <a href="/#/catalog/giftcard" data-nav="giftcard"><span class="bn-icon" aria-hidden="true">🎁</span>點卡</a>
    <a class="bn-cart" href="/#/cart" data-nav="cart"><span class="bn-icon" aria-hidden="true">🛒</span>購物車<span class="cart-count" data-count="0"></span></a>
    <a href="/#/account" data-nav="account"><span class="bn-icon" aria-hidden="true">👤</span>會員</a>
  </nav>
  <script>(function(){try{var c=JSON.parse(localStorage.getItem("xueaiok_cart_v1")||"[]"),n=0;c.forEach(function(i){n+=Number(i.qty)||0});document.querySelectorAll(".cart-count").forEach(function(e){e.textContent=n>0?String(n):"";e.dataset.count=String(n)})}catch(e){}})();</script>'''

def page(path, title, desc, body, crumbs, jsonld=None, og_type="website", draft=False):
    url = SITE + path
    ld = [{"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": SITE + u} for i, (n, u) in enumerate(crumbs)]}]
    if jsonld: ld.append(jsonld)
    crumb_html = " / ".join(f'<a href="{u if u != "/" else "/#/"}">{E(n)}</a>' if i < len(crumbs) - 1 else f"<span>{E(n)}</span>" for i, (n, u) in enumerate(crumbs))
    full = f"{title} | {BRAND}"
    return f'''<!DOCTYPE html>
<html lang="zh-HK">
<head>
  <meta charset="UTF-8" />
  {"<!-- DRAFT: 內容為草稿，上線前須經法律審閱 -->" if draft else ""}
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
  <meta name="format-detection" content="telephone=no, date=no, address=no" />
  <title>{E(full)}</title>
  <meta name="description" content="{E(desc)}" />
  <link rel="canonical" href="{url}" />
  <meta property="og:type" content="{og_type}" />
  <meta property="og:site_name" content="{BRAND}" />
  <meta property="og:locale" content="zh_HK" />
  <meta property="og:title" content="{E(full)}" />
  <meta property="og:description" content="{E(desc)}" />
  <meta property="og:url" content="{url}" />
  <meta property="og:image" content="{SITE}/images/logo-header.png" />
  <meta name="twitter:card" content="summary" />
  <link rel="icon" type="image/png" href="/images/favicon.png?v={V}" />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700;800&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/css/styles.css?v={V}" />
  <link rel="stylesheet" href="/css/site-bg.css?v={V}" />
  <script type="application/ld+json">{json.dumps(ld if len(ld) > 1 else ld[0], ensure_ascii=False)}</script>
</head>
<body class="info-page">
  {header()}
  <main class="container info-wrap">
    <div class="breadcrumb">{crumb_html}</div>
    {body}
  </main>
  {footer()}
  {bottom_nav()}
  <script>fetch("/api/site-settings").then(function(r){{return r.ok?r.json():null}}).then(function(s){{if(s&&s.background_url){{document.body.classList.add("has-custom-bg");document.body.style.setProperty("--site-bg-image","url("+s.background_url+")")}} }}).catch(function(){{}});</script>
  <script src="/js/cookie-consent.js?v={V}"></script>
</body>
</html>
'''

def render_blocks(blocks):
    out = []
    for kind, val in blocks:
        if kind in ("ul", "ol"):
            out.append(f"<{kind}>" + "".join(f"<li>{E(x)}</li>" for x in val) + f"</{kind}>")
        else:
            out.append(f"<{kind}>{E(val)}</{kind}>")
    return "\n".join(out)

def write(rel, txt):
    p = os.path.join(ROOT, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "w", encoding="utf-8").write(txt)

def section_page(path, title, desc, intro, sections, draft=True, jsonld=None, updated=None):
    intros = list(intro) if isinstance(intro, (list, tuple)) else [intro]
    updated_s = updated if updated is not None else date.today().isoformat()
    body = f'<article class="info-card"><h1>{E(title)}</h1><p class="info-meta">最後更新：{E(updated_s)}</p>'
    body += "".join(f"<p>{E(p)}</p>" for p in intros)
    for h, blocks in sections:
        body += f"<h2>{E(h)}</h2>" + render_blocks(blocks)
    body += "</article>"
    write(path.lstrip("/"), page(path, title, desc, body, [("首頁", "/"), (title, path)], jsonld, draft=draft))

TBD = "【待填寫】"
EMAIL = "hogamehk@gmail.com"
HOURS = "24小時在線"

# ---------- static info pages ----------
section_page("/about.html", "關於我們", "3388.HK 由 HOGAME ONLINE ENTERTAINMENT LIMITED 營運，提供香港遊戲點卡、禮品卡及手遊儲值服務，以港幣結算。",
  "3388.HK 是一個面向香港用戶的遊戲充值及數碼禮品卡平台，由 HOGAME ONLINE ENTERTAINMENT LIMITED 營運。", [
  ("我們提供", [["ul", ["遊戲點數卡及數碼禮品卡（例如 MyCard、PSN 禮物卡）", "手遊儲值（例如王者榮耀點券）", "全站港幣（HK$）報價及結算"]]]),
  ("付款方式", [["p", "我們透過持牌支付服務商收款：Antom（AlipayHK、Boost、Touch'n Go eWallet）及 QFPay（FPS 轉數快、PayMe、WeChat Pay）。本平台不支援信用卡付款。"]]),
  ("公司資料", [["ul", ["HOGAME ONLINE ENTERTAINMENT LIMITED（火龍在線有限公司）", "香港公司註冊編號：2243519", "商業登記號碼：64818203", "公司成立於2015年"]]]),
  ("聯絡我們", [["ul", ["WhatsApp：+852 5536 0181／+852 5536 0191", "WeChat：+852 5536 0181／+852 5536 0191", f"客服電郵：{EMAIL}", f"客服時間：{HOURS}"]]]),
], jsonld={"@context": "https://schema.org", "@type": "AboutPage", "url": SITE + "/about.html", "mainEntity": {"@type": "Organization", "name": "3388.HK", "legalName": CO, "alternateName": "火龍在線有限公司", "foundingDate": "2015", "url": SITE, "email": EMAIL, "telephone": ["+852-5536-0181", "+852-5536-0191"], "identifier": [{"@type": "PropertyValue", "name": "香港公司註冊編號", "value": "2243519"}, {"@type": "PropertyValue", "name": "商業登記號碼", "value": "64818203"}]}})

FAQ = [
  ("有哪些付款方式？", "Antom：AlipayHK（行政費 2.2%）、Boost（2.5%）、Touch'n Go eWallet（2.5%）。QFPay：FPS 轉數快、PayMe、WeChat Pay（行政費 1.2%）。行政費按商品小計計算，並於結帳時清楚列出。"),
  ("可以用信用卡付款嗎？", "暫不支援信用卡付款。"),
  ("為甚麼大額訂單不能用 FPS／PayMe／WeChat Pay？", "QFPay 渠道單筆付款上限為 HK$2000（含行政費）。超過此金額請改用 AlipayHK、Boost 或 Touch'n Go，或分開下單。"),
  ("訂單多久未付款會取消？", "由於商品價格可能變動，未付款訂單會於建立後 30 分鐘自動取消。如需購買請重新下單，以最新價錢為準。"),
  ("付款後多久收到商品？", "點卡類商品付款成功後，卡號及密碼一般會即時顯示於會員中心的訂單記錄；直充商品會按所填帳號處理，處理時間視乎遊戲方而定。如遇延誤請聯絡客服。"),
  ("直充需要填寫甚麼資料？", "請填寫正確的玩家 ID，部分遊戲亦需伺服器資料。購物車內每件直充商品可以填寫各自的帳號。資料錯誤可能導致充值失敗或充值到他人帳戶。"),
  ("可以退款嗎？", "數碼商品（卡密及直充）一經發出或充值成功，一般不設退款或更換。如因本平台原因未能發貨，我們會按原付款方式退款。詳情請參閱使用條款。"),
  ("付款成功但訂單顯示已取消？", "如付款在訂單取消後才到帳，系統會標記為「逾時付款（待人工處理）」，客服會跟進處理。"),
  ("如何聯絡客服？", "客服 24 小時在線。可透過 WhatsApp 或 WeChat（+852 5536 0181 或 +852 5536 0191）、電郵 hogamehk@gmail.com 聯絡我們，查詢訂單時請提供訂單編號。"),
  ("一次可以買多件商品嗎？", "可以。在商品頁選擇數量，或使用「加入購物車」把不同商品一併結帳。"),
]
faq_body = '<article class="info-card"><h1>常見問題</h1><div class="faq-list">' + "".join(
  f'<details class="faq-item"{" open" if i == 0 else ""}><summary>{E(q)}</summary><p>{E(a)}</p></details>' for i, (q, a) in enumerate(FAQ)) + "</div></article>"
faq_ld = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
  {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in FAQ]}
write("faq.html", page("/faq.html", "常見問題", "3388.HK 常見問題：付款方式及行政費、HK$2000 限額、30 分鐘未付款自動取消、發貨、退款及帳號填寫。", faq_body, [("首頁", "/"), ("常見問題", "/faq.html")], faq_ld))

section_page("/terms.html", "服務使用條款", "3388.HK 服務使用條款：帳戶註冊與使用、服務範圍、交易與交付、用戶責任、帳戶終止、個人資料、知識產權及適用法律。",
  [
    "HOGAME ONLINE ENTERTAINMENT LIMITED（下稱「本公司」）經營 www.3388.hk 網站（下稱「本網站」），向用戶提供遊戲點卡、手遊儲值、遊戲金幣、會員訂閱及 CD-KEY 等數位商品服務（下稱「本服務」）。",
    "用戶於註冊帳戶、瀏覽本網站或進行任何交易前，請仔細閱讀本條款。一旦用戶完成註冊、下單或繼續使用本服務，即視為已閱讀、理解並同意受本條款約束。如不同意本條款任何內容，請立即停止使用本服務。",
  ], [
  ("一、帳戶註冊與使用", [["ol", [
    "用戶須提供真實、準確及完整的資料完成註冊。註冊時一般只需提供自定義的英文帳號名稱及電郵地址。資料如有變更，應即時更新。",
    "用戶應妥善保管帳戶名稱及密碼。以該帳戶進行的一切操作及交易，均視為用戶本人所為。",
    "如發現帳戶遭未經授權使用，用戶應立即透過本公司公布的聯絡方式通知我們。本公司可暫停相關帳戶，直至情況澄清為止。",
    "未滿十八歲的用戶，須在家長或監護人同意下方可註冊及使用本服務。",
  ]]]),
  ("二、服務範圍", [
    ["p", "本公司透過本網站銷售及代為處理以下類型的數位商品："],
    ["ul", ["遊戲點卡", "手遊儲值", "遊戲金幣", "會員訂閱", "CD-KEY"]],
    ["p", "本公司僅負責收取款項並依訂單將對應商品或儲值交付予用戶或指定第三方。本公司並非銀行或金融機構，不提供任何金融轉帳或支付結算服務。"],
  ]),
  ("三、交易與交付", [["ol", [
    "用戶下單並完成付款後，本公司將依產品性質安排發貨或代儲。虛擬商品一經交付（包括發送卡密、完成儲值或提供序號），除因本公司明顯錯誤外，原則上不予退款或更換。",
    "用戶應自行確認所購商品的適用地區、伺服器、帳號要求及使用限制。因用戶提供錯誤資料或選擇不適用商品而導致無法使用，本公司不承擔責任。",
    "因遊戲官方、發行商或第三方平台的政策、系統故障、維護或帳號限制所導致的問題，由用戶與相關第三方自行解決。",
  ]]]),
  ("四、用戶責任", [["p", "用戶同意僅以合法方式使用本服務，不得利用本服務從事任何違法、欺詐或侵害他人權益的行為。如有違反，本公司有權暫停或終止相關帳戶，並保留追究法律責任的權利。"]]),
  ("五、服務中斷與風險", [["p", "本服務可能因系統維護、電信故障、第三方問題、網絡攻擊或其他不可抗力因素而中斷或延遲。本公司會盡合理努力維持服務穩定，但不保證服務絕對不中斷或無錯誤。用戶理解並自行承擔使用本服務可能產生的風險。"]]),
  ("六、帳戶終止", [["ol", [
    "用戶可隨時透過本公司公布的聯絡方式申請終止帳戶。",
    "如用戶違反本條款、提供虛假資料、從事欺詐交易或其他本公司合理認為不當的行為，本公司可在通知用戶後終止其帳戶及服務。",
    "帳戶終止後，未使用的餘額或點數將依當時公告的規則處理。",
  ]]]),
  ("七、個人資料", [["p", "本公司會依相關法例及本網站公布的私隱政策處理用戶的個人資料。用戶同意本公司為提供服務、核實身份及處理交易而使用其提供的資料。註冊時一般只收集帳號名稱及電郵；其他資料（如電話號碼、姓名）僅在用戶主動聯絡我們時才可能需要提供。"]]),
  ("八、知識產權", [["p", "本網站的文字、圖像、商標、系統及其他內容的知識產權均屬本公司或相關權利人所有。未經書面許可，用戶不得複製、修改或作商業用途。"]]),
  ("九、聯絡方式", [
    ["p", "如對本服務有任何查詢或投訴，可透過以下方式聯絡本公司："],
    ["ul", ["WhatsApp：+852 55360181", "WeChat：+852 55360181"]],
    ["p", "本公司目前主要以即時通訊方式處理查詢，我們會盡快回覆。"],
  ]),
  ("十、適用法律與爭議解決", [["p", "本條款受香港特別行政區法律管轄。如因本服務或本條款產生爭議，雙方應先嘗試友好協商；協商不成時，以香港法院為第一審管轄法院。"]]),
  ("十一、條款修改", [["p", "本公司保留修改本條款的權利。修改後的條款將於本網站公布後生效。建議用戶定期查閱本條款頂部的「最後更新」日期。用戶於修改後繼續使用本服務，即視為接受修訂內容。"]]),
], draft=False)
section_page("/privacy.html", "私隱政策", "3388.HK 私隱政策：說明我們如何收集、使用、保存及保護個人資料，以及您根據香港《個人資料（私隱）條例》享有的權利。",
  [
    "HOGAME ONLINE ENTERTAINMENT LIMITED（下稱「本公司」）重視用戶的個人資料私隱。本政策說明我們在營運 www.3388.hk 網站（下稱「本網站」）及提供相關服務時，如何收集、使用、保存及保護您的個人資料。",
    "使用本網站或向我們購買商品，即表示您已閱讀並同意本政策的內容。",
  ], [
  ("一、我們收集的資料", [
    ["p", "為提供服務，我們可能收集以下類型的資料："],
    ["ul", [
      "註冊帳戶時提供的資料（例如自定義的英文帳號名稱及電郵地址）",
      "交易相關資料（訂單內容、付款參考、商品交付資訊）",
      "使用本網站時產生的技術資料（如裝置類型、瀏覽器資訊、IP 地址、瀏覽記錄）",
      "當您主動透過 WhatsApp 或 WeChat 聯絡我們時，您可能會提供的姓名、電話號碼或其他聯絡方式",
    ]],
    ["p", "我們不會在註冊時強制要求您提供電話號碼或真實姓名。只有在您主動聯絡我們處理訂單或查詢時，才可能需要您提供相關聯絡資料。"],
  ]),
  ("二、資料的使用目的", [
    ["p", "我們收集的資料主要用於："],
    ["ul", [
      "處理您的訂單及交付商品（包括點卡、手遊儲值、遊戲金幣、會員訂閱及 CD-KEY）",
      "管理您的帳戶及提供客戶支援",
      "核實身份、防止欺詐及保障交易安全",
      "改善本網站的運作及使用體驗",
      "在法律要求或允許的情況下，履行相關法定責任",
    ]],
  ]),
  ("三、資料的分享", [
    ["p", "我們不會出售您的個人資料。在以下情況下，我們可能會向第三方披露有限的資料："],
    ["ul", [
      "為完成交易而必須提供給相關遊戲發行商、平台或支付服務商的資料",
      "法律要求或政府機關依法提出要求時",
      "為保護本公司、用戶或公眾的合法權益而有必要時",
    ]],
  ]),
  ("四、資料的保存", [["p", "我們會在達成收集目的所需的期間內保存您的資料，或依法律規定的保存期限保留。交易紀錄一般會保存合理期間以供查核及處理爭議。帳戶如長期未使用，我們可能會依內部規則予以刪除或匿名化處理。"]]),
  ("五、資料安全", [["p", "我們採取合理的技術及管理措施，防止個人資料遭未經授權的存取、使用或洩露。惟請注意，任何透過互聯網傳送的資料均無法保證絕對安全，用戶應自行妥善保管帳戶資料。"]]),
  ("六、您的權利", [
    ["p", "根據香港《個人資料（私隱）條例》，您有權："],
    ["ul", [
      "查閱我們持有您的個人資料",
      "要求更正不準確的資料",
      "在法律允許的範圍內，要求停止使用或刪除您的資料",
    ]],
    ["p", "如需行使上述權利，請透過以下方式聯絡我們。我們會在合理時間內回覆。"],
  ]),
  ("七、Cookie 及類似技術", [
    ["p", "本網站使用 Cookie 及類似技術，包括用於分析網站流量的 Google Analytics。這些技術幫助我們了解用戶如何使用本網站，並改善服務體驗。"],
    ["p", "你可透過瀏覽器設定拒絕或刪除 Cookie，但這可能影響本網站部分功能的正常運作。繼續使用本網站即表示你同意我們按本政策使用 Cookie。"],
  ]),
  ("八、未成年人", [["p", "本服務主要面向成年人。如未成年人使用本網站，應在家長或監護人的同意及指導下進行。我們不會故意收集未滿十八歲人士的個人資料，除非已獲得適當同意。"]]),
  ("九、政策更新", [["p", "我們可能不時修訂本政策。更新後的版本將發布於本網站，並於發布時生效。建議您定期查閱本政策頂部的「最後更新」日期。"]]),
  ("十、聯絡我們", [
    ["p", "如對本私隱政策或您的個人資料有任何查詢，可透過以下方式聯絡本公司："],
    ["ul", ["WhatsApp：+852 55360181", "WeChat：+852 55360181"]],
    ["p", "本公司目前主要以即時通訊方式處理查詢，我們會盡快回覆。"],
  ]),
], draft=False, updated="2026年10月13日")


# ---------- contact ----------
WA = "+852 5536 0181"
contact_body = rf"""<section class="info-card contact-hero"><h1>聯絡 3388.HK 客戶服務</h1><p>需要幫助嗎？你可以透過 WhatsApp、WeChat 或電郵聯絡我們，客服 24 小時在線。查詢訂單時請提供訂單編號，方便我們更快處理。</p>
<div class="contact-quick"><a class="btn btn-outline-accent" href="/faq.html">常見問題</a><a class="btn btn-outline-accent" href="/#/orders">我的訂單</a></div></section>
<div class="contact-cards">
  <div class="contact-card"><div class="cc-ico">💬</div><h2>WhatsApp</h2><div class="cc-lines"><a class="cc-line btn btn-accent btn-sm" href="https://wa.me/85255360181" target="_blank" rel="noopener">+852 5536 0181</a><a class="cc-line btn btn-accent btn-sm" href="https://wa.me/85255360191" target="_blank" rel="noopener">+852 5536 0191</a></div><p class="cc-note">點擊號碼開啟 WhatsApp</p></div>
  <div class="contact-card"><div class="cc-ico">🟢</div><h2>WeChat</h2><div class="cc-lines"><button type="button" class="cc-line btn btn-outline-accent btn-sm copy-wechat" data-v="+85255360181">+852 5536 0181 · 複製</button><button type="button" class="cc-line btn btn-outline-accent btn-sm copy-wechat" data-v="+85255360191">+852 5536 0191 · 複製</button></div><p class="cc-note">在 WeChat 以電話號碼搜尋並加為好友</p></div>
  <div class="contact-card"><div class="cc-ico">✉️</div><h2>客服電郵</h2><p class="cc-val cc-mail">{EMAIL}</p><a class="btn btn-outline-accent btn-sm" href="mailto:{EMAIL}">發送電郵</a></div>
  <div class="contact-card"><div class="cc-ico">🕘</div><h2>服務時間</h2><p class="cc-val">{HOURS}</p><p class="cc-note">全年無休</p></div>
</div>
{('<section class="info-card"><h2>關注我們</h2>' + social_links("contact-social") + '</section>') if social_links() else ""}
<div class="toast-static" id="toast" hidden></div>
<script>(function(){{
var t=document.getElementById("toast");function toast(m){{t.textContent=m;t.hidden=false;clearTimeout(t._h);t._h=setTimeout(function(){{t.hidden=true}},3000)}}
document.querySelectorAll(".copy-wechat").forEach(function(b){{b.addEventListener("click",function(){{var v=b.dataset.v;(navigator.clipboard?navigator.clipboard.writeText(v):Promise.reject()).then(function(){{toast("已複製 WeChat ID："+v)}},function(){{toast("WeChat ID："+v)}})}})}});
}})();</script>"""
write("contact.html", page("/contact.html", "聯絡我們", "聯絡 3388.HK 客戶服務：WhatsApp／WeChat +852 5536 0181／0191、電郵 hogamehk@gmail.com，24 小時在線，查詢訂單、付款及直充問題。", contact_body, [("首頁", "/"), ("聯絡我們", "/contact.html")],
  {"@context": "https://schema.org", "@type": "ContactPage", "name": "聯絡我們", "url": SITE + "/contact.html",
   "mainEntity": {"@type": "Organization", "name": CO, "url": SITE, "contactPoint": [{"@type": "ContactPoint", "telephone": "+852-5536-0181", "contactType": "customer service", "email": EMAIL, "hoursAvailable": {"@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"], "opens": "00:00", "closes": "23:59"}, "availableLanguage": ["zh-HK", "en"]}, {"@type": "ContactPoint", "telephone": "+852-5536-0191", "contactType": "customer service", "email": EMAIL, "availableLanguage": ["zh-HK", "en"]}]}}))

# ---------- products ----------
import sys as _sys
_sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import products as _products
_pdata = _products.load_products(ROOT)
PRODUCT_URL = {p["id"]: f"/product/{p.get('slug') or p['id']}.html" for p in _pdata["products"]}

# ---------- news ----------
arts = sorted((json.load(open(f, encoding="utf-8")) for f in glob.glob(os.path.join(ROOT, "content/news/*.json"))), key=lambda a: a["date"], reverse=True)
for a in arts:
    path = f"/news/{a['slug']}.html"
    ld = {"@context": "https://schema.org", "@type": "Article", "headline": a["title"], "description": a["description"],
          "datePublished": a["date"], "dateModified": a.get("updated", a["date"]), "inLanguage": "zh-HK",
          "mainEntityOfPage": SITE + path, "image": SITE + "/images/logo-header.png",
          "author": {"@type": "Organization", "name": BRAND}, "publisher": {"@type": "Organization", "name": CO, "logo": {"@type": "ImageObject", "url": SITE + "/images/logo-header.png"}}}
    body = f'''<article class="info-card news-article"><h1>{E(a["title"])}</h1><p class="info-meta"><time datetime="{a["date"]}">{a["date"]}</time> · 最新消息</p>
{render_blocks(a["body"])}
<div class="news-cta"><a class="btn btn-accent" href="{E(PRODUCT_URL.get(a["product"], "/#/product/" + a["product"]))}">前往購買 {E(a["productName"])}</a><a class="btn btn-outline" href="/news/">返回新聞列表</a></div></article>'''
    write(path.lstrip("/"), page(path, a["title"], a["description"], body, [("首頁", "/"), ("最新消息", "/news/"), (a["title"], path)], ld, "article"))

idx = '<div class="info-card"><h1>最新消息</h1><p>購買教學、商品資訊及平台公告。</p></div><div class="news-list">' + "".join(
  f'<a class="news-card" href="/news/{a["slug"]}.html"><time datetime="{a["date"]}">{a["date"]}</time><h2>{E(a["title"])}</h2><p>{E(a["description"])}</p><span class="news-more">閱讀全文 →</span></a>' for a in arts) + "</div>"
write("news/index.html", page("/news/", "最新消息", "3388.HK 最新消息：遊戲點卡、禮品卡及手遊儲值購買教學與公告。", idx, [("首頁", "/"), ("最新消息", "/news/")],
  {"@context": "https://schema.org", "@type": "CollectionPage", "name": "最新消息", "url": SITE + "/news/"}))
write("news/latest.json", json.dumps([{k: a[k] for k in ("slug", "title", "description", "date")} for a in arts[:3]], ensure_ascii=False))

urls = ["/", "/news/", "/about.html", "/faq.html", "/terms.html", "/privacy.html", "/contact.html"] + [f"/news/{a['slug']}.html" for a in arts]
today = date.today().isoformat()
write("sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "".join(f"  <url><loc>{SITE}{u}</loc><lastmod>{today}</lastmod></url>\n" for u in urls) + "</urlset>\n")
write("robots.txt", f"User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: {SITE}/sitemap.xml\n")
_ppaths = _products.regenerate_product_pages(ROOT, _pdata)  # also appends product URLs to sitemap
print("built", len(arts), "articles,", len(urls), "urls,", len(_ppaths), "product pages")
