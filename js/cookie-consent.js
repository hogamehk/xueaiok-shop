/* Cookie consent banner — Traditional Chinese */
(function () {
  var KEY = "cookie_consent";
  try {
    if (localStorage.getItem(KEY) === "1") return;
  } catch (e) {}

  function accept() {
    try {
      localStorage.setItem(KEY, "1");
    } catch (e) {}
    var el = document.getElementById("cookie-banner");
    if (el) el.remove();
    document.documentElement.classList.remove("has-cookie-banner");
  }

  function show() {
    if (document.getElementById("cookie-banner")) return;
    document.documentElement.classList.add("has-cookie-banner");
    var bar = document.createElement("div");
    bar.id = "cookie-banner";
    bar.className = "cookie-banner";
    bar.setAttribute("role", "dialog");
    bar.setAttribute("aria-live", "polite");
    bar.setAttribute("aria-label", "Cookie 提示");
    bar.innerHTML =
      '<div class="cookie-banner-inner">' +
      "<p>本網站使用 Cookie。繼續瀏覽即表示同意。詳情請見" +
      '<a href="/privacy.html">私隱政策</a>。</p>' +
      '<button type="button" class="btn btn-accent btn-sm cookie-banner-ok">知道了</button>' +
      "</div>";
    bar.querySelector(".cookie-banner-ok").addEventListener("click", accept);
    document.body.appendChild(bar);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", show);
  } else {
    show();
  }
})();
