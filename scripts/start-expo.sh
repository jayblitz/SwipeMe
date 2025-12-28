#!/bin/bash

# Expo dev server startup script with fallback for missing REPLIT_DEV_DOMAIN

if [ -z "$REPLIT_DEV_DOMAIN" ]; then
  echo "REPLIT_DEV_DOMAIN not set, using localhost fallback"
  REPLIT_DEV_DOMAIN="localhost"
fi

export EXPO_PACKAGER_PROXY_URL="https://${REPLIT_DEV_DOMAIN}"
export REACT_NATIVE_PACKAGER_HOSTNAME="${REPLIT_DEV_DOMAIN}"
export EXPO_PUBLIC_DOMAIN="${REPLIT_DEV_DOMAIN}:5000"

echo "Starting Expo with:"
echo "  EXPO_PACKAGER_PROXY_URL=$EXPO_PACKAGER_PROXY_URL"
echo "  REACT_NATIVE_PACKAGER_HOSTNAME=$REACT_NATIVE_PACKAGER_HOSTNAME"
echo "  EXPO_PUBLIC_DOMAIN=$EXPO_PUBLIC_DOMAIN"

npx expo start --localhost
