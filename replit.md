# SwipeMe - WeChat-Style Super App

## Overview
SwipeMe is a WeChat-inspired super app MVP that integrates end-to-end encrypted messaging with blockchain-based P2P payments. Its core purpose is to provide "instant money, straight from your chat" by combining secure communication with seamless crypto transactions. The project aims to deliver a cross-platform mobile experience using Expo (React Native). Key capabilities include robust authentication (email verification, 2FA, passkeys), secure wallet management (creation, import, encryption), real-time multi-asset display and transfers on the Tempo testnet, and end-to-end encrypted messaging powered by XMTP. Future ambitions include real-time message streaming, advanced XMTP content types, gas-sponsored transactions, and fiat on-ramp integration.

## User Preferences
- iOS 26 liquid glass UI design aesthetic
- Mobile-first responsive design
- No emojis in UI
- Clean, minimal interface

## System Architecture
The application is built with an Expo/React Native frontend and an Express.js backend, communicating via a RESTful API.

**UI/UX Decisions:**
- **Design System:** Utilizes a consistent design language with a primary blue color (#0066FF), Feather icons, system fonts, and a defined spacing scale (4px to 32px).
- **Theming:** Supports Light, Dark, and System themes with persistence via AsyncStorage.
- **Navigation:** Features a 4-tab bottom navigation (Chats, Wallet, Discover, Profile) and dedicated stack navigators for different feature sets.
- **Chat UI:** Includes WhatsApp-style voice message recording/playback with waveform visualization, custom per-chat backgrounds, and date separators for message grouping.
- **Wallet UI:** Displays multi-asset token balances and provides a "Get Free TEMPO" faucet for gas.

**Technical Implementations & Feature Specifications:**
- **Authentication:** Multi-step signup/login with email verification (Resend), 2FA (TOTP), and passkey authentication (WebAuthn) using `react-native-passkeys` for native platforms. Session-based API authentication with secure cookies.
- **Wallet Management:** Local wallet generation/import using `viem` (seed phrase/private key validation against Tempo testnet). Seed phrases and private keys are AES-256-GCM encrypted before storage. Wallet data is persisted globally via `WalletContext` and `AsyncStorage`.
- **P2P Payments:** Real-time token balance fetching for Tempo testnet assets (pathUSD, AlphaUSD, BetaUSD, ThetaUSD). P2P token transfers within chats with server-side transaction signing and encrypted wallet decryption.
- **Messaging:** End-to-end encrypted messaging via XMTP React Native SDK v3. Secure remote signing architecture ensures private keys remain encrypted on the server. Web platform gracefully falls back to mock data due to XMTP's native module requirements. Unified chat persistence combines XMTP conversations and local AsyncStorage chats.
- **Disappearing Messages:** Signal-style disappearing messages with user-selectable timers (24 hours, 7 days, 30 days) per chat, automatically deleting expired messages on chat load.
- **Contact Details Screen:** Signal/WhatsApp-style contact profile accessible by tapping name in chat header. Features quick action buttons (Voice, Video, Mute, Search), settings (disappearing messages, nickname, chat theme), shared media gallery, payment history, groups in common, and safety options (block/report).
- **Voice/Video Calling:** Real-time voice and video calling powered by VideoSDK. Full-screen call UI with mute, video toggle, speaker controls, and call duration timer. Call buttons accessible from chat header and contact details screen. Web platform shows graceful fallback directing users to Expo Go.
- **Attachments:** Full attachment system supporting photos, camera, location, contacts, and documents.
- **Permissions:** Handles contacts, microphone, and biometric permissions with user-friendly prompts and settings redirects.

**System Design Choices:**
- **Frontend:** Expo (React Native) for cross-platform mobile development. `AuthContext`, `WalletContext`, and `XMTPContext` for global state management. `React Query` for API data fetching.
- **Backend:** Express.js API server. `Drizzle ORM` for database interactions with PostgreSQL.
- **Security:** AES-256-GCM encryption for sensitive wallet data. `requireAuth` and `requireSameUser` middleware for API protection.
- **Database:** PostgreSQL with schemas for users, wallets, chats, messages, transactions, and authentication-related data (verification codes, passkeys).

## External Dependencies
- **Resend:** For email verification code delivery.
- **PostgreSQL:** Primary database for application data.
- **viem:** For Ethereum wallet generation, import, address derivation, and ERC-20 balance fetching/transaction signing on Tempo testnet.
- **XMTP React Native SDK v3:** For end-to-end encrypted messaging.
- **Expo Ecosystem:** `expo-auth-session`, `expo-local-authentication`, `expo-contacts`, `expo-clipboard`, `expo-audio`, `expo-image-picker`, `expo-location`, `expo-file-system`, `expo-document-picker`, `expo-linking`, `expo-secure-store` for various device functionalities.
- **react-native-passkeys:** For WebAuthn passkey authentication on native platforms.
- **Google Forms:** For waitlist signups on the marketing landing page.
- **EAS (Expo Application Services):** For building and distributing native development builds.