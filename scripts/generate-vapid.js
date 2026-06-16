#!/usr/bin/env node
/**
 * Generate VAPID keys for Web Push
 * Run: node scripts/generate-vapid.js
 * Add output to .env.local
 */
const webpush = require("web-push");
const keys = webpush.generateVAPIDKeys();
console.log("Add to .env.local:\n");
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:team@limitcode.dev`);
