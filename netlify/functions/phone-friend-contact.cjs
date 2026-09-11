'use strict';

/**
 * Netlify Function — Android device contact analyze
 */

const {
  AndroidContactApi,
} = require('../../adapters/web/android-contact-api.cjs');

const api = new AndroidContactApi();

exports.handler = api.createNetlifyHandler();
