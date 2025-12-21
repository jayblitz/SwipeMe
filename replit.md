# TempoChat - WeChat-Style Super App

## Overview

TempoChat is a WeChat-inspired super app MVP combining end-to-end encrypted messaging and blockchain-based P2P payments. Built with Expo (React Native) for cross-platform mobile experience.

## Current State

**MVP Phase 1 Complete:**
- Full authentication system with email/password signup
- 4-tab navigation (Chats, Wallet, Discover, Profile)
- Floating action button for quick new chat/payment access
- Mock data layer using AsyncStorage for local persistence
- Complete UI screens for all core features

**Planned Features (Phase 2):**
- XMTP SDK integration for E2E encrypted messaging
- Tempo testnet blockchain integration for payments
- Ramp SDK for fiat on-ramp
- Passkey/biometric authentication
- Self-custodial wallet generation

## Project Architecture

```
client/                     # Expo/React Native frontend
├── App.tsx                 # Root app component with providers
├── contexts/
│   └── AuthContext.tsx     # Authentication state management
├── screens/
│   ├── AuthScreen.tsx      # Login/signup with form validation
│   ├── ChatsScreen.tsx     # Chat list with search
│   ├── ChatScreen.tsx      # Messages + integrated payment modal
│   ├── WalletScreen.tsx    # Balance card + transaction history
│   ├── DiscoverScreen.tsx  # Contact search/discovery
│   ├── ProfileScreen.tsx   # User settings and profile
│   └── SettingsScreen.tsx  # App preferences
├── navigation/
│   ├── RootStackNavigator.tsx    # Auth flow + main app
│   ├── MainTabNavigator.tsx      # 4-tab bottom navigation
│   ├── ChatsStackNavigator.tsx   # Chat screens stack
│   ├── WalletStackNavigator.tsx  # Wallet screens stack
│   ├── DiscoverStackNavigator.tsx # Discovery screens stack
│   └── ProfileStackNavigator.tsx  # Profile screens stack
├── lib/
│   └── storage.ts          # AsyncStorage data layer
├── constants/
│   └── theme.ts            # Design tokens and colors
├── hooks/
│   └── useTheme.ts         # Theme management hook
└── components/             # Reusable UI components

server/                     # Express backend (port 5000)
├── index.ts               # API server entry
└── templates/
    └── landing-page.html  # Static landing page
```

## Design System

- **Primary Color:** #0066FF (blue)
- **Icons:** Feather icons from @expo/vector-icons
- **Typography:** System fonts
- **Spacing Scale:** 4px, 8px, 12px, 16px, 24px, 32px
- **Border Radius:** 8px (small), 12px (medium), 16px (large)

## Running the App

- **Expo web:** Port 8081
- **Backend API:** Port 5000
- Use workflow "Start App" to run both servers

## Technical Notes

- AsyncStorage v2.2.0 requires custom Metro resolver for `./hooks` module resolution
- Uses React Navigation 7+ with bottom tabs
- Supports light/dark theme modes
- Mock data stored in AsyncStorage for offline development

## User Preferences

- iOS 26 liquid glass UI design aesthetic
- Mobile-first responsive design
- No emojis in UI
- Clean, minimal interface
