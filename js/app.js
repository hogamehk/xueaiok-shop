/* 3388 Shop — SPA router, cart, checkout */
(function () {
  "use strict";

  const DATA = window.XUEAIOK_DATA;
  const CART_KEY = "xueaiok_cart_v1";
  const ORDER_KEY = "xueaiok_last_order_v1";
  const HIDDEN_ORDERS_KEY = "xueaiok_hidden_orders_v1";
  const API = "/api";

  let currentUser = null; // { username } | null
  let authReady = false;
  let lastOrdersCache = [];

  async function api(path, opts = {}) {
    const res = await fetch(API + path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      ...opts,
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { ok: res.ok, status: res.status, body };
  }

  async function refreshAuth() {
    try {
      const { ok, body } = await api("/me");
      currentUser = ok && body?.username ? { username: body.username, order_count: body.order_count || 0, email: body.email || "", email_verified: !!body.email_verified, is_admin: !!body.is_admin } : null;
    } catch {
      currentUser = null;
    }
    authReady = true;
    updateAuthUI();
  }

  function updateAuthUI() {
    const slot = $("#auth-slot");
    if (slot) {
      if (currentUser) {
        slot.innerHTML = `
          <a class="auth-user" href="#/account" title="${escapeHtml(currentUser.username)}">${escapeHtml(currentUser.username)}</a>
          <button type="button" class="auth-link auth-logout" id="logout-btn">登出</button>`;
        $("#logout-btn")?.addEventListener("click", async () => {
          await api("/logout", { method: "POST", body: "{}" });
          currentUser = null;
          updateAuthUI();
          toast("已登出");
          const route = parseHash();
          if (["login", "register", "account", "orders", "order-detail"].includes(route.page)) navigate("/");
          else render();
        });
      } else {
        slot.innerHTML = `
          <a class="auth-link" href="#/login">登入</a>
          <a class="btn btn-accent btn-sm auth-register" href="#/register">註冊</a>`;
      }
    }
    $$("[data-auth]").forEach((el) => {
      const mode = el.dataset.auth;
      if (mode === "guest") el.hidden = !!currentUser;
      if (mode === "user") {
        el.hidden = !currentUser;
        if (currentUser && el.id === "mobile-user") {
          el.textContent = "會員中心 · " + currentUser.username;
          el.href = "#/account";
        }
      }
    });
  }


  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  function money(n) {
    const v = Math.round((Number(n) || 0) * 100) / 100;
    const [i, d] = Math.abs(v).toFixed(2).split(".");
    return (v < 0 ? "-" : "") + "HK$" + i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + d;
  }

  function getProduct(id) {
    return DATA.products.find((p) => p.id === id);
  }

  function getCategory(id) {
    return DATA.categories.find((c) => c.id === id);
  }

  function productInitials(name) {
    const parts = name.replace(/[：:]/g, " ").split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2);
    return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
  }

  function thumbStyle(product) {
    return `background: linear-gradient(145deg, ${product.color}ee, ${product.color}88);`;
  }

  function loadCart() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartBadge();
  }

  function cartCount() {
    return loadCart().reduce((s, i) => s + i.qty, 0);
  }

  function cartSubtotal() {
    return loadCart().reduce((s, i) => s + i.sale * i.qty, 0);
  }

  const QFPAY_FEE_RATE = 0.012;
  const QFPAY_MAX_HKD = 2000;
  const QFPAY_METHODS = new Set(["qfpay_fps", "qfpay_payme", "qfpay_wechat"]);
  const ANTOM_FEE_RATES = { alipay_hk: 0.022, boost: 0.025, tng: 0.025 };
  const ANTOM_METHODS = new Set(["alipay_hk", "boost", "tng"]);

  function feeRateLabel(rate) {
    const pct = Math.round(Number(rate) * 1000) / 10;
    return Number.isInteger(pct) ? pct + "%" : String(pct) + "%";
  }

  function feeAmounts(subtotal, rate) {
    const sub = Number(subtotal) || 0;
    const chargeCents = Math.round(sub * (1 + Number(rate)) * 100);
    const charge = chargeCents / 100;
    const fee = Math.round((charge - sub) * 100) / 100;
    return { subtotal: sub, adminFee: fee, charge, feeRate: Number(rate) };
  }

  function qfpayAmounts(subtotal) {
    const amt = feeAmounts(subtotal, QFPAY_FEE_RATE);
    const over = amt.subtotal > QFPAY_MAX_HKD || amt.charge > QFPAY_MAX_HKD;
    return { ...amt, overLimit: over };
  }

  function checkoutFeeForMethod(method, subtotal) {
    if (QFPAY_METHODS.has(method)) {
      const a = qfpayAmounts(subtotal);
      return { ...a, feeLabel: "行政費 " + feeRateLabel(QFPAY_FEE_RATE), applies: true };
    }
    if (ANTOM_METHODS.has(method)) {
      const rate = ANTOM_FEE_RATES[method];
      const a = feeAmounts(subtotal, rate);
      return { ...a, feeLabel: "行政費 " + feeRateLabel(rate), applies: true, overLimit: false };
    }
    return { subtotal, adminFee: 0, charge: subtotal, feeLabel: "行政費", applies: false, overLimit: false };
  }

  function orderFeeLabel(order) {
    if (order && order.fee_label) return order.fee_label;
    const m = (order && order.payment_method) || "";
    if (ANTOM_FEE_RATES[m] != null) return "行政費 " + feeRateLabel(ANTOM_FEE_RATES[m]);
    if (QFPAY_METHODS.has(m)) return "行政費 " + feeRateLabel(QFPAY_FEE_RATE);
    return "行政費";
  }

  function addToCart(productId, optionId, qty, uid) {
    const product = getProduct(productId);
    if (!product || product.comingSoon || !product.options || !product.options.length) {
      toast("此商品即將上架");
      return;
    }
    const option = product?.options.find((o) => o.id === optionId);
    if (!product || !option) return;

    const cart = loadCart();
    uid = String(uid || "").trim().slice(0, 100);
    const key = productId + "::" + optionId + (uid ? "::" + uid : "");
    const existing = cart.find((i) => i.key === key);
    if (existing) {
      existing.qty = Math.min(CART_MAX_QTY, existing.qty + qty);
    } else {
      cart.push({
        key,
        productId,
        optionId,
        name: product.name,
        optionLabel: option.label,
        sale: option.sale,
        list: option.list,
        color: product.color,
        needsUid: !!product.needsUid,
        uid,
        qty: Math.min(CART_MAX_QTY, qty),
      });
    }
    saveCart(cart);
    toast(`已加入購物車：${product.name}（${option.label}）`);
  }

  const CART_MAX_QTY = 10;
  function updateQty(key, qty) {
    const cart = loadCart();
    const item = cart.find((i) => i.key === key);
    if (!item) return;
    item.qty = Math.max(1, Math.min(CART_MAX_QTY, qty));
    saveCart(cart);
  }

  function removeItem(key) {
    saveCart(loadCart().filter((i) => i.key !== key));
  }

  function clearCart() {
    saveCart([]);
  }

  function updateCartBadge() {
    const n = cartCount();
    $$(".cart-count").forEach((el) => {
      el.textContent = n > 0 ? String(n) : "";
      el.dataset.count = String(n);
    });
  }

  function toast(msg) {
    let wrap = $(".toast-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "toast-wrap";
      document.body.appendChild(wrap);
    }
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transition = "opacity 0.3s";
      setTimeout(() => el.remove(), 300);
    }, 2400);
  }

  function productUrl(p) {
    return "/product/" + encodeURIComponent((p && (p.slug || p.id)) || "") + ".html";
  }

  function parseHash() {
    if (window.__PRODUCT_ID && (!location.hash || location.hash === "#" || location.hash === "#/")) {
      return { page: "product", id: window.__PRODUCT_ID, query: {} };
    }
    let raw = (location.hash || "#/").replace(/^#/, "") || "/";
    const qIdx = raw.indexOf("?");
    let query = {};
    if (qIdx >= 0) {
      const qs = raw.slice(qIdx + 1);
      raw = raw.slice(0, qIdx);
      qs.split("&").forEach((pair) => {
        const [k, v] = pair.split("=");
        if (k) query[decodeURIComponent(k)] = decodeURIComponent(v || "");
      });
    }
    const parts = raw.split("/").filter(Boolean).map((p) => p.split("?")[0]);
    if (parts.length === 0) return { page: "home", query };
    if (parts[0] === "catalog") return { page: "catalog", category: parts[1] || null, query };
    if (parts[0] === "product" && parts[1]) return { page: "product", id: parts[1], query };
    if (parts[0] === "cart") return { page: "cart", query };
    if (parts[0] === "checkout") return { page: "checkout", query };
    if (parts[0] === "order") return { page: "order", query };
    if (parts[0] === "pay-result" && parts[1]) return { page: "pay-result", id: parts[1], query };
    if (parts[0] === "login") return { page: "login", query };
    if (parts[0] === "forgot-password") return { page: "forgot", query };
    if (parts[0] === "reset-password") return { page: "reset", query };
    if (parts[0] === "verify-email") return { page: "verify", query };
    if (parts[0] === "register") return { page: "register", query };
    if (parts[0] === "account") {
      if (parts[1] === "password") return { page: "account", section: "password", query };
      return { page: "account", query };
    }
    if (parts[0] === "member") return { page: "account", query };
    if (parts[0] === "orders") {
      if (parts[1]) return { page: "order-detail", id: parts[1], query };
      return { page: "orders", query };
    }
    return { page: "home", query };
  }

  function navigate(path) {
    location.hash = path.startsWith("#") ? path : "#" + path;
  }

  function setActiveNav(page, category) {
    $$(".nav-links a, .mobile-nav a").forEach((a) => {
      const href = a.getAttribute("href") || "";
      let active = false;
      if (page === "home" && (href === "#/" || href === "#")) active = true;
      if (page === "catalog" && href === "#/catalog" && !category) active = true;
      if (page === "catalog" && category && href === "#/catalog/" + category) active = true;
      if (page === "catalog" && !category && href.includes("catalog") && href !== "#/catalog") active = false;
      if ((page === "cart" || page === "checkout") && href.includes("cart")) active = true;
      a.classList.toggle("active", active);
    });

    $$(".bottom-nav a").forEach((a) => {
      const nav = a.dataset.nav;
      let active = false;
      if (nav === "home" && page === "home") active = true;
      if (nav === "catalog" && page === "catalog" && category !== "giftcard") active = true;
      if (nav === "giftcard" && page === "catalog" && category === "giftcard") active = true;
      if (nav === "cart" && (page === "cart" || page === "checkout" || page === "order")) active = true;
      if (nav === "account" && (page === "account" || page === "orders" || page === "order-detail")) active = true;
      a.classList.toggle("active", active);
    });
  }

  function productCardHTML(p, extraClass) {
    if (p.comingSoon || !p.options || !p.options.length) {
      const cat = getCategory(p.category);
      const cls = extraClass ? `product-card ${extraClass} is-soon` : "product-card is-soon";
      return `<article class="${cls}"><div class="card-badge">即將上架</div><h3>${escapeHtml(p.name)}</h3><p class="muted">${escapeHtml(cat ? cat.name : "")}</p></article>`;
    }
    const cheapest = Math.min(...p.options.map((o) => o.sale));
    const cheapestList = p.options.find((o) => o.sale === cheapest)?.list;
    const cat = getCategory(p.category);
    const cls = extraClass ? `product-card ${extraClass}` : "product-card";
    return `
      <article class="${cls}">
        <a href="${productUrl(p)}">
          <div class="product-thumb" style="${thumbStyle(p)}">
            ${p.badge ? `<span class="product-badge">${p.badge}</span>` : ""}
            <span>${productInitials(p.name)}</span>
          </div>
        </a>
        <div class="product-body">
          <div class="product-cat">${cat ? cat.name : ""}</div>
          <h3><a href="${productUrl(p)}">${p.name}</a></h3>
          <div class="product-price">
            <span class="price-sale">起 ${money(cheapest)}</span>
            ${cheapestList > cheapest ? `<span class="price-list">${money(cheapestList)}</span>` : ""}
          </div>
          <a class="product-cta" href="${productUrl(p)}">選面額</a>
        </div>
      </article>`;
  }

  function shelfHTML(title, link, products) {
    if (!products.length) return "";
    return `
      <section class="shelf">
        <div class="section-head">
          <h2>${title}</h2>
          <a href="${link}">查看全部</a>
        </div>
        <div class="shelf-track">
          ${products.map((p) => productCardHTML(p, "shelf-card")).join("")}
        </div>
      </section>`;
  }

  function renderHome() {
    const hot = DATA.products.filter((p) => p.hot && !p.comingSoon);
    const slides = [
      { t: "100% 官方正品 · 即買即發", d: "遊戲點卡、手遊儲值一站買齊，港幣結帳", c: "linear-gradient(120deg,#f97316,#fb923c 55%,#fdba74)", h: "#/catalog" },
      { t: "FPS／PayMe／WeChat Pay", d: "香港常用支付，掃碼即付，快速到帳", c: "linear-gradient(120deg,#ea580c,#f59e0b)", h: "#/catalog/giftcard" },
      { t: "熱門手遊 UID 儲值", d: "王者榮耀、絕區零、鳴潮等，輸入 ID 即充", c: "linear-gradient(120deg,#fb923c,#f43f5e)", h: "#/catalog/mobile" },
    ];
    return `
      <div class="container home">
        <section class="carousel" id="carousel">
          <div class="car-track">
            ${slides.map((s) => `<a class="car-slide" href="${s.h}" style="background:${s.c}"><div><h2>${s.t}</h2><p>${s.d}</p><span class="car-cta">立即選購 →</span></div><img src="images/logo-hero.png?v=logo4" alt="" /></a>`).join("")}
          </div>
          <div class="car-dots">${slides.map((_, i) => `<button type="button" data-i="${i}" class="${i ? "" : "on"}" aria-label="第 ${i + 1} 張"></button>`).join("")}</div>
        </section>
        <div class="benefits">
          <div><b>⚡</b><span>即時發貨</span></div>
          <div><b>🛡️</b><span>官方正品</span></div>
          <div><b>💳</b><span>在線支付</span></div>
          <div><b>💬</b><span>繁中客服</span></div>
        </div>
        ${hot.length ? `<section class="home-sec"><div class="section-head"><h2>🔥 熱門商品</h2><a href="#/catalog">查看全部</a></div><div class="hot-row">${hot.map(iconTileHTML).join("")}</div></section>` : ""}
        ${DATA.categories.map((c) => {
          const list = DATA.products.filter((p) => p.category === c.id);
          if (!list.length) {
            return `<section class="home-sec"><div class="section-head"><h2>${c.icon} ${c.name}</h2><a href="#/catalog/${c.id}">查看全部</a></div><p class="store-empty">即將上架，敬請期待</p></section>`;
          }
          return `<section class="home-sec"><div class="section-head"><h2>${c.icon} ${c.name}</h2><a href="#/catalog/${c.id}">查看全部</a></div><div class="icon-grid">${list.map(iconTileHTML).join("")}</div></section>`;
        }).join("")}
        <section class="home-steps">
          <h2>3 步輕鬆購買</h2>
          <div><span>1</span><p><b>選擇商品</b>點卡、手遊儲值或 CD-KEY</p></div>
          <div><span>2</span><p><b>選面額及付款</b>FPS／PayMe／AlipayHK 等</p></div>
          <div><span>3</span><p><b>即時到帳</b>卡密發送至會員中心</p></div>
        </section>
        <section class="home-news" id="home-news" hidden>
          <div class="home-news-head"><h2>最新消息</h2><a href="/news/">查看全部 →</a></div>
          <div class="news-list" id="home-news-list"></div>
        </section>
      </div>`;
  }
  function loadHomeNews() {
    fetch("/news/latest.json?v=news1").then((r) => (r.ok ? r.json() : [])).then((list) => {
      const box = $("#home-news-list");
      if (!box || !Array.isArray(list) || !list.length) return;
      box.innerHTML = list.slice(0, 3).map((a) => `<a class="news-card" href="/news/${encodeURIComponent(a.slug)}.html"><time>${escapeHtml(a.date)}</time><h3>${escapeHtml(a.title)}</h3><p>${escapeHtml(a.description)}</p></a>`).join("");
      $("#home-news").hidden = false;
    }).catch(() => {});
  }

  function bindHome() {
    loadHomeNews();
    const car = $("#carousel");
    if (!car) return;
    const track = car.querySelector(".car-track");
    const dots = [...car.querySelectorAll(".car-dots button")];
    let i = 0;
    const go = (n) => { i = (n + dots.length) % dots.length; track.style.transform = `translateX(-${i * 100}%)`; dots.forEach((d, k) => d.classList.toggle("on", k === i)); };
    dots.forEach((d, k) => d.addEventListener("click", () => go(k)));
    let sx = null;
    track.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; }, { passive: true });
    track.addEventListener("touchend", (e) => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1)); sx = null; });
    clearInterval(window.__carT);
    window.__carT = setInterval(() => { if (!document.body.contains(track)) return clearInterval(window.__carT); go(i + 1); }, 6000);
  }

  const REGION_INFO = {
    hk: { code: "hk", name: "香港", group: "hktw" },
    tw: { code: "tw", name: "台灣", group: "hktw" },
    jp: { code: "jp", name: "日本", group: "intl" },
    cn: { code: "cn", name: "中國", group: "intl" },
    us: { code: "us", name: "美國", group: "intl" },
    sg: { code: "sg", name: "新加坡", group: "intl" },
    my: { code: "my", name: "馬來西亞", group: "intl" },
    kr: { code: "kr", name: "韓國", group: "intl" },
  };
  function productRegion(p) {
    if (p.region) return p.region;
    const n = p.name;
    if (/香港|港/.test(n)) return "hk";
    if (/台灣|台服|臺/.test(n)) return "tw";
    if (/日本|DMM/.test(n)) return "jp";
    if (/中國|大陸/.test(n)) return "cn";
    if (/美國/.test(n)) return "us";
    if (/新加坡|\(SG\)/.test(n)) return "sg";
    return null;
  }
  function iconTileHTML(p) {
    const r = REGION_INFO[productRegion(p)];
    const soon = !!p.comingSoon || !(p.options && p.options.length);
    const cls = soon ? "icon-tile icon-tile-soon" : "icon-tile";
    const href = soon ? `#/catalog/${encodeURIComponent(p.category)}` : productUrl(p);
    return `
      <a class="${cls}" href="${href}" title="${escapeHtml(p.name)}${soon ? "（即將上架）" : ""}" ${soon ? 'aria-disabled="true"' : ""}>
        <div class="icon-img" style="${thumbStyle(p)}">
          <span>${productInitials(p.name)}</span>
          ${r ? `<img class="icon-flag" src="https://flagcdn.com/w40/${r.code}.png" alt="${r.name}" title="${r.name}" loading="lazy" />` : ""}
          ${soon ? `<span class="icon-soon-badge">即將上架</span>` : ""}
        </div>
        <div class="icon-name">${escapeHtml(p.name)}</div>
      </a>`;
  }
  function renderCatalog(categoryId) {
    const qs = (location.hash.split("?")[1] || "");
    const params = new URLSearchParams(qs);
    const region = (params.get("region") || "").toLowerCase();
    const q = (params.get("q") || "").trim();
    const ql = q.toLowerCase();
    let list = categoryId ? DATA.products.filter((p) => p.category === categoryId) : DATA.products.slice();
    const present = Object.keys(REGION_INFO).filter((k) => DATA.products.some((p) => productRegion(p) === k));
    if (region) list = list.filter((p) => productRegion(p) === region);
    if (ql) list = list.filter((p) => p.name.toLowerCase().includes(ql));
    const base = categoryId ? `#/catalog/${categoryId}` : "#/catalog";
    const mk = (b, o) => { const u = new URLSearchParams(); if (o.q) u.set("q", o.q); if (o.r) u.set("region", o.r.toUpperCase()); const t = u.toString(); return b + (t ? "?" + t : ""); };
    window.__storeGo = (f) => { location.hash = mk(base, { q: f.q.value.trim(), r: f.region.value }); };
    return `
      <div class="container icon-store">
        <form class="store-search" onsubmit="event.preventDefault();__storeGo(this);">
          <div class="store-search-box"><span class="store-search-ico search-ico-wrap" aria-hidden="true"><svg class="search-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></span>
          <input name="q" type="search" placeholder="搜點卡（如：GASH、PSN）..." value="${q.replace(/"/g, "&quot;")}" /></div>
          <select name="region" class="store-region" onchange="__storeGo(this.form)">
            <option value="">全部地區</option>
            ${present.map((k) => `<option value="${k}" ${region === k ? "selected" : ""}>${REGION_INFO[k].name}</option>`).join("")}
          </select>
        </form>
        <nav class="store-tabs">
          <a class="${!categoryId ? "active" : ""}" href="${mk("#/catalog", { q, r: region })}">全部</a>
          ${DATA.categories.map((c) => `<a class="${categoryId === c.id ? "active" : ""}" href="${mk("#/catalog/" + c.id, { q, r: region })}">${escapeHtml(c.shortName || c.name)}</a>`).join("")}
        </nav>
        ${list.length ? `<div class="icon-grid">${list.map(iconTileHTML).join("")}</div>` : `<p class="store-empty">${categoryId ? "此分類即將上架，敬請期待" : "暫時沒有相關商品"}</p>`}
      </div>`;
  }

  const PDP_PAY = [
    { v: "qfpay_fps", n: "FPS 轉數快", s: "QFPay", qf: true },
    { v: "qfpay_payme", n: "PayMe", s: "QFPay", qf: true },
    { v: "qfpay_wechat", n: "WeChat Pay", s: "微信支付", qf: true },
    { v: "alipay_hk", n: "AlipayHK", s: "支付寶香港" },
    { v: "boost", n: "Boost", s: "電子錢包" },
    { v: "tng", n: "Touch'n Go", s: "eWallet" },
  ];
  function renderProduct(id) {
    const p = getProduct(id);
    if (!p) {
      return `<div class="container"><div class="empty-state"><div class="emoji">😕</div><h2>找不到商品</h2><a class="btn btn-accent" href="#/catalog">返回目錄</a></div></div>`;
    }
    const cat = getCategory(p.category);
    if (p.comingSoon || !p.options || !p.options.length) {
      return `<div class="container"><div class="empty-state"><div class="emoji">⏳</div><h2>${escapeHtml(p.name)}</h2><p class="muted">${escapeHtml(cat ? cat.name : "商品")} · 即將上架</p><p>${escapeHtml(p.desc || "此商品即將上架，敬請期待。")}</p><a class="btn btn-accent" href="#/catalog/${encodeURIComponent(p.category)}">返回分類</a></div></div>`;
    }
    const r = REGION_INFO[productRegion(p)];
    const uid = !!p.needsUid;
    let n = 0;
    const step = (t, body) => `<section class="pdp-step"><h2><span class="pdp-num">${++n}</span>${t}</h2>${body}</section>`;
    const flag = r ? `<img class="pdp-flag" src="https://flagcdn.com/w40/${r.code}.png" alt="${r.name}" />` : "";
    return `
      <div class="container pdp" data-product-id="${p.id}">
        <div class="breadcrumb pdp-crumb"><a href="#/">首頁</a> / <a href="#/catalog/${p.category}">${cat ? cat.name : "商品"}</a> / <span>${p.name}</span></div>
        <div class="pdp-layout">
          <aside class="pdp-side">
            <div class="pdp-head">
              <div class="icon-img pdp-icon" style="${thumbStyle(p)}"><span>${productInitials(p.name)}</span>${r ? `<img class="icon-flag" src="https://flagcdn.com/w40/${r.code}.png" alt="${r.name}" />` : ""}</div>
              <div>
                <h1>${p.name}</h1>
                <div class="pdp-tags">${flag}${r ? `<span>${r.name}區</span>` : ""}<span>${cat ? cat.name : ""}</span><span class="pdp-fast">⚡ 即時發貨</span></div>
              </div>
            </div>
            <p class="pdp-desc">${p.desc}</p>
            <div class="pdp-howto">
              <strong>購買步驟</strong>
              <ol>${uid ? "<li>輸入玩家 ID 及伺服器</li>" : ""}<li>選擇面額</li><li>選擇付款方式（港幣 HKD）</li><li>按「立即購買」到購物車結帳，${uid ? "系統自動直充到帳" : "卡密發送到會員中心及電郵"}</li></ol>
            </div>
          </aside>
          <form class="pdp-main" id="pdp-form" novalidate>
            ${uid ? step("輸入帳號資料", `
              <div class="pdp-uid">
                <input name="uid" placeholder="玩家 ID / UID" required autocomplete="off" />
                <input name="server" placeholder="伺服器（選填）" autocomplete="off" />
              </div>
              <div class="form-hint">請確認 ID 正確，直充成功後無法退款。</div>`) : ""}
            ${step("選擇面額", `<div class="pdp-denoms">${p.options.map((o, i) => `
              <button type="button" class="pdp-denom ${i === 0 ? "selected" : ""}" data-opt="${o.id}">
                <span class="d-label">${o.label}</span>
                <span class="d-price">${money(o.sale)}</span>
                ${o.list > o.sale ? `<span class="d-list">${money(o.list)}</span>` : ""}
              </button>`).join("")}</div>`)}
            ${step("選擇付款方式", `<div class="pdp-pays">${PDP_PAY.map((m, i) => `
              <button type="button" class="pdp-pay ${i === 0 ? "selected" : ""}" data-pay="${m.v}">
                <span class="p-name">${m.n}</span><span class="p-sub">${m.s} · 行政費 ${feeRateLabel(m.qf ? QFPAY_FEE_RATE : ANTOM_FEE_RATES[m.v])}</span>
                <span class="p-price" data-price></span>
              </button>`).join("")}</div>
              <div class="demo-note" id="pdp-limit" hidden>單筆超過 HK$2000 不可使用 FPS／PayMe／WeChat Pay，請選擇其他支付方式。</div>`)}
            ${step("購買", `
              <input type="email" name="email" class="pdp-email" placeholder="電郵（選填，用於接收訂單通知）" value="${escapeHtml((currentUser && currentUser.email) || "")}" />
              <div class="pdp-qty-row"><span>數量</span><div class="pdp-qty" role="group" aria-label="數量"><button type="button" class="pdp-qty-dec" aria-label="減少數量">−</button><span class="pdp-qty-val" aria-live="polite">1</span><button type="button" class="pdp-qty-inc" aria-label="增加數量">+</button></div></div>
              <div class="pdp-summary">
                <div><span>商品</span><span id="pdp-item"></span></div>
                <div><span>行政費</span><span id="pdp-fee"></span></div>
                <div class="tot"><span>合計</span><span id="pdp-total"></span></div>
              </div>
              <div class="auth-error" id="pdp-error" hidden></div>
              <div class="pdp-actions"><button type="button" class="btn btn-outline-accent btn-lg pdp-addcart">加入購物車</button><button type="submit" class="btn btn-accent btn-lg pdp-buy">立即購買</button></div>
              ${currentUser ? "" : `<div class="form-hint" style="text-align:center">購買前需要 <a href="#/login">登入</a> 會員</div>`}`)}
          </form>
        </div>
      </div>
      <div class="pdp-bar"><div class="pdp-bar-row"><div class="pdp-bar-info"><small id="pdp-bar-sub"></small><strong id="pdp-bar-total"></strong></div><div class="pdp-qty" role="group" aria-label="數量"><button type="button" class="pdp-qty-dec" aria-label="減少數量">−</button><span class="pdp-qty-val" aria-live="polite">1</span><button type="button" class="pdp-qty-inc" aria-label="增加數量">+</button></div></div><div class="pdp-bar-actions"><button type="button" class="btn btn-outline-accent pdp-addcart" id="pdp-bar-cart">加入購物車</button><button type="button" class="btn btn-accent" id="pdp-bar-buy">立即購買</button></div></div>`;
  }

  function bindProductPage() {
    const root = $("[data-product-id]");
    if (!root) return;
    const p = getProduct(root.dataset.productId);
    const form = $("#pdp-form");
    document.body.classList.add("has-pdp-bar");
    let opt = p.options[0].id;
    let pay = PDP_PAY[0].v;
    let qty = 1;
    const PDP_MAX_QTY = 10;
    function refresh() {
      const o = p.options.find((x) => x.id === opt);
      const sub = Math.round(o.sale * qty * 100) / 100;
      const over = qfpayAmounts(sub).overLimit;
      $$(".pdp-pay").forEach((b) => {
        const m = b.dataset.pay;
        const dis = QFPAY_METHODS.has(m) && over;
        b.classList.toggle("disabled", dis);
        b.setAttribute("aria-disabled", dis ? "true" : "false");
        b.querySelector("[data-price]").textContent = dis ? "不適用" : money(checkoutFeeForMethod(m, sub).charge);
      });
      if (QFPAY_METHODS.has(pay) && over) { pay = "alipay_hk"; toast("金額超過 HK$2000，已改用 AlipayHK"); }
      $$(".pdp-qty-val").forEach((x) => { x.textContent = qty; });
      $$(".pdp-qty-dec").forEach((x) => { x.classList.toggle("is-disabled", qty <= 1); x.setAttribute("aria-disabled", qty <= 1 ? "true" : "false"); });
      $$(".pdp-qty-inc").forEach((x) => { x.classList.toggle("is-disabled", qty >= PDP_MAX_QTY); x.setAttribute("aria-disabled", qty >= PDP_MAX_QTY ? "true" : "false"); });
      $$(".pdp-pay").forEach((b) => b.classList.toggle("selected", b.dataset.pay === pay));
      $("#pdp-limit").hidden = !over;
      const f = checkoutFeeForMethod(pay, sub);
      const name = PDP_PAY.find((m) => m.v === pay).n;
      $("#pdp-item").textContent = `${o.label} × ${qty} · ${money(sub)}`;
      $("#pdp-fee").textContent = `${money(f.adminFee)}（${f.feeLabel.replace("行政費 ", "")}）`;
      $("#pdp-total").textContent = money(f.charge);
      $("#pdp-bar-total").textContent = money(f.charge);
      $("#pdp-bar-sub").textContent = `${o.label}${qty > 1 ? " ×" + qty : ""} · ${name}`;
    }
    $$(".pdp-denom").forEach((b) => b.addEventListener("click", () => {
      $$(".pdp-denom").forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected"); opt = b.dataset.opt; refresh();
    }));
    $$(".pdp-pay").forEach((b) => b.addEventListener("click", () => { if (b.classList.contains("disabled")) return; pay = b.dataset.pay; refresh(); }));
    $$(".pdp-qty-dec").forEach((x) => x.addEventListener("click", () => { if (qty > 1) { qty--; refresh(); } }));
    $$(".pdp-qty-inc").forEach((x) => x.addEventListener("click", () => { if (qty < PDP_MAX_QTY) { qty++; refresh(); } }));
    $("#pdp-bar-buy").addEventListener("click", () => form.requestSubmit());
    function readUid() {
      const err = $("#pdp-error");
      err.hidden = true;
      if (!p.needsUid) return "";
      let u = form.uid.value.trim();
      if (!u) {
        err.textContent = "請輸入玩家 ID"; err.hidden = false;
        toast("請先輸入玩家 ID");
        form.uid.scrollIntoView({ block: "center" }); form.uid.focus({ preventScroll: true });
        return null;
      }
      const sv = form.server.value.trim();
      if (sv) u += " / " + sv;
      return u;
    }
    $$(".pdp-addcart").forEach((b) => b.addEventListener("click", () => {
      const u = readUid();
      if (u === null) return;
      addToCart(p.id, opt, qty, u);
    }));
    refresh();
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const u = readUid();
      if (u === null) return;
      addToCart(p.id, opt, qty, u);
      navigate("/cart");
    });
  }

  function renderCart() {
    const cart = loadCart();
    if (!cart.length) {
      return `
        <div class="container">
          <div class="page-banner"><h1>購物車</h1></div>
          <div class="empty-state">
            <div class="emoji">🛒</div>
            <h2>購物車是空的</h2>
            <p>去挑幾件點卡或手遊儲值吧</p>
            <a class="btn btn-accent" href="#/catalog">開始購物</a>
          </div>
        </div>`;
    }

    return `
      <div class="container">
        <div class="page-banner">
          <div class="breadcrumb"><a href="#/">首頁</a> / <span>購物車</span></div>
          <h1>購物車</h1>
          <p>${cartCount()} 件商品</p>
        </div>
        <div class="cart-layout">
          <div class="cart-list">
            ${cart
              .map(
                (i) => `
              <div class="cart-item" data-key="${i.key}">
                <div class="cart-item-thumb" style="background:linear-gradient(145deg,${i.color},${i.color}99)">${productInitials(i.name)}</div>
                <div>
                  <h3>${i.name}</h3>
                  <div class="meta">${escapeHtml(i.optionLabel)} · 單價 ${money(i.sale)}</div>
                  ${i.uid ? `<div class="meta cart-uid">帳號：${escapeHtml(i.uid)}</div>` : (i.needsUid ? `<div class="meta cart-uid warn">未填寫玩家 ID（結帳時填寫）</div>` : "")}
                  <div class="qty-control">
                    <button type="button" class="qty-dec${i.qty <= 1 ? " is-disabled" : ""}" aria-disabled="${i.qty <= 1}" aria-label="減少">−</button>
                    <span class="qty-val">${i.qty}</span>
                    <button type="button" class="qty-inc${i.qty >= CART_MAX_QTY ? " is-disabled" : ""}" aria-disabled="${i.qty >= CART_MAX_QTY}" aria-label="增加">+</button>
                  </div>
                </div>
                <div class="cart-item-right">
                  <div class="cart-item-price">${money(i.sale * i.qty)}</div>
                  <button type="button" class="remove-btn">移除</button>
                </div>
              </div>`
              )
              .join("")}
          </div>
          <aside class="cart-summary">
            <h2>訂單摘要</h2>
            <div class="summary-row"><span>商品小計</span><span>${money(cartSubtotal())}</span></div>
            <div class="cart-fees">
              <div class="cart-fees-title">各付款方式應付金額</div>
              ${[["alipay_hk","AlipayHK"],["boost","Boost"],["tng","Touch'n Go"],["qfpay_fps","FPS 轉數快"],["qfpay_payme","PayMe"],["qfpay_wechat","WeChat Pay"]].map(([m, n]) => {
                const f = checkoutFeeForMethod(m, cartSubtotal());
                const off = QFPAY_METHODS.has(m) && qfpayAmounts(cartSubtotal()).overLimit;
                return `<div class="summary-row${off ? " off" : ""}"><span>${n} <small>${feeRateLabel(QFPAY_METHODS.has(m) ? QFPAY_FEE_RATE : ANTOM_FEE_RATES[m])}</small></span><span>${off ? "超過 HK$2000 不適用" : money(f.charge)}</span></div>`;
              }).join("")}
            </div>
            <div class="form-hint">付款方式於下一步選擇，行政費按商品小計計算。</div>
            <a class="btn btn-accent btn-block btn-lg" href="#/checkout">去結帳</a>
            <a class="btn btn-outline btn-block" href="#/catalog" style="margin-top:0.5rem">繼續購物</a>
          </aside>
        </div>
      </div>`;
  }

  function bindCartPage() {
    $$(".cart-item").forEach((row) => {
      const key = row.dataset.key;
      row.querySelector(".qty-dec")?.addEventListener("click", () => {
        const item = loadCart().find((i) => i.key === key);
        if (item && item.qty > 1) {
          updateQty(key, item.qty - 1);
          render();
        }
      });
      row.querySelector(".qty-inc")?.addEventListener("click", () => {
        const item = loadCart().find((i) => i.key === key);
        if (item && item.qty < CART_MAX_QTY) {
          updateQty(key, item.qty + 1);
          render();
        }
      });
      row.querySelector(".remove-btn")?.addEventListener("click", () => {
        removeItem(key);
        toast("已從購物車移除");
        render();
      });
    });
  }

  function renderCheckout() {
    const cart = loadCart();
    if (!cart.length) {
      navigate("/cart");
      return "";
    }

    if (!currentUser) {
      return `
        <div class="container">
          <div class="page-banner">
            <div class="breadcrumb"><a href="#/">首頁</a> / <a href="#/cart">購物車</a> / <span>結帳</span></div>
            <h1>結帳</h1>
          </div>
          <div class="empty-state member-gate">
            <div class="emoji">🔐</div>
            <h2>請先登入再結帳</h2>
            <p>登入後訂單會保存到你的會員中心，方便查閱記錄。</p>
            <div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap">
              <a class="btn btn-accent" href="#/login">登入</a>
              <a class="btn btn-outline" href="#/register">註冊</a>
            </div>
          </div>
        </div>`;
    }

    const needsUid = cart.some((i) => i.needsUid && !i.uid);

    return `
      <div class="container">
        <div class="page-banner">
          <div class="breadcrumb"><a href="#/">首頁</a> / <a href="#/cart">購物車</a> / <span>結帳</span></div>
          <h1>結帳</h1>
          <p>以 <strong>${escapeHtml(currentUser.username)}</strong> 下單 · 港幣（HK$）線上支付</p>
        </div>
        <form class="checkout-layout" id="checkout-form">
          <div class="form-card">
            <h2>聯絡與帳號資料</h2>
            <div class="form-group">
              <label>電郵 <span class="req">*</span></label>
              <input type="email" name="email" required placeholder="you@example.com" autocomplete="email" />
              <div class="form-hint">訂單確認與卡密將發至此電郵</div>
            </div>
            <div class="form-group">
              <label>遊戲 UID／帳號${needsUid ? ' <span class="req">*</span>' : "（選填）"}</label>
              <input type="text" name="uid" ${needsUid ? "required" : ""} placeholder="直充商品請填寫遊戲 UID" />
              <div class="form-hint">${needsUid ? "購物車含直充商品，必須填寫" : "點卡類商品可留空"}</div>
            </div>
            <div class="form-group">
              <label>備註（選填）</label>
              <textarea name="note" placeholder="其他說明…"></textarea>
            </div>

            <h2 style="margin-top:1.5rem">付款方式</h2>
            <div class="pay-methods" id="pay-methods">
              <label class="pay-option selected">
                <input type="radio" name="payment" value="alipay_hk" checked />
                <div><strong>AlipayHK</strong><span>支付寶香港 · 行政費 2.2%</span></div>
              </label>
              <label class="pay-option">
                <input type="radio" name="payment" value="boost" />
                <div><strong>Boost</strong><span>馬來西亞電子錢包 · 行政費 2.5%</span></div>
              </label>
              <label class="pay-option">
                <input type="radio" name="payment" value="tng" />
                <div><strong>Touch'n Go eWallet</strong><span>電子錢包 · 行政費 2.5%</span></div>
              </label>
              <label class="pay-option" data-qfpay-option>
                <input type="radio" name="payment" value="qfpay_fps" />
                <div><strong>FPS（轉數快）</strong><span>掃碼或銀行 App · 行政費 1.2%</span></div>
              </label>
              <label class="pay-option" data-qfpay-option>
                <input type="radio" name="payment" value="qfpay_payme" />
                <div><strong>PayMe</strong><span>HSBC PayMe · 行政費 1.2%</span></div>
              </label>
              <label class="pay-option" data-qfpay-option>
                <input type="radio" name="payment" value="qfpay_wechat" />
                <div><strong>WeChat Pay（微信支付）</strong><span>掃碼／手機 · 行政費 1.2%</span></div>
              </label>
            </div>
            <div class="demo-note" id="checkout-qfpay-limit" hidden>單筆超過 HK$2000 請使用其他支付方式</div>
            <div class="demo-note" id="checkout-pay-hint">🔒 提交後會前往對應支付頁完成付款（港幣 HKD）。Antom 錢包與 QFPay 均另收行政費。</div>
            <div class="auth-error" id="checkout-error" hidden></div>
          </div>

          <aside class="order-side">
            <h2>訂單內容</h2>
            ${cart
              .map(
                (i) => `
              <div class="order-line">
                <div>
                  <div class="name">${escapeHtml(i.name)}</div>
                  <div class="sub">${escapeHtml(i.optionLabel)} × ${i.qty}${i.uid ? " · 帳號 " + escapeHtml(i.uid) : ""}</div>
                </div>
                <div>${money(i.sale * i.qty)}</div>
              </div>`
              )
              .join("")}
            <div class="summary-row" style="margin-top:1rem">
              <span>商品小計</span><span id="checkout-subtotal">${money(cartSubtotal())}</span>
            </div>
            <div class="summary-row" id="checkout-fee-row" hidden>
              <span id="checkout-fee-label">行政費</span><span id="checkout-fee">${money(0)}</span>
            </div>
            <div class="summary-row total">
              <span>合計</span><span id="checkout-grand">${money(cartSubtotal())}</span>
            </div>
            <button type="submit" class="btn btn-accent btn-block btn-lg" id="checkout-submit">立即付款</button>
            <a class="btn btn-outline btn-block" href="#/cart" style="margin-top:0.5rem">返回購物車</a>
          </aside>
        </form>
      </div>`;
  }

  function bindCheckoutPage() {
    const sub = cartSubtotal();
    const qfAmt = qfpayAmounts(sub);
    const qfBlocked = qfAmt.overLimit;

    function refreshCheckoutTotals() {
      const selected = document.querySelector('input[name="payment"]:checked');
      const method = selected ? selected.value : "alipay_hk";
      const feeInfo = checkoutFeeForMethod(method, sub);
      const feeRow = $("#checkout-fee-row");
      const feeEl = $("#checkout-fee");
      const feeLabel = $("#checkout-fee-label");
      const grandEl = $("#checkout-grand");
      const hint = $("#checkout-pay-hint");
      if (feeInfo.applies) {
        if (feeRow) feeRow.hidden = false;
        if (feeLabel) feeLabel.textContent = feeInfo.feeLabel;
        if (feeEl) feeEl.textContent = money(feeInfo.adminFee);
        if (grandEl) grandEl.textContent = money(feeInfo.charge);
        if (hint) {
          if (QFPAY_METHODS.has(method)) {
            hint.textContent = "🔒 QFPay 付款含行政費 1.2%，提交後前往支付頁或顯示二維碼（港幣 HKD）。";
          } else {
            hint.textContent = "🔒 Antom 付款含" + feeInfo.feeLabel + "，提交後前往支付頁完成付款（港幣 HKD）。";
          }
        }
      } else {
        if (feeRow) feeRow.hidden = true;
        if (feeEl) feeEl.textContent = money(0);
        if (grandEl) grandEl.textContent = money(sub);
        if (hint) hint.textContent = "🔒 提交後會前往對應支付頁完成付款（港幣 HKD）。";
      }
    }

    // Disable QFPay when over HK$2000
    const limitNote = $("#checkout-qfpay-limit");
    $$("[data-qfpay-option]").forEach((label) => {
      const input = label.querySelector("input");
      if (qfBlocked) {
        label.classList.add("pay-option-disabled");
        label.setAttribute("aria-disabled", "true");
        if (input) {
          input.disabled = true;
          if (input.checked) {
            input.checked = false;
            const fallback = document.querySelector('input[name="payment"][value="alipay_hk"]');
            if (fallback) {
              fallback.checked = true;
              fallback.closest(".pay-option")?.classList.add("selected");
            }
            label.classList.remove("selected");
          }
        }
      } else {
        label.classList.remove("pay-option-disabled");
        label.removeAttribute("aria-disabled");
        if (input) input.disabled = false;
      }
    });
    if (limitNote) {
      limitNote.hidden = !qfBlocked;
    }

    $$(".pay-option").forEach((label) => {
      label.addEventListener("click", (ev) => {
        const input = label.querySelector("input");
        if (!input || input.disabled) {
          ev.preventDefault();
          return;
        }
        $$(".pay-option").forEach((l) => l.classList.remove("selected"));
        label.classList.add("selected");
        input.checked = true;
        refreshCheckoutTotals();
      });
    });
    refreshCheckoutTotals();

    $("#checkout-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const errEl = $("#checkout-error");
      const btn = $("#checkout-submit");
      if (errEl) { errEl.hidden = true; errEl.textContent = ""; }

      if (!currentUser) {
        navigate("/login");
        return;
      }

      const email = form.email.value.trim();
      const uid = form.uid.value.trim();
      const note = form.note.value.trim();
      const paymentInput = form.querySelector('input[name="payment"]:checked');
      const payment = paymentInput ? paymentInput.value : "";
      const cart = loadCart();
      if (!cart.length) {
        navigate("/cart");
        return;
      }
      if (QFPAY_METHODS.has(payment) && qfpayAmounts(cartSubtotal()).overLimit) {
        if (errEl) {
          errEl.textContent = "單筆超過 HK$2000 請使用其他支付方式";
          errEl.hidden = false;
        }
        return;
      }

      if (btn) { btn.disabled = true; btn.textContent = "建立支付中…"; }

      try {
        const { ok, body, status } = await api("/orders", {
          method: "POST",
          body: JSON.stringify({
            email,
            game_uid: uid,
            note,
            payment,
            items: cart.map((i) => ({
              productId: i.productId,
              name: i.name,
              optionLabel: i.optionLabel,
              qty: i.qty,
              sale: i.sale,
              game_uid: i.uid || (i.needsUid ? uid : ""),
            })),
          }),
        });
        if (!ok) {
          if (status === 401) {
            currentUser = null;
            updateAuthUI();
            toast("請重新登入");
            navigate("/login");
            return;
          }
          if (errEl) {
            errEl.textContent = (body && body.error) || "建立訂單失敗";
            errEl.hidden = false;
          } else {
            toast((body && body.error) || "建立訂單失敗");
          }
          return;
        }

        localStorage.setItem(ORDER_KEY, JSON.stringify(body));
        clearCart();
        if (body && body.pay_qrcode && !body.redirect) {
          toast("請掃碼完成付款");
          navigate("/pay-result/" + encodeURIComponent(body.id));
          return;
        }
        if (body && body.pay_url && (body.redirect !== false)) {
          toast("正在前往支付…");
          if (btn) { btn.textContent = "前往支付…"; }
          window.location.href = body.pay_url;
          return;
        }
        toast("訂單已建立");
        navigate("/pay-result/" + encodeURIComponent(body.id));
      } catch {
        if (errEl) {
          errEl.textContent = "無法連線伺服器，請稍後再試";
          errEl.hidden = false;
        }
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = "立即付款"; }
      }
    });
  }

  function authShell(title, lead, inner) {
    return `
      <div class="container">
        <div class="auth-page">
          <div class="auth-hero"><img src="images/logo-hero.png?v=logo4" alt="3388.HK" /><ul><li>⚡ 即買即發</li><li>🛡️ 官方正品</li><li>💳 在線支付</li></ul></div>
          <div class="form-card auth-card"><h1>${title}</h1>${lead ? `<p class="auth-lead">${lead}</p>` : ""}${inner}</div>
        </div>
      </div>`;
  }

  function renderForgot() {
    return authShell("忘記密碼", "輸入註冊時使用的電郵，我們會發送重設密碼連結（30 分鐘內有效）。", `
      <form id="forgot-form" novalidate>
        <div class="form-group"><label>電郵 <span class="req">*</span></label>
          <input type="email" name="email" required autocomplete="email" maxlength="120" placeholder="you@example.com" /></div>
        <div class="auth-error" id="forgot-error" hidden></div>
        <div class="demo-note" id="forgot-ok" hidden></div>
        <button type="submit" class="btn btn-accent btn-block btn-lg" id="forgot-submit">發送重設連結</button>
      </form>
      <p class="auth-switch"><a href="#/login">返回登入</a></p>`);
  }

  function bindForgot() {
    const f = $("#forgot-form"); if (!f) return;
    const e = $("#forgot-error"), ok = $("#forgot-ok"), b = $("#forgot-submit");
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault(); e.hidden = true; ok.hidden = true;
      const email = f.email.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) { e.textContent = "請輸入有效的電郵地址"; e.hidden = false; return; }
      if (b.classList.contains("is-disabled")) return;
      b.classList.add("is-disabled"); b.textContent = "發送中…";
      try {
        const { ok: good, body } = await api("/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
        if (good) { ok.textContent = body.message || "如該電郵已登記，我們已發送重設密碼連結。"; ok.hidden = false; toast("已處理你的要求"); }
        else { e.textContent = (body && body.error) || "操作失敗"; e.hidden = false; }
      } catch { e.textContent = "無法連線伺服器，請稍後再試"; e.hidden = false; }
      finally { b.classList.remove("is-disabled"); b.textContent = "發送重設連結"; }
    });
  }

  function renderReset(token) {
    if (!token) return authShell("重設密碼", "", `<div class="auth-error">連結無效，請重新申請。</div><p class="auth-switch"><a href="#/forgot-password">重新申請</a></p>`);
    return authShell("重設密碼", "請設定新密碼（至少 8 個字元）。完成後所有已登入裝置會被登出。", `
      <form id="reset-form" novalidate>
        <div class="form-group"><label>新密碼 <span class="req">*</span></label>
          <input type="password" name="password" required autocomplete="new-password" minlength="8" placeholder="至少 8 個字元" /></div>
        <div class="form-group"><label>確認新密碼 <span class="req">*</span></label>
          <input type="password" name="password2" required autocomplete="new-password" minlength="8" placeholder="再輸入一次" /></div>
        <div class="auth-error" id="reset-error" hidden></div>
        <button type="submit" class="btn btn-accent btn-block btn-lg" id="reset-submit">更新密碼</button>
      </form>`);
  }

  function bindReset(token) {
    const f = $("#reset-form"); if (!f) return;
    const e = $("#reset-error"), b = $("#reset-submit");
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault(); e.hidden = true;
      const pw = f.password.value;
      if (pw.length < 8) { e.textContent = "密碼至少 8 個字元"; e.hidden = false; return; }
      if (pw !== f.password2.value) { e.textContent = "兩次輸入的密碼不一致"; e.hidden = false; return; }
      if (b.classList.contains("is-disabled")) return;
      b.classList.add("is-disabled"); b.textContent = "更新中…";
      try {
        const { ok, body } = await api("/reset-password", { method: "POST", body: JSON.stringify({ token, password: pw }) });
        if (ok) { currentUser = null; updateAuthUI(); toast("密碼已更新，請重新登入"); navigate("/login"); }
        else { e.textContent = (body && body.error) || "操作失敗"; e.hidden = false; }
      } catch { e.textContent = "無法連線伺服器，請稍後再試"; e.hidden = false; }
      finally { b.classList.remove("is-disabled"); b.textContent = "更新密碼"; }
    });
  }

  function renderVerify() {
    return authShell("驗證電郵", "", `<div class="demo-note" id="verify-msg">驗證中…</div><p class="auth-switch"><a href="#/account">前往會員中心</a></p>`);
  }

  async function doVerify(token) {
    const m = $("#verify-msg"); if (!m) return;
    if (!token) { m.textContent = "驗證連結無效。"; return; }
    try {
      const { ok, body } = await api("/verify-email", { method: "POST", body: JSON.stringify({ token }) });
      m.textContent = ok ? "✅ 電郵驗證成功！" : ((body && body.error) || "驗證失敗");
      if (ok) { await refreshAuth(); toast("電郵已驗證"); }
    } catch { m.textContent = "無法連線伺服器，請稍後再試"; }
  }

  function bindEmailForm() {
    $("#resend-verify")?.addEventListener("click", async (ev) => {
      const b = ev.currentTarget; if (b.classList.contains("is-disabled")) return;
      b.classList.add("is-disabled");
      const { ok, body } = await api("/email/resend-verification", { method: "POST" });
      toast(ok ? "驗證電郵已發送" : ((body && body.error) || "發送失敗"));
      setTimeout(() => b.classList.remove("is-disabled"), 30000);
    });
    const f = $("#email-form"); if (!f) return;
    const e = $("#email-error");
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault(); e.hidden = true;
      const email = f.email.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) { e.textContent = "請輸入有效的電郵地址"; e.hidden = false; return; }
      const { ok, body } = await api("/email", { method: "POST", body: JSON.stringify({ email }) });
      if (!ok) { e.textContent = (body && body.error) || "儲存失敗"; e.hidden = false; return; }
      await refreshAuth(); toast(body.email_verified ? "電郵已驗證" : "已儲存，驗證電郵已發送"); render();
    });
  }

  function renderLogin() {
    if (currentUser) {
      navigate("/");
      return "";
    }
    return `
      <div class="container">
        <div class="auth-page">
          <div class="auth-hero"><img src="images/logo-hero.png?v=logo4" alt="3388.HK" /><ul><li>⚡ 即買即發</li><li>🛡️ 官方正品</li><li>💳 在線支付</li></ul></div>
          <div class="form-card auth-card">
            <h1>登入</h1>
            <p class="auth-lead">使用你的英文用戶名登入 3388</p>
            <form id="auth-form" data-mode="login" novalidate>
              <div class="form-group">
                <label>用戶名 <span class="req">*</span></label>
                <input type="text" name="username" required autocomplete="username"
                  placeholder="your_name" pattern="[A-Za-z0-9_]{3,20}" maxlength="20" />
                <div class="form-hint">3–20 個英文字母、數字或底線</div>
              </div>
              <div class="form-group">
                <label>密碼 <span class="req">*</span></label>
                <input type="password" name="password" required autocomplete="current-password"
                  placeholder="至少 6 個字元" minlength="6" />
              </div>
              <div class="auth-forgot"><a href="#/forgot-password">忘記密碼？</a></div>
              <div class="auth-error" id="auth-error" hidden></div>
              <button type="submit" class="btn btn-accent btn-block btn-lg" id="auth-submit">登入</button>
            </form>
            <p class="auth-switch">還沒有帳號？ <a href="#/register">立即註冊</a></p>
          </div>
        </div>
      </div>`;
  }

  function renderRegister() {
    if (currentUser) {
      navigate("/");
      return "";
    }
    return `
      <div class="container">
        <div class="auth-page">
          <div class="auth-hero"><img src="images/logo-hero.png?v=logo4" alt="3388.HK" /><ul><li>⚡ 即買即發</li><li>🛡️ 官方正品</li><li>💳 在線支付</li></ul></div>
          <div class="form-card auth-card">
            <h1>註冊</h1>
            <p class="auth-lead">自訂英文用戶名，註冊後請驗證電郵</p>
            <form id="auth-form" data-mode="register" novalidate>
              <div class="form-group">
                <label>用戶名 <span class="req">*</span></label>
                <input type="text" name="username" required autocomplete="username"
                  placeholder="your_name" pattern="[A-Za-z0-9_]{3,20}" maxlength="20" />
                <div class="form-hint">3–20 個英文字母、數字或底線 · 不區分大小寫唯一</div>
              </div>
              <div class="form-group">
                <label>電郵 <span class="req">*</span></label>
                <input type="email" name="email" required autocomplete="email" maxlength="120" placeholder="you@example.com" />
                <div class="form-hint">用於驗證帳戶、訂單通知及重設密碼</div>
              </div>
              <div class="form-group">
                <label>密碼 <span class="req">*</span></label>
                <input type="password" name="password" required autocomplete="new-password"
                  placeholder="至少 8 個字元" minlength="8" />
              </div>
              <div class="form-group">
                <label>確認密碼 <span class="req">*</span></label>
                <input type="password" name="password2" required autocomplete="new-password"
                  placeholder="再輸入一次" minlength="8" />
              </div>
              <label class="terms-check"><input type="checkbox" name="accept_terms" required />
                <span>我已閱讀並同意<a href="/terms.html" target="_blank" rel="noopener">《服務使用條款》</a>及<a href="/privacy.html" target="_blank" rel="noopener">《私隱政策》</a></span></label>
              <div class="auth-error" id="auth-error" hidden></div>
              <button type="submit" class="btn btn-accent btn-block btn-lg" id="auth-submit">建立帳號</button>
            </form>
            <p class="auth-switch">已有帳號？ <a href="#/login">前往登入</a></p>
          </div>
        </div>
      </div>`;
  }

  function bindAuthForm() {
    const form = $("#auth-form");
    if (!form) return;
    const mode = form.dataset.mode;
    const errEl = $("#auth-error");
    const btn = $("#auth-submit");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errEl.hidden = true;
      errEl.textContent = "";
      const username = form.username.value.trim();
      const password = form.password.value;
      const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

      if (!USERNAME_RE.test(username)) {
        errEl.textContent = "用戶名須為 3–20 個英文字母、數字或底線";
        errEl.hidden = false;
        return;
      }
      if (mode === "login" && password.length < 1) {
        errEl.textContent = "請輸入密碼";
        errEl.hidden = false;
        return;
      }
      if (mode === "register") {
        const email = form.email.value.trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
          errEl.textContent = "請輸入有效的電郵地址"; errEl.hidden = false; return;
        }
        if (password.length < 8) {
          errEl.textContent = "密碼至少 8 個字元"; errEl.hidden = false; return;
        }
        if (!form.accept_terms.checked) {
          errEl.textContent = "請先閱讀並同意《服務使用條款》及《私隱政策》"; errEl.hidden = false; return;
        }
        const password2 = form.password2.value;
        if (password !== password2) {
          errEl.textContent = "兩次輸入的密碼不一致";
          errEl.hidden = false;
          return;
        }
      }

      btn.disabled = true;
      btn.textContent = mode === "register" ? "註冊中…" : "登入中…";
      try {
        const path = mode === "register" ? "/register" : "/login";
        const { ok, body, status } = await api(path, {
          method: "POST",
          body: JSON.stringify(mode === "register"
            ? { username, password, email: form.email.value.trim(), accept_terms: form.accept_terms.checked }
            : { username, password }),
        });
        if (!ok) {
          errEl.textContent = (body && body.error) || (status === 0 ? "無法連線伺服器" : "操作失敗");
          errEl.hidden = false;
          return;
        }
        await refreshAuth();
        toast(mode === "register" ? "註冊成功，請到電郵收件匣驗證電郵" : "登入成功");
        navigate("/account");
      } catch (err) {
        errEl.textContent = "無法連線伺服器，請稍後再試";
        errEl.hidden = false;
      } finally {
        btn.disabled = false;
        btn.textContent = mode === "register" ? "建立帳號" : "登入";
      }
    });
  }

  function formatWhen(isoOrSql) {
    if (!isoOrSql) return "—";
    // SQLite datetime('now') is UTC-ish without Z; treat as UTC if no zone
    let s = String(isoOrSql);
    if (/^\d{4}-\d{2}-\d{2} /.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
      s = s.replace(" ", "T") + "Z";
    }
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return String(isoOrSql);
    return d.toLocaleString("zh-HK", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function statusBadge(status, label) {
    const cls =
      status === "completed" ? "ok" : status === "paid" ? "paid" : "pending";
    return `<span class="status-badge status-${cls}">${escapeHtml(label || status)}</span>`;
  }

  function requireAuthPage(title) {
    return `
      <div class="container">
        <div class="empty-state member-gate">
          <div class="emoji">🔐</div>
          <h2>請先登入</h2>
          <p>登入後即可查看${escapeHtml(title)}</p>
          <div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap">
            <a class="btn btn-accent" href="#/login">登入</a>
            <a class="btn btn-outline" href="#/register">註冊</a>
          </div>
        </div>
      </div>`;
  }

  function memberNav(active) {
    return `
      <aside class="member-side">
        <div class="member-side-head">
          <div class="member-avatar">${escapeHtml((currentUser.username || "?").slice(0, 1).toUpperCase())}</div>
          <div>
            <div class="member-name">${escapeHtml(currentUser.username)}</div>
            <div class="member-sub">會員中心</div>
          </div>
        </div>
        <nav class="member-nav">
          <a class="${active === "account" ? "active" : ""}" href="#/account">帳戶概覽</a>
          <a class="${active === "orders" ? "active" : ""}" href="#/orders">我的訂單</a>
          <a class="${active === "password" ? "active" : ""}" href="#/account/password">修改密碼</a>
          <a href="/faq.html">常見問題</a>
          <a href="/contact.html">聯絡我們</a>
        </nav>
      </aside>`;
  }

  async function renderAccount(section) {
    if (!currentUser) return requireAuthPage("會員中心");

    if (section === "password") {
      return `
        <div class="container">
          <div class="page-banner">
            <div class="breadcrumb"><a href="#/">首頁</a> / <a href="#/account">會員中心</a> / <span>修改密碼</span></div>
            <h1>修改密碼</h1>
          </div>
          <div class="member-layout">
            ${memberNav("password")}
            <div class="form-card member-main">
              <h2>變更登入密碼</h2>
              <p class="auth-lead" style="margin-bottom:1.25rem">用戶名不可更改：${escapeHtml(currentUser.username)}</p>
              <form id="password-form" novalidate>
                <div class="form-group">
                  <label>舊密碼 <span class="req">*</span></label>
                  <input type="password" name="old_password" required autocomplete="current-password" minlength="6" />
                </div>
                <div class="form-group">
                  <label>新密碼 <span class="req">*</span></label>
                  <input type="password" name="new_password" required autocomplete="new-password" minlength="6" placeholder="至少 6 個字元" />
                </div>
                <div class="form-group">
                  <label>確認新密碼 <span class="req">*</span></label>
                  <input type="password" name="new_password2" required autocomplete="new-password" minlength="6" />
                </div>
                <div class="auth-error" id="pw-error" hidden></div>
                <div class="auth-ok" id="pw-ok" hidden></div>
                <button type="submit" class="btn btn-accent btn-lg" id="pw-submit">儲存新密碼</button>
              </form>
            </div>
          </div>
        </div>`;
    }

    let orderCount = currentUser.order_count;
    if (typeof orderCount !== "number") {
      try {
        const { ok, body } = await api("/me");
        if (ok) {
          orderCount = body.order_count || 0;
          currentUser.order_count = orderCount;
        } else orderCount = 0;
      } catch {
        orderCount = 0;
      }
    }

    return `
      <div class="container">
        <div class="page-banner">
          <div class="breadcrumb"><a href="#/">首頁</a> / <span>會員中心</span></div>
          <h1>會員中心</h1>
          <p>歡迎回來，${escapeHtml(currentUser.username)}</p>
        </div>
        <div class="member-layout">
          ${memberNav("account")}
          <div class="member-main">
            <div class="member-stats">
              <div class="stat-card">
                <div class="stat-label">訂單數</div>
                <div class="stat-value">${orderCount}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">帳戶</div>
                <div class="stat-value stat-user">${escapeHtml(currentUser.username)}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">狀態</div>
                <div class="stat-value" style="color:var(--success);font-size:1.25rem">已登入</div>
              </div>
            </div>
            <div class="member-quick">
              <a class="quick-card" href="#/orders">
                <span class="qc-icon">📦</span>
                <div><strong>訂單記錄</strong><span>查看歷史訂單與狀態</span></div>
              </a>
              <a class="quick-card" href="#/account/password">
                <span class="qc-icon">🔑</span>
                <div><strong>個人資料</strong><span>用戶名唯讀 · 可改密碼</span></div>
              </a>
              <a class="quick-card" href="#/catalog">
                <span class="qc-icon">🛒</span>
                <div><strong>繼續購物</strong><span>瀏覽點卡與手遊儲值</span></div>
              </a>
            </div>
            <div class="form-card" style="margin-top:1.25rem">
              <h2>個人資料</h2>
              <div class="confirm-details" style="margin-top:0.75rem">
                <div class="row"><span>用戶名</span><span>${escapeHtml(currentUser.username)}</span></div>
                <div class="row"><span>電郵</span><span>${currentUser.email ? escapeHtml(currentUser.email) : "未填寫"}</span></div>
                <div class="row"><span>電郵驗證</span><span>${currentUser.email ? (currentUser.email_verified ? '<b style="color:var(--success)">已驗證</b>' : '<b style="color:#d9480f">未驗證</b>') : "—"}</span></div>
              </div>
              ${currentUser.email && !currentUser.email_verified ? `<div class="demo-note" style="margin-top:.75rem">請到收件匣按驗證連結完成電郵驗證。<button type="button" class="btn btn-outline-accent btn-sm" id="resend-verify" style="margin-left:6px">重新發送驗證電郵</button></div>` : ""}
              <form id="email-form" class="email-form" novalidate>
                <label>${currentUser.email ? "更改電郵" : "新增電郵（用於驗證及重設密碼）"}</label>
                <div class="email-row"><input type="email" name="email" maxlength="120" placeholder="you@example.com" autocomplete="email" /><button type="submit" class="btn btn-accent btn-sm">儲存並驗證</button></div>
                <div class="auth-error" id="email-error" hidden></div>
              </form>
              <a class="btn btn-outline" href="#/account/password" style="margin-top:1rem">修改密碼</a>
            </div>
          </div>
        </div>
      </div>`;
  }

  function bindPasswordForm() {
    const form = $("#password-form");
    if (!form) return;
    const errEl = $("#pw-error");
    const okEl = $("#pw-ok");
    const btn = $("#pw-submit");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errEl.hidden = true;
      okEl.hidden = true;
      const old_password = form.old_password.value;
      const new_password = form.new_password.value;
      const new_password2 = form.new_password2.value;
      if (new_password.length < 6) {
        errEl.textContent = "新密碼至少 6 個字元";
        errEl.hidden = false;
        return;
      }
      if (new_password !== new_password2) {
        errEl.textContent = "兩次輸入的新密碼不一致";
        errEl.hidden = false;
        return;
      }
      btn.disabled = true;
      btn.textContent = "儲存中…";
      try {
        const { ok, body } = await api("/change-password", {
          method: "POST",
          body: JSON.stringify({ old_password, new_password }),
        });
        if (!ok) {
          errEl.textContent = (body && body.error) || "修改失敗";
          errEl.hidden = false;
          return;
        }
        form.reset();
        okEl.textContent = "密碼已更新";
        okEl.hidden = false;
        toast("密碼已更新");
      } catch {
        errEl.textContent = "無法連線伺服器";
        errEl.hidden = false;
      } finally {
        btn.disabled = false;
        btn.textContent = "儲存新密碼";
      }
    });
  }

  function loadHiddenOrders() {
    // Order deletion/hiding is not allowed; clear any legacy local hidden list.
    try { localStorage.removeItem(HIDDEN_ORDERS_KEY); } catch {}
    return [];
  }
  function _legacyHiddenUnused() {
    try {
      const arr = JSON.parse(localStorage.getItem(HIDDEN_ORDERS_KEY) || "[]");
      return Array.isArray(arr) ? arr.map(String) : [];
    } catch {
      return [];
    }
  }

  function formatWhenFull(isoOrSql) {
    if (!isoOrSql) return "—";
    let s = String(isoOrSql);
    if (/^\d{4}-\d{2}-\d{2} /.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
      s = s.replace(" ", "T") + "Z";
    }
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return String(isoOrSql);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t)?.value || "00";
    return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
  }

  function orderTabKey(status) {
    const s = String(status || "").toLowerCase();
    if (s === "pending" || s === "unpaid" || s === "timeout" || s === "failed") return "pending";
    if (s === "shipping" || s === "sending") return "shipping";
    if (s === "refunded" || s === "refund") return "refunded";
    if (s === "paid" || s === "completed" || s === "success") return "success";
    return "other";
  }

  function orderPayStatusText(o) {
    if (o.status === "cancelled") return "超時未付款（已取消）";
    if (o.status === "paid_late") return o.status_label || "逾時付款（待人工處理）";
    const tab = orderTabKey(o.status);
    if (tab === "pending") return o.status_label || "待付款";
    if (tab === "refunded") return "已退款";
    if (tab === "shipping") return "發送中";
    const pay = o.payment_label || o.payment_method || "";
    return pay ? `已以 ${pay} 付款` : o.status_label || "已付款";
  }

  function secondaryOrderId(orderId) {
    let h = 0;
    const s = String(orderId || "");
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return "C" + String(100000000 + (h % 900000000));
  }

  function realCardCodes(order) {
    const st = order && order.status;
    if (st !== "paid" && st !== "completed") return { allowed: false, ready: false, codes: [] };
    const codes = Array.isArray(order.codes)
      ? order.codes.filter((c) => c && String(c.code || "").trim()).map((c) => ({
          title: c.title || "商品",
          denom: c.denomination || "",
          code: String(c.code).trim(),
        }))
      : [];
    return { allowed: true, ready: codes.length > 0 || !!order.codes_ready, codes };
  }


  function productThumbHtml(productId, title) {
    const product = productId ? getProduct(productId) : null;
    if (product) {
      return `<div class="seagm-thumb" style="${thumbStyle(product)}"><span>${escapeHtml(productInitials(product.name))}</span></div>`;
    }
    const initials = productInitials(title || "OK");
    return `<div class="seagm-thumb seagm-thumb-fallback"><span>${escapeHtml(initials)}</span></div>`;
  }

  function renderOrderSeagmCard(o) {
    const items = o.items || [];
    const tab = orderTabKey(o.status);
    const isSuccess = tab === "success";
    const isPending = tab === "pending";
    const payText = orderPayStatusText(o);
    const secId = isSuccess || tab === "shipping" ? secondaryOrderId(o.id) : "";

    const lines =
      items.length > 0
        ? items
            .map((it) => {
              const actions = [];
              if (isSuccess) {
                actions.push(
                  `<button type="button" class="seagm-btn-getcard" data-get-card="${escapeHtml(o.id)}">獲取卡密</button>`
                );
                actions.push(
                  `<button type="button" class="seagm-link-rebuy" data-rebuy-order="${escapeHtml(o.id)}" data-rebuy-product="${escapeHtml(it.product_id || "")}" data-rebuy-denom="${escapeHtml(it.denomination || "")}" data-rebuy-qty="${it.qty || 1}">再次購買</button>`
                );
                actions.push(`<div class="seagm-status-ok">交易成功</div>`);
              } else if (isPending) {
                if (o.pay_qrcode) {
                  actions.push(
                    `<a class="seagm-btn-getcard" href="#/pay-result/${encodeURIComponent(o.id)}">掃碼付款</a>`
                  );
                } else if (o.pay_url) {
                  actions.push(
                    `<a class="seagm-btn-getcard" href="${escapeHtml(o.pay_url)}">前往支付</a>`
                  );
                }
                actions.push(
                  `<button type="button" class="seagm-link-rebuy" data-rebuy-order="${escapeHtml(o.id)}" data-rebuy-product="${escapeHtml(it.product_id || "")}" data-rebuy-denom="${escapeHtml(it.denomination || "")}" data-rebuy-qty="${it.qty || 1}">再次購買</button>`
                );
                actions.push(`<div class="seagm-status-muted">${escapeHtml(o.status_label || "待付款")}</div>`);
              } else if (tab === "shipping") {
                actions.push(`<div class="seagm-status-ship">發送中</div>`);
                actions.push(
                  `<button type="button" class="seagm-link-rebuy" data-rebuy-order="${escapeHtml(o.id)}" data-rebuy-product="${escapeHtml(it.product_id || "")}" data-rebuy-denom="${escapeHtml(it.denomination || "")}" data-rebuy-qty="${it.qty || 1}">再次購買</button>`
                );
              } else if (tab === "refunded") {
                actions.push(`<div class="seagm-status-muted">已退款</div>`);
              } else {
                if (o.status === "cancelled" || o.status === "paid_late") actions.push(`<div class="seagm-status-muted seagm-status-expired">${escapeHtml(o.status_label || "超時未付款")}</div>`);
                actions.push(
                  `<button type="button" class="seagm-link-rebuy" data-rebuy-order="${escapeHtml(o.id)}" data-rebuy-product="${escapeHtml(it.product_id || "")}" data-rebuy-denom="${escapeHtml(it.denomination || "")}" data-rebuy-qty="${it.qty || 1}">再次購買</button>`
                );
              }
              return `
              <div class="seagm-line">
                ${secId ? `<div class="seagm-sec-id">${escapeHtml(secId)}</div>` : `<div class="seagm-sec-id seagm-sec-empty"></div>`}
                ${productThumbHtml(it.product_id, it.title)}
                <div class="seagm-prod">
                  <div class="seagm-prod-name">${escapeHtml(it.title || "商品")}</div>
                  <div class="seagm-prod-sub">${escapeHtml(it.denomination || "")}${it.game_uid ? " · 帳號 " + escapeHtml(it.game_uid) : ""}</div>
                </div>
                <div class="seagm-price-qty">
                  <div class="seagm-unit">${money(it.unit_price)}</div>
                  <div class="seagm-qty">× ${it.qty || 1}</div>
                </div>
                <div class="seagm-actions">${actions.join("")}</div>
              </div>`;
            })
            .join("")
        : `<div class="seagm-line seagm-line-empty"><div class="seagm-prod"><div class="seagm-prod-name">（無商品明細）</div></div></div>`;

    return `
      <article class="seagm-order-card" data-order-id="${escapeHtml(o.id)}" data-status-tab="${tab}" data-search="${escapeHtml(
        ((o.id || "") + " " + items.map((i) => (i.title || "") + " " + (i.denomination || "")).join(" ")).toLowerCase()
      )}">
        <div class="seagm-card-head">
          <div class="seagm-head-left">
            <span class="seagm-pay-label">訂單</span>
            <a class="seagm-order-id" href="#/orders/${encodeURIComponent(o.id)}">${escapeHtml(o.id)}</a>
            <span class="seagm-time">${escapeHtml(formatWhenFull(o.created_at))}</span>
          </div>
          <div class="seagm-head-right">
            <span class="seagm-pay-status">${escapeHtml(payText)}</span>
            <span class="seagm-total">總計 ${money(o.total)}</span>
          </div>
        </div>
        <div class="seagm-card-body">${lines}</div>
      </article>`;
  }


  async function renderPayResult(orderId) {
    if (!currentUser) return requireAuthPage("付款結果");
    let order = null;
    let loadErr = "";
    let syncNote = "正在確認付款狀態…";

    try {
      const inq = await api("/orders/" + encodeURIComponent(orderId) + "/inquire-payment", {
        method: "POST",
        body: "{}",
      });
      if (inq.ok && inq.body && inq.body.order) {
        order = inq.body.order;
        if (inq.body.already_paid || order.status === "paid" || order.status === "completed") {
          syncNote = "付款成功，訂單已更新。";
        } else if (order.status === "failed") {
          syncNote = "付款未完成或已失敗，請重新下單。";
        } else if (order.status === "cancelled") {
          syncNote = "訂單超過 30 分鐘未付款，已自動取消。價錢可能已更新，請重新下單。";
        } else if (order.status === "paid_late") {
          syncNote = "已收到逾時付款，客服會人工處理，請聯絡客服。";
        } else if (inq.body.qfpay_payment_status) {
          syncNote = "QFPay 狀態：" + inq.body.qfpay_payment_status + "（若剛完成付款，請稍候刷新）";
        } else if (inq.body.antom_payment_status) {
          syncNote = "支付狀態：" + inq.body.antom_payment_status + "（若剛完成付款，請稍候刷新）";
        } else {
          syncNote = "尚未收到付款確認。若你已付款，請稍後在「我的訂單」查看，或再按重新確認。";
        }
      } else {
        const { ok, body, status } = await api("/orders/" + encodeURIComponent(orderId));
        if (ok) order = body;
        else loadErr = status === 404 ? "找不到此訂單" : ((body && body.error) || "無法載入");
      }
    } catch {
      loadErr = "無法連線伺服器";
    }

    if (!order) {
      return `
        <div class="container">
          <div class="empty-state">
            <div class="emoji">😕</div>
            <h2>${escapeHtml(loadErr || "找不到訂單")}</h2>
            <a class="btn btn-accent" href="#/orders">返回訂單列表</a>
          </div>
        </div>`;
    }

    const paid = order.status === "paid" || order.status === "completed";
    const expired = order.status === "cancelled";
    const failed = order.status === "failed" || expired || order.status === "paid_late";
    const firstItem = (order.items || [])[0] || {};
    let remainSec = 0;
    if (order.status === "pending" && order.created_at) {
      const created = Date.parse(order.created_at.replace(" ", "T") + "Z");
      const now = order.server_now ? Date.parse(order.server_now.replace(" ", "T") + "Z") : Date.now();
      remainSec = Math.max(0, Math.floor((created + (order.expire_minutes || 30) * 60000 - now) / 1000));
      window.__payDeadline = Date.now() + remainSec * 1000;
    }
    const badge = paid
      ? statusBadge("paid", "已付款")
      : failed
        ? statusBadge("pending", expired ? "超時未付款" : order.status === "paid_late" ? "逾時付款" : "付款失敗")
        : statusBadge("pending", "待付款");

    return `
      <div class="container">
        <div class="page-banner">
          <div class="breadcrumb"><a href="#/">首頁</a> / <a href="#/orders">我的訂單</a> / <span>付款結果</span></div>
          <h1>付款結果</h1>
        </div>
        <div class="pr-card ${paid ? "is-paid" : failed ? "is-failed" : "is-pending"}">
          <div class="pr-head">
            <div class="pr-ico">${paid ? "✓" : failed ? "!" : "⏳"}</div>
            <div><h2>${paid ? "付款成功" : expired ? "訂單已取消" : order.status === "paid_late" ? "逾時付款（待人工處理）" : failed ? "付款未成功" : "等待付款確認"}</h2><p>${escapeHtml(syncNote)}</p></div>
          </div>
          ${order.status === "pending" ? `<div class="pr-countdown" id="pr-countdown">請於 <b id="pr-cd">--:--</b> 內完成付款，逾時訂單自動取消</div>` : ""}
          <div class="pr-amount"><span>應付金額</span><strong>${money(order.total)}</strong></div>
          ${!paid && !failed && order.pay_qrcode ? `
          <div class="pay-qr-box">
            <p class="pay-qr-title">請用 ${escapeHtml(order.payment_label || "對應 App")} 掃描二維碼付款</p>
            <img class="pay-qr-img" alt="付款二維碼" width="220" height="220"
              src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&amp;margin=8&amp;data=${encodeURIComponent(order.pay_qrcode)}" />
            <p class="pay-qr-hint">付款完成後按「重新確認付款」</p>
          </div>` : ""}
          <div class="pr-rows">
            <div><span>訂單編號</span><span class="mono">${escapeHtml(order.id)}</span></div>
            <div><span>狀態</span><span>${badge}</span></div>
            ${(order.items || []).map((it) => `<div class="pr-item"><span>${escapeHtml(it.title || "商品")}<small>${escapeHtml(it.denomination || "")} × ${it.qty}${it.game_uid ? " · 帳號 " + escapeHtml(it.game_uid) : ""}</small></span><span>${money(it.line_total != null ? it.line_total : it.unit_price * it.qty)}</span></div>`).join("")}
            <div><span>付款方式</span><span>${escapeHtml(order.payment_label || order.payment_method || "")}</span></div>
            ${Number(order.admin_fee) > 0 ? `
            <div><span>商品小計</span><span>${money(order.subtotal != null ? order.subtotal : (order.total - order.admin_fee))}</span></div>
            <div><span>${escapeHtml(orderFeeLabel(order))}</span><span>${money(order.admin_fee)}</span></div>` : ""}
            <div class="pr-total"><span>合計</span><span>${money(order.total)}</span></div>
          </div>
          <div class="pr-actions">
            ${!paid && !failed && order.pay_url ? `<a class="btn btn-accent" href="${escapeHtml(order.pay_url)}" target="_blank" rel="noopener">繼續前往支付</a>` : ""}
            ${expired || order.status === "failed" ? `<a class="btn btn-accent" href="${getProduct(firstItem.product_id) ? productUrl(getProduct(firstItem.product_id)) : "#/catalog"}">再次購買（按最新價錢）</a>` : `<button type="button" class="btn ${!paid && !failed && !order.pay_url ? "btn-accent" : "btn-outline"}" id="pay-result-refresh">重新確認付款</button>`}
            <a class="btn btn-outline" href="#/orders/${encodeURIComponent(order.id)}">查看訂單</a>
            <a class="btn btn-outline" href="#/orders">我的訂單</a>
          </div>
        </div>
      </div>`;
  }

  function bindPayResultPage(orderId) {
    $("#pay-result-refresh")?.addEventListener("click", () => {
      render();
    });
    clearInterval(window.__payCdT);
    const cd = $("#pr-cd");
    if (cd && window.__payDeadline) {
      const tick = () => {
        if (!document.body.contains(cd)) return clearInterval(window.__payCdT);
        const left = Math.max(0, Math.round((window.__payDeadline - Date.now()) / 1000));
        cd.textContent = String(Math.floor(left / 60)).padStart(2, "0") + ":" + String(left % 60).padStart(2, "0");
        if (left <= 0) { clearInterval(window.__payCdT); setTimeout(render, 1500); }
      };
      tick();
      window.__payCdT = setInterval(tick, 1000);
    }
  }

  async function renderOrders() {
    if (!currentUser) return requireAuthPage("我的訂單");

    let orders = [];
    let loadErr = "";
    try {
      const { ok, body } = await api("/orders");
      if (!ok) loadErr = (body && body.error) || "無法載入訂單";
      else orders = body.orders || [];
    } catch {
      loadErr = "無法連線伺服器";
    }
    lastOrdersCache = orders;

    const hidden = new Set(loadHiddenOrders());
    const visible = orders.filter((o) => !hidden.has(String(o.id)));

    const counts = { all: visible.length, pending: 0, shipping: 0, success: 0, refunded: 0 };
    for (const o of visible) {
      const t = orderTabKey(o.status);
      if (counts[t] != null) counts[t] += 1;
    }

    const listHtml = loadErr
      ? `<div class="empty-state"><h2>${escapeHtml(loadErr)}</h2></div>`
      : !visible.length
        ? `<div class="empty-state" style="padding:2rem 1rem">
            <div class="emoji">📦</div>
            <h2>尚無訂單</h2>
            <p>下單後會顯示在這裡</p>
            <a class="btn btn-accent" href="#/catalog">去逛逛</a>
          </div>`
        : `<div class="seagm-order-list" id="seagm-order-list">
            ${visible.map(renderOrderSeagmCard).join("")}
          </div>
          <div class="seagm-empty-filter" id="seagm-empty-filter" hidden>
            <div class="empty-state" style="padding:2rem 1rem">
              <div class="emoji">🔍</div>
              <h2>沒有符合條件的訂單</h2>
              <p>試試其他狀態或清除搜尋</p>
            </div>
          </div>`;

    return `
      <div class="container seagm-orders-page">
        <div class="page-banner seagm-orders-banner">
          <div class="breadcrumb"><a href="#/">首頁</a> / <a href="#/account">會員中心</a> / <span>我的訂單</span></div>
          <h1>我的訂單</h1>
        </div>
        <div class="member-layout">
          ${memberNav("orders")}
          <div class="member-main">
            <div class="seagm-toolbar">
              <div class="seagm-tabs" role="tablist" aria-label="訂單狀態">
                <button type="button" class="seagm-tab active" data-tab="all" role="tab" aria-selected="true">所有${counts.all ? ` ${counts.all}` : ""}</button>
                <button type="button" class="seagm-tab" data-tab="pending" role="tab" aria-selected="false">待發貨${counts.pending ? ` ${counts.pending}` : ""}</button>
                <button type="button" class="seagm-tab" data-tab="shipping" role="tab" aria-selected="false">發送中${counts.shipping ? ` ${counts.shipping}` : ""}</button>
                <button type="button" class="seagm-tab" data-tab="success" role="tab" aria-selected="false">交易成功${counts.success ? ` ${counts.success}` : ""}</button>
                <button type="button" class="seagm-tab" data-tab="refunded" role="tab" aria-selected="false">已退款${counts.refunded ? ` ${counts.refunded}` : ""}</button>
              </div>
              <label class="seagm-search">
                <input type="search" id="seagm-order-search" placeholder="搜尋訂單編號、商品名稱" autocomplete="off" />
                <span class="seagm-search-icon" aria-hidden="true">
                  <svg class="search-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
                </span>
              </label>
            </div>
            ${listHtml}
          </div>
        </div>
      </div>
      <div class="seagm-modal" id="seagm-card-modal" hidden>
        <div class="seagm-modal-backdrop" data-close-modal></div>
        <div class="seagm-modal-panel" role="dialog" aria-modal="true" aria-labelledby="seagm-modal-title">
          <div class="seagm-modal-head">
            <h2 id="seagm-modal-title">獲取卡密</h2>
            <button type="button" class="seagm-modal-close" data-close-modal aria-label="關閉">×</button>
          </div>
          <div class="seagm-modal-body" id="seagm-modal-body"></div>
          <div class="seagm-modal-foot">
            <button type="button" class="btn btn-outline" data-close-modal>關閉</button>
            <button type="button" class="btn btn-accent" id="seagm-copy-all">複製全部</button>
          </div>
        </div>
      </div>`;
  }

  function bindOrdersPage(ordersCache) {
    const root = $(".seagm-orders-page");
    if (!root) return;

    const list = $("#seagm-order-list");
    const emptyFilter = $("#seagm-empty-filter");
    const search = $("#seagm-order-search");
    let activeTab = "all";

    function applyFilter() {
      if (!list) return;
      const q = (search?.value || "").trim().toLowerCase();
      let shown = 0;
      $$(".seagm-order-card", list).forEach((card) => {
        const tab = card.dataset.statusTab || "other";
        const hay = card.dataset.search || "";
        const tabOk = activeTab === "all" || tab === activeTab;
        const qOk = !q || hay.includes(q) || (card.dataset.orderId || "").toLowerCase().includes(q);
        const ok = tabOk && qOk;
        card.hidden = !ok;
        if (ok) shown += 1;
      });
      if (emptyFilter) emptyFilter.hidden = shown > 0 || !$$(".seagm-order-card", list).length;
      if (list) list.hidden = shown === 0 && !!$$(".seagm-order-card", list).length;
    }

    $$(".seagm-tab", root).forEach((btn) => {
      btn.addEventListener("click", () => {
        activeTab = btn.dataset.tab || "all";
        $$(".seagm-tab", root).forEach((b) => {
          const on = b === btn;
          b.classList.toggle("active", on);
          b.setAttribute("aria-selected", on ? "true" : "false");
        });
        applyFilter();
      });
    });

    search?.addEventListener("input", applyFilter);

    root.addEventListener("click", (e) => {

      const getBtn = e.target.closest("[data-get-card]");
      if (getBtn) {
        e.preventDefault();
        const id = getBtn.getAttribute("data-get-card");
        const order = (ordersCache || []).find((o) => String(o.id) === String(id));
        openCardModal(id, order);
        return;
      }

      const rebuy = e.target.closest("[data-rebuy-product]");
      if (rebuy) {
        e.preventDefault();
        const productId = rebuy.getAttribute("data-rebuy-product") || "";
        const denom = rebuy.getAttribute("data-rebuy-denom") || "";
        const qty = Math.max(1, parseInt(rebuy.getAttribute("data-rebuy-qty") || "1", 10) || 1);
        const product = getProduct(productId);
        if (!product) {
          toast("找不到對應商品，請從目錄選購");
          navigate("/catalog");
          return;
        }
        let option = product.options.find((o) => o.label === denom);
        if (!option && product.options.length) option = product.options[0];
        if (!option) {
          navigate("/product/" + encodeURIComponent(productId));
          return;
        }
        addToCart(productId, option.id, qty);
        navigate("/cart");
      }
    });

    async function openCardModal(orderId, cached) {
      const modal = $("#seagm-card-modal");
      const body = $("#seagm-modal-body");
      const copyAll = $("#seagm-copy-all");
      if (!modal || !body) return;
      body.innerHTML = `<p class="seagm-modal-note">載入中…</p>`;
      if (copyAll) { copyAll.hidden = true; copyAll.setAttribute("hidden", ""); }
      modal.hidden = false;
      document.body.style.overflow = "hidden";

      let order = cached;
      try {
        const { ok, body: b } = await api("/orders/" + encodeURIComponent(orderId));
        if (ok) order = b;
      } catch {}
      const info = realCardCodes(order || {});
      if (!info.allowed) {
        body.innerHTML = `<p class="seagm-modal-note">訂單未付款或已取消，無法顯示卡密。</p>`;
        return;
      }
      if (!info.codes.length) {
        body.innerHTML = `
          <p class="seagm-modal-note">訂單 <strong>${escapeHtml((order && order.id) || orderId || "")}</strong></p>
          <p class="seagm-modal-pending">卡密準備中，請稍後再試或聯絡客服。</p>
          <p class="form-hint" style="margin-top:8px"><a href="/contact.html">聯絡客服</a></p>`;
        return;
      }
      if (copyAll) { copyAll.hidden = false; copyAll.removeAttribute("hidden"); }
      body.innerHTML = `
        <p class="seagm-modal-note">訂單 <strong>${escapeHtml(order.id || orderId || "")}</strong></p>
        <ul class="seagm-code-list">
          ${info.codes
            .map(
              (c) => `
            <li>
              <div class="seagm-code-meta">${escapeHtml(c.title)}${c.denom ? " · " + escapeHtml(c.denom) : ""}</div>
              <code class="seagm-code">${escapeHtml(c.code)}</code>
              <button type="button" class="seagm-copy-one" data-copy="${escapeHtml(c.code)}">複製</button>
            </li>`
            )
            .join("")}
        </ul>`;
      body.querySelectorAll("[data-copy]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const t = btn.getAttribute("data-copy") || "";
          try {
            await navigator.clipboard.writeText(t);
            toast("已複製卡密");
          } catch {
            toast(t);
          }
        });
      });
      if (copyAll) {
        copyAll.onclick = async () => {
          const text = info.codes.map((c) => `${c.title}${c.denom ? " " + c.denom : ""}: ${c.code}`).join("\n");
          try {
            await navigator.clipboard.writeText(text);
            toast("已複製全部卡密");
          } catch {
            toast("複製失敗，請手動選擇");
          }
        };
      }
    }

    function closeModal() {
      const modal = $("#seagm-card-modal");
      if (!modal) return;
      modal.hidden = true;
      document.body.style.overflow = "";
    }

    $$("[data-close-modal]").forEach((el) => el.addEventListener("click", closeModal));
  }

  async function renderOrderDetail(id) {
    if (!currentUser) return requireAuthPage("訂單詳情");

    let order = null;
    let loadErr = "";
    try {
      const { ok, body, status } = await api("/orders/" + encodeURIComponent(id));
      if (!ok) loadErr = status === 404 ? "找不到此訂單" : ((body && body.error) || "無法載入");
      else order = body;
    } catch {
      loadErr = "無法連線伺服器";
    }

    if (loadErr || !order) {
      return `
        <div class="container">
          <div class="empty-state">
            <div class="emoji">😕</div>
            <h2>${escapeHtml(loadErr || "找不到訂單")}</h2>
            <a class="btn btn-accent" href="#/orders">返回訂單列表</a>
          </div>
        </div>`;
    }

    const items = order.items || [];
    return `
      <div class="container">
        <div class="page-banner">
          <div class="breadcrumb">
            <a href="#/">首頁</a> /
            <a href="#/account">會員中心</a> /
            <a href="#/orders">訂單記錄</a> /
            <span>${escapeHtml(order.id)}</span>
          </div>
          <h1>訂單詳情</h1>
          <p>${statusBadge(order.status, order.status_label)} · ${formatWhen(order.created_at)}（香港）</p>
        </div>
        <div class="member-layout">
          ${memberNav("orders")}
          <div class="member-main">
            <div class="form-card">
              <div class="order-id-box" style="margin:0 0 1.25rem">
                <div class="label">訂單編號</div>
                <div class="id">${escapeHtml(order.id)}</div>
              </div>
              <div class="confirm-details">
                <div class="row"><span>狀態</span><span>${statusBadge(order.status, order.status_label)}</span></div>
                <div class="row"><span>付款方式</span><span>${escapeHtml(order.payment_label || order.payment_method)}</span></div>
                ${order.email ? `<div class="row"><span>電郵</span><span>${escapeHtml(order.email)}</span></div>` : ""}
                ${order.game_uid ? `<div class="row"><span>遊戲 UID</span><span>${escapeHtml(order.game_uid)}</span></div>` : ""}
                ${order.note ? `<div class="row"><span>備註</span><span>${escapeHtml(order.note)}</span></div>` : ""}
                ${Number(order.admin_fee) > 0 ? `
                <div class="row"><span>商品小計</span><span>${money(order.subtotal != null ? order.subtotal : (order.total - order.admin_fee))}</span></div>
                <div class="row"><span>${escapeHtml(orderFeeLabel(order))}</span><span>${money(order.admin_fee)}</span></div>` : ""}
                <div class="row"><span>合計</span><span><strong>${money(order.total)}</strong></span></div>
              </div>
            </div>
            <div class="form-card" style="margin-top:1rem">
              <h2>商品明細</h2>
              <div class="order-lines-detail">
                ${items
                  .map(
                    (i) => `
                  <div class="order-line">
                    <div>
                      <div class="name">${escapeHtml(i.title)}</div>
                      <div class="sub">${escapeHtml(i.denomination)} × ${i.qty} · 單價 ${money(i.unit_price)}${i.game_uid ? " · 帳號 " + escapeHtml(i.game_uid) : ""}</div>
                    </div>
                    <div>${money(i.line_total != null ? i.line_total : i.unit_price * i.qty)}</div>
                  </div>`
                  )
                  .join("")}
              </div>
            </div>
            <div style="margin-top:1rem;display:flex;gap:0.75rem;flex-wrap:wrap">
              <a class="btn btn-outline" href="#/orders">返回列表</a>
              <a class="btn btn-accent" href="#/catalog">繼續購物</a>
            </div>
          </div>
        </div>
      </div>`;
  }

  function renderOrder() {
    let order = null;
    try {
      order = JSON.parse(localStorage.getItem(ORDER_KEY));
    } catch {
      order = null;
    }
    if (!order) {
      return `
        <div class="container">
          <div class="empty-state" style="margin-top:2rem">
            <div class="emoji">📦</div>
            <h2>尚無訂單</h2>
            <a class="btn btn-accent" href="#/catalog">去逛逛</a>
          </div>
        </div>`;
    }

    const when = formatWhen(order.created_at || order.createdAt);
    const items = order.items || [];
    const payLabel = order.payment_label || order.payment || order.payment_method || "";
    const statusHtml = order.status
      ? statusBadge(order.status, order.status_label)
      : statusBadge("paid", "已付款");

    return `
      <div class="container">
        <div class="confirm-card">
          <div class="confirm-icon">✓</div>
          <h1>訂單已建立</h1>
          <p>感謝你的購買。可在會員中心查看訂單狀態。</p>
          <div class="order-id-box">
            <div class="label">訂單編號</div>
            <div class="id">${escapeHtml(order.id)}</div>
          </div>
          <div class="confirm-details">
            <div class="row"><span>狀態</span><span>${statusHtml}</span></div>
            ${order.email ? `<div class="row"><span>電郵</span><span>${escapeHtml(order.email)}</span></div>` : ""}
            ${(order.game_uid || order.uid) ? `<div class="row"><span>遊戲 UID</span><span>${escapeHtml(order.game_uid || order.uid)}</span></div>` : ""}
            <div class="row"><span>付款方式</span><span>${escapeHtml(payLabel)}</span></div>
            <div class="row"><span>下單時間</span><span>${when}（香港）</span></div>
            <div class="row"><span>商品數</span><span>${items.reduce((s, i) => s + (i.qty || 0), 0)} 件</span></div>
            ${Number(order.admin_fee) > 0 ? `
            <div class="row"><span>商品小計</span><span>${money(order.subtotal != null ? order.subtotal : (order.total - order.admin_fee))}</span></div>
            <div class="row"><span>${escapeHtml(orderFeeLabel(order))}</span><span>${money(order.admin_fee)}</span></div>` : ""}
            <div class="row"><span>合計</span><span>${money(order.total)}</span></div>
          </div>
          <div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap">
            <a class="btn btn-accent" href="#/orders/${encodeURIComponent(order.id)}">查看訂單</a>
            <a class="btn btn-outline" href="#/orders">訂單記錄</a>
            <a class="btn btn-outline" href="#/catalog">繼續購物</a>
          </div>
        </div>
      </div>`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function render() {
    document.body.classList.remove("has-pdp-bar");
    const route = parseHash();
    // Static product pages (/product/<slug>.html) host only the product route;
    // any other in-app route goes back to the SPA root.
    if (window.__PRODUCT_ID && route.page !== "product") {
      location.replace("/" + (location.hash || "#/"));
      return;
    }
    // Old hash product links → crawlable product page
    if (route.page === "product" && !window.__PRODUCT_ID) {
      const prod = getProduct(route.id) || (DATA.products || []).find((x) => x.slug === route.id);
      if (prod) { location.replace(productUrl(prod)); return; }
    }
    if (route.page === "product" && window.__PRODUCT_ID && route.id !== window.__PRODUCT_ID) {
      const prod = getProduct(route.id);
      if (prod) { location.replace(productUrl(prod)); return; }
    }
    setActiveNav(route.page, route.category);
    const app = $("#app");
    if (!app) return;

    let html = "";
    switch (route.page) {
      case "catalog":
        html = renderCatalog(route.category);
        break;
      case "product":
        html = renderProduct(route.id);
        break;
      case "cart":
        html = renderCart();
        break;
      case "checkout":
        html = renderCheckout();
        break;
      case "order":
        html = renderOrder();
        break;
      case "forgot":
        html = renderForgot();
        break;
      case "reset":
        html = renderReset(route.query.token || "");
        break;
      case "verify":
        html = renderVerify();
        break;
      case "login":
        html = renderLogin();
        break;
      case "register":
        html = renderRegister();
        break;
      case "account":
        html = await renderAccount(route.section);
        break;
      case "orders":
        html = await renderOrders();
        break;
      case "order-detail":
        html = await renderOrderDetail(route.id);
        break;
      case "pay-result":
        html = await renderPayResult(route.id);
        break;
      default:
        html = renderHome();
    }
    app.innerHTML = html;
    updateCartBadge();
    updateAuthUI();
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });

    if (route.page === "product") bindProductPage();
    if (route.page === "home") bindHome();
    if (route.page === "cart") bindCartPage();
    if (route.page === "checkout") bindCheckoutPage();
    if (route.page === "login" || route.page === "register") bindAuthForm();
    if (route.page === "account" && route.section === "password") bindPasswordForm();
    if (route.page === "account" && !route.section) bindEmailForm();
    if (route.page === "forgot") bindForgot();
    if (route.page === "reset") bindReset(route.query.token || "");
    if (route.page === "verify") doVerify(route.query.token || "");
    if (route.page === "orders") bindOrdersPage(lastOrdersCache);
    if (route.page === "pay-result") bindPayResultPage(route.id);

    $(".mobile-nav")?.classList.remove("open");
  }

  function applySiteBackground(settings) {
    const url = settings && settings.background_url;
    if (url) {
      document.body.classList.add("has-custom-bg");
      document.body.style.setProperty("--site-bg-image", "url(" + url + ")");
    } else {
      document.body.classList.remove("has-custom-bg");
      document.body.style.removeProperty("--site-bg-image");
    }
  }

  async function loadSiteSettings() {
    try {
      const { ok, body } = await api("/site-settings");
      if (ok) applySiteBackground(body);
    } catch {}
  }

  function init() {
    updateCartBadge();
    loadSiteSettings();
    $("#menu-toggle")?.addEventListener("click", () => {
      $(".mobile-nav")?.classList.toggle("open");
    });
    window.addEventListener("hashchange", render);
    refreshAuth().finally(() => render());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
(function () {
  var h = document.querySelector(".site-header");
  if (!h) return;
  var f = function () { h.classList.toggle("is-scrolled", window.scrollY > 4); };
  window.addEventListener("scroll", f, { passive: true }); f();
})();
(function () {
  var box = document.getElementById("ft-social");
  if (!box) return;
  var ICONS = {"facebook": "M14 8.5V6.8c0-.8.2-1.3 1.4-1.3H17V2.6c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.4-4 4.1v1.9H8v3.2h2.6V22H14V11.7h2.6l.4-3.2H14z", "x": "M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.2-8.3L1.9 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z", "instagram": "M12 2.2c3.2 0 3.6 0 4.8.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-3.3-.1-4.8-1.7-4.9-4.9C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8C2.4 3.9 3.9 2.4 7.2 2.3 8.4 2.2 8.8 2.2 12 2.2zm0 4.8a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4zm5.2-9.6a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z", "youtube": "M23 7.2s-.2-1.6-.9-2.3c-.9-.9-1.8-.9-2.3-1C16.6 3.6 12 3.6 12 3.6s-4.6 0-7.8.3c-.4.1-1.4.1-2.3 1C1.2 5.6 1 7.2 1 7.2S.8 9.1.8 11v1.8c0 1.9.2 3.8.2 3.8s.2 1.6.9 2.3c.9.9 2 .9 2.5 1 1.8.2 7.6.2 7.6.2s4.6 0 7.8-.3c.4-.1 1.4-.1 2.3-1 .7-.7.9-2.3.9-2.3s.2-1.9.2-3.8V11c0-1.9-.2-3.8-.2-3.8zM9.7 15.1V8.5l6.2 3.3-6.2 3.3z"};
  var names = [["facebook", "Facebook"], ["x", "X"], ["instagram", "Instagram"], ["youtube", "YouTube"]];
  fetch("/content/social.json?v=social2").then(function (r) { return r.ok ? r.json() : {}; }).then(function (cfg) {
    var html = names.filter(function (n) { return cfg && String(cfg[n[0]] || "").trim(); }).map(function (n) {
      var u = String(cfg[n[0]]).trim().replace(/"/g, "&quot;");
      return '<a class="soc soc-' + n[0] + '" href="' + u + '" target="_blank" rel="noopener" aria-label="' + n[1] + '" title="' + n[1] + '"><svg viewBox="0 0 24 24" width="16" height="16" fill="#fff" aria-hidden="true" focusable="false"><path d="' + ICONS[n[0]] + '"/></svg></a>';
    }).join("");
    if (html) { box.innerHTML = html; box.hidden = false; }
  }).catch(function () {});
})();
