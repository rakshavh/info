(function () {
  var state = { type: null, theme: null };

  function readingsDataUrl() {
    return new URL('data/readings.json', window.location.href).href;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatNotes(text) {
    if (!text) return '';
    return escapeHtml(text).replace(/\n/g, '<br>');
  }

  function matchesFilters(item) {
    if (state.type && !(item.type || []).includes(state.type)) return false;
    if (state.theme && !(item.theme || []).includes(state.theme)) return false;
    return true;
  }

  function renderFilters(root, data) {
    var filtersEl = document.getElementById('readings-filters');
    if (!filtersEl) return;

    var html = '<div class="readings-filter-row">';
    html +=
      '<button type="button" class="readings-btn readings-btn-primary" data-filter="all" aria-pressed="true">Show all</button>';
    html += '</div>';

    ['type', 'theme'].forEach(function (groupKey) {
      var group = data.filterGroups[groupKey];
      if (!group || !group.tags || group.tags.length === 0) return;
      html += '<div class="readings-filter-row" role="group" aria-label="' + escapeHtml(group.label) + '">';
      group.tags.forEach(function (tag) {
        html +=
          '<button type="button" class="readings-btn" data-filter-group="' +
          groupKey +
          '" data-filter-value="' +
          escapeHtml(tag) +
          '" aria-pressed="false">' +
          escapeHtml(tag) +
          '</button>';
      });
      html += '</div>';
    });

    filtersEl.innerHTML = html;
    filtersEl.hidden = false;

    filtersEl.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-filter], button[data-filter-group]');
      if (!btn) return;

      if (btn.getAttribute('data-filter') === 'all') {
        state.type = null;
        state.theme = null;
      } else {
        var group = btn.getAttribute('data-filter-group');
        var value = btn.getAttribute('data-filter-value');
        state[group] = state[group] === value ? null : value;
      }

      updateFilterButtons(filtersEl);
      renderList(root, data);
    });
  }

  function updateFilterButtons(filtersEl) {
    filtersEl.querySelectorAll('button').forEach(function (btn) {
      if (btn.getAttribute('data-filter') === 'all') {
        var allActive = !state.type && !state.theme;
        btn.setAttribute('aria-pressed', allActive ? 'true' : 'false');
        btn.classList.toggle('readings-btn-primary', allActive);
        return;
      }
      var group = btn.getAttribute('data-filter-group');
      var value = btn.getAttribute('data-filter-value');
      var active = state[group] === value;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.classList.toggle('readings-btn-active', active);
    });
  }

  function renderList(root, data) {
    var listEl = document.getElementById('readings-list');
    var metaEl = document.getElementById('readings-meta');
    if (!listEl) return;

    var items = (data.items || []).filter(matchesFilters);
    if (metaEl) {
      metaEl.textContent =
        items.length +
        (items.length === 1 ? ' entry' : ' entries') +
        (data.syncedAt ? ' · synced ' + new Date(data.syncedAt).toLocaleDateString() : '');
    }

    if (!data.items || data.items.length === 0) {
      listEl.innerHTML =
        '<p class="light-text readings-empty">No entries yet. Add <code>NOTION_TOKEN</code> to <code>.env</code> and run <code>npm run sync-readings</code> (see NOTION_READINGS.md).</p>';
      return;
    }

    if (items.length === 0) {
      listEl.innerHTML =
        '<p class="light-text readings-empty">No entries match these filters.</p>';
      return;
    }

    listEl.innerHTML = items
      .map(function (item) {
        var tags = []
          .concat(item.type || [])
          .concat(item.theme || [])
          .map(function (t) {
            return '<span class="readings-tag">' + escapeHtml(t) + '</span>';
          })
          .join('');

        var titleHtml = item.notionUrl
          ? '<a href="' +
            escapeHtml(item.notionUrl) +
            '" target="_blank" rel="noopener">' +
            escapeHtml(item.title) +
            '</a>'
          : escapeHtml(item.title);

        var authorHtml = item.author
          ? '<p class="readings-author light-text">' + escapeHtml(item.author) + '</p>'
          : '';

        var notesHtml = item.notes
          ? '<div class="readings-notes">' + formatNotes(item.notes) + '</div>'
          : '';

        return (
          '<article class="readings-card" role="listitem">' +
          '<h3 class="readings-title">' +
          titleHtml +
          '</h3>' +
          authorHtml +
          (tags ? '<div class="readings-tags">' + tags + '</div>' : '') +
          notesHtml +
          '</article>'
        );
      })
      .join('');
  }

  function init() {
    var root = document.getElementById('readings');
    if (!root) return;

    var loading = document.getElementById('readings-loading');

    if (window.location.protocol === 'file:') {
      if (loading) {
        loading.innerHTML =
          'Cannot load readings from a local file. In Terminal, run <code>npm run serve</code>, then open <a href="http://localhost:8766/#readings">http://localhost:8766/#readings</a>.';
      }
      return;
    }

    fetch(readingsDataUrl())
      .then(function (res) {
        if (!res.ok) {
          throw new Error('HTTP ' + res.status);
        }
        return res.json();
      })
      .then(function (data) {
        if (loading) loading.remove();
        renderFilters(root, data);
        renderList(root, data);
      })
      .catch(function (err) {
        if (loading) {
          loading.innerHTML =
            'Could not load reading list (' +
            escapeHtml(err.message || 'unknown error') +
            '). Run <code>npm run serve</code> and open <a href="http://localhost:8766/#readings">localhost:8766/#readings</a>, or push <code>data/readings.json</code> to GitHub Pages.';
        }
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
