// content-script.js
// DOM Event Capture Script - Injected into web pages to capture user interactions

let recordingStartTime = null;
let events = [];
let isRecording = false;
let scrollTimeout = null;
let mutationObserver = null;
let currentSessionId = null;
// ✅ SAFE FIX #10: Track last scroll position for threshold
let lastScrollY = 0;
let lastScrollX = 0;
let isPaused = false;
let overlayElement = null;
let recordingTimer = null;
let secondsElapsed = 0;

// Initialize recording session
function startRecording(sessionId) {
  recordingStartTime = Date.now();
  events = [];
  isRecording = true;
  currentSessionId = sessionId;
  lastScrollY = window.scrollY;
  lastScrollX = window.scrollX;
  attachEventListeners();
  startMutationObserver();
  createOverlay();
  startTimer();
  console.log('[content-script] Recording started with sessionId:', sessionId);
}

function startTimer() {
  secondsElapsed = 0;
  recordingTimer = setInterval(() => {
    secondsElapsed++;
    updateOverlay();
  }, 1000);
}

function stopTimer() {
  if (recordingTimer) {
    clearInterval(recordingTimer);
    recordingTimer = null;
  }
}

function stopRecording() {
  isRecording = false;
  removeEventListeners();
  stopMutationObserver();
  stopTimer();
  destroyOverlay();

  const sessionData = {
    sessionId: currentSessionId,
    startTime: recordingStartTime,
    endTime: Date.now(),
    url: window.location.href,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    },
    events: events
  };

  console.log('[content-script] Recording stopped, sessionId:', currentSessionId);
  console.log('[content-script] Events captured:', events.length);
  return sessionData;
}

// Attach event listeners
function attachEventListeners() {
  // Click events
  document.addEventListener('click', handleClick, true); // Use capture phase

  // Input events
  document.addEventListener('input', handleInput, true);
  document.addEventListener('change', handleChange, true);

  // Focus events
  document.addEventListener('focus', handleFocus, true);
  document.addEventListener('blur', handleBlur, true);

  // Scroll events (debounced)
  window.addEventListener('scroll', handleScrollDebounced, true);

  // Page navigation detection
  window.addEventListener('popstate', handleStepChange);

  // Intercept pushState/replaceState for SPA navigation
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    originalPushState.apply(history, args);
    handleStepChange();
  };

  history.replaceState = function (...args) {
    originalReplaceState.apply(history, args);
    handleStepChange();
  };

  // Shadow DOM event listener support
  document.addEventListener('mouseover', handleShadowDomEvents, true);
}

function handleShadowDomEvents(e) {
  if (!isRecording || isPaused) return;
  const path = e.composedPath();
  const shadowTarget = path[0];

  if (shadowTarget && shadowTarget.shadowRoot && !shadowTarget._hasCluesoListener) {
    shadowTarget.shadowRoot.addEventListener('click', handleClick, true);
    shadowTarget.shadowRoot.addEventListener('input', handleInput, true);
    shadowTarget._hasCluesoListener = true;
  }
}

function removeEventListeners() {
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('input', handleInput, true);
  document.removeEventListener('change', handleChange, true);
  document.removeEventListener('focus', handleFocus, true);
  document.removeEventListener('blur', handleBlur, true);
  window.removeEventListener('scroll', handleScrollDebounced, true);
  window.removeEventListener('popstate', handleStepChange);
}

// Click event handler
function handleClick(e) {
  if (!isRecording || isPaused) return;

  const target = e.target;
  const bbox = target.getBoundingClientRect();

  const event = {
    timestamp: Date.now() - recordingStartTime,
    type: 'click',
    target: {
      tag: target.tagName,
      id: target.id || null,
      classes: Array.from(target.classList),
      text: getVisibleText(target),
      selector: generateSelector(target),
      bbox: {
        x: Math.round(bbox.x),
        y: Math.round(bbox.y),
        width: Math.round(bbox.width),
        height: Math.round(bbox.height)
      },
      attributes: getImportantAttributes(target)
    },
    metadata: {
      url: window.location.href,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    }
  };

  events.push(event);
  sendEventToBackground(event);
}

