(() => {
  const splash = document.getElementById('splash');
  const login = document.getElementById('login');
  const status = document.getElementById('status');
  const hold = document.getElementById('hold');
  const finishButton = document.getElementById('finish');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let timers = [];
  let generation = 0;
  let waiting = false;
  let settling = false;
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  function finish() {
    if (settling || document.body.classList.contains('complete')) return;
    settling = true;
    timers.forEach(clearTimeout);
    timers = [];
    document.body.classList.add('assembled');
    status.textContent = '준비되었습니다.';
    splash.setAttribute('aria-busy', 'false');
    later(() => {
      document.body.classList.add('complete');
      splash.setAttribute('aria-hidden', 'true');
      login.inert = false;
      login.removeAttribute('aria-hidden');
      finishButton.hidden = true;
    }, reducedMotion.matches ? 0 : 440);
  }

  // The demo simulates startup. An integration can pass its real readiness
  // promise to window.splashPreview.start(readyPromise), without a minimum wait.
  function start(readyPromise) {
    const current = ++generation;
    timers.forEach(clearTimeout);
    timers = [];
    settling = false;
    document.body.classList.remove('assembled', 'complete');
    login.inert = true;
    login.setAttribute('aria-hidden', 'true');
    splash.removeAttribute('aria-hidden');
    splash.setAttribute('aria-busy', 'true');
    status.textContent = '프로그램을 준비하고 있습니다.';
    finishButton.hidden = !waiting;
    if (readyPromise) {
      Promise.resolve(readyPromise).then(() => {
        if (current === generation) finish();
      }).catch(() => {
        if (current !== generation) return;
        status.textContent = '준비하지 못했습니다. 다시 시도해주세요.';
        // Show the error instead of leaving a silent infinite loading state.
        status.classList.remove('sr-only');
        status.style.cssText = 'position:absolute;top:calc(50% + 65px);font-size:12px;color:#777e70';
      });
    } else if (!waiting) later(finish, 1600);
    status.className = 'sr-only';
    status.removeAttribute('style');
  }

  document.getElementById('replay').addEventListener('click', () => start());
  hold.addEventListener('click', () => {
    waiting = !waiting;
    hold.setAttribute('aria-pressed', String(waiting));
    start();
  });
  finishButton.addEventListener('click', finish);
  document.getElementById('loginForm').addEventListener('submit', event => {
    event.preventDefault();
    document.getElementById('formNote').textContent = '로그인 화면 시안입니다. 입력 내용은 전송하지 않았습니다.';
  });
  document.addEventListener('visibilitychange', () => {
    document.querySelector('.thread').style.animationPlayState = document.hidden ? 'paused' : 'running';
  });
  window.splashPreview = { start, finish };
  start();
})();
