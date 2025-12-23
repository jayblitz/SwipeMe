# TempoChat - WeChat-Style Super App

## Overview

TempoChat is a WeChat-inspired super app MVP combining end-to-end encrypted messaging and blockchain-based P2P payments. Built with Expo (React Native) for cross-platform mobile experience.

## Current State

**MVP Phase 1 Complete:**
- Full authentication system with email verification via Resend
- Multi-step signup flow: email → verification code → password
- Login with proper error handling ("Incorrect email or password")
- PostgreSQL database with 8 tables: users, verification_codes, wallets, contacts, chats, chat_participants, messages, transactions
- 4-tab navigation (Chats, Wallet, Discover, Profile)
- Wallet setup with two options:
  - "Create New Wallet" - Local wallet generation using viem with 12-word recovery phrase
  - "Import Wallet" - Real wallet import using viem with seed phrase (12/24 words) or private key validation
- Wallet import validates against Tempo testnet (chain ID 42429) and derives real addresses using viem
- Seed phrases and private keys encrypted with AES-256-GCM before database storage (WALLET_ENCRYPTION_KEY required)
- Recovery phrase export screen with biometric gating
- Profile settings: biometric authentication, 2FA setup, edit profile, appearance switcher (light/dark/system)
- Contacts permission handling in Discover tab with FAB popup menu
- Theme persistence via AsyncStorage

**MVP Phase 2 Complete:**
- Real-time token balance fetching for all Tempo testnet assets (pathUSD, AlphaUSD, BetaUSD, ThetaUSD)
- Multi-asset display in Wallet screen with individual token balances
- Direct blockchain queries using viem for ERC-20 balances
- P2P token transfers within chat conversations
- Token selector in payment modal (choose which stablecoin to send)
- Server-side transaction signing with AES-256-GCM wallet decryption
- Full attachment system: photos, camera, location, contacts, documents
- Chat input with attachment button (+) and header payment button ($)

**MVP Phase 3 Complete:**
- Session-based API authentication using express-session with secure cookies
- All sensitive routes (wallet, user, 2FA) protected by authentication middleware
- requireAuth and requireSameUser middleware ensure users can only access their own data
- Logout endpoint to destroy session
- Session status check endpoint (/api/auth/session)
- "Get Free TEMPO" faucet button in Wallet screen for easy gas top-up
- Payment confirmation dialog before sending tokens
- User-friendly error messages for common payment failures (gas, auth, network)
- Voice message recording and playback using expo-audio
- WhatsApp-style send/mic button toggle (mic when empty, send when typing)
- AudioMessageBubble component with progress tracking and playback controls
- Microphone permission handling with Settings redirect for denied permissions

**MVP Limitations (Production Improvements Needed):**
- No XMTP integration yet (messages use local mock data) - deferred due to native SDK requirements
- Gas sponsored transactions not yet implemented (users need TEMPO for gas, but can use faucet)

**Planned Features (Future):**
- XMTP SDK integration for E2E encrypted messaging (requires development build, not Expo Go)
- Gas-sponsored meta-transactions
- Ramp SDK for fiat on-ramp

**Note:** Privy integration was removed due to SDK incompatibility with Expo Go (native SDK requires development build, JS SDK Core has "Invalid nativeAppID" errors in WebView context). Wallet creation now uses local viem-based wallet generation.

## Project Architecture

