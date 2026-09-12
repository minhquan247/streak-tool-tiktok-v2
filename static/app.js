document.addEventListener('DOMContentLoaded', () => {
  const scheduleTimeInput = document.getElementById('scheduleTime');
  const delayMinInput = document.getElementById('delayMin');
  const delayMaxInput = document.getElementById('delayMax');
  const videoLinksInput = document.getElementById('videoLinks');
  const cookieJsonInput = document.getElementById('cookieJsonInput');
  const telegramEnabledCheck = document.getElementById('telegramEnabled');
  const telegramBotTokenInput = document.getElementById('telegramBotToken');
  const telegramChatIdInput = document.getElementById('telegramChatId');
  const newRecipientInput = document.getElementById('newRecipientInput');
  const recipientsListContainer = document.getElementById('recipientsList');

  const testUsernameInput = document.getElementById('testUsername');
  const testVideoUrlInput = document.getElementById('testVideoUrl');
  const btnTestSend = document.getElementById('btnTestSend');

  const statusBadgeText = document.getElementById('statusBadgeText');
  const statusPill = document.getElementById('statusPill');
  const cookieBadgeText = document.getElementById('cookieBadgeText');
  const statusMessage = document.getElementById('statusMessage');

  const btnSaveConfig = document.getElementById('btnSaveConfig');
  const btnSaveCookies = document.getElementById('btnSaveCookies');
  const btnAddRecipient = document.getElementById('btnAddRecipient');
  const btnSelectAll = document.getElementById('btnSelectAll');
  const btnDeselectAll = document.getElementById('btnDeselectAll');
  const btnStartSender = document.getElementById('btnStartSender');
  const btnStopSender = document.getElementById('btnStopSender');
  const toastContainer = document.getElementById('toastContainer');

  let currentRecipients = [];

  // ===========================================
  // Card Entrance Animations (Intersection Observer)
  // ===========================================
  const animateCards = document.querySelectorAll('.animate-card');
  const observerOptions = {
    root: null,
    rootMargin: '0px 0px -40px 0px',
    threshold: 0.1,
  };

  const cardObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
      if (entry.isIntersecting) {
        // Stagger the animation delay for sequential reveal
        const cardIndex = Array.from(animateCards).indexOf(entry.target);
        entry.target.style.animationDelay = `${cardIndex * 0.08}s`;
        entry.target.classList.add('visible');
        cardObserver.unobserve(entry.target);
      }
    });
  }, observerOptions);

  animateCards.forEach((card) => cardObserver.observe(card));

  // ===========================================
  // Toast Notification System
  // ===========================================
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(30px) scale(0.95)';
      toast.style.transition = 'all 0.35s ease';
      setTimeout(() => toast.remove(), 350);
    }, 4200);
  }

  // ===========================================
  // Button Ripple Effect
  // ===========================================
  document.querySelectorAll('.btn').forEach((btn) => {
    btn.addEventListener('click', function (e) {
      const ripple = document.createElement('span');
      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
      ripple.style.position = 'absolute';
      ripple.style.borderRadius = '50%';
      ripple.style.background = 'rgba(255,255,255,0.3)';
      ripple.style.transform = 'scale(0)';
      ripple.style.animation = 'rippleExpand 0.5s ease forwards';
      ripple.style.pointerEvents = 'none';
      this.appendChild(ripple);
      setTimeout(() => ripple.remove(), 550);
    });
  });

  // Inject ripple keyframes
  const rippleStyle = document.createElement('style');
  rippleStyle.textContent = `
    @keyframes rippleExpand {
      to { transform: scale(2.5); opacity: 0; }
    }
  `;
  document.head.appendChild(rippleStyle);

  // ===========================================
  // Load Config
  // ===========================================
  async function loadConfig() {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (data.config) {
        const config = data.config;
        scheduleTimeInput.value = config.schedule?.time || '00:00';
        const delay = config.tiktok?.message_delay_seconds || [8, 18];
        delayMinInput.value = delay[0] || 8;
        delayMaxInput.value = delay[1] || 18;
        videoLinksInput.value = (config.videos || []).join('\n');

        telegramEnabledCheck.checked = config.telegram?.enabled || false;
        telegramBotTokenInput.value = config.telegram?.bot_token || '';
        telegramChatIdInput.value = config.telegram?.chat_id || '';

        currentRecipients = config.recipients || [];
        renderRecipients();
      }

      updateCookieBadge(data.cookies_valid);
    } catch (err) {
      showToast('Lỗi tải cấu hình ban đầu!', 'error');
    }
  }

  function updateCookieBadge(isValid) {
    if (isValid) {
      cookieBadgeText.textContent = 'Hợp lệ';
      cookieBadgeText.className = 'valid';
    } else {
      cookieBadgeText.textContent = 'Hết hạn / Chưa có';
      cookieBadgeText.className = 'invalid';
    }
  }

  // ===========================================
  // Render Recipients
  // ===========================================
  function renderRecipients() {
    recipientsListContainer.innerHTML = '';
    if (currentRecipients.length === 0) {
      recipientsListContainer.innerHTML =
        '<p style="color: var(--text-muted); font-size: 13px; padding: 12px 0;">Chưa có người nhận nào. Vui lòng thêm username ở trên.</p>';
      return;
    }

    currentRecipients.forEach((rec, idx) => {
      const item = document.createElement('div');
      item.className = 'user-item-box';
      item.style.animationDelay = `${idx * 0.04}s`;
      const displayName = rec.name || rec.username;
      const handle = rec.username ? `@${rec.username}` : '(Chưa xác minh)';
      const initial = (displayName[0] || 'T').toUpperCase();

      item.innerHTML = `
        <div class="user-left-info">
          <input type="checkbox" checked data-index="${idx}" />
          <div class="user-avatar">${initial}</div>
          <div class="user-details">
            <strong>${displayName}</strong>
            <small>${handle}</small>
          </div>
        </div>
        <button class="btn-remove" data-index="${idx}">&times;</button>
      `;
      recipientsListContainer.appendChild(item);
    });

    document.querySelectorAll('.btn-remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        const box = e.target.closest('.user-item-box');
        box.style.transition = 'all 0.3s ease';
        box.style.opacity = '0';
        box.style.transform = 'translateX(20px) scale(0.95)';
        setTimeout(() => {
          currentRecipients.splice(index, 1);
          renderRecipients();
        }, 300);
      });
    });
  }

  // ===========================================
  // Save Config
  // ===========================================
  async function saveConfig() {
    const videoList = videoLinksInput.value
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const checkedBoxes = document.querySelectorAll('.user-item-box input[type="checkbox"]:checked');
    const selectedRecipients = Array.from(checkedBoxes).map((box) => {
      const idx = parseInt(box.dataset.index);
      return currentRecipients[idx];
    });

    const payload = {
      schedule: {
        time: scheduleTimeInput.value || '00:00',
        timezone: 'Asia/Ho_Chi_Minh',
        run_on_start: true,
      },
      tiktok: {
        message_delay_seconds: [
          parseInt(delayMinInput.value || 8),
          parseInt(delayMaxInput.value || 18),
        ],
        headless: true,
      },
      videos: videoList,
      recipients: selectedRecipients,
      telegram: {
        enabled: telegramEnabledCheck.checked,
        bot_token: telegramBotTokenInput.value,
        chat_id: telegramChatIdInput.value,
      },
    };

    try {
      statusMessage.textContent = 'Đang lưu cấu hình...';
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        statusMessage.textContent = 'Đã lưu cấu hình thành công!';
        showToast('Đã lưu cấu hình thành công!', 'success');
      } else {
        statusMessage.textContent = 'Lỗi lưu: ' + (data.error || 'Không xác định');
        showToast('Lỗi lưu cấu hình: ' + data.error, 'error');
      }
    } catch (err) {
      statusMessage.textContent = 'Lưu thất bại!';
      showToast('Không thể kết nối đến server!', 'error');
    }
  }

  // ===========================================
  // Save Cookies
  // ===========================================
  btnSaveCookies.addEventListener('click', async () => {
    const rawCookies = cookieJsonInput.value.trim();
    if (!rawCookies) {
      showToast('Vui lòng dán mã cookie JSON vào ô trước khi lưu!', 'error');
      return;
    }

    try {
      statusMessage.textContent = 'Đang kiểm tra và lưu Cookie...';
      const res = await fetch('/api/cookies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies: rawCookies }),
      });
      const data = await res.json();
      if (res.ok) {
        updateCookieBadge(data.valid);
        statusMessage.textContent = `Đã cập nhật ${data.count} cookie thành công!`;
        showToast(`Đã cập nhật thành công ${data.count} cookie!`, 'success');
      } else {
        showToast('Lỗi lưu cookie: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Mã cookie không đúng định dạng JSON hợp lệ!', 'error');
    }
  });

  // ===========================================
  // Add Recipient
  // ===========================================
  btnAddRecipient.addEventListener('click', () => {
    const val = newRecipientInput.value.trim();
    if (!val) return;
    const cleanUsername = val.replace(/^@/, '');
    currentRecipients.push({ name: cleanUsername, username: cleanUsername });
    newRecipientInput.value = '';
    renderRecipients();
    showToast(`Đã thêm @${cleanUsername} vào danh sách!`, 'success');
  });

  // Allow Enter key to add recipient
  newRecipientInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      btnAddRecipient.click();
    }
  });

  btnSelectAll.addEventListener('click', () => {
    document.querySelectorAll('.user-item-box input[type="checkbox"]').forEach((box) => (box.checked = true));
    showToast('Đã chọn tất cả', 'success');
  });

  btnDeselectAll.addEventListener('click', () => {
    document.querySelectorAll('.user-item-box input[type="checkbox"]').forEach((box) => (box.checked = false));
  });

  btnSaveConfig.addEventListener('click', saveConfig);

  // ===========================================
  // Test Send
  // ===========================================
  btnTestSend.addEventListener('click', async () => {
    const targetUser = testUsernameInput.value.trim().replace(/^@/, '');
    const videoUrl = testVideoUrlInput.value.trim();

    if (!targetUser) {
      showToast('Vui lòng nhập Username TikTok cần gửi thử!', 'error');
      return;
    }

    try {
      statusMessage.textContent = `Đang khởi động gửi tin nhắn thử tới @${targetUser}...`;
      btnTestSend.disabled = true;

      const res = await fetch('/api/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: targetUser, video_url: videoUrl }),
      });
      const data = await res.json();

      if (res.ok) {
        statusMessage.textContent = data.message;
        statusBadgeText.textContent = 'Đang chạy';
        statusPill.className = 'status-pill running';
        showToast(`Đang gửi tin nhắn thử tới @${targetUser}...`, 'success');
      } else {
        showToast('Lỗi gửi thử: ' + data.error, 'error');
        statusMessage.textContent = 'Lỗi gửi thử: ' + data.error;
      }
    } catch (err) {
      showToast('Lỗi kết nối khi gửi thử!', 'error');
    } finally {
      setTimeout(() => { btnTestSend.disabled = false; }, 3000);
    }
  });

  // ===========================================
  // Start / Stop Sender
  // ===========================================
  btnStartSender.addEventListener('click', async () => {
    await saveConfig();
    try {
      const res = await fetch('/api/start', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        statusBadgeText.textContent = 'Đang chạy';
        statusPill.className = 'status-pill running';
        statusMessage.textContent = 'Đã khởi động tiến trình tự động gửi!';
        btnStartSender.disabled = true;
        btnStopSender.disabled = false;
        showToast('Đã khởi động tiến trình tự động gửi!', 'success');
      } else {
        showToast('Không thể chạy: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Lỗi khởi động!', 'error');
    }
  });

  btnStopSender.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/stop', { method: 'POST' });
      const data = await res.json();
      statusBadgeText.textContent = 'Đã dừng';
      statusPill.className = 'status-pill';
      statusMessage.textContent = 'Đã dừng tiến trình tự động gửi.';
      btnStartSender.disabled = false;
      btnStopSender.disabled = true;
      showToast('Đã dừng tiến trình!', 'info');
    } catch (err) {
      console.error(err);
    }
  });

  // ===========================================
  // Auto Status Polling
  // ===========================================
  setInterval(async () => {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      if (data.status === 'running') {
        statusBadgeText.textContent = 'Đang chạy';
        statusPill.className = 'status-pill running';
        btnStartSender.disabled = true;
        btnStopSender.disabled = false;
      } else if (data.status === 'finished') {
        statusBadgeText.textContent = 'Hoàn thành';
        statusPill.className = 'status-pill';
        btnStartSender.disabled = false;
        btnStopSender.disabled = true;
      }
      if (data.message) {
        statusMessage.textContent = data.message;
      }
    } catch (e) {
      // quiet
    }
  }, 5000);

  loadConfig();
});
