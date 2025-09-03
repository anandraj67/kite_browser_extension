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
  if (msg.action === "get_api_key") {
    sendResponse({ apiKey, redirectUri });
  }

  if (msg.action === "check_login_status") {
    // Always check session storage first in case service worker restarted
    chrome.storage.session.get(['accessToken'], (result) => {
      if (result.accessToken && !accessToken) {
        accessToken = result.accessToken;
      }
      sendResponse({ isLoggedIn: !!accessToken });
    });
    return true; // Required for async response
  }

  if (msg.action === "received_token") {
    const requestToken = msg.request_token;
    const checksum = CryptoJS.SHA256(apiKey + requestToken + apiSecret).toString();
    
    const requestBody = new URLSearchParams({
      api_key: apiKey,
      request_token: requestToken,
      checksum: checksum
    });

    fetch("https://api.kite.trade/session/token", {
      method: "POST",
      headers: {
        "X-Kite-Version": "3",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: requestBody
    })
      .then(res => res.json())
      .then(data => {
        if (data.status === "success") {
          accessToken = data.data.access_token;
          // Store in session storage to persist across service worker restarts
          chrome.storage.session.set({ accessToken });

          // Notify kite.zerodha.com tab about success
          chrome.tabs.query({ url: "*://kite.zerodha.com/*" }, (tabs) => {
            for (const tab of tabs) {
              chrome.tabs.sendMessage(tab.id, { action: "login_success" }, (response) => {
                if (chrome.runtime.lastError) {
                  // Ignore connection errors - tab might be closed or navigated away
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
      });

    console.log("🔄 Token exchange initiated, returning false");
    // Don't return true - we're not sending a response back to avoid connection errors
    return false;
  }

  if (msg.action === "cancel_orders") {
    // Check session storage first in case service worker restarted
    chrome.storage.session.get(['accessToken'], (result) => {
      if (result.accessToken && !accessToken) {
        accessToken = result.accessToken;
      }
      
      if (!accessToken) {
        sendResponse({ status: "error", message: "Not logged in" });
        return;
      }
      fetch("https://api.kite.trade/orders", {
        method: "GET",
        headers: {
          Authorization: `token ${apiKey}:${accessToken}`,
          "X-Kite-Version": "3"
        }
      })
        .then(res => res.json())
        .then(data => {
          if (data.status !== "success") {
            sendResponse({ status: "error", details: data });
            return;
          }
          const openOrders = data.data.filter(o => 
            o.status === "OPEN" || 
            o.status === "TRIGGER PENDING"
          );
          if (openOrders.length === 0) {
            sendResponse({ status: "ok", cancelled_count: 0, details: [] });
            return;
          }
          Promise.all(
            openOrders.map(order => {
              return fetch(`https://api.kite.trade/orders/${order.variety}/${order.order_id}`, {
                method: "DELETE",
                headers: {
                  Authorization: `token ${apiKey}:${accessToken}`,
                  "X-Kite-Version": "3"
                }
              }).then(res => {
                return res.json().then(body => {
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
            sendResponse({ status: "ok", cancelled_count: cancelledCount, details: results });
          }).catch(promiseErr => {
            sendResponse({ status: "error", error: promiseErr.toString() });
          });
        })
        .catch(err => {
          sendResponse({ status: "error", error: err.toString() });
        });
    });
    return true;
  }

  if (msg.action === "adjust_prices") {
    const adjustment = msg.adjustment; // +1 or -1
    
    // Check session storage first in case service worker restarted
    chrome.storage.session.get(['accessToken'], (result) => {
      if (result.accessToken && !accessToken) {
        accessToken = result.accessToken;
      }
      
      if (!accessToken) {
        sendResponse({ status: "error", message: "Not logged in" });
        return;
      }
      fetch("https://api.kite.trade/orders", {
        method: "GET",
        headers: {
          Authorization: `token ${apiKey}:${accessToken}`,
          "X-Kite-Version": "3"
        }
      })
        .then(res => res.json())
        .then(data => {
          if (data.status !== "success") {
            sendResponse({ status: "error", details: data });
            return;
          }
          
          // Filter orders that can be modified (OPEN orders with limit prices)
          const modifiableOrders = data.data.filter(o => 
            (o.status === "OPEN" || o.status === "TRIGGER PENDING") && 
            o.order_type === "LIMIT" && 
            o.price > 0
          );
          
          if (modifiableOrders.length === 0) {
            sendResponse({ status: "ok", updated_count: 0, details: [] });
            return;
          }
          Promise.all(
            modifiableOrders.map(order => {
              const newPrice = parseFloat(order.price) + adjustment;
              if (newPrice <= 0) {
                return Promise.resolve({
                  ok: false,
                  order_id: order.order_id,
                  variety: order.variety,
                  exchange: order.exchange,
                  error: "Would result in non-positive price",
                  body: JSON.stringify({ error: "Price would be <= 0" })
                });
              }
              
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
                return res.json().then(body => {
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
            sendResponse({ status: "ok", updated_count: updatedCount, details: results });
          }).catch(promiseErr => {
            sendResponse({ status: "error", error: promiseErr.toString() });
          });
        })
        .catch(err => {
          sendResponse({ status: "error", error: err.toString() });
        });
    });
    return true;
  }

  if (msg.action === "get_orders") {
    // Check session storage first in case service worker restarted
    chrome.storage.session.get(['accessToken'], (result) => {
      if (result.accessToken && !accessToken) {
        accessToken = result.accessToken;
      }
      
      if (!accessToken) {
        sendResponse({ status: "error", message: "Not logged in" });
        return;
      }
      
      fetch("https://api.kite.trade/orders", {
        method: "GET",
        headers: {
          Authorization: `token ${apiKey}:${accessToken}`,
          "X-Kite-Version": "3"
        }
      })
        .then(res => res.json())
        .then(data => {
          if (data.status !== "success") {
            sendResponse({ status: "error", details: data });
            return;
          }
          const openOrders = data.data.filter(o => 
            o.status === "OPEN" || 
            o.status === "TRIGGER PENDING"
          );
          sendResponse({ status: "ok", orders: openOrders });
        })
        .catch(err => {
          sendResponse({ status: "error", error: err.toString() });
        });
    });
    return true;
  }
});
