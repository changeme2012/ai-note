const state = {
  projects: [],
  category: '全部',
  query: '',
  sort: 'today',
  favoritesOnly: false,
  favorites: new Set(JSON.parse(localStorage.getItem('ai-note-favorites') || '[]')),
  compare: new Set()
};

const els = {
  projects: document.querySelector('#projects'),
  template: document.querySelector('#projectTemplate'),
  filters: document.querySelector('#categoryFilters'),
  search: document.querySelector('#searchInput'),
  sort: document.querySelector('#sortSelect'),
  resultCount: document.querySelector('#resultCount'),
  empty: document.querySelector('#emptyState'),
  favoritesToggle: document.querySelector('#favoritesToggle'),
  themeToggle: document.querySelector('#themeToggle'),
  compareBar: document.querySelector('#compareBar'),
  compareNames: document.querySelector('#compareNames'),
  compareDialog: document.querySelector('#compareDialog'),
  compareContent: document.querySelector('#compareContent')
};

const number = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 });
const fullNumber = new Intl.NumberFormat('zh-CN');

function formatDate(value) {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(`${value}T00:00:00Z`));
}

function initials(name) {
  return name.split('/')[0].slice(0, 2).toUpperCase();
}

function saveFavorites() {
  localStorage.setItem('ai-note-favorites', JSON.stringify([...state.favorites]));
}

function filteredProjects() {
  const query = state.query.trim().toLowerCase();
  const items = state.projects.filter(project => {
    const haystack = [project.name, project.category, project.language, project.description, project.verdict, ...project.tags].join(' ').toLowerCase();
    return (!query || haystack.includes(query))
      && (state.category === '全部' || project.category === state.category)
      && (!state.favoritesOnly || state.favorites.has(project.name));
  });
  return items.sort((a, b) => {
    if (state.sort === 'stars') return b.stars - a.stars;
    if (state.sort === 'effort') return a.effort - b.effort;
    if (state.sort === 'name') return a.name.localeCompare(b.name);
    return b.starsToday - a.starsToday;
  });
}

function renderFilters() {
  const categories = ['全部', ...new Set(state.projects.map(item => item.category))];
  els.filters.replaceChildren(...categories.map(category => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'filter-button';
    button.textContent = category;
    button.setAttribute('aria-pressed', String(state.category === category));
    button.addEventListener('click', () => { state.category = category; renderFilters(); renderProjects(); });
    return button;
  }));
}

function renderProjects() {
  const items = filteredProjects();
  els.projects.replaceChildren(...items.map((project, index) => {
    const fragment = els.template.content.cloneNode(true);
    const card = fragment.querySelector('.project-card');
    card.dataset.project = project.name;
    fragment.querySelector('.rank').textContent = `#${String(index + 1).padStart(2, '0')}`;
    fragment.querySelector('.trend-badge').textContent = project.badge;
    fragment.querySelector('.repo-avatar').textContent = initials(project.name);
    fragment.querySelector('h3').textContent = project.name;
    fragment.querySelector('.category').textContent = project.category;
    fragment.querySelector('.description').textContent = project.description;
    fragment.querySelector('.today-stars').textContent = `+${fullNumber.format(project.starsToday)}`;
    fragment.querySelector('.total-stars').textContent = number.format(project.stars);
    fragment.querySelector('.language').textContent = project.language;
    fragment.querySelector('.tags').replaceChildren(...project.tags.map(tag => {
      const span = document.createElement('span'); span.textContent = tag; return span;
    }));
    fragment.querySelector('.card-note p').textContent = project.verdict;
    const link = fragment.querySelector('.card-footer a');
    link.href = project.url;
    link.setAttribute('aria-label', `打开 ${project.name} 的 GitHub 仓库`);

    const star = fragment.querySelector('.star-button');
    const updateStar = () => {
      const active = state.favorites.has(project.name);
      star.classList.toggle('active', active);
      star.textContent = active ? '★' : '☆';
      star.setAttribute('aria-label', active ? `取消收藏 ${project.name}` : `收藏 ${project.name}`);
    };
    updateStar();
    star.addEventListener('click', () => {
      state.favorites.has(project.name) ? state.favorites.delete(project.name) : state.favorites.add(project.name);
      saveFavorites(); updateStar();
      if (state.favoritesOnly) renderProjects();
    });

    const checkbox = fragment.querySelector('.compare-checkbox');
    checkbox.checked = state.compare.has(project.name);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked && state.compare.size >= 3) {
        checkbox.checked = false;
        alert('最多同时对比 3 个项目。');
        return;
      }
      checkbox.checked ? state.compare.add(project.name) : state.compare.delete(project.name);
      updateCompareBar();
    });
    return fragment;
  }));
  els.resultCount.textContent = items.length;
  els.empty.hidden = items.length !== 0;
}

