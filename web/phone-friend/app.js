(() => {
  const API_URL = '/api/phone-friend';

  const transcript = document.getElementById('transcript');
  const composer = document.getElementById('composer');
  const input = document.getElementById('utterance');
  const sendBtn = document.getElementById('sendBtn');
  const orb = document.getElementById('orb');
  const presenceLabel = document.getElementById('presenceLabel');
  const statusBadge = document.getElementById('statusBadge');

  let sessionId = null;

  const STATUS_COPY = {
    IDLE: '듣고 있어요',
    ANSWER: '답하고 있어요',
    CONFIRM: '확인이 필요해요',
    HOLD: '잠시 보류했어요',
    WARN: '주의가 필요해요',
    DENY: '지금은 어려워요',
    COMPLETE: '완료했어요',
    HANDOFF: '전문 축으로 연결해요',
    CLARIFY: '조금 더 알려주세요',
  };

  function setStatus(status) {
    const key = status || 'IDLE';
    orb.dataset.status = key;
    statusBadge.textContent = key;
    presenceLabel.textContent = STATUS_COPY[key] || '듣고 있어요';
  }

  function appendBubble(role, text) {
    const el = document.createElement('div');
    el.className = `bubble ${role}`;
    el.textContent = text;
    transcript.appendChild(el);
    transcript.scrollTop = transcript.scrollHeight;
  }

  function appendCard(card) {
    const el = document.createElement('article');
    el.className = 'card';

    const title = document.createElement('h3');
    title.textContent = card.title || '알림';
    el.appendChild(title);

    if (card.type === 'calendar' && Array.isArray(card.events)) {
      if (card.events.length === 0) {
        const p = document.createElement('p');
        p.textContent = '등록된 일정이 없어요.';
        el.appendChild(p);
      } else {
        const ul = document.createElement('ul');
        card.events.forEach((event) => {
          const li = document.createElement('li');
          li.textContent = `${event.title || '일정'} · ${event.start_at || ''}`;
          ul.appendChild(li);
        });
        el.appendChild(ul);
      }
    }

    if (card.type === 'confirm') {
      const p = document.createElement('p');
      p.textContent = card.text || '';
      el.appendChild(p);

      const actions = document.createElement('div');
      actions.className = 'card-actions';

      const yes = document.createElement('button');
      yes.type = 'button';
      yes.className = 'yes';
      yes.textContent = '응';
      yes.addEventListener('click', () => sendUtterance('응'));

      const no = document.createElement('button');
      no.type = 'button';
      no.className = 'no';
      no.textContent = '아니';
      no.addEventListener('click', () => sendUtterance('아니'));

      actions.append(yes, no);
      el.appendChild(actions);
    }

    if (card.type === 'message') {
      const p = document.createElement('p');
      p.textContent = `${card.to || ''}에게: ${card.content || ''}`;
      el.appendChild(p);
    }

    if (card.type === 'safety') {
      const p = document.createElement('p');
      p.textContent = card.note || '';
      el.appendChild(p);
      const risk = document.createElement('span');
      risk.className = 'risk';
      risk.textContent = `RISK ${card.risk || 'UNKNOWN'}`;
      el.appendChild(risk);

      if (Array.isArray(card.findings) && card.findings.length) {
        const ul = document.createElement('ul');
        card.findings.slice(0, 4).forEach((item) => {
          const li = document.createElement('li');
          li.textContent = item.code || JSON.stringify(item);
          ul.appendChild(li);
        });
        el.appendChild(ul);
      }
    }

    if (card.type === 'document' && card.document) {
      const p = document.createElement('p');
      p.textContent = `${card.document.source_filename || ''} → ${card.document.output_format || ''}`;
      el.appendChild(p);
    }

    if (card.type === 'handoff') {
      const p = document.createElement('p');
      p.textContent = card.text || '';
      el.appendChild(p);
    }

    transcript.appendChild(el);
    transcript.scrollTop = transcript.scrollHeight;
  }

  async function sendUtterance(text) {
    const utterance = String(text || '').trim();
    if (!utterance) return;

    appendBubble('user', utterance);
    setStatus('ANSWER');
    sendBtn.disabled = true;

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          utterance,
          session_id: sessionId,
          subject: 'user:web',
          device_id: 'web-browser',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || '요청 실패');
      }

      sessionId = data.session_id || sessionId;
      setStatus(data.status || 'ANSWER');
      appendBubble('assistant', data.assistant_text || '응답을 받았어요.');

      (data.cards || []).forEach(appendCard);
    } catch (error) {
      setStatus('DENY');
      appendBubble(
        'assistant',
        '지금은 서버에 연결하지 못했어요. Netlify Function이 켜져 있는지 확인해 주세요.'
      );
      console.error(error);
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  }

  composer.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = input.value;
    input.value = '';
    sendUtterance(value);
  });

  setStatus('IDLE');
  input.focus();
})();