// Input event handler
function handleInput(e) {
  if (!isRecording || isPaused) return;

  const target = e.target;
  if (!target.matches('input, textarea, select')) return;

  const bbox = target.getBoundingClientRect();

  const event = {
    timestamp: Date.now() - recordingStartTime,
    type: 'type',
    target: {
      tag: target.tagName,
      id: target.id || null,
      classes: Array.from(target.classList),
      text: null,
      selector: generateSelector(target),
      bbox: {
        x: Math.round(bbox.x),
        y: Math.round(bbox.y),
        width: Math.round(bbox.width),
        height: Math.round(bbox.height)
      },
      attributes: getImportantAttributes(target),
      type: target.type || null,
      name: target.name || null
    },
    value: target.value,
    metadata: {
      url: window.location.href,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    }
  };

  events.push(event);
  sendEventToBackground(event);
}

// Change event handler (for select dropdowns, checkboxes, etc.)
function handleChange(e) {
  if (!isRecording || isPaused) return;

  const target = e.target;
  if (!target.matches('input, textarea, select')) return;

  const bbox = target.getBoundingClientRect();

  const event = {
    timestamp: Date.now() - recordingStartTime,
    type: 'type',
    target: {
      tag: target.tagName,
      id: target.id || null,
      classes: Array.from(target.classList),
      text: null,
      selector: generateSelector(target),
      bbox: {
        x: Math.round(bbox.x),
        y: Math.round(bbox.y),
        width: Math.round(bbox.width),
        height: Math.round(bbox.height)
      },
      attributes: getImportantAttributes(target),
      type: target.type || null,
      name: target.name || null
    },
    value: target.type === 'checkbox' || target.type === 'radio'
      ? target.checked
      : target.value,
    metadata: {
      url: window.location.href,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    }
  };

  events.push(event);
  sendEventToBackground(event);
}

// Focus event handler
function handleFocus(e) {
  if (!isRecording || isPaused) return;

  const target = e.target;
  if (!target.matches('input, textarea, select')) return;

  const bbox = target.getBoundingClientRect();

  const event = {
    timestamp: Date.now() - recordingStartTime,
    type: 'focus',
    target: {
      tag: target.tagName,
      id: target.id || null,
      classes: Array.from(target.classList),
      text: null,
      selector: generateSelector(target),
      bbox: {
        x: Math.round(bbox.x),
        y: Math.round(bbox.y),
        width: Math.round(bbox.width),
        height: Math.round(bbox.height)
      },
      attributes: getImportantAttributes(target),
      type: target.type || null,
      name: target.name || null
    },
    metadata: {
      url: window.location.href,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    }
  };

  events.push(event);
}

// Blur event handler
function handleBlur(e) {
  if (!isRecording || isPaused) return;

  const target = e.target;
  if (!target.matches('input, textarea, select')) return;

  const bbox = target.getBoundingClientRect();

  const event = {
    timestamp: Date.now() - recordingStartTime,
    type: 'blur',
    target: {
      tag: target.tagName,
      id: target.id || null,
      classes: Array.from(target.classList),
      text: null,
      selector: generateSelector(target),
      bbox: {
        x: Math.round(bbox.x),
        y: Math.round(bbox.y),
        width: Math.round(bbox.width),
        height: Math.round(bbox.height)
      },
      attributes: getImportantAttributes(target),
      type: target.type || null,
      name: target.name || null
    },
    metadata: {
      url: window.location.href,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    }
  };

  events.push(event);
}

// Debounced scroll handler
function handleScrollDebounced() {
  if (!isRecording || isPaused) return;

  clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    handleScroll();
  }, 300);
}