function updateCompareBar() {
  const selected = state.projects.filter(project => state.compare.has(project.name));
  els.compareBar.hidden = selected.length === 0;
  els.compareNames.textContent = selected.map(project => project.name).join(' · ');
}

function openCompare() {
  const selected = state.projects.filter(project => state.compare.has(project.name));
  if (!selected.length) return;
  const rows = [
    ['分类', item => item.category],
    ['今日增星', item => `+${fullNumber.format(item.starsToday)}`],
    ['总 Star', item => fullNumber.format(item.stars)],
    ['语言', item => item.language],
    ['上手成本', item => `${item.effort}/5`],
    ['适合', item => item.fit],
    ['判断', item => item.verdict]
  ];
  const table = document.createElement('table');
  table.className = 'compare-table';
  table.innerHTML = `<thead><tr><th>维度</th>${selected.map(item => `<th>${item.name}</th>`).join('')}</tr></thead><tbody>${rows.map(([label, get]) => `<tr><th>${label}</th>${selected.map(item => `<td>${get(item)}</td>`).join('')}</tr>`).join('')}</tbody>`;
  els.compareContent.replaceChildren(table);
  els.compareDialog.showModal();
}

function renderMeta(data) {
  document.querySelector('#snapshotDate').textContent = formatDate(data.snapshotDate);
  document.querySelector('#dailyThesis').textContent = data.thesis;
  document.querySelector('#metricCount').textContent = data.projects.length;
  document.querySelector('#metricGrowth').textContent = `+${number.format(data.projects.reduce((sum, item) => sum + item.starsToday, 0))}`;
  const categoryCounts = Object.entries(data.projects.reduce((all, item) => ({ ...all, [item.category]: (all[item.category] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  document.querySelector('#metricCategory').textContent = categoryCounts[0]?.[0] || '—';
  document.querySelector('#learningPath').replaceChildren(...data.learningPath.map(step => {
    const li = document.createElement('li'); li.innerHTML = `<strong>${step.title}</strong>${step.description}`; return li;
  }));
  document.querySelector('#practiceTitle').textContent = data.practice.title;
  document.querySelector('#practiceDescription').textContent = data.practice.description;
  document.querySelector('#sourceLink').href = data.source.url;
}

async function init() {
  try {
    const response = await fetch('./data/projects.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.projects = data.projects;
    renderMeta(data); renderFilters(); renderProjects(); updateCompareBar();
  } catch (error) {
    els.projects.innerHTML = `<div class="empty-state"><strong>数据加载失败</strong><p>请稍后刷新，或直接查看 GitHub 原始榜单。</p></div>`;
    console.error(error);
  }
}

els.search.addEventListener('input', event => { state.query = event.target.value; renderProjects(); });
els.sort.addEventListener('change', event => { state.sort = event.target.value; renderProjects(); });
els.favoritesToggle.addEventListener('click', () => {
  state.favoritesOnly = !state.favoritesOnly;
  els.favoritesToggle.setAttribute('aria-pressed', String(state.favoritesOnly));
  els.favoritesToggle.textContent = state.favoritesOnly ? '★ 正在看收藏' : '☆ 只看收藏';
  renderProjects();
});
els.themeToggle.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('ai-note-theme', next);
});
document.querySelector('#openCompare').addEventListener('click', openCompare);
document.querySelector('#clearCompare').addEventListener('click', () => { state.compare.clear(); updateCompareBar(); renderProjects(); });
document.addEventListener('keydown', event => {
  if (event.key === '/' && document.activeElement?.tagName !== 'INPUT') { event.preventDefault(); els.search.focus(); }
  if (event.key === 'Escape' && els.compareDialog.open) els.compareDialog.close();
});

document.documentElement.dataset.theme = localStorage.getItem('ai-note-theme') || 'dark';
init();

