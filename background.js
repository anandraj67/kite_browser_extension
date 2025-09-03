// background.js
importScripts('config.js');
importScripts('crypto-js.js');

let accessToken = null;

// Load access token from storage when service worker starts
chrome.storage.session.get(['accessToken'], (result) => {
  if (result.accessToken) {
    accessToken = result.accessToken;
    console.log("🔄 Restored access token from session storage");
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("🔵 Background received message:", msg.action, "from:", sender.tab?.url || sender.url);
  
  if (msg.action === "get_api_key") {
    console.log("✅ Sending API key response");
    sendResponse({ apiKey, redirectUri });
  }

  if (msg.action === "check_login_status") {
    // Always check session storage first in case service worker restarted
    chrome.storage.session.get(['accessToken'], (result) => {
      if (result.accessToken && !accessToken) {
        accessToken = result.accessToken;
        console.log("� Restored access token from session storage for status check");
      }
      console.log("�🔍 Checking login status, accessToken exists:", !!accessToken);
      sendResponse({ isLoggedIn: !!accessToken });
    });
    return true; // Required for async response
  }

  if (msg.action === "received_token") {
    const requestToken = msg.request_token;
    console.log("🟡 Starting token exchange with:", requestToken);
    console.log("🔧 Sender info:", {
      tabId: sender.tab?.id,
      url: sender.tab?.url,
      frameId: sender.frameId
    });

    const checksum = CryptoJS.SHA256(apiKey + requestToken + apiSecret).toString();
    console.log("🔐 Generated checksum:", checksum);
    console.log("🔑 Using API Key:", apiKey);
    
    const requestBody = new URLSearchParams({
      api_key: apiKey,
      request_token: requestToken,
      checksum: checksum
    });
    
    console.log("📤 Request body:", requestBody.toString());

    fetch("https://api.kite.trade/session/token", {
      method: "POST",
      headers: {
        "X-Kite-Version": "3",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: requestBody
    })
      .then(res => {
        console.log("🌐 Kite API response status:", res.status);
        return res.json();
      })
      .then(data => {
        console.log("📦 Kite API response data:", data);
        if (data.status === "success") {
          accessToken = data.data.access_token;
          // Store in session storage to persist across service worker restarts
          chrome.storage.session.set({ accessToken }, () => {
            console.log("✅ Access token saved to session storage");
          });
          console.log("✅ Access token saved successfully");

          // Notify kite.zerodha.com tab about success
          chrome.tabs.query({ url: "*://kite.zerodha.com/*" }, (tabs) => {
            for (const tab of tabs) {
              chrome.tabs.sendMessage(tab.id, { action: "login_success" }, (response) => {
                if (chrome.runtime.lastError) {
                  // Ignore connection errors - tab might be closed or navigated away
                  console.log("Tab connection error (ignored):", chrome.runtime.lastError.message);
                }
              });
            }
          });

        } else {
          console.error("❌ Token exchange failed:", data);
        }
      })
      .catch(err => {
        console.error("💥 Error exchanging token:", err);
        console.error("💥 Error details:", {
          message: err.message,
          stack: err.stack
        });
      });

    console.log("🔄 Token exchange initiated, returning false");
    // Don't return true - we're not sending a response back to avoid connection errors
    return false;
  }

  if (msg.action === "cancel_orders") {
    console.log("🔴 Cancel orders requested. Current accessToken:", accessToken ? "EXISTS" : "NULL");
    
    // Check session storage first in case service worker restarted
    chrome.storage.session.get(['accessToken'], (result) => {
      if (result.accessToken && !accessToken) {
        accessToken = result.accessToken;
        console.log("🔄 Restored access token from session storage for cancel operation");
      }
      
      if (!accessToken) {
        console.log("❌ No access token - returning error");
        sendResponse({ status: "error", message: "Not logged in" });
        return;
      }
      
      console.log("✅ Access token found - proceeding with cancel");
      console.log("🔄 Fetching orders from Kite API...");
      fetch("https://api.kite.trade/orders", {
        method: "GET",
        headers: {
          Authorization: `token ${apiKey}:${accessToken}`,
          "X-Kite-Version": "3"
        }
      })
        .then(res => {
          console.log("📡 GET orders response status:", res.status);
          return res.json();
        })
        .then(data => {
          console.log("📦 GET orders response data:", data);
          if (data.status !== "success") {
            console.log("❌ GET orders failed:", data);
            sendResponse({ status: "error", details: data });
            return;
          }
          const openOrders = data.data.filter(o => o.status === "OPEN" || o.status === "TRIGGER PENDING");
          console.log("🎯 Found open orders:", openOrders.length);
          if (openOrders.length === 0) {
            console.log("✅ No open orders to cancel");
            sendResponse({ status: "ok", cancelled_count: 0, details: [] });
            return;
          }
          console.log("🔄 Starting cancel operations for", openOrders.length, "orders");
          Promise.all(
            openOrders.map(order => {
              console.log("🗑️ Cancelling order:", order.order_id, "variety:", order.variety);
              return fetch(`https://api.kite.trade/orders/${order.variety}/${order.order_id}`, {
                method: "DELETE",
                headers: {
                  Authorization: `token ${apiKey}:${accessToken}`,
                  "X-Kite-Version": "3"
                }
              }).then(res => {
                console.log("📡 DELETE order", order.order_id, "response status:", res.status);
                return res.json().then(body => {
                  console.log("📦 DELETE order", order.order_id, "response body:", body);
                  return {
                    ok: res.ok,
                    order_id: order.order_id,
                    variety: order.variety,
                    exchange: order.exchange,
                    http_status: res.status,
                    body: JSON.stringify(body)
                  };
                });
              });
            })
          ).then(results => {
            const cancelledCount = results.filter(r => r.ok).length;
            console.log("✅ Cancel operation complete. Cancelled:", cancelledCount, "Total:", results.length);
            console.log("📊 Results details:", results);
            sendResponse({ status: "ok", cancelled_count: cancelledCount, details: results });
          }).catch(promiseErr => {
            console.log("❌ Promise.all error:", promiseErr);
            sendResponse({ status: "error", error: promiseErr.toString() });
          });
        })
        .catch(err => {
          console.log("❌ GET orders fetch error:", err);
          sendResponse({ status: "error", error: err.toString() });
        });
    });
    return true;
  }

  if (msg.action === "adjust_prices") {
    const adjustment = msg.adjustment; // +1 or -1
    console.log(`🔧 Price adjustment requested: ${adjustment > 0 ? '+' : ''}${adjustment}`);
    console.log("🔴 Current accessToken:", accessToken ? "EXISTS" : "NULL");
    
    // Check session storage first in case service worker restarted
    chrome.storage.session.get(['accessToken'], (result) => {
      if (result.accessToken && !accessToken) {
        accessToken = result.accessToken;
        console.log("🔄 Restored access token from session storage for price adjustment");
      }
      
      if (!accessToken) {
        console.log("❌ No access token - returning error");
        sendResponse({ status: "error", message: "Not logged in" });
        return;
      }
      
      console.log("✅ Access token found - proceeding with price adjustment");
      console.log("🔄 Fetching orders from Kite API...");
      fetch("https://api.kite.trade/orders", {
        method: "GET",
        headers: {
          Authorization: `token ${apiKey}:${accessToken}`,
          "X-Kite-Version": "3"
        }
      })
        .then(res => {
          console.log("📡 GET orders response status:", res.status);
          return res.json();
        })
        .then(data => {
          console.log("📦 GET orders response data:", data);
          if (data.status !== "success") {
            console.log("❌ GET orders failed:", data);
            sendResponse({ status: "error", details: data });
            return;
          }
          
          // Filter orders that can be modified (OPEN orders with limit prices)
          const modifiableOrders = data.data.filter(o => 
            (o.status === "OPEN" || o.status === "TRIGGER PENDING") && 
            o.order_type === "LIMIT" && 
            o.price > 0
          );
          
          console.log("🎯 Found modifiable orders:", modifiableOrders.length);
          if (modifiableOrders.length === 0) {
            console.log("✅ No modifiable orders found");
            sendResponse({ status: "ok", updated_count: 0, details: [] });
            return;
          }
          
          console.log("🔄 Starting price modification for", modifiableOrders.length, "orders");
          Promise.all(
            modifiableOrders.map(order => {
              const newPrice = parseFloat(order.price) + adjustment;
              if (newPrice <= 0) {
                console.log("⚠️ Skipping order", order.order_id, "- would result in non-positive price:", newPrice);
                return Promise.resolve({
                  ok: false,
                  order_id: order.order_id,
                  variety: order.variety,
                  exchange: order.exchange,
                  error: "Would result in non-positive price",
                  body: JSON.stringify({ error: "Price would be <= 0" })
                });
              }
              
              console.log("📝 Modifying order:", order.order_id, "from ₹" + order.price, "to ₹" + newPrice.toFixed(2));
              
              const requestBody = new URLSearchParams({
                quantity: order.quantity,
                price: newPrice.toFixed(2),
                order_type: order.order_type,
                validity: order.validity,
                disclosed_quantity: order.disclosed_quantity || 0,
                trigger_price: order.trigger_price || 0
              });
              
              return fetch(`https://api.kite.trade/orders/${order.variety}/${order.order_id}`, {
                method: "PUT",
                headers: {
                  Authorization: `token ${apiKey}:${accessToken}`,
                  "X-Kite-Version": "3",
                  "Content-Type": "application/x-www-form-urlencoded"
                },
                body: requestBody
              }).then(res => {
                console.log("📡 PUT order", order.order_id, "response status:", res.status);
                return res.json().then(body => {
                  console.log("📦 PUT order", order.order_id, "response body:", body);
                  return {
                    ok: res.ok,
                    order_id: order.order_id,
                    variety: order.variety,
                    exchange: order.exchange,
                    old_price: order.price,
                    new_price: newPrice.toFixed(2),
                    http_status: res.status,
                    body: JSON.stringify(body)
                  };
                });
              });
            })
          ).then(results => {
            const updatedCount = results.filter(r => r.ok).length;
            console.log("✅ Price adjustment complete. Updated:", updatedCount, "Total:", results.length);
            console.log("📊 Results details:", results);
            sendResponse({ status: "ok", updated_count: updatedCount, details: results });
          }).catch(promiseErr => {
            console.log("❌ Promise.all error:", promiseErr);
            sendResponse({ status: "error", error: promiseErr.toString() });
          });
        })
        .catch(err => {
          console.log("❌ GET orders fetch error:", err);
          sendResponse({ status: "error", error: err.toString() });
        });
    });
    return true;
  }
  
  console.log("⚪ Message handler complete for action:", msg.action);
});
