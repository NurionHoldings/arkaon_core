'use strict';

/**
 * @deprecated Use products/phone-friend/natural/natural-conversation-engine.cjs
 * Compatibility shim — do not add new logic here.
 */

const {
  NaturalConversationEngine,
  NATURAL_GOAL,
  CONTACT_METHOD,
  isAffirm,
  isNeg,
} = require('../natural/natural-conversation-engine.cjs');

/**
 * Legacy adapter: understand() → interpret()
 */
class NaturalConversationLayer {
  constructor(opts = {}) {
    this.engine = new NaturalConversationEngine(opts);
  }

  understand(input = {}) {
    const result = this.engine.interpret(input);
    return {
      ...result,
      // legacy field name
      plan: result.dialogue_plan,
    };
  }
}

module.exports = {
  NaturalConversationLayer,
  NATURAL_GOAL,
  CONTACT_METHOD,
  isAffirm,
  isNeg,
};
