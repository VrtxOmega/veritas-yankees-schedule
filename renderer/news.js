/* ─── news.js — Yankees news ticker (MLB RSS feed) ──────────────────────── */

const NEWS_FEEDS = [
  'https://www.mlb.com/yankees/feeds/news/rss.xml',
  // ESPN MLB headlines as a fallback (broader coverage, may include Yankees mentions).
  'https://www.espn.com/espn/rss/mlb/news',
];
const NEWS_CACHE_KEY = 'yanks_news_v1';
const NEWS_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const NEWS_MAX_ITEMS = 14;

/**
 * Load Yankees news. Returns an array of { title, link, pubDate, source }.
 * Cached to localStorage for NEWS_CACHE_TTL_MS.
 */
export async function loadNews() {
  // Try cache first
  try {
    const raw = localStorage.getItem(NEWS_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Date.now() - parsed.timestamp < NEWS_CACHE_TTL_MS && Array.isArray(parsed.items)) {
        return parsed.items;
      }
    }
  } catch {}

  const all = [];
  for (const url of NEWS_FEEDS) {
    try {
      const items = await fetchFeed(url);
      all.push(...items);
      if (all.length >= NEWS_MAX_ITEMS) break;
    } catch (e) {
      console.warn('[news] feed failed:', url, e.message);
    }
  }

  const dedup = dedupeByTitle(all).slice(0, NEWS_MAX_ITEMS);
  if (dedup.length > 0) {
    try {
      localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), items: dedup }));
    } catch {}
  }
  return dedup;
}

async function fetchFeed(url) {
  let xml;
  if (window.electronAPI?.fetchText) {
    xml = await window.electronAPI.fetchText(url);
  } else {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    xml = await res.text();
  }
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('XML parse failed');

  const sourceTitle = doc.querySelector('channel > title')?.textContent?.trim() || 'MLB';
  return Array.from(doc.querySelectorAll('item')).map(item => ({
    title: (item.querySelector('title')?.textContent || '').trim(),
    link: (item.querySelector('link')?.textContent || '').trim(),
    pubDate: (item.querySelector('pubDate')?.textContent || '').trim(),
    source: sourceTitle,
  })).filter(i => i.title && i.link);
}

function dedupeByTitle(items) {
  const seen = new Set();
  return items.filter(i => {
    const key = i.title.toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Render the ticker into #newsTicker. Items are duplicated so the marquee
 * loops seamlessly.
 */
export function renderNewsTicker(items) {
  const container = document.getElementById('newsTicker');
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = '<div class="news-empty">— Yankees news unavailable —</div>';
    return;
  }

  const itemHtml = items.map(item => `
    <a href="#" class="news-item" data-url="${escapeAttr(item.link)}" title="${escapeAttr(item.source)}">
      <span class="news-bullet">⦿</span>
      <span class="news-title">${escapeHtml(item.title)}</span>
    </a>
  `).join('');

  // Duplicate the run for a seamless infinite loop.
  container.innerHTML = `<div class="news-track">${itemHtml}${itemHtml}</div>`;

  container.querySelectorAll('.news-item').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      const url = el.dataset.url;
      if (!url) return;
      if (window.electronAPI?.openExternal) {
        window.electronAPI.openExternal(url);
      } else {
        window.open(url, '_blank', 'noopener');
      }
    });
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }
