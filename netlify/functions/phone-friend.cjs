'use strict';

/**
 * Netlify Function — PHONE FRIEND
 * Thin HTTP edge over adapters/web/phone-friend-api.cjs
 */

const {
  createNetlifyHandler,
} = require('../../adapters/web/phone-friend-api.cjs');

exports.handler = createNetlifyHandler();
