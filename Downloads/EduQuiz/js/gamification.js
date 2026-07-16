/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  js/gamification.js — XP · Streak · Huy hiệu cho EduQuiz         ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Module độc lập, KHÔNG đụng vào quiz-engine.js — chỉ đọc kết quả bài
 * làm (đã có sẵn trong `rec` mà saveRecord() tạo ra) và tự quản lý
 * state riêng trong localStorage key "eduquiz_gamestate".
 *
 * Cách dùng ở trang khác (vd. ic3-dashboard.html):
 *   const state = EduGamification.getState();
 *   // state.xp, state.level, state.streak, state.badges: string[]
 *
 * Cách hiển thị nhanh trong lobby (index.html), thêm vào cuối <body>:
 *   <script src="js/gamification.js"></script>
 *   <script>EduGamification.renderInto('#lobbyGameStrip');</script>
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'eduquiz_gamestate';
  const XP_PER_CORRECT = 10;
  const XP_PER_MINITEST_DONE = 50;
  const XP_PER_PERFECT_SCORE = 100; // thêm, cộng dồn cùng XP_PER_MINITEST_DONE

  const LEVEL_THRESHOLDS = [0, 100, 250, 500, 900, 1400, 2000, 2800, 3800, 5000];

  const BADGE_DEFS = [
    { id: 'first_quiz',    label: '🎉 Bài đầu tiên',     check: s => s.totalQuizzes >= 1 },
    { id: 'streak_3',      label: '🔥 3 ngày liên tiếp', check: s => s.streak >= 3 },
    { id: 'streak_7',      label: '🔥 7 ngày liên tiếp', check: s => s.streak >= 7 },
    { id: 'perfect_score', label: '🏆 Điểm tuyệt đối',   check: s => s.perfectScores >= 1 },
    { id: 'ten_quizzes',   label: '📚 10 bài đã làm',    check: s => s.totalQuizzes >= 10 },
  ];

  function _today() {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, ổn định múi giờ trình duyệt
  }

  function _defaultState() {
    return {
      xp: 0,
      totalQuizzes: 0,
      perfectScores: 0,
      streak: 0,
      lastPlayedDate: null, // YYYY-MM-DD
      badges: [],
    };
  }

  function getState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return _defaultState();
      return Object.assign(_defaultState(), JSON.parse(raw));
    } catch (e) {
      console.warn('[Gamification] Không đọc được state, dùng mặc định.', e);
      return _defaultState();
    }
  }

  function _saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('[Gamification] Không lưu được state.', e);
    }
  }

  function levelForXp(xp) {
    let lvl = 1;
    for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
      if (xp >= LEVEL_THRESHOLDS[i]) lvl = i + 1;
    }
    return lvl;
  }

  function xpToNextLevel(xp) {
    const nextThreshold = LEVEL_THRESHOLDS.find(t => t > xp);
    return nextThreshold === undefined ? null : nextThreshold - xp;
  }

  /** Cập nhật streak dựa trên ngày làm bài gần nhất. */
  function _updateStreak(state) {
    const today = _today();
    if (state.lastPlayedDate === today) {
      // Đã làm bài hôm nay rồi → streak không đổi
      return;
    }
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (state.lastPlayedDate === yesterday) {
      state.streak += 1; // liên tiếp
    } else {
      state.streak = 1; // đứt quãng → bắt đầu lại
    }
    state.lastPlayedDate = today;
  }

  /**
   * Gọi hàm này sau mỗi lần nộp bài (đã được hook trong quiz-engine.js § SAVE RECORD).
   * @param {object} rec — bản ghi kết quả, có { correct, total, score }
   * @returns {{ xpGained: number, newBadges: object[], state: object }}
   */
  function recordResult(rec) {
    const state = getState();
    _updateStreak(state);

    const correct = rec.correct || 0;
    const isPerfect = rec.total > 0 && correct === rec.total;

    let xpGained = correct * XP_PER_CORRECT + XP_PER_MINITEST_DONE;
    if (isPerfect) xpGained += XP_PER_PERFECT_SCORE;

    state.xp += xpGained;
    state.totalQuizzes += 1;
    if (isPerfect) state.perfectScores += 1;

    const newBadges = [];
    BADGE_DEFS.forEach(def => {
      if (!state.badges.includes(def.id) && def.check(state)) {
        state.badges.push(def.id);
        newBadges.push(def);
      }
    });

    _saveState(state);
    return { xpGained, newBadges, state };
  }

  /** Render 1 dải nhỏ (streak + level + XP) vào 1 container có sẵn trên trang. */
  function renderInto(selector) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) return;
    const s = getState();
    const lvl = levelForXp(s.xp);
    const toNext = xpToNextLevel(s.xp);

    el.innerHTML = `
      <div class="eduquiz-game-strip" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:14px;">
        <span class="chip" style="background:#fff3cd;border:1px solid #ffe08a;border-radius:999px;padding:4px 12px;">
          ⭐ Cấp ${lvl} · ${s.xp} XP${toNext !== null ? ` (còn ${toNext} XP lên cấp)` : ' (MAX)'}
        </span>
        <span class="chip" style="background:#ffe5e5;border:1px solid #ffb3b3;border-radius:999px;padding:4px 12px;">
          🔥 Chuỗi ${s.streak} ngày
        </span>
        <span class="chip" style="background:#e0e7ff;border:1px solid #c7d2fe;border-radius:999px;padding:4px 12px;">
          🎖️ ${s.badges.length} huy hiệu
        </span>
      </div>
    `;
  }

  global.EduGamification = {
    getState,
    recordResult,
    renderInto,
    levelForXp,
    xpToNextLevel,
    BADGE_DEFS,
  };
})(window);