```
client/                     # Expo/React Native frontend
├── App.tsx                 # Root app component with providers
├── contexts/
│   └── AuthContext.tsx     # Authentication state management (signup, login, user updates)
├── screens/
│   ├── AuthScreen.tsx      # Multi-step login/signup with email verification
│   ├── ChatsScreen.tsx     # Chat list with search
│   ├── ChatScreen.tsx      # Messages + integrated payment modal
│   ├── WalletScreen.tsx    # Balance card + transaction history (shows WalletSetupScreen if no wallet)
│   ├── WalletSetupScreen.tsx # Wallet creation/import flow
│   ├── DiscoverScreen.tsx  # Contact search with permissions + FAB menu
│   ├── ProfileScreen.tsx   # Settings: biometric, 2FA, edit profile, appearance
│   ├── RecoveryPhraseScreen.tsx # Export wallet recovery phrase with biometric auth
│   └── SettingsScreen.tsx  # Additional settings
├── navigation/
│   ├── RootStackNavigator.tsx    # Auth flow + main app
│   ├── MainTabNavigator.tsx      # 4-tab bottom navigation
│   ├── ChatsStackNavigator.tsx   # Chat screens stack
│   ├── WalletStackNavigator.tsx  # Wallet screens stack
│   ├── DiscoverStackNavigator.tsx # Discovery screens stack
│   └── ProfileStackNavigator.tsx  # Profile + RecoveryPhrase screens
├── lib/
│   ├── storage.ts          # AsyncStorage data layer (mock data for chats/transactions)
│   ├── query-client.ts     # React Query setup + API helpers
│   └── tempo-tokens.ts     # Tempo testnet token configs + balance fetching via viem
├── constants/
│   └── theme.ts            # Design tokens, colors, shadows
├── hooks/
│   └── useTheme.ts         # Theme management with mode persistence (ThemeProvider)
└── components/             # Reusable UI components

server/                     # Express backend (port 5000)
├── index.ts               # API server entry
├── routes.ts              # API endpoints (auth, user, wallet)
├── storage.ts             # Database operations (Drizzle ORM)
├── email.ts               # Resend email service for verification codes
└── templates/
    └── landing-page.html  # Static landing page

shared/
└── schema.ts              # Drizzle ORM schema + Zod validation
```

## Database Schema

- **users**: id, email, password (hashed), displayName, profileImage, status, social links, theme, biometric/2FA settings
- **verification_codes**: id, email, code, type (signup/password_reset), expiresAt, used
- **wallets**: id, userId, address, encryptedPrivateKey, encryptedSeedPhrase, isImported, timestamps
- **contacts**: id, userId, contactUserId, nickname, timestamps
- **chats**: id, type (direct/group), name, timestamps
- **chat_participants**: id, chatId, userId, role, timestamps
- **messages**: id, chatId, senderId, content, type, timestamps
- **transactions**: id, chatId, messageId, senderId, receiverId, amount, currency, status, txHash, timestamps

## API Routes

**Auth:**
- POST /api/auth/signup/start - Send verification email
- POST /api/auth/signup/verify - Verify email code
- POST /api/auth/signup/complete - Set password and create account (sets session)
- POST /api/auth/login - Login with email/password (sets session)
- POST /api/auth/logout - Destroy session and clear cookie
- GET /api/auth/session - Check authentication status

**User (protected - requireSameUser):**
- GET /api/user/:id - Get user profile
- PUT /api/user/:id - Update user profile/settings

**Wallet:**
- GET /api/wallet/:userId - Get wallet by user
- POST /api/wallet/privy - Link Privy-created wallet to user account
- POST /api/wallet/import - Import wallet using seed phrase or private key (validates with viem)
- DELETE /api/wallet/:userId - Delete wallet (can be recovered via import)
- GET /api/wallet/:userId/recovery - Get encrypted recovery phrase
- POST /api/wallet/:userId/transfer - Execute ERC20 token transfer (server-side signing)

## Design System

- **Primary Color:** #0066FF (blue)
- **Icons:** Feather icons from @expo/vector-icons
- **Typography:** System fonts
- **Spacing Scale:** 4px, 8px, 12px, 16px, 24px, 32px
- **Border Radius:** 8px (small), 12px (medium), 16px (large)
- **Theme:** Light/Dark/System with persistence

## Running the App

- **Expo web:** Port 8081
- **Backend API:** Port 5000
- Use workflow "Start App" to run both servers

## Technical Notes

- Email verification uses Resend with 10-minute code expiration
- Password hashing uses Node.js crypto with PBKDF2
- Theme preference persisted via AsyncStorage
- Biometric authentication via expo-local-authentication
- Contacts permission via expo-contacts
- Clipboard access via expo-clipboard
- Privy wallet integration uses SDK v0.54+ with:
  - Environment variables: PRIVY_APP_ID, PRIVY_CLIENT_ID_MOBILE, PRIVY_CLIENT_ID_WEB
  - Email OTP flow with sendCode/loginWithCode API
  - LocalStorage adapter for web persistence
  - Iframe-based embedded wallet setup
  - Auto-detection of mobile vs web client ID based on ReactNativeWebView presence

## User Preferences

- iOS 26 liquid glass UI design aesthetic
- Mobile-first responsive design
- No emojis in UI
- Clean, minimal interface