// Scroll event handler
function handleScroll() {
  if (!isRecording || isPaused) return;

  // ✅ SAFE FIX #10: Only record scroll if moved more than 100px
  const scrollDistanceY = Math.abs(window.scrollY - lastScrollY);
  const scrollDistanceX = Math.abs(window.scrollX - lastScrollX);

  if (scrollDistanceY < 100 && scrollDistanceX < 100) {
    return; // Not enough movement, ignore
  }

  lastScrollY = window.scrollY;
  lastScrollX = window.scrollX;

  const event = {
    timestamp: Date.now() - recordingStartTime,
    type: 'scroll',
    metadata: {
      url: window.location.href,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      scrollPosition: {
        x: window.scrollX,
        y: window.scrollY
      }
    }
  };

  events.push(event);
}

// Step change handler (page navigation, major UI changes)
function handleStepChange() {
  if (!isRecording || isPaused) return;

  const event = {
    timestamp: Date.now() - recordingStartTime,
    type: 'step_change',
    metadata: {
      url: window.location.href,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    }
  };

  events.push(event);
}

// Mutation observer for detecting major DOM changes (modals, etc.)
function startMutationObserver() {
  mutationObserver = new MutationObserver((mutations) => {
    if (!isRecording) return;

    // Intelligent filtering: Ignore noisy mutations
    const hasMajorChange = mutations.some(mutation => {
      // Ignore common overlay elements like clocks or dynamic ads
      const isNoisy = Array.from(mutation.addedNodes).some(node =>
        node.nodeType === 1 && (
          node.matches?.('.ad, .ads, .clock, .timer') ||
          node.closest?.('.ad, .ads, .clock, .timer')
        )
      );

      if (isNoisy) return false;

      return mutation.addedNodes.length > 5 ||
        mutation.removedNodes.length > 5 ||
        Array.from(mutation.addedNodes).some(node =>
          node.nodeType === 1 &&
          (node.matches?.('dialog, [role="dialog"], .modal, .overlay') || false)
        );
    });

    if (hasMajorChange) {
      handleStepChange();
    }
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function stopMutationObserver() {
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }
}

// Generate CSS selector for element
function generateSelector(element) {
  if (element.id) {
    return `#${element.id}`;
  }

  if (element.className) {
    const classes = Array.from(element.classList)
      .filter(cls => !cls.startsWith('_')) // Filter out framework classes
      .join('.');
    if (classes) {
      return `${element.tagName.toLowerCase()}.${classes}`;
    }
  }

  // Fallback: use path
  const path = [];
  let current = element;
  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector += `#${current.id}`;
      path.unshift(selector);
      break;
    }
    if (current.className) {
      const classes = Array.from(current.classList)
        .filter(cls => !cls.startsWith('_'))
        .slice(0, 2) // Limit classes
        .join('.');
      if (classes) selector += `.${classes}`;
    }

    const siblings = Array.from(current.parentElement?.children || [])
      .filter(el => el.tagName === current.tagName);
    if (siblings.length > 1) {
      const index = siblings.indexOf(current) + 1;
      selector += `:nth-of-type(${index})`;
    }

    path.unshift(selector);
    current = current.parentElement;
  }

  return path.join(' > ');
}

// Helper to find element through Shadow DOM boundaries
function findInShadow(selector) {
  let root = document.body;
  const parts = selector.split(' >>> ');

  for (const part of parts) {
    if (!root) return null;
    if (root.shadowRoot) {
      root = root.shadowRoot.querySelector(part);
    } else {
      root = root.querySelector(part);
    }
  }
  return root;
}

// Get visible text content
function getVisibleText(element) {
  // Get text content, excluding hidden elements
  const clone = element.cloneNode(true);
  const hidden = clone.querySelectorAll('[style*="display: none"], [style*="visibility: hidden"], [hidden]');
  hidden.forEach(el => el.remove());

  return clone.textContent?.trim() || null;
}

