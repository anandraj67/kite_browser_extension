(function () {
  const PREFIX = "kite-ext: ";
  let statusEl = null;

  function setStatus(s) {
    if (statusEl) statusEl.textContent = s;
  }

  function createTopBar() {
    if (document.getElementById("kite-ext-topbar-root")) return;
    const host = document.createElement("div");
    host.id = "kite-ext-topbar-root";
    host.style.all = "initial";
    host.style.position = "fixed";
    host.style.top = "0";
    host.style.left = "0";
    host.style.right = "0";
    host.style.zIndex = "2147483647";
    document.documentElement.prepend(host);

    const shadow = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = `
      .bar { display:flex;align-items:center;gap:8px;padding:8px 12px;background:#666;color:white;font-family:Arial,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,0.2);flex-wrap:wrap;}
      .btn { background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.25);color:white;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px;white-space:nowrap;}
      .btn:hover { background:rgba(255,255,255,0.2); }
      .btn:disabled { opacity:0.5; cursor:default; }
      .btn.price-btn { background:rgba(76,175,80,0.2);border-color:rgba(76,175,80,0.4); }
      .btn.price-btn:hover { background:rgba(76,175,80,0.3); }
      .status { margin-left: auto; font-size: 13px; opacity:0.95; }
    `;

    const bar = document.createElement("div");
    bar.className = "bar";

    const title = document.createElement("div");
    title.textContent = "Kite Extension";
    title.style.fontWeight = "600";

    const loginBtn = document.createElement("button");
    loginBtn.className = "btn";
    loginBtn.textContent = "Login";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn";
    cancelBtn.textContent = "Cancel All Orders";

    const increasePriceBtn = document.createElement("button");
    increasePriceBtn.className = "btn price-btn";
    increasePriceBtn.textContent = "+1 Price";
    increasePriceBtn.title = "Increase all order prices by ₹1";

    const decreasePriceBtn = document.createElement("button");
    decreasePriceBtn.className = "btn price-btn";
    decreasePriceBtn.textContent = "-1 Price";
    decreasePriceBtn.title = "Decrease all order prices by ₹1";

    statusEl = document.createElement("div");
    statusEl.className = "status";
    statusEl.textContent = ""; // Show empty

    bar.appendChild(title);
    bar.appendChild(loginBtn);
    bar.appendChild(cancelBtn);
    bar.appendChild(increasePriceBtn);
    bar.appendChild(decreasePriceBtn);
    bar.appendChild(statusEl);

    shadow.appendChild(style);
    shadow.appendChild(bar);

    setTimeout(() => {
      const height = host.getBoundingClientRect().height || 44;
      document.documentElement.style.marginTop = `${height}px`;
    }, 0);

    loginBtn.addEventListener("click", () => {
      setStatus("Opening Kite login...");
      chrome.runtime.sendMessage({ action: "get_api_key" }, (res) => {
        if (!res || !res.apiKey || !res.redirectUri) {
          setStatus("API key missing");
          return;
        }
        const url = `https://kite.trade/connect/login?api_key=${res.apiKey}&v=3&redirect_uri=${encodeURIComponent(res.redirectUri)}`;
        window.open(url, "_blank");
      });
    });

    cancelBtn.addEventListener("click", () => {
      setStatus("Cancelling orders...");
      chrome.runtime.sendMessage({ action: "cancel_orders" }, (response) => {
        if (!response) return;
        if (response.status === "ok") {
          const failed = (response.details || []).filter(d => !d.ok);
          if (failed.length === 0) setStatus(`✅ Cancelled ${response.cancelled_count} order(s)`);
          else setStatus(`✅ ${response.cancelled_count} cancelled, ${failed.length} failed`);
        } else {
          setStatus("❌ Cancel failed");
        }
      });
    });

    increasePriceBtn.addEventListener("click", () => {
      setStatus("Increasing prices...");
      chrome.runtime.sendMessage({ action: "adjust_prices", adjustment: 1 }, (response) => {
        if (!response) return;
        if (response.status === "ok") {
          const failed = (response.details || []).filter(d => !d.ok);
          if (failed.length === 0) setStatus(`✅ Updated ${response.updated_count} order(s) (+₹1)`);
          else setStatus(`✅ ${response.updated_count} updated, ${failed.length} failed (+₹1)`);
        } else {
          setStatus("❌ Price update failed");
        }
      });
    });

    decreasePriceBtn.addEventListener("click", () => {
      setStatus("Decreasing prices...");
      chrome.runtime.sendMessage({ action: "adjust_prices", adjustment: -1 }, (response) => {
        if (!response) return;
        if (response.status === "ok") {
          const failed = (response.details || []).filter(d => !d.ok);
          if (failed.length === 0) setStatus(`✅ Updated ${response.updated_count} order(s) (-₹1)`);
          else setStatus(`✅ ${response.updated_count} updated, ${failed.length} failed (-₹1)`);
        } else {
          setStatus("❌ Price update failed");
        }
      });
    });
  }

  function handleGitHubRedirectPage() {
    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      if (event.data.request_token) {
        chrome.runtime.sendMessage({ action: "received_token", request_token: event.data.request_token });
      }
    });
    setTimeout(() => {
      window.postMessage({ extensionReady: true }, "*");
    }, 0);
  }

  // Listen for login_success from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "login_success") {
      setStatus("✅ Logged in");
    }
  });

  if (location.hostname.includes("kite.zerodha.com")) {
    createTopBar();
    
    // Check login status on page load/refresh
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: "check_login_status" }, (response) => {
        if (chrome.runtime.lastError) {
          console.log("Could not check login status:", chrome.runtime.lastError.message);
          setStatus("Not logged in");
          return;
        }
        if (response && response.isLoggedIn) {
          setStatus("✅ Logged in");
          console.log("✅ Found existing login in background memory");
        } else {
          setStatus("Not logged in");
          console.log("🔘 No existing login found");
        }
      });
    }, 100); // Small delay to ensure statusEl is created
  }
  if (location.hostname.includes("anandraj67.github.io")) {
    handleGitHubRedirectPage();
  }
})();
