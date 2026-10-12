/* XueAiOK Shop — SPA router, cart, checkout */
(function () {
  "use strict";

  const DATA = window.XUEAIOK_DATA;
  const CART_KEY = "xueaiok_cart_v1";
  const ORDER_KEY = "xueaiok_last_order_v1";

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  /* —— Helpers —— */
  function money(n) {
    return "HK$" + Number(n).toLocaleString("en-HK", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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
    return `background: linear-gradient(145deg, ${product.color}ee, ${product.color}99);`;
  }

  /* —— Cart (localStorage) —— */
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

  function addToCart(productId, optionId, qty) {
    const product = getProduct(productId);
    const option = product?.options.find((o) => o.id === optionId);
    if (!product || !option) return;

    const cart = loadCart();
    const key = productId + "::" + optionId;
    const existing = cart.find((i) => i.key === key);
    if (existing) {
      existing.qty += qty;
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
        qty,
      });
    }
    saveCart(cart);
    toast(`已加入購物車：${product.name}（${option.label}）`);
  }

  function updateQty(key, qty) {
    let cart = loadCart();
    const item = cart.find((i) => i.key === key);
    if (!item) return;
    item.qty = Math.max(1, Math.min(99, qty));
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

  /* —— Toast —— */
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

  /* —— Router —— */
  function parseHash() {
    const raw = (location.hash || "#/").replace(/^#/, "") || "/";
    const parts = raw.split("/").filter(Boolean);
    // #/  #/catalog  #/catalog/giftcard  #/product/mycard-hk  #/cart  #/checkout  #/order
    if (parts.length === 0) return { page: "home" };
    if (parts[0] === "catalog") return { page: "catalog", category: parts[1] || null };
    if (parts[0] === "product" && parts[1]) return { page: "product", id: parts[1] };
    if (parts[0] === "cart") return { page: "cart" };
    if (parts[0] === "checkout") return { page: "checkout" };
    if (parts[0] === "order") return { page: "order" };
    return { page: "home" };
  }

  function navigate(path) {
    location.hash = path.startsWith("#") ? path : "#" + path;
  }

  function setActiveNav(page) {
    $$(".nav-links a, .mobile-nav a").forEach((a) => {
      const href = a.getAttribute("href") || "";
      let active = false;
      if (page === "home" && (href === "#/" || href === "#")) active = true;
      if (page === "catalog" && href.includes("catalog")) active = true;
      if ((page === "cart" || page === "checkout") && href.includes("cart")) active = true;
      a.classList.toggle("active", active);
    });
  }

  /* —— Views —— */
  function productCardHTML(p) {
    const cheapest = Math.min(...p.options.map((o) => o.sale));
    const cheapestList = p.options.find((o) => o.sale === cheapest)?.list;
    const cat = getCategory(p.category);
    return `
      <article class="product-card">
        <a href="#/product/${p.id}">
          <div class="product-thumb" style="${thumbStyle(p)}">
            ${p.badge ? `<span class="product-badge">${p.badge}</span>` : ""}
            <span>${productInitials(p.name)}</span>
          </div>
        </a>
        <div class="product-body">
          <div class="product-cat">${cat ? cat.name : ""}</div>
          <h3><a href="#/product/${p.id}">${p.name}</a></h3>
          <div class="product-price">
            <span class="price-sale">起 ${money(cheapest)}</span>
            ${cheapestList > cheapest ? `<span class="price-list">${money(cheapestList)}</span>` : ""}
          </div>
          <a class="product-cta" href="#/product/${p.id}">選面額</a>
        </div>
      </article>`;
  }

  function renderHome() {
    const featured = DATA.products.filter((p) => p.hot).concat(
      DATA.products.filter((p) => !p.hot)
    ).slice(0, 8);

    return `
      <section class="hero">
        <div class="container">
          <div class="hero-card">
            <div class="hero-eyebrow">✨ 香港玩家首選 · 演示商城</div>
            <h1>${DATA.brand.tagline}</h1>
            <p>點卡禮品、手遊直充，一次買齊。簡潔介面、透明價錢、即時下單。</p>
            <div class="hero-actions">
              <a class="btn btn-primary" href="#/catalog">瀏覽全部商品</a>
              <a class="btn btn-ghost" href="#/catalog/mobile">手遊直充</a>
            </div>
          </div>
        </div>
      </section>

      <div class="container">
        <div class="trust-strip">
          <div class="trust-item">
            <div class="trust-icon">⚡</div>
            <div><strong>秒充發貨</strong><span>付款後快速處理</span></div>
          </div>
          <div class="trust-item">
            <div class="trust-icon">🔒</div>
            <div><strong>安全可靠</strong><span>加密結帳流程</span></div>
          </div>
          <div class="trust-item">
            <div class="trust-icon">💬</div>
            <div><strong>專人客服</strong><span>繁中支援協助</span></div>
          </div>
        </div>

        <div class="section-head">
          <h2>商品分類</h2>
        </div>
        <div class="chips">
          <a class="chip" href="#/catalog">全部</a>
          ${DATA.categories
            .map(
              (c) =>
                `<a class="chip" href="#/catalog/${c.id}">${c.icon} ${c.name}</a>`
            )
            .join("")}
        </div>

        <div class="section-head">
          <h2>精選商品</h2>
          <a href="#/catalog">查看全部 →</a>
        </div>
        <div class="product-grid">
          ${featured.map(productCardHTML).join("")}
        </div>
      </div>`;
  }

  function renderCatalog(categoryId) {
    const cat = categoryId ? getCategory(categoryId) : null;
    const list = categoryId
      ? DATA.products.filter((p) => p.category === categoryId)
      : DATA.products;

    return `
      <div class="container">
        <div class="page-banner">
          <div class="breadcrumb">
            <a href="#/">首頁</a> / <span>${cat ? cat.name : "全部商品"}</span>
          </div>
          <h1>${cat ? cat.icon + " " + cat.name : "全部商品"}</h1>
          <p>共 ${list.length} 件商品 · 價錢以港幣顯示</p>
        </div>
        <div class="chips">
          <a class="chip ${!categoryId ? "active" : ""}" href="#/catalog">全部</a>
          ${DATA.categories
            .map(
              (c) =>
                `<a class="chip ${categoryId === c.id ? "active" : ""}" href="#/catalog/${c.id}">${c.icon} ${c.name}</a>`
            )
            .join("")}
        </div>
        <div class="product-grid">
          ${list.map(productCardHTML).join("")}
        </div>
      </div>`;
  }

  function renderProduct(id) {
    const p = getProduct(id);
    if (!p) {
      return `<div class="container"><div class="empty-state"><div class="emoji">😕</div><h2>找不到商品</h2><a class="btn btn-accent" href="#/catalog">返回目錄</a></div></div>`;
    }
    const cat = getCategory(p.category);
    const defaultOpt = p.options[0];

    return `
      <div class="container">
        <div class="page-banner" style="padding-bottom:0">
          <div class="breadcrumb">
            <a href="#/">首頁</a> /
            <a href="#/catalog/${p.category}">${cat ? cat.name : "商品"}</a> /
            <span>${p.name}</span>
          </div>
        </div>
        <div class="detail-layout" data-product-id="${p.id}">
          <div class="detail-media">
            <div class="detail-thumb" style="${thumbStyle(p)}">
              ${p.badge ? `<span class="product-badge" style="position:absolute;top:1rem;left:1rem">${p.badge}</span>` : ""}
              ${productInitials(p.name)}
            </div>
          </div>
          <div class="detail-info">
            <div class="product-cat" style="margin-bottom:0.35rem">${cat ? cat.name : ""}</div>
            <h1>${p.name}</h1>
            <p class="detail-desc">${p.desc}${p.needsUid ? " 結帳時請填寫遊戲 UID／帳號。" : ""}</p>

            <div class="option-label">選擇面額</div>
            <div class="option-grid" id="option-grid">
              ${p.options
                .map(
                  (o, i) => `
                <button type="button" class="option-card ${i === 0 ? "selected" : ""}" data-option-id="${o.id}" data-sale="${o.sale}" data-list="${o.list}">
                  <span class="opt-label">${o.label}</span>
                  <span class="opt-price">${money(o.sale)}</span>
                  ${o.list > o.sale ? `<span class="opt-list">${money(o.list)}</span>` : ""}
                </button>`
                )
                .join("")}
            </div>

            <div class="qty-row">
              <label>數量</label>
              <div class="qty-control">
                <button type="button" id="qty-minus" aria-label="減少">−</button>
                <input type="number" id="qty-input" value="1" min="1" max="99" readonly />
                <button type="button" id="qty-plus" aria-label="增加">+</button>
              </div>
            </div>

            <div class="detail-total">
              <span class="label">小計</span>
              <span class="amount" id="detail-total">${money(defaultOpt.sale)}</span>
            </div>

            <div class="detail-actions">
              <button type="button" class="btn btn-accent btn-lg" id="add-cart-btn">加入購物車</button>
              <a class="btn btn-outline btn-lg" href="#/cart">查看購物車</a>
            </div>
          </div>
        </div>
      </div>`;
  }

  function bindProductPage() {
    const root = $("[data-product-id]");
    if (!root) return;
    const productId = root.dataset.productId;
    let selectedId = $(".option-card.selected")?.dataset.optionId;
    let qty = 1;

    function refreshTotal() {
      const opt = getProduct(productId)?.options.find((o) => o.id === selectedId);
      if (!opt) return;
      $("#detail-total").textContent = money(opt.sale * qty);
    }

    $$(".option-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".option-card").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        selectedId = btn.dataset.optionId;
        refreshTotal();
      });
    });

    $("#qty-minus")?.addEventListener("click", () => {
      qty = Math.max(1, qty - 1);
      $("#qty-input").value = qty;
      refreshTotal();
    });
    $("#qty-plus")?.addEventListener("click", () => {
      qty = Math.min(99, qty + 1);
      $("#qty-input").value = qty;
      refreshTotal();
    });
    $("#add-cart-btn")?.addEventListener("click", () => {
      if (!selectedId) return;
      addToCart(productId, selectedId, qty);
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
            <p>去挑幾件點卡或直充吧</p>
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
                  <div class="meta">${i.optionLabel}</div>
                  <div class="qty-control">
                    <button type="button" class="qty-dec" aria-label="減少">−</button>
                    <input type="number" value="${i.qty}" min="1" max="99" readonly />
                    <button type="button" class="qty-inc" aria-label="增加">+</button>
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
            <div class="summary-row"><span>運費</span><span>免費（虛擬商品）</span></div>
            <div class="summary-row total"><span>合計</span><span>${money(cartSubtotal())}</span></div>
            <a class="btn btn-accent btn-block btn-lg" href="#/checkout">前往結帳</a>
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
        if (item) {
          updateQty(key, item.qty - 1);
          render();
        }
      });
      row.querySelector(".qty-inc")?.addEventListener("click", () => {
        const item = loadCart().find((i) => i.key === key);
        if (item) {
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
    const needsUid = cart.some((i) => i.needsUid);

    return `
      <div class="container">
        <div class="page-banner">
          <div class="breadcrumb"><a href="#/">首頁</a> / <a href="#/cart">購物車</a> / <span>結帳</span></div>
          <h1>結帳</h1>
          <p>演示模式 · 不會真正扣款</p>
        </div>
        <form class="checkout-layout" id="checkout-form">
          <div class="form-card">
            <h2>聯絡與帳號資料</h2>
            <div class="form-group">
              <label>電郵 <span class="req">*</span></label>
              <input type="email" name="email" required placeholder="you@example.com" autocomplete="email" />
              <div class="form-hint">訂單確認與卡密將發至此電郵（演示）</div>
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
                <input type="radio" name="payment" value="fps" checked />
                <div><strong>轉數快 FPS</strong><span>香港本地轉帳 · 演示</span></div>
              </label>
              <label class="pay-option">
                <input type="radio" name="payment" value="payme" />
                <div><strong>PayMe</strong><span>手機一掃即付 · 演示</span></div>
              </label>
              <label class="pay-option">
                <input type="radio" name="payment" value="card" />
                <div><strong>信用卡</strong><span>Visa / Mastercard · 演示</span></div>
              </label>
            </div>
            <div class="demo-note">⚠️ 此為演示結帳：按下「提交訂單」只會在本機產生訂單編號，不會向任何支付渠道扣款。</div>
          </div>

          <aside class="order-side">
            <h2>訂單內容</h2>
            ${cart
              .map(
                (i) => `
              <div class="order-line">
                <div>
                  <div class="name">${i.name}</div>
                  <div class="sub">${i.optionLabel} × ${i.qty}</div>
                </div>
                <div>${money(i.sale * i.qty)}</div>
              </div>`
              )
              .join("")}
            <div class="summary-row total" style="margin-top:1rem">
              <span>合計</span><span>${money(cartSubtotal())}</span>
            </div>
            <button type="submit" class="btn btn-accent btn-block btn-lg">提交訂單</button>
            <a class="btn btn-outline btn-block" href="#/cart" style="margin-top:0.5rem">返回購物車</a>
          </aside>
        </form>
      </div>`;
  }

  function bindCheckoutPage() {
    $$(".pay-option").forEach((label) => {
      label.addEventListener("click", () => {
        $$(".pay-option").forEach((l) => l.classList.remove("selected"));
        label.classList.add("selected");
        label.querySelector("input").checked = true;
      });
    });

    $("#checkout-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      const email = form.email.value.trim();
      const uid = form.uid.value.trim();
      const note = form.note.value.trim();
      const payment = form.payment.value;
      const cart = loadCart();
      if (!cart.length) {
        navigate("/cart");
        return;
      }

      const payLabels = { fps: "轉數快 FPS", payme: "PayMe", card: "信用卡" };
      const orderId =
        "XA" +
        Date.now().toString(36).toUpperCase() +
        Math.random().toString(36).slice(2, 6).toUpperCase();

      const order = {
        id: orderId,
        email,
        uid,
        note,
        payment: payLabels[payment] || payment,
        items: cart,
        total: cartSubtotal(),
        createdAt: new Date().toISOString(),
      };

      localStorage.setItem(ORDER_KEY, JSON.stringify(order));
      clearCart();
      navigate("/order");
    });
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

    const when = new Date(order.createdAt).toLocaleString("zh-HK", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    return `
      <div class="container">
        <div class="confirm-card">
          <div class="confirm-icon">✓</div>
          <h1>訂單已建立</h1>
          <p>感謝你的購買（演示）。我們不會真正扣款或發貨。</p>
          <div class="order-id-box">
            <div class="label">訂單編號</div>
            <div class="id">${order.id}</div>
          </div>
          <div class="confirm-details">
            <div class="row"><span>電郵</span><span>${escapeHtml(order.email)}</span></div>
            ${order.uid ? `<div class="row"><span>遊戲 UID</span><span>${escapeHtml(order.uid)}</span></div>` : ""}
            <div class="row"><span>付款方式</span><span>${escapeHtml(order.payment)}</span></div>
            <div class="row"><span>下單時間</span><span>${when}（香港）</span></div>
            <div class="row"><span>商品數</span><span>${order.items.reduce((s, i) => s + i.qty, 0)} 件</span></div>
            <div class="row"><span>合計</span><span>${money(order.total)}</span></div>
          </div>
          <div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap">
            <a class="btn btn-accent" href="#/catalog">繼續購物</a>
            <a class="btn btn-outline" href="#/">返回首頁</a>
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

  /* —— Render —— */
  function render() {
    const route = parseHash();
    setActiveNav(route.page);
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
      default:
        html = renderHome();
    }
    app.innerHTML = html;
    updateCartBadge();
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });

    if (route.page === "product") bindProductPage();
    if (route.page === "cart") bindCartPage();
    if (route.page === "checkout") bindCheckoutPage();

    // close mobile nav
    $(".mobile-nav")?.classList.remove("open");
  }

  function init() {
    updateCartBadge();
    $("#menu-toggle")?.addEventListener("click", () => {
      $(".mobile-nav")?.classList.toggle("open");
    });
    window.addEventListener("hashchange", render);
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
