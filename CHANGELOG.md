# Changelog

All notable changes to SwipeMe will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2026-01-14

### Added
- Threaded comments with nested replies in Moments feed
- Reply button on comments with visual reply indicator
- Swipe-up tip prompt for quick tipping ($5, $10, $25)
- Memoized threaded comment data structure for performance
- Parent comment validation (replies must belong to same post)

### Changed
- Comment modal now shows replies indented under parent comments
- "Replying to [username]" bar appears when composing replies
- Haptic feedback on long-press for quick reply action

### Security
- Added rate limiting to verify-2fa endpoint
- Added rate limiting to signup-complete endpoint
- CSRF protection with SameSite=Strict cookies
- Parent comment ownership validation prevents cross-post replies

### Fixed
- Audio/video sync issues in video posts
- Memory leaks from audio cleanup on unmount
- Keyboard handling for all modal TextInputs

## [1.0.1] - 2026-01-10

### Added
- TikTok-style video recording with expo-camera
- Video preview with playback controls and caption input
- FYP algorithm with engagement scoring
- Blockchain tipping for posts using pathUSD
- Mini-apps marketplace with Calculator app
- Revenue tracking system (5% tip fees, 1% P2P fees)
- Creator earnings dashboard with withdrawal functionality
- Signal-style group chats with server-side persistence
- Group admin controls (transfer admin, remove members)

### Changed
- Moments feed now uses FYP algorithm by default
- Video posts support 15-60 second limits

### Security
- Session cookies use SameSite=Strict
- Group messages persisted to database

## [1.0.0] - 2026-01-01

### Added
- Initial release of SwipeMe super app
- End-to-end encrypted messaging via XMTP
- Blockchain P2P payments on Tempo testnet
- Multi-stablecoin support (pathUSD, AlphaUSD, BetaUSD, ThetaUSD)
- Wallet creation and import (seed phrase/private key)
- AES-256-GCM encryption for wallet data
- Email verification with Resend
- 2FA authentication (TOTP)
- Passkey/WebAuthn authentication
- Push notifications for messages and payments
- Disappearing messages (24h, 7d, 30d timers)
- Contact details screen with chat settings
- Photo/video attachments in chats
- Voice message recording with waveform visualization
- Custom per-chat backgrounds
- Dark/Light/System theme support

### Security
- Helmet middleware with CSP headers
- Rate limiting on all auth endpoints
- Zod validation for all wallet operations
- Winston security logging
- Password strength validation
- Secure OTP generation with 10-minute expiration

---

## Version Numbering

SwipeMe follows Semantic Versioning:
- **MAJOR** (1.x.x): Breaking changes to API or data formats
- **MINOR** (x.1.x): New features, backward compatible
- **PATCH** (x.x.1): Bug fixes, security patches

### Build Numbers
- iOS: `buildNumber` in app.json (currently: 3)
- Android: `versionCode` in app.json (currently: 3)

Build numbers increment with every EAS build submission.

### API Versioning
- Current API version: v1
- Base URL: `/api/`
- Version info: `GET /api/version`

Future API versions will be available at `/api/v2/`, etc.
