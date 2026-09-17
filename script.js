(function() {
    'use strict';

    // ---------- helpers ----------
    function norm(s) { return (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

    function hashCode(str) { var h = 0; for (var i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; } return Math.abs(h); }

    function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }

    function escapeHtml(s) { return (s || '').toString().replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

    var REGIAO = {
        'PA': 'Norte',
        'RO': 'Norte',
        'AL': 'Nordeste',
        'BA': 'Nordeste',
        'CE': 'Nordeste',
        'MA': 'Nordeste',
        'PB': 'Nordeste',
        'PE': 'Nordeste',
        'PI': 'Nordeste',
        'RN': 'Nordeste',
        'SE': 'Nordeste',
        'DF': 'Centro-Oeste',
        'GO': 'Centro-Oeste',
        'MT': 'Centro-Oeste',
        'MS': 'Centro-Oeste',
        'ES': 'Sudeste',
        'MG': 'Sudeste',
        'RJ': 'Sudeste',
        'SP': 'Sudeste',
        'PR': 'Sul',
        'RS': 'Sul',
        'SC': 'Sul'
    };

    var RAW = (window.STORE_DATA || []);
    var STORES = RAW.map(function(r) {
        var ativo = r.s === 'Ativo';
        var pickup = ativo;
        var entrega = ativo;
        var shopping = r.ti === 'Shopping';
        var rappi = ativo && (hashCode(r.f) % 5) < 3;
        return {
            filial: r.f,
            loja: r.n,
            siteTag: r.t,
            dom: r.d,
            cidade: r.c,
            endereco: r.e,
            uf: r.u,
            tipo: r.ti,
            porte: r.p,
            email: r.em,
            status: r.s,
            regiao: REGIAO[r.u] || '—',
            sv: { pickup: pickup, rappi: rappi, shopping: shopping, entrega: entrega }
        };
    });

    var EXAMPLE_FILIAL = '0200';
    var EXAMPLE_HOURS = [
        ['Segunda à sábado', '08:00 – 19:00'],
        ['Domingo', '10:00 – 16:00']
    ];
    var EXAMPLE_TEAM = [
        { nm: 'Marcos Vinícius Andrade', role: 'Gerente Regional II', tel: '(11) 3346-7200' },
        { nm: 'Patrícia Souza Lima', role: 'Gerente de Loja I', tel: '(11) 3346-7215' },
        { nm: 'Carlos Eduardo Ramos', role: 'Gerente de Loja II', tel: '(11) 3346-7215' }
    ];

    // ---------- state ----------
    var state = {
        status: '',
        regiao: '',
        uf: '',
        cidade: '',
        search: '',
        sortKey: 'f',
        sortDir: 1,
        page: 1,
        pageSize: 10
    };

    // ---------- theme ----------
    (function initTheme() {
        var saved = null;
        try { saved = localStorage.getItem('kalunga-lojas-theme'); } catch (e) {}
        if (saved === 'dark' || saved === 'light') document.documentElement.setAttribute('data-theme', saved);
        updateThemeIcon();
    })();

    function updateThemeIcon() {
        var cur = document.documentElement.getAttribute('data-theme');
        var btn = document.getElementById('themeToggle');
        btn.title = cur === 'dark' ? 'Usar tema claro' : 'Usar tema escuro';
    }
    document.getElementById('themeToggle').addEventListener('click', function() {
        var cur = document.documentElement.getAttribute('data-theme');
        var next = cur === 'dark' ? 'light' : (cur === 'light' ? null : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'dark'));
        if (next) document.documentElement.setAttribute('data-theme', next);
        else document.documentElement.removeAttribute('data-theme');
        try { if (next) localStorage.setItem('kalunga-lojas-theme', next);
            else localStorage.removeItem('kalunga-lojas-theme'); } catch (e) {}
        updateThemeIcon();
    });

    // ---------- toast ----------
    var toastTimer = null;

    function toast(msg) {
        var t = document.getElementById('toast');
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function() { t.classList.remove('show'); }, 2600);
    }

    // ---------- filter option population ----------
    var ufSel = document.getElementById('fUf');
    var regiaoSel = document.getElementById('fRegiao');
    var cidadeSel = document.getElementById('fCidade');

    var allRegioes = Array.from(new Set(STORES.map(function(s) { return s.regiao; }))).sort();
    allRegioes.forEach(function(r) { regiaoSel.appendChild(el('option', '', r)).value = r; });

    function refreshUfOptions() {
        var pool = state.regiao ? STORES.filter(function(s) { return s.regiao === state.regiao; }) : STORES;
        var ufs = Array.from(new Set(pool.map(function(s) { return s.uf; }))).filter(Boolean).sort();
        var prev = ufSel.value;
        ufSel.innerHTML = '<option value="">Todas</option>';
        ufs.forEach(function(u) { var o = el('option', '', u);
            o.value = u;
            ufSel.appendChild(o); });
        if (ufs.indexOf(prev) !== -1) ufSel.value = prev;
        else state.uf = '';
    }

    function refreshCidadeOptions() {
        var pool = STORES.filter(function(s) {
            return (!state.regiao || s.regiao === state.regiao) && (!state.uf || s.uf === state.uf);
        });
        var cidades = Array.from(new Set(pool.map(function(s) { return s.cidade; }))).filter(Boolean).sort();
        var prev = cidadeSel.value;
        cidadeSel.innerHTML = '<option value="">Todos</option>';
        cidades.forEach(function(c) { var o = el('option', '', c);
            o.value = c;
            cidadeSel.appendChild(o); });
        if (cidades.indexOf(prev) !== -1) cidadeSel.value = prev;
        else state.cidade = '';
    }
    refreshUfOptions();
    refreshCidadeOptions();

    // ---------- KPIs (computed once from full dataset) ----------
    (function renderKpis() {
        var total = STORES.length;
        var ativas = STORES.filter(function(s) { return s.status === 'Ativo'; }).length;
        var ufsN = new Set(STORES.map(function(s) { return s.uf; })).size;
        var cidadesN = new Set(STORES.map(function(s) { return s.cidade; })).size;
        var regioesN = new Set(STORES.map(function(s) { return s.regiao; })).size;
        document.getElementById('kpiAtivas').textContent = ativas;
        document.getElementById('kpiAtivasSub').textContent = 'de ' + total + ' carregadas · ' + Math.round(ativas / total * 100) + '%';
        document.getElementById('kpiCobertura').textContent = ufsN + ' estados';
        document.getElementById('kpiCoberturaSub').textContent = cidadesN + ' cidades · ' + regioesN + ' regiões';

        var svc = { pickup: 0, rappi: 0, shopping: 0, entrega: 0 };
        STORES.forEach(function(s) { Object.keys(svc).forEach(function(k) { if (s.sv[k]) svc[k]++; }); });
        document.getElementById('kpiServicos').textContent = '4 serviços';
        var bd = document.getElementById('kpiServicosBreakdown');
        bd.innerHTML = '' +
            '<span>Pickup <b>' + svc.pickup + '</b></span>' +
            '<span>Rappi <b>' + svc.rappi + '</b></span>' +
            '<span>Shopping <b>' + svc.shopping + '</b></span>' +
            '<span>Entrega <b>' + svc.entrega + '</b></span>';
    })();

    // ---------- filtering / sorting / pagination ----------
    function getFiltered() {
        var q = norm(state.search);
        return STORES.filter(function(s) {
            if (state.status && s.status !== state.status) return false;
            if (state.regiao && s.regiao !== state.regiao) return false;
            if (state.uf && s.uf !== state.uf) return false;
            if (state.cidade && s.cidade !== state.cidade) return false;
            if (q && norm(s.loja + ' ' + s.cidade + ' ' + s.email + ' ' + s.filial).indexOf(q) === -1) return false;
            return true;
        });
    }

    function getSorted(list) {
        var key = state.sortKey,
            dir = state.sortDir;
        return list.slice().sort(function(a, b) {
            var av = (a[key] || '').toString(),
                bv = (b[key] || '').toString();
            if (av < bv) return -1 * dir;
            if (av > bv) return 1 * dir;
            return 0;
        });
    }

    function svcIcon(kind) {
        var paths = {
            pickup: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
            rappi: '<circle cx="5.5" cy="17.5" r="3.2"/><circle cx="18.5" cy="17.5" r="3.2"/><path d="M5.5 17.5L9.5 9h4.5l3 5.5M10 9l2.5 5.5h5"/>',
            shopping: '<path d="M6 2l1.5 4M18 2l-1.5 4M3.5 8h17l-1.2 11a2 2 0 01-2 1.8H6.7a2 2 0 01-2-1.8L3.5 8z"/><path d="M8 11a4 4 0 008 0"/>',
            entrega: '<path d="M1 3h13v11H1z"/><path d="M14 8h4l4 4v3h-8V8z"/><circle cx="5.5" cy="18.5" r="1.8"/><circle cx="17.5" cy="18.5" r="1.8"/>'
        };
        return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + paths[kind] + '</svg>';
    }
    var SVC_LABEL = { pickup: 'Pickup in Store', rappi: 'Rappi', shopping: 'Retirada em Shopping', entrega: 'Entrega da loja' };

    function renderTable() {
        var filtered = getFiltered();
        var sorted = getSorted(filtered);
        var totalPages = Math.max(1, Math.ceil(sorted.length / state.pageSize));
        if (state.page > totalPages) state.page = totalPages;
        var start = (state.page - 1) * state.pageSize;
        var pageItems = sorted.slice(start, start + state.pageSize);

        document.getElementById('tblBadgeCount').textContent = STORES.length;
        document.getElementById('resultCount').textContent = filtered.length + ' loja' + (filtered.length === 1 ? '' : 's') + ' encontrada' + (filtered.length === 1 ? '' : 's');

        var hasFilters = state.status || state.regiao || state.uf || state.cidade || state.search;
        document.getElementById('clearFilters').disabled = !hasFilters;

        var tbody = document.getElementById('tblBody');
        tbody.innerHTML = '';

        if (!pageItems.length) {
            var tr = el('tr', 'empty-row', '<td colspan="6">Nenhuma loja encontrada para os filtros selecionados.</td>');
            tbody.appendChild(tr);
        }

        pageItems.forEach(function(s) {
            var tr = document.createElement('tr');
            tr.className = 'row-click';
            tr.title = 'Ver detalhes de ' + s.loja;
            tr.addEventListener('click', function() { openModal(s.filial); });

            var tdF = el('td', 'mono', escapeHtml(s.filial));
            tdF.style.color = 'var(--text-2)';
            tdF.style.fontWeight = '600';

            var tdLoja = el('td', 'cell-loja');
            tdLoja.innerHTML = '<div class="name-row"><span class="name">' + escapeHtml(s.loja) + '</span>' +
                (s.dom ? '<span class="tag-dom" title="Aberto aos domingos">DOM</span>' : '') + '</div>' +
                '<div class="city">' + escapeHtml(s.cidade) + (s.endereco ? ' · ' + escapeHtml(s.endereco) : '') + '</div>';

            var tdPerfil = el('td');
            var perfilParts = [s.uf, s.tipo, s.porte].filter(Boolean);
            tdPerfil.innerHTML = '<div class="perfil-txt">' + escapeHtml(perfilParts.join(' · ')) + '</div>';

            var tdSvc = el('td');
            tdSvc.innerHTML = '<div class="sv-row">' + ['pickup', 'rappi', 'shopping', 'entrega'].map(function(k) {
                var on = s.sv[k];
                return '<span class="sv ' + (on ? 'on' : 'off') + '" title="' + SVC_LABEL[k] + ' — ' + (on ? 'ativo' : 'não disponível') + '">' + svcIcon(k) + '</span>';
            }).join('') + '</div>';

            var tdStatus = el('td');
            var on = s.status === 'Ativo';
            tdStatus.innerHTML = '<span class="pill ' + (on ? 'on' : 'off') + '"><span class="dot"></span>' + escapeHtml(s.status) + '</span>';

            var tdAcoes = el('td');
            tdAcoes.style.textAlign = 'right';
            var btn = document.createElement('button');
            btn.className = 'btn-detail';
            btn.setAttribute('aria-label', 'Ver detalhes de ' + s.loja);
            btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
            btn.addEventListener('click', function(e) { e.stopPropagation();
                openModal(s.filial); });
            tdAcoes.appendChild(btn);

            tr.appendChild(tdF);
            tr.appendChild(tdLoja);
            tr.appendChild(tdPerfil);
            tr.appendChild(tdSvc);
            tr.appendChild(tdStatus);
            tr.appendChild(tdAcoes);
            tbody.appendChild(tr);
        });

        // pager
        var from = sorted.length ? start + 1 : 0;
        var to = Math.min(start + state.pageSize, sorted.length);
        document.getElementById('pagerInfo').innerHTML = 'Mostrando <b>' + from + '–' + to + '</b> de <b>' + sorted.length + '</b> lojas';

        document.getElementById('pgPrev').disabled = state.page <= 1;
        document.getElementById('pgNext').disabled = state.page >= totalPages;

        var nums = document.getElementById('pgNumbers');
        nums.innerHTML = '';
        var pages = [];
        var span = 1;
        for (var p = 1; p <= totalPages; p++) {
            if (p === 1 || p === totalPages || Math.abs(p - state.page) <= span) pages.push(p);
            else if (pages[pages.length - 1] !== '…') pages.push('…');
        }
        pages.forEach(function(p) {
            if (p === '…') { nums.appendChild(el('span', '', '…')).style.cssText = 'width:20px;text-align:center;color:var(--text-3);font-size:12px;'; return; }
            var b = el('button', 'pg-btn' + (p === state.page ? ' active' : ''), p);
            b.addEventListener('click', function() { state.page = p;
                renderTable(); });
            nums.appendChild(b);
        });

        // sort arrows
        ['f', 'n', 's'].forEach(function(k) {
            var a = document.querySelector('[data-arrow="' + k + '"]');
            a.textContent = state.sortKey === k ? (state.sortDir === 1 ? '▲' : '▼') : '';
        });
    }

    // ---------- events: filters ----------
    document.getElementById('fStatus').addEventListener('change', function(e) { state.status = e.target.value;
        state.page = 1;
        renderTable(); });
    regiaoSel.addEventListener('change', function(e) { state.regiao = e.target.value;
        state.uf = '';
        state.cidade = '';
        refreshUfOptions();
        refreshCidadeOptions();
        state.page = 1;
        renderTable(); });
    ufSel.addEventListener('change', function(e) { state.uf = e.target.value;
        state.cidade = '';
        refreshCidadeOptions();
        state.page = 1;
        renderTable(); });
    cidadeSel.addEventListener('change', function(e) { state.cidade = e.target.value;
        state.page = 1;
        renderTable(); });
    document.getElementById('fSearch').addEventListener('input', function(e) { state.search = e.target.value;
        state.page = 1;
        renderTable(); });
    document.getElementById('clearFilters').addEventListener('click', function() {
        state.status = '';
        state.regiao = '';
        state.uf = '';
        state.cidade = '';
        state.search = '';
        document.getElementById('fStatus').value = '';
        document.getElementById('fSearch').value = '';
        refreshUfOptions();
        refreshCidadeOptions();
        state.page = 1;
        renderTable();
    });
    document.getElementById('pageSize').addEventListener('change', function(e) { state.pageSize = parseInt(e.target.value, 10);
        state.page = 1;
        renderTable(); });
    document.getElementById('pgPrev').addEventListener('click', function() { if (state.page > 1) { state.page--;
            renderTable(); } });
    document.getElementById('pgNext').addEventListener('click', function() { state.page++;
        renderTable(); });
    document.querySelectorAll('th.sortable').forEach(function(th) {
        th.addEventListener('click', function() {
            var k = th.getAttribute('data-sort');
            if (state.sortKey === k) state.sortDir *= -1;
            else { state.sortKey = k;
                state.sortDir = 1; }
            renderTable();
        });
    });

    // ---------- modal ----------
    var currentTab = 'geral';

    function openModal(filial) {
        var s = STORES.filter(function(x) { return x.filial === filial; })[0];
        if (!s) return;
        currentTab = 'geral';
        document.getElementById('modalTitle').textContent = s.loja;
        document.getElementById('modalFilial').textContent = 'Filial #' + s.filial;
        document.getElementById('modalAddr').textContent = (s.endereco ? s.endereco + ' · ' : '') + s.cidade + '/' + s.uf;
        document.getElementById('modalDom').hidden = !s.dom;
        var stPill = document.getElementById('modalStatus');
        stPill.className = 'pill ' + (s.status === 'Ativo' ? 'on' : 'off');
        stPill.querySelector('span:last-child').textContent = s.status;

        renderGeral(s);
        renderContato(s);
        renderOperacional(s);
        setTab('geral');

        document.getElementById('modalOverlay').hidden = false;
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        document.getElementById('modalOverlay').hidden = true;
        document.body.style.overflow = '';
    }

    function setTab(tab) {
        currentTab = tab;
        document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.toggle('active', b.getAttribute('data-tab') === tab); });
        document.getElementById('panelGeral').hidden = tab !== 'geral';
        document.getElementById('panelContato').hidden = tab !== 'contato';
        document.getElementById('panelOperacional').hidden = tab !== 'operacional';
    }
    document.querySelectorAll('.tab-btn').forEach(function(b) {
        b.addEventListener('click', function() { setTab(b.getAttribute('data-tab')); });
    });
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    document.getElementById('modalOverlay').addEventListener('click', function(e) { if (e.target === this) closeModal(); });
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && !document.getElementById('modalOverlay').hidden) closeModal(); });
    document.getElementById('modalEditBtn').addEventListener('click', function() { toast('Ação disponível apenas no sistema real — não implementada nesta demonstração.'); });

    function fitem(k, v, isMuted) {
        return '<div class="fitem"><span class="k">' + k + '</span><span class="v' + (isMuted ? ' muted' : '') + '">' + (v || '<span class=\"muted\">Não informado</span>') + '</span></div>';
    }

    function buildMapEmbed(s) {
        var coords = window.CITY_COORDS ? window.CITY_COORDS[s.cidade] : null;
        var addrLine = (s.endereco ? escapeHtml(s.endereco) + ' — ' : '') + escapeHtml(s.cidade) + '/' + escapeHtml(s.uf);
        if (!coords) {
            return '<div class="map-box">' +
                '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-7.5 7-12a7 7 0 10-14 0c0 4.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.6"/></svg>' +
                '<span class="addr">' + addrLine + '</span>' +
                '<span class="cap">Mapa não disponível para esta cidade nesta demonstração.</span>' +
                '</div>';
        }
        var lat = coords[0],
            lon = coords[1];
        var d = 0.035;
        var bbox = (lon - d) + ',' + (lat - d) + ',' + (lon + d) + ',' + (lat + d);
        var embedUrl = 'https://www.openstreetmap.org/export/embed.html?bbox=' + encodeURIComponent(bbox) + '&layer=mapnik&marker=' + lat + '%2C' + lon;
        var viewUrl = 'https://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lon + '#map=14/' + lat + '/' + lon;
        return '<div class="map-embed">' +
            '<iframe src="' + embedUrl + '" title="Mapa de ' + escapeHtml(s.cidade) + '" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>' +
            '<div class="map-foot">' +
            '<span class="addr">' + addrLine + '</span>' +
            '<a href="' + viewUrl + '" target="_blank" rel="noopener">Ver mapa maior ↗</a>' +
            '</div>' +
            '<div class="map-note">Localização aproximada em nível de cidade — não há geocodificação do endereço exato nesta demonstração.</div>' +
            '</div>';
    }

    function renderGeral(s) {
        var html = '<div class="two-col">' +
            '<div class="subsection">' +
            '<div class="section-label">Informações gerais</div>' +
            '<div class="field-grid">' +
            fitem('Código', '<span class="mono">' + escapeHtml(s.filial) + '</span>') +
            fitem('Nome site', escapeHtml(s.siteTag || s.loja)) +
            fitem('Região', escapeHtml(s.regiao)) +
            fitem('UF', escapeHtml(s.uf)) +
            fitem('Tipo', s.tipo ? escapeHtml(s.tipo) : null) +
            fitem('Porte', s.porte ? escapeHtml(s.porte) : null) +
            '</div>' +
            fitem('Endereço', s.endereco ? escapeHtml(s.endereco) : null) +
            fitem('Cidade', escapeHtml(s.cidade)) +
            '</div>' +
            '<div class="subsection">' +
            '<div class="section-label">Localização</div>' +
            buildMapEmbed(s) +
            '</div>' +
            '</div>';
        document.getElementById('panelGeral').innerHTML = html;
    }

    function renderContato(s) {
        var isExample = s.filial === EXAMPLE_FILIAL;
        var html = '<div class="opstack">';

        html += '<div class="subsection"><div class="section-label">Contato da loja</div>' +
            '<div class="contact-card">' +
            '<div class="contact-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 6l10 7 10-7"/></svg>' +
            (s.email ? '<a href="mailto:' + escapeHtml(s.email) + '">' + escapeHtml(s.email) + '</a>' : '<span class="muted">Não informado</span>') + '</div>' +
            '<div class="contact-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3A19.5 19.5 0 013 10.8 19.8 19.8 0 01.1 2.2 2 2 0 012.1 0h3a2 2 0 012 1.7c.1 1 .3 2 .6 3a2 2 0 01-.5 2L6 8a16 16 0 008 8l1.3-1.3a2 2 0 012-.5c1 .3 2 .5 3 .6a2 2 0 011.7 2.1z"/></svg>' +
            '<span class="' + (isExample ? 'mono' : 'muted') + '">' + (isExample ? '(11) 3346-7200' : 'Não informado nesta demonstração') + '</span></div>' +
            '</div></div>';

        if (isExample) {
            html += '<div class="subsection"><div class="section-label">Equipe de gestão <span class="example-chip">dados fictícios de exemplo</span></div>' +
                '<div class="contact-list">' +
                EXAMPLE_TEAM.map(function(m) {
                    var initials = m.nm.split(' ').filter(Boolean).slice(0, 2).map(function(w) { return w[0]; }).join('').toUpperCase();
                    return '<div class="contact-row"><div class="av">' + initials + '</div>' +
                        '<div class="who"><span class="nm">' + escapeHtml(m.nm) + '</span><span class="role">' + escapeHtml(m.role) + '</span></div>' +
                        '<a href="tel:' + escapeHtml(m.tel) + '" class="mono" style="font-size:13px;font-weight:600;color:var(--text-2);">' + escapeHtml(m.tel) + '</a></div>';
                }).join('') +
                '</div></div>';
        } else {
            html += '<div class="subsection"><div class="notice neutral">' +
                '<span>Esta demonstração inclui equipe de gestão completa apenas para a loja <b class="mono">' + EXAMPLE_FILIAL + '</b> (SP-SPO-RadialMooca). Para as demais lojas, esses dados viriam da mesma origem usada no cadastro de contatos.</span>' +
                '<button class="link" id="gotoExampleContato">Ver exemplo completo (loja ' + EXAMPLE_FILIAL + ') →</button>' +
                '</div></div>';
        }

        html += '</div>';
        document.getElementById('panelContato').innerHTML = html;
        var goto = document.getElementById('gotoExampleContato');
        if (goto) goto.addEventListener('click', function() { openModal(EXAMPLE_FILIAL);
            setTab('contato'); });
    }

    function renderOperacional(s) {
        var isExample = s.filial === EXAMPLE_FILIAL;
        var html = '<div class="two-col">' +
            '<div class="opstack">' +
            '<div class="subsection"><div class="section-label">Horário de funcionamento' + (isExample ? ' <span class="example-chip">exemplo</span>' : '') + '</div>';

        if (isExample) {
            html += '<div style="display:flex;flex-direction:column;gap:6px;">' +
                EXAMPLE_HOURS.map(function(h) { return '<div class="hours-row"><span style="color:var(--text-2);">' + h[0] + '</span><span class="mono" style="font-weight:700;">' + h[1] + '</span></div>'; }).join('') +
                '</div>';
        } else {
            html += '<div class="notice neutral"><span>Horário não cadastrado nesta demonstração para esta loja.</span>' +
                '<button class="link" id="gotoExampleHoras">Ver exemplo completo (loja ' + EXAMPLE_FILIAL + ') →</button></div>';
        }
        html += '</div>';

        html += '<div class="subsection"><div class="section-label">Serviços</div><div class="services-grid">' + ['pickup', 'rappi', 'shopping', 'entrega'].map(function(k) {
                var on = s.sv[k];
                return '<div class="svc-card ' + (on ? 'on' : 'off') + '"><span class="ic">' + svcIcon(k) + '</span><span class="lbl">' + SVC_LABEL[k] + '</span>' +
                    (on ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>' : '<span style="font-size:10.5px;color:var(--text-3);">N/D</span>') +
                    '</div>';
            }).join('') +
            '</div></div>' +
            '</div>';

        html += '<div class="subsection">' +
            '<div class="section-label">Sobre a loja</div>' +
            '<div class="notice amber">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto;margin-top:1px;"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg>' +
            '<span>6 de 6 campos operacionais não preenchidos no cadastro desta loja.</span>' +
            '</div>' +
            '<div class="field-grid">' +
            fitem('Voltagem', null) +
            fitem('Tamanho', null) +
            fitem('Coleta de valores', null) +
            fitem('Planta da loja', null) +
            fitem('Horário de recebimento', null) +
            fitem('Tipo de caminhão', null) +
            '</div>' +
            '</div>' +
            '</div>';

        document.getElementById('panelOperacional').innerHTML = html;
        var goto = document.getElementById('gotoExampleHoras');
        if (goto) goto.addEventListener('click', function() { openModal(EXAMPLE_FILIAL);
            setTab('operacional'); });
    }

    // ---------- init ----------
    renderTable();
})();