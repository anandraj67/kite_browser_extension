(function () {
  const PREFIX = "kite-ext: ";
  let statusEl = null;
  let orderPriceEl = null;
  let cancelBtn = null;
  let increasePriceBtn = null;
  let decreasePriceBtn = null;
  let pollingInterval = null;
  let currentOrderData = null;

  function setStatus(s) {
    if (statusEl) statusEl.textContent = s;
  }

  function pollOrdersAndPrices() {
    chrome.runtime.sendMessage({ action: "get_orders" }, (response) => {
      if (!response || response.status !== "ok") {
        // Hide price displays if no orders or error
        hideOrderPrices();
        return;
      }

      const orders = response.orders || [];
      if (orders.length === 0) {
        hideOrderPrices();
        return;
      }

      // Get first order data
      const firstOrder = orders[0];
      currentOrderData = firstOrder;

      // Display order price
      if (orderPriceEl) {
        orderPriceEl.textContent = `Order: ₹${firstOrder.price}`;
        
        // Remove existing buy/sell classes
        orderPriceEl.classList.remove('buy', 'sell');
        
        // Add appropriate class based on transaction type
        if (firstOrder.transaction_type === 'BUY') {
          orderPriceEl.classList.add('buy');
        } else if (firstOrder.transaction_type === 'SELL') {
          orderPriceEl.classList.add('sell');
        }
        
        orderPriceEl.classList.remove('hidden');
        
        // Show order control buttons
        if (cancelBtn) cancelBtn.classList.remove('hidden');
        if (increasePriceBtn) increasePriceBtn.classList.remove('hidden');
        if (decreasePriceBtn) decreasePriceBtn.classList.remove('hidden');
      }
    });
  }

  function hideOrderPrices() {
    currentOrderData = null;
    if (orderPriceEl) {
      orderPriceEl.classList.add('hidden');
    }
    // Hide order control buttons
    if (cancelBtn) cancelBtn.classList.add('hidden');
    if (increasePriceBtn) increasePriceBtn.classList.add('hidden');
    if (decreasePriceBtn) decreasePriceBtn.classList.add('hidden');
  }

  function startPolling() {
    // Clear existing interval if any
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }
    
    // Start polling every 1 second
    pollingInterval = setInterval(pollOrdersAndPrices, 1000);
    
    // Initial call
    pollOrdersAndPrices();
  }

  function stopPolling() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
    hideOrderPrices();
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
      .btn.price-btn.decrease { background:rgba(244,67,54,0.2);border-color:rgba(244,67,54,0.4); }
      .btn.price-btn.decrease:hover { background:rgba(244,67,54,0.3); }
      .price-display { background:rgba(33,150,243,0.15);border:1px solid rgba(33,150,243,0.3);color:white;padding:6px 10px;border-radius:6px;font-size:12px;white-space:nowrap;min-width:80px;text-align:center; }
      .price-display.order-price { background:rgba(255,193,7,0.15);border-color:rgba(255,193,7,0.3); }
      .price-display.order-price.buy { background:rgba(76,175,80,0.15);border-color:rgba(76,175,80,0.3); }
      .price-display.order-price.sell { background:rgba(244,67,54,0.15);border-color:rgba(244,67,54,0.3); }
      .price-display.hidden { display: none; }
      .btn.hidden { display: none; }
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

    cancelBtn = document.createElement("button");
    cancelBtn.className = "btn hidden";
    cancelBtn.textContent = "Cancel All Orders";

    increasePriceBtn = document.createElement("button");
    increasePriceBtn.className = "btn price-btn hidden";
    increasePriceBtn.textContent = "+1 Price";
    increasePriceBtn.title = "Increase all order prices by ₹1";

    decreasePriceBtn = document.createElement("button");
    decreasePriceBtn.className = "btn price-btn decrease hidden";
    decreasePriceBtn.textContent = "-1 Price";
    decreasePriceBtn.title = "Decrease all order prices by ₹1";

    orderPriceEl = document.createElement("div");
    orderPriceEl.className = "price-display order-price hidden";
    orderPriceEl.title = "Current order price";

    statusEl = document.createElement("div");
    statusEl.className = "status";
    statusEl.textContent = ""; // Show empty

    bar.appendChild(title);
    bar.appendChild(loginBtn);
    bar.appendChild(cancelBtn);
    bar.appendChild(increasePriceBtn);
    bar.appendChild(decreasePriceBtn);
    bar.appendChild(orderPriceEl);
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
        if (chrome.runtime.lastError) {
          setStatus("Extension error");
          return;
        }
        if (!res || !res.apiKey || !res.redirectUri) {
          setStatus("API key missing");
          return;
        }
        const url = `https://kite.trade/connect/login?api_key=${res.apiKey}&v=3&redirect_uri=${encodeURIComponent(res.redirectUri)}`;
        
        const popup = window.open(url, "_blank");
        if (popup) {
          setStatus("Login window opened");
          
          // Check if popup was closed without completing login
          const checkClosed = setInterval(() => {
            if (popup.closed) {
              clearInterval(checkClosed);
              // Check login status after popup closes
              setTimeout(() => {
                chrome.runtime.sendMessage({ action: "check_login_status" }, (response) => {
                  if (response && response.isLoggedIn) {
                    setStatus("✅ Logged in");
                  } else {
                    setStatus("Login cancelled");
                  }
                });
              }, 1000);
            }
          }, 1000);
        } else {
          setStatus("Popup blocked");
        }
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
          // Refresh prices after successful update
          setTimeout(pollOrdersAndPrices, 500);
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
          // Refresh prices after successful update
          setTimeout(pollOrdersAndPrices, 500);
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
      startPolling(); // Start polling when logged in
    }
  });

  if (location.hostname.includes("kite.zerodha.com")) {
    createTopBar();
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      stopPolling();
    });
    
    // Check login status on page load/refresh
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: "check_login_status" }, (response) => {
        if (chrome.runtime.lastError) {
          setStatus("Not logged in");
          return;
        }
        if (response && response.isLoggedIn) {
          setStatus("✅ Logged in");
          startPolling(); // Start polling if already logged in
        } else {
          setStatus("Not logged in");
          stopPolling(); // Stop polling if not logged in
        }
      });
    }, 100); // Small delay to ensure statusEl is created
  }
  if (location.hostname.includes("anandraj67.github.io")) {
    handleGitHubRedirectPage();
  }
})();
