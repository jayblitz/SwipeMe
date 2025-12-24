# TempoChat Design Guidelines

## Architecture Decisions

### Authentication
**Auth Required** - The app has explicit user accounts, messaging sync, and financial features.

**Implementation:**
- **Primary Auth:** SSO with Apple Sign-In (iOS) and Google Sign-In (Android/cross-platform)
- **Biometric Security:** Face ID/Touch ID for wallet access and payment confirmation
- **Onboarding Flow:**
  - Welcome screen with value proposition (secure messaging + instant payments)
  - Sign up with Apple/Google buttons
  - Biometric setup prompt after account creation
  - Automatic wallet generation (self-custodial, emphasize security)
  - Optional: Phone number verification for chat discovery
- **Account Management:**
  - Profile screen with avatar (user-selectable from preset avatars matching payment/messaging theme)
  - Display name, phone number fields
  - Security section: Change biometric settings, view recovery phrase
  - Log out with confirmation dialog
  - Delete account nested under Settings > Account Security > Delete Account (double confirmation with warnings about losing wallet access)

### Navigation
**Tab Navigation** (4 tabs with floating action button for core action)

**Structure:**
1. **Chats Tab** (left): List of conversations
2. **Wallet Tab** (center-left): Balance, transaction history, on-ramp
3. **Floating Action Button (center)**: New chat/payment quick action
4. **Discover Tab** (center-right): Find contacts, QR scanner
5. **Profile Tab** (right): Settings, account, support

**Rationale:** 4 tabs with FAB provides quick access to core messaging and payment actions while maintaining clear feature separation.

---

## Screen Specifications

### 1. Chats Screen (Default Tab)
**Purpose:** View all conversations, access individual chats

**Layout:**
- **Header:** 
  - Transparent background
  - Title: "Chats"
  - Right button: Search icon
  - No back button (root screen)
- **Main Content:**
  - Scrollable FlatList of chat previews
  - Each chat card shows: avatar (circular, 48px), name, last message preview (truncated), timestamp, unread badge
  - Swipe actions: Archive (left), Delete (right)
  - Empty state: Illustration with "Start a conversation" CTA
- **Safe Area Insets:**
  - Top: `headerHeight + Spacing.xl`
  - Bottom: `tabBarHeight + Spacing.xl`

**Components:** Search bar (modal), chat preview cards, unread badge

---

### 2. Individual Chat Screen
**Purpose:** Send/receive messages, initiate payments

**Layout:**
- **Header:**
  - Opaque background (to separate from messages)
  - Left: Back button
  - Center: Contact name + online status indicator
  - Right: Payment icon button (opens payment sheet)
- **Main Content:**
  - Inverted FlatList of message bubbles
  - Message bubbles:
    - Sent: Aligned right, blue background, white text
    - Received: Aligned left, light gray background, dark text
    - Payment messages: Special card with amount, memo, status (pending/complete)
  - Message input bar (fixed bottom): Text input + attach button + send button
- **Safe Area Insets:**
  - Top: `Spacing.xl` (header is opaque)
  - Bottom: `insets.bottom + Spacing.md` (input bar is fixed)

**Components:** Message bubbles, payment cards, input toolbar, payment bottom sheet

---

### 3. Payment Bottom Sheet (Modal)
**Purpose:** Send money within a chat

**Layout:**
- **Header:**
  - Drag handle at top
  - Title: "Send Payment"
  - Right: Close button
- **Form:**
  - Amount input (large, prominent, with currency symbol)
  - Recipient display (avatar + name, read-only)
  - Memo/note field (optional, placeholder: "What's this for?")
  - Available balance display below form
  - Submit button: "Send $XX.XX" (primary, full-width)
  - Submit requires biometric confirmation
- **Safe Area Insets:**
  - Bottom: `insets.bottom + Spacing.xl`

**Components:** Amount input with currency formatting, memo text field, balance display, biometric prompt

---

### 4. Wallet Screen (Tab)
**Purpose:** View balance, transaction history, add funds

**Layout:**
- **Header:**
  - Transparent background
  - Title: "Wallet"
  - Right button: Transaction filter icon
- **Main Content:**
  - Scrollable view:
    - Balance card (top): Large balance display, currency (USDC), "Add Funds" button
    - Transaction list: Date-grouped list of payments sent/received
    - Each transaction: Contact avatar/name, amount (+ or -), memo, timestamp
- **Floating Action Button:**
  - "Add Funds" (opens Ramp widget)
  - Position: Bottom right, above tab bar
  - Shadow: `shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.10, shadowRadius: 2`