// Recording Overlay UI
function createOverlay() {
  if (overlayElement) return;

  overlayElement = document.createElement('div');
  overlayElement.id = 'clueso-recording-overlay';
  Object.assign(overlayElement.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    backgroundColor: '#1f2937',
    color: 'white',
    padding: '12px 16px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    zIndex: '2147483647',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    border: '1px solid #374151',
    pointerEvents: 'auto',
    userSelect: 'none'
  });

  const dot = document.createElement('div');
  Object.assign(dot.style, {
    width: '8px',
    height: '8px',
    backgroundColor: '#ef4444',
    borderRadius: '50%',
    animation: 'clueso-pulse 1.5s infinite'
  });

  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes clueso-pulse {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.1); }
      100% { opacity: 1; transform: scale(1); }
    }
  `;
  document.head.appendChild(style);

  const timeDisplay = document.createElement('span');
  timeDisplay.id = 'clueso-timer';
  timeDisplay.innerText = '00:00';

  const pauseBtn = document.createElement('button');
  pauseBtn.id = 'clueso-pause-btn';
  pauseBtn.innerText = 'Pause';
  Object.assign(pauseBtn.style, {
    backgroundColor: '#374151',
    border: 'none',
    color: 'white',
    padding: '4px 8px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px'
  });

  pauseBtn.onclick = () => {
    isPaused = !isPaused;
    pauseBtn.innerText = isPaused ? 'Resume' : 'Pause';
    dot.style.backgroundColor = isPaused ? '#f59e0b' : '#ef4444';
    dot.style.animation = isPaused ? 'none' : 'clueso-pulse 1.5s infinite';
    chrome.runtime.sendMessage({ type: isPaused ? 'PAUSE_RECORDING' : 'RESUME_RECORDING' });
  };

  const stopBtn = document.createElement('button');
  stopBtn.innerText = 'Stop';
  Object.assign(stopBtn.style, {
    backgroundColor: '#ef4444',
    border: 'none',
    color: 'white',
    padding: '4px 8px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px'
  });
  stopBtn.onclick = () => {
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
  };

  overlayElement.appendChild(dot);
  overlayElement.appendChild(timeDisplay);
  overlayElement.appendChild(pauseBtn);
  overlayElement.appendChild(stopBtn);
  document.body.appendChild(overlayElement);
}

function updateOverlay() {
  const timeDisplay = document.getElementById('clueso-timer');
  if (timeDisplay) {
    const mins = Math.floor(secondsElapsed / 60).toString().padStart(2, '0');
    const secs = (secondsElapsed % 60).toString().padStart(2, '0');
    timeDisplay.innerText = `${mins}:${secs}`;
  }
}

function destroyOverlay() {
  if (overlayElement) {
    overlayElement.remove();
    overlayElement = null;
  }
}

// Get important attributes
function getImportantAttributes(element) {
  const important = ['data-testid', 'aria-label', 'aria-labelledby', 'name', 'type', 'role'];
  const attrs = {};

  important.forEach(attr => {
    const value = element.getAttribute(attr);
    if (value) {
      attrs[attr] = value;
    }
  });

  return attrs;
}

// Send event to background script (optional: real-time sync)
function sendEventToBackground(event) {
  try {
    chrome.runtime.sendMessage({
      type: 'EVENT_CAPTURED',
      event: event
    });
  } catch (error) {
    // Ignore errors if background script is not available
    console.debug('[content-script] Could not send event to background:', error);
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ success: true, ready: true });
    return true;
  }

  if (message.type === 'START_RECORDING') {
    startRecording(message.sessionId);
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'STOP_RECORDING') {
    const sessionData = stopRecording();
    sendResponse({ success: true, sessionData: sessionData });
    return true;
  }

  if (message.type === 'PAUSE_RECORDING') {
    isPaused = true;
    const pauseBtn = document.getElementById('clueso-pause-btn');
    if (pauseBtn) pauseBtn.innerText = 'Resume';
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'RESUME_RECORDING') {
    isPaused = false;
    const pauseBtn = document.getElementById('clueso-pause-btn');
    if (pauseBtn) pauseBtn.innerText = 'Pause';
    sendResponse({ success: true });
    return true;
  }

  return true; // Keep message channel open for async response
});

console.log('[content-script] Content script loaded');