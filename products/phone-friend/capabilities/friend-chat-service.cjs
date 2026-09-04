'use strict';

/**
 * FriendChatService
 * ─────────────────────────────────────────────
 * PHONE FRIEND — FRIEND_CHAT
 *
 * 일상 대화 / 간단한 정서적 반응 / 정리 / 쉬운 설명을 위한
 * 비실행형 Capability.
 *
 * 이 서비스는 현실 세계의 외부 행동을 직접 수행하지 않는다.
 *
 * 중요한 원칙:
 *   Conversation !== Authority
 *   Friendly response !== professional diagnosis
 */

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  return String(value || '').trim();
}

class FriendChatService {
  constructor(opts = {}) {
    this.name = opts.name || '아르카온';
  }

  respond(input = {}) {
    const text = normalizeText(
      input.text || input.utterance
    );

    if (!text) {
      return clone({
        ok: false,
        kind: 'CLARIFY',
        text: '무슨 이야기를 하고 싶은지 편하게 말씀해 주세요.',
        capability: 'FRIEND_CHAT',
        authority_granted: false,
      });
    }

    let response;

    if (/(힘들|지쳤|피곤|답답|속상|우울)/.test(text)) {
      response =
        '많이 지친 것 같네요. 무슨 일이 있었는지 이야기해 주시면 같이 정리해볼게요.';
    } else if (/(심심|뭐해|놀아줘|이야기하자|얘기하자)/.test(text)) {
      response =
        '좋아요. 지금 떠오르는 이야기부터 편하게 해봐요.';
    } else if (/(어려운 말|쉽게 설명|무슨 뜻)/.test(text)) {
      response =
        '좋아요. 내용을 보내주시면 어려운 표현을 줄이고 쉬운 말로 풀어드릴게요.';
    } else if (/(고마워|고맙다|감사)/.test(text)) {
      response =
        '언제든 불러주세요. 필요한 일이 있으면 같이 해봐요.';
    } else {
      response =
        '응, 듣고 있어요. 조금 더 이야기해 주세요.';
    }

    return clone({
      ok: true,
      kind: 'ANSWER',
      text: response,
      capability: 'FRIEND_CHAT',
      input_text: text,

      /**
       * 대화 자체는 어떠한 실행권한도 만들지 않는다.
       */
      authority_granted: false,
      execution_required: false,
    });
  }
}

module.exports = {
  FriendChatService,
  normalizeText,
};
