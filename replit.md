# SwipeMe - WeChat-Style Super App

## Overview

SwipeMe is a WeChat-inspired super app MVP combining end-to-end encrypted messaging and blockchain-based P2P payments. The tagline is "Just SwipeMe – instant money, straight from your chat". Built with Expo (React Native) for cross-platform mobile experience.

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
- WhatsApp-style AudioMessageBubble with waveform visualization, duration, timestamp, playback speed (1x/1.5x/2x)
- Green dot indicator for unplayed voice messages
- Microphone permission handling with Settings redirect for denied permissions
- Per-chat custom backgrounds (8 preset colors, stored per chatId in AsyncStorage)
- Date separators between message groups (Today, Yesterday, weekday, or full date)

**MVP Phase 4 Complete (XMTP Integration):**
- XMTP React Native SDK v3 integration for end-to-end encrypted messaging
- Secure remote signing architecture - private keys remain encrypted on server
- Server-side signing endpoint (/api/wallet/:userId/sign) for XMTP authentication
- XMTPContext provider for client state management
- ChatsScreen lists real XMTP DM conversations on native platforms
- ChatScreen sends/receives XMTP messages on native platforms
- Web platform gracefully falls back to mock data (XMTP requires native modules)
- Android development build configured via EAS (APK downloadable from Expo dashboard)
- XMTP dev environment with dbEncryptionKey stored securely in SecureStore

**MVP Limitations (Production Improvements Needed):**
- XMTP messaging only works on native (Android/iOS development builds), web uses mock data
- No real-time message streaming yet (requires manual refresh to see new messages)
- Voice messages and attachments not yet integrated with XMTP (text messages only)
- Gas sponsored transactions not yet implemented (users need TEMPO for gas, but can use faucet)
- Voice message playback works on native devices but has issues on web

**Planned Features (Future):**
- XMTP message streaming for real-time updates
- XMTP content types for payments, voice messages, and attachments
- Gas-sponsored meta-transactions
- Ramp SDK for fiat on-ramp

**Marketing Landing Page:**
- Marketing website served on Express port 5000 (server/templates/landing-page.html)
- Desktop-optimized with mobile responsive breakpoints
- Waitlist signup via Google Forms (https://forms.gle/WpY7LDTSANbxeWuG9)
- App Store/Google Play buttons show "Coming Soon" alert
- Relative asset paths for GoDaddy export compatibility
- Ready for export: rename landing-page.html to index.html, include assets/images/icon.png

**MVP Phase 5 Complete (Wallet Persistence & Data Cleanup):**
- WalletContext added to persist wallet data globally across all screens
- Wallet automatically loads when user logs in, no need to re-import
- Wallet data persisted to AsyncStorage, available immediately after app restart
- Privy SDK integration removed (was causing bundling issues)
- All mock data removed from storage.ts - app now uses real data only
- On web platform, empty states shown instead of mock data (XMTP requires native)
- On native platforms, real XMTP conversations and messages displayed
- EAS project: @crypto4eva/swipeme (ID: 26540cf7-4cc6-4892-881f-a4070c21b3f2)
- Android development build available at: https://expo.dev/accounts/crypto4eva/projects/swipeme/builds/d4082879-e51b-4754-8e02-ae3cc95f0e17

**MVP Phase 6 Complete (Enhanced Authentication):**
- Binance-style multi-step login flow: email → password → 2FA (if enabled)
- 2FA enforcement: login endpoint returns `requires2FA` flag when user has 2FA enabled
- /api/auth/verify-2fa endpoint for TOTP code verification before session creation
- Passkey authentication infrastructure with WebAuthn endpoints
- Passkey endpoints: check, register/options, register/complete, login/options, login
- "Continue with Passkey" button on login screen (native platforms only)
- Passkey login uses react-native-passkeys on native development builds
- Passkey login bypasses 2FA (passkey is strong authentication)
- AuthContext updated with verify2FA and signInWithPasskey functions
- signIn now returns LoginResult type with requires2FA flag

## Project Architecture

```
client/                     # Expo/React Native frontend
├── App.tsx                 # Root app component with providers
├── contexts/
│   ├── AuthContext.tsx     # Authentication state management (signup, login, user updates)
│   ├── WalletContext.tsx   # Wallet state persistence across screens
│   └── XMTPContext.tsx     # XMTP client state management and initialization
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
│   ├── storage.ts          # AsyncStorage data layer (real data only, no mocks)
│   ├── query-client.ts     # React Query setup + API helpers
│   ├── tempo-tokens.ts     # Tempo testnet token configs + balance fetching via viem
│   └── xmtp.ts             # XMTP client utilities with remote signer and DM management
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
- **waitlist_signups**: id, email (unique), source, createdAt
- **passkeys**: id, userId, credentialId (unique), publicKey, deviceName, createdAt

## API Routes

**Auth:**
- POST /api/auth/signup/start - Send verification email
- POST /api/auth/signup/verify - Verify email code
- POST /api/auth/signup/complete - Set password and create account (sets session)
- POST /api/auth/login - Login with email/password (returns requires2FA flag if 2FA enabled)
- POST /api/auth/verify-2fa - Verify TOTP code and create session
- POST /api/auth/logout - Destroy session and clear cookie
- GET /api/auth/session - Check authentication status

**Passkey (WebAuthn):**
- POST /api/auth/passkey/check - Check if user has registered passkey
- POST /api/auth/passkey/register/options - Get registration challenge (requireAuth)
- POST /api/auth/passkey/register/complete - Store passkey credentials (requireAuth)
- POST /api/auth/passkey/login/options - Get assertion challenge
- POST /api/auth/passkey/login - Authenticate with passkey credential (bypasses 2FA)
- GET /api/auth/passkeys - List user's registered passkeys (requireAuth)
- DELETE /api/auth/passkey/:id - Delete a passkey (requireAuth)

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
- POST /api/wallet/:userId/sign - Sign message for XMTP authentication (server-side signing)

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