- **Safe Area Insets:**
  - Top: `headerHeight + Spacing.xl`
  - Bottom: `tabBarHeight + Spacing.xl`

**Components:** Balance card, transaction list items, filter modal, Ramp integration

---

### 5. Profile Screen (Tab)
**Purpose:** Manage account, settings, support

**Layout:**
- **Header:**
  - Transparent background
  - Title: "Profile"
  - Right button: Edit icon
- **Main Content:**
  - Scrollable list:
    - Profile section: Avatar (100px, circular), name, phone number
    - Menu sections:
      - Account: Recovery phrase, biometric settings
      - Preferences: Notifications, language, theme
      - Support: Help center, contact support
      - Legal: Privacy policy, terms of service
      - Log out (red text)
- **Safe Area Insets:**
  - Top: `headerHeight + Spacing.xl`
  - Bottom: `tabBarHeight + Spacing.xl`

**Components:** Profile header, settings menu list, confirmation dialogs

---

## Design System

### Color Palette
**Primary:**
- `primary`: `#0066FF` (trust, payments, action buttons)
- `primaryDark`: `#0052CC` (pressed state)
- `primaryLight`: `#E6F0FF` (backgrounds, highlights)

**Neutral:**
- `background`: `#FFFFFF`
- `surface`: `#F8F9FA`
- `border`: `#E1E4E8`
- `text`: `#1F2937`
- `textSecondary`: `#6B7280`

**Semantic:**
- `success`: `#10B981` (completed payments)
- `error`: `#EF4444` (failed transactions, delete)
- `warning`: `#F59E0B`

**Message Bubbles:**
- `sentMessage`: `#0066FF`
- `receivedMessage`: `#F3F4F6`

### Typography
**Font Family:** System default (SF Pro on iOS, Roboto on Android)

**Scales:**
- `title1`: 28px, bold (screen titles)
- `title2`: 22px, semibold (section headers)
- `body`: 16px, regular (message text, labels)
- `caption`: 14px, regular (timestamps, secondary info)
- `large`: 34px, bold (balance amounts)

### Visual Design
**Icons:** Feather icon set from `@expo/vector-icons` for all UI elements (no emojis)

**Touchable Feedback:**
- Standard buttons: Opacity 0.7 on press
- Cards/list items: Background color shift to `surface` on press
- Floating buttons: Subtle drop shadow with `shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.10, shadowRadius: 2`

**Corner Radius:**
- Cards/containers: 12px
- Buttons: 8px
- Message bubbles: 16px
- Avatars: 50% (circular)

**Spacing System:**
- `xs`: 4px
- `sm`: 8px
- `md`: 16px
- `lg`: 24px
- `xl`: 32px

### Critical Assets
**Required Generated Assets:**
1. **User Avatars** (8 preset options): Abstract geometric patterns in brand colors, professional/trustworthy aesthetic matching financial app theme
2. **Empty State Illustrations:**
   - No chats yet: Simple messaging icon with friendly text
   - No transactions yet: Wallet icon with "Start sending money" message
3. **Payment Status Icons:**
   - Pending: Animated loader
   - Completed: Green checkmark
   - Failed: Red X

**DO NOT include:** Stock photos, emoji-heavy designs, or unrelated decorative imagery

### Interaction Design
**Biometric Prompts:**
- Trigger on: Payment send, wallet recovery phrase view, sensitive settings
- Native OS biometric dialog (Face ID/Touch ID)
- Fallback: Passcode entry if biometric unavailable

**Payment Flow:**
1. Tap payment icon in chat → Bottom sheet slides up
2. Enter amount → Preview updates
3. Add memo (optional)
4. Tap "Send $XX.XX" → Biometric prompt
5. Success → Dismiss sheet, show message bubble with payment confirmation
6. Loading state: Disable send button, show spinner

**Message Sending:**
- Tap send → Immediate optimistic UI update
- Show "sending" indicator on message
- Update to "delivered" when confirmed

### Accessibility
- All interactive elements minimum 44px tap target
- Color contrast ratio 4.5:1 for text
- Screen reader labels for all icons and actions
- Dynamic type support for font scaling
- VoiceOver/TalkBack announcements for payment confirmations
- Haptic feedback on payment send confirmation

---

## Platform-Specific Considerations
**iOS:**
- Follow iOS HIG for navigation patterns
- Use SF Symbols where appropriate (fallback to Feather icons)
- System-native bottom sheets with drag handle

**Android:**
- Material Design elevation for cards
- Ripple effect on touchables
- Navigation gestures follow Android conventions