(() => {
  const API_URL = '/api/phone-friend';

  const transcript = document.getElementById('transcript');
  const composer = document.getElementById('composer');
  const input = document.getElementById('utterance');
  const sendBtn = document.getElementById('sendBtn');
  const orb = document.getElementById('orb');
  const presenceLabel = document.getElementById('presenceLabel');
  const statusBadge = document.getElementById('statusBadge');
  const progressPanel = document.getElementById('progressPanel');

  let sessionId = null;
  let naturalSessionId = null;

  const MOOD_COPY = {
    LISTENING: '응, 듣고 있어.',
    THINKING: '잠깐만, 확인해볼게.',
    WORKING: '지금 살펴보고 있어.',
    CAUTION: '이건 조심해야 할 것 같아.',
    HAPPY: '다 했어.',
    SLEEP: '필요할 때 불러줘.',
  };

  function setPresence(data) {
    const mood = (data && data.character_mood) || 'LISTENING';
    const label =
      (data && data.presence_label) ||
      MOOD_COPY[mood] ||
      MOOD_COPY.LISTENING;

    orb.dataset.mood = mood;
    orb.dataset.status = (data && data.status) || 'IDLE';
    presenceLabel.textContent = label;
    statusBadge.textContent = label;
    statusBadge.hidden = false;
  }

  function renderProgress(steps) {
    if (!progressPanel) return;
    progressPanel.innerHTML = '';

    if (!Array.isArray(steps) || !steps.length) {
      progressPanel.hidden = true;
      return;
    }

    progressPanel.hidden = false;
    const list = document.createElement('ul');
    list.className = 'progress-list';

    steps.forEach((step) => {
      const li = document.createElement('li');
      li.className = `progress-item mark-${step.mark || 'pending'}`;
      const symbol = document.createElement('span');
      symbol.className = 'progress-symbol';
      symbol.textContent =
        step.symbol ||
        (step.mark === 'done' ? '✓' : step.mark === 'active' ? '●' : '○');
      const text = document.createElement('span');
      text.className = 'progress-text';
      text.textContent = step.text || '';
      li.append(symbol, text);
      list.appendChild(li);
    });

    progressPanel.appendChild(list);
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

    if (card.type === 'options' && Array.isArray(card.options)) {
      const actions = document.createElement('div');
      actions.className = 'card-actions options';
      card.options.forEach((opt) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'option';
        btn.textContent = opt.label || opt.id;
        btn.addEventListener('click', () =>
          sendUtterance(opt.label || opt.id)
        );
        actions.appendChild(btn);
      });
      el.appendChild(actions);
    }

    if (card.type === 'message') {
      const p = document.createElement('p');
      p.textContent = `${card.to || ''}에게: ${card.content || ''}`;
      el.appendChild(p);
    }

    if (card.type === 'contact') {
      const p = document.createElement('p');
      p.textContent =
        card.note ||
        `중복 그룹 ${card.duplicate_group_count || 0}개`;
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
    setPresence({
      character_mood: 'THINKING',
      presence_label: MOOD_COPY.THINKING,
      status: 'THINKING',
    });
    sendBtn.disabled = true;

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          utterance,
          session_id: sessionId,
          natural_session_id: naturalSessionId,
          subject: 'user:web',
          device_id: 'web-browser',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || '요청 실패');
      }

      sessionId = data.session_id || sessionId;
      naturalSessionId =
        data.natural_session_id || naturalSessionId || sessionId;

      setPresence(data);
      renderProgress(data.progress || []);
      appendBubble('assistant', data.assistant_text || '응답을 받았어요.');

      (data.cards || []).forEach(appendCard);
    } catch (error) {
      setPresence({
        character_mood: 'CAUTION',
        presence_label: MOOD_COPY.CAUTION,
        status: 'DENY',
      });
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

  setPresence({
    character_mood: 'LISTENING',
    presence_label: MOOD_COPY.LISTENING,
    status: 'IDLE',
  });
  renderProgress([]);
  input.focus();
})();
