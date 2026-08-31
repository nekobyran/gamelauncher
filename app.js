(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = { config: null, release: null, platform: 'windows', motion: true };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const saveData = connection?.saveData === true;
  const lowPower = saveData || Number(navigator.hardwareConcurrency || 8) <= 4 || Number(navigator.deviceMemory || 8) <= 4;

  const setText = (selector, value) => {
    const element = $(selector);
    if (element) element.textContent = value ?? '—';
  };

  async function loadJson(path) {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.json();
  }

  function renderList(selector, items) {
    const list = $(selector);
    if (!list) return;
    list.replaceChildren(...items.map((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      return li;
    }));
  }

  function selectPlatform(platformId, focus = false) {
    const platform = state.release?.platforms?.find((item) => item.id === platformId);
    if (!platform) return;
    state.platform = platformId;

    $$('[data-platform]').forEach((button) => {
      const active = button.dataset.platform === platformId;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      if (active && focus) button.focus();
    });

    const stack = $('.device-stack');
    if (stack) stack.dataset.active = platformId;
    setText('#platformGlyph', platform.glyph);
    setText('#platformStatus', platform.statusLabel);
    setText('#platformTitle', platform.title);
    setText('#platformFile', platform.fileName);
    setText('#platformVersion', state.release.release.version);
    setText('#platformArch', platform.architecture);
    setText('#platformPackage', platform.packageType);
    setText('#platformChecksum', platform.sha256);
    setText('#accessNotice', state.release.release.accessNotice);

    const steps = $('#installSteps');
    if (steps) {
      steps.replaceChildren(...platform.installSteps.map((text, index) => {
        const li = document.createElement('li');
        const marker = document.createElement('span');
        marker.textContent = String(index + 1).padStart(2, '0');
        li.append(marker, document.createTextNode(text));
        return li;
      }));
    }

    const download = $('#downloadAction');
    if (download) {
      download.href = platform.downloadUrl || state.release.release.releasePageUrl;
      const label = $('span', download);
      if (label) label.textContent = platform.actionLabel;
    }
    setText('#heroDownloadLabel', `${platform.shortLabel} 当前版本`);
  }

  function renderRelease() {
    const { config, release } = state;
    document.title = `${release.release.productName} · ${release.release.channel}`;
    setText('#topStatus', release.release.channel.toUpperCase());
    setText('#releaseChannel', release.release.channel.toUpperCase());
    setText('#releaseIndex', release.release.sequence);
    setText('#heroVersion', release.release.version);
    setText('#heroPlatforms', String(release.platforms.length).padStart(2, '0'));
    setText('#stageVersion', release.release.version);
    setText('#footerDomain', config.customDomain);

    const footerDomain = $('#footerDomain');
    if (footerDomain) footerDomain.href = `https://${config.customDomain}`;
    const githubLink = $('#githubLink');
    if (githubLink) githubLink.href = release.release.releasePageUrl;

    selectPlatform(state.platform);
  }

  async function copyChecksum() {
    const value = $('#platformChecksum')?.textContent.trim();
    if (!value || value === '—') return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const area = document.createElement('textarea');
      area.value = value;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    const label = $('#copyChecksum span');
    if (!label) return;
    const previous = label.textContent;
    label.textContent = '已复制';
    setTimeout(() => { label.textContent = previous; }, 1400);
  }

  function setupInteractions() {
    const platformButtons = $$('[data-platform]');
    platformButtons.forEach((button, index) => {
      button.addEventListener('click', () => selectPlatform(button.dataset.platform));
      button.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'ArrowRight'
          ? (index + 1) % platformButtons.length
          : (index - 1 + platformButtons.length) % platformButtons.length;
        selectPlatform(platformButtons[next].dataset.platform, true);
      });
    });

    $('#copyChecksum')?.addEventListener('click', copyChecksum);

    const revealItems = [...document.querySelectorAll('.reveal')];
    const revealAll = () => revealItems.forEach((element) => element.classList.add('is-visible'));
    if ('IntersectionObserver' in window && state.motion) {
      const revealObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      }, { threshold: 0.12, rootMargin: '0px 0px -5% 0px' });
      document.documentElement.classList.add('reveal-enhanced');
      revealItems.forEach((element) => revealObserver.observe(element));
      setTimeout(() => {
        revealAll();
        revealObserver.disconnect();
      }, 900);
    } else {
      revealAll();
    }

    if (matchMedia('(pointer:fine)').matches) {
      document.body.classList.add('has-pointer');
      const glow = $('#cursorGlow');
      addEventListener('pointermove', (event) => {
        if (!glow) return;
        glow.style.left = `${event.clientX}px`;
        glow.style.top = `${event.clientY}px`;
      }, { passive: true });

      $$('.magnetic').forEach((element) => {
        element.addEventListener('pointermove', (event) => {
          if (!state.motion) return;
          const box = element.getBoundingClientRect();
          const x = (event.clientX - box.left - box.width / 2) * 0.13;
          const y = (event.clientY - box.top - box.height / 2) * 0.13;
          element.style.transform = `translate3d(${x}px,${y}px,0)`;
        });
        element.addEventListener('pointerleave', () => { element.style.transform = ''; });
      });

      const stage = $('#coreStage');
      const stack = $('.device-stack');
      stage?.addEventListener('pointermove', (event) => {
        if (!state.motion || !stack) return;
        const box = stage.getBoundingClientRect();
        const x = (event.clientX - box.left) / box.width - 0.5;
        const y = (event.clientY - box.top) / box.height - 0.5;
        stack.style.transform = `rotateY(${x * 7}deg) rotateX(${-y * 5}deg)`;
      });
      stage?.addEventListener('pointerleave', () => {
        if (stack) stack.style.transform = '';
      });
    }
  }

  function setMotion(enabled) {
    state.motion = enabled && !reducedMotion.matches && !saveData;
    document.body.classList.toggle('motion-off', !state.motion);
    $('#motionToggle')?.setAttribute('aria-pressed', String(!state.motion));
    try { localStorage.setItem('gamelauncher-motion', state.motion ? 'on' : 'off'); } catch {}
    dispatchEvent(new CustomEvent('gamelauncher:motion', { detail: state.motion }));
  }

  function setupMotionControl() {
    let stored = null;
    try { stored = localStorage.getItem('gamelauncher-motion'); } catch {}
    setMotion(stored !== 'off');
    $('#motionToggle')?.addEventListener('click', () => setMotion(!state.motion));
    reducedMotion.addEventListener('change', () => setMotion(state.motion));
  }

  function setupStarfield() {
    const canvas = $('#starfield');
    const context = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !context) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let frame = 0;
    let running = true;
    let particles = [];
    let previousTime = 0;
    const pointer = { x: 0.68, y: 0.42 };

    const createParticle = () => ({
      angle: Math.random() * Math.PI * 2,
      radius: 90 + Math.random() * Math.max(width, height) * 0.52,
      speed: (0.00008 + Math.random() * 0.00022) * (Math.random() > 0.5 ? 1 : -1),
      size: 0.35 + Math.random() * 1.25,
      alpha: 0.12 + Math.random() * 0.48,
      depth: 0.35 + Math.random() * 1.1,
      tint: Math.random()
    });

    function resize() {
      width = innerWidth;
      height = innerHeight;
      dpr = Math.min(devicePixelRatio || 1, lowPower ? 1 : (width < 720 ? 1.25 : 1.8));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = lowPower ? 18 : Math.min(width < 720 ? 34 : 76, Math.max(24, Math.floor((width * height) / 23000)));
      particles = Array.from({ length: count }, createParticle);
    }

    function draw(time) {
      frame = requestAnimationFrame(draw);
      if (!running || !state.motion) {
        previousTime = time;
        return;
      }
      const delta = Math.min(32, Math.max(0, time - previousTime || 16.67));
      previousTime = time;
      context.clearRect(0, 0, width, height);
      const centerX = width * pointer.x;
      const centerY = height * pointer.y;

      for (const particle of particles) {
        particle.angle += particle.speed * delta;
        const x = centerX + Math.cos(particle.angle) * particle.radius;
        const y = centerY + Math.sin(particle.angle) * particle.radius * 0.48;
        if (x < -20 || x > width + 20 || y < -20 || y > height + 20) continue;
        const tint = particle.tint > 0.82 ? '121,185,106' : particle.tint < 0.16 ? '166,216,103' : '78,123,61';
        context.beginPath();
        context.fillStyle = `rgba(${tint},${particle.alpha})`;
        context.arc(x, y, particle.size * particle.depth, 0, Math.PI * 2);
        context.fill();
      }
    }

    addEventListener('resize', resize, { passive: true });
    addEventListener('pointermove', (event) => {
      if (!width || !height) return;
      pointer.x += ((event.clientX / width) * 0.2 + 0.58 - pointer.x) * 0.06;
      pointer.y += ((event.clientY / height) * 0.15 + 0.34 - pointer.y) * 0.06;
    }, { passive: true });
    document.addEventListener('visibilitychange', () => {
      running = !document.hidden;
      previousTime = performance.now();
    });
    addEventListener('gamelauncher:motion', (event) => {
      if (!event.detail) context.clearRect(0, 0, width, height);
      previousTime = performance.now();
    });
    resize();
    frame = requestAnimationFrame(draw);
    addEventListener('pagehide', () => cancelAnimationFrame(frame), { once: true });
  }

  async function boot() {
    try {
      [state.config, state.release] = await Promise.all([
        loadJson('/site.config.json'),
        loadJson('/release.json')
      ]);
      renderRelease();
    } catch (error) {
      console.error('Release data unavailable', error);
      const errorMessage = $('#dataError');
      if (errorMessage) errorMessage.hidden = false;
      setText('#platformStatus', 'RELEASE DATA UNAVAILABLE');
      setText('#platformFile', '请直接前往公开 GitHub Release');
    } finally {
      setupInteractions();
      setupMotionControl();
      setupStarfield();
      requestAnimationFrame(() => { document.documentElement.dataset.ready = 'true'; });
    }
  }

  boot();
})();
