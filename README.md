# Kite In-Page Controller

A Chrome browser extension that injects a control bar into Kite (Zerodha) trading platform with enhanced order management features.

## Features

### Core Functionality
- **Login Integration** - OAuth authentication with Kite API
- **Order Management** - Cancel all open orders with one click
- **Price Adjustment** - Increase/decrease all order prices by ₹1
- **Real-time Monitoring** - Live order price display

### Live Order Display
- **Order Price** - Shows the price of your first active order
- **Auto-refresh** - Updates every 1 second when logged in
- **Smart visibility** - Only displays when you have active orders

### User Interface
- **Persistent top bar** with modern design
- **Shadow DOM isolation** to prevent conflicts with Kite's UI
- **Status indicators** for all operations
- **Responsive design** that adapts to different screen sizes

## How It Works

1. **Authentication**: Uses Kite's OAuth flow via your GitHub Pages redirect
2. **API Integration**: Communicates with Kite API for order management
3. **Real-time Updates**: Polls for order status every second
4. **Cross-tab Sync**: Login state synchronized across all Kite tabs

## Installation

1. Load the extension in Chrome Developer Mode
2. Navigate to `kite.zerodha.com`
3. Click "Login" in the extension bar
4. Complete OAuth authentication
5. Start trading with enhanced controls!

## Order Display Details

- **Order Price**: Yellow-tinted display showing your current order price
- **Auto-hide**: Display disappears when no active orders exist
- **Real-time**: Updates every second to reflect current order status

## Technical Details

- **Manifest V3** compliance
- **Session-based** token storage
- **Background service worker** for API calls
- **Content script injection** for UI elements
- **1-second polling** for real-time order updates