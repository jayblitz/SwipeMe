#!/bin/bash

# Expo dev server startup script with fallback for missing REPLIT_DEV_DOMAIN
# This script is designed to be robust when environment variables are missing

echo "Starting Expo development server..."

# Check if REPLIT_DEV_DOMAIN is set and non-empty
if [ -z "$REPLIT_DEV_DOMAIN" ] || [ "$REPLIT_DEV_DOMAIN" = "" ]; then
  echo "REPLIT_DEV_DOMAIN not set, using localhost fallback"
  DOMAIN="localhost"
else
  DOMAIN="$REPLIT_DEV_DOMAIN"
fi

# Only set proxy URL if we have a valid domain (not localhost)
if [ "$DOMAIN" != "localhost" ]; then
  export EXPO_PACKAGER_PROXY_URL="https://${DOMAIN}"
  export REACT_NATIVE_PACKAGER_HOSTNAME="${DOMAIN}"
fi

export EXPO_PUBLIC_DOMAIN="${DOMAIN}:5000"

echo "Expo configuration:"
echo "  DOMAIN=$DOMAIN"
echo "  EXPO_PACKAGER_PROXY_URL=${EXPO_PACKAGER_PROXY_URL:-not set}"
echo "  REACT_NATIVE_PACKAGER_HOSTNAME=${REACT_NATIVE_PACKAGER_HOSTNAME:-not set}"
echo "  EXPO_PUBLIC_DOMAIN=$EXPO_PUBLIC_DOMAIN"

# Start expo with localhost binding
exec npx expo start --localhost
