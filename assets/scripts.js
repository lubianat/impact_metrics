
async function fetchData(category) {
    const url = `https://wikimedia.org/api/rest_v1/metrics/commons-analytics/category-metrics-snapshot/${category}/20120101/20241101`;
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.statusText}`);
    }
    return response.json();
}

async function fetchPageviews(category, scope, wiki) {
    const url = `https://wikimedia.org/api/rest_v1/metrics/commons-analytics/pageviews-per-category-monthly/${category}/${scope}/${wiki}/20120101/20241101`;
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) {
        throw new Error(`Failed to fetch pageviews: ${response.statusText}`);
    }
    return response.json();
}

async function fetchCategories() {
    const url = 'assets/commons_category_allow_list.tsv';
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to load categories');
    const text = await response.text();
    return text.split('\n').filter(line => line.trim() !== '');
}

async function fetchTopViewedMedia(category, scope, wiki, year, month) {
    const url = `https://wikimedia.org/api/rest_v1/metrics/commons-analytics/top-viewed-media-files-monthly/${category}/${scope}/${wiki}/${year}/${month}`;
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) {
        throw new Error(`Failed to fetch top viewed media: ${response.statusText}`);
    }
    return response.json();
}

async function fetchTopPagesForMediaFile(mediaFile, wiki, year, month) {
    const url = `https://wikimedia.org/api/rest_v1/metrics/commons-analytics/top-pages-per-media-file-monthly/${encodeURIComponent(mediaFile)}/${wiki}/${year}/${month}`;
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) {
        throw new Error(`Failed to fetch top pages for ${mediaFile}: ${response.statusText}`);
    }
    return response.json();
}

function getCategoryFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('category') || 'Files_from_the_Biodiversity_Heritage_Library';
}

function createPlot(data, selectedSeries, plotId, title) {
    const x = data.items.map(item => item.timestamp);
    const y = data.items.map(item => item[selectedSeries]);

    const trace = {
        x,
        y,
        type: 'scatter',
        mode: 'lines+markers',
        marker: { size: 6 },
    };

    const layout = {
        title: title,
        xaxis: { title: 'Date', showline: true, mirror: true, ticks: 'outside' },
        yaxis: { title: selectedSeries.replace(/-/g, ' '), showline: true, mirror: true, ticks: 'outside' },
        margin: { l: 60, r: 20, t: 50, b: 50 }
    };

    const config = {
        displaylogo: false,
        scrollZoom: false,
        modeBarButtonsToRemove: [
            'zoom2d', 'pan2d', 'select2d', 'lasso2d',
            'autoScale2d',
            'hoverCompareCartesian', 'hoverClosestCartesian',
            'toImage'
        ],
        modeBarButtons: [[
            'resetScale2d',
            'zoomIn2d', 'zoomOut2d',
            {
                name: 'Download PNG',
                icon: Plotly.Icons.camera,
                click: function (gd) {
                    Plotly.downloadImage(gd, { format: 'png', filename: 'plot' });
                }
            },
            {
                name: 'Download SVG',
                icon: Plotly.Icons.camera,
                click: function (gd) {
                    Plotly.downloadImage(gd, { format: 'svg', filename: 'plot' });
                }
            }
        ]],
        displayModeBar: true,
        responsive: true
    };

    Plotly.newPlot(plotId, [trace], layout, config);
}

async function setupAutocomplete() {
    const input = document.getElementById('category-input');
    const categoriesRaw = await fetchCategories();

    // Transform categories for user display vs. API call
    const categories = categoriesRaw.map(cat => ({
        label: cat.replace(/_/g, ' '),
        value: cat
    }));

    new Awesomplete(input, {
        list: categories,
        minChars: 1,
        maxItems: 10,
        autoFirst: true
    });

    input.addEventListener('awesomplete-selectcomplete', (event) => {
        const category = event.text.value;
        window.location.search = `?category=${encodeURIComponent(category)}`;
    });
}

// --------------------- Pageviews Dashboard Logic ---------------------
async function initializePageviewsDashboard(category) {
    const initialPageviews = await fetchPageviews(category, 'shallow', 'all-wikis');
    const pageviewsWikiSelect = document.getElementById('pageviews-wiki-select');
    const pageviewsScopeSelect = document.getElementById('pageviews-scope-select');

    async function updatePageviewsPlot() {
        const scope = pageviewsScopeSelect.value;
        const wiki = pageviewsWikiSelect.value;
        const pageviewData = await fetchPageviews(category, scope, wiki);
        createPlot(pageviewData, 'pageview-count', 'pageviews-plot', 'Page Views Over Time');
    }

    pageviewsWikiSelect.addEventListener('change', updatePageviewsPlot);
    pageviewsScopeSelect.addEventListener('change', updatePageviewsPlot);

    createPlot(initialPageviews, 'pageview-count', 'pageviews-plot', 'Page Views Over Time');
}

// --------------------- Category Dashboard Logic ---------------------
async function initializeCategoryDashboard(category) {
    const snapshotData = await fetchData(category);
    const timeSeriesDropdown = document.getElementById('category-time-series');
    const subcategoryDropdown = document.getElementById('category-subcategory-select');

    function updateCategoryPlot() {
        const selectedSeries = timeSeriesDropdown.value;
        const includeSubcategories = subcategoryDropdown.value;
        let finalSeries = selectedSeries;

        if (includeSubcategories === 'deep') {
            finalSeries += '-deep';
        }

        createPlot(snapshotData, finalSeries, 'category-plot', timeSeriesDropdown.selectedOptions[0]?.text || '');
    }

    timeSeriesDropdown.addEventListener('change', updateCategoryPlot);
    subcategoryDropdown.addEventListener('change', updateCategoryPlot);

    updateCategoryPlot();
}

// --------------------- Ranking Dashboard Logic (DataTables) ---------------------


// Helper function to generate year-month pairs
function generateYearMonthPairs(startYear, startMonth, endYear, endMonth) {
    const pairs = [];
    let currentYear = startYear;
    let currentMonth = startMonth;

    while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
        const monthName = new Date(currentYear, currentMonth - 1).toLocaleString('default', { month: 'short' });
        pairs.push({ label: `${monthName} ${currentYear}`, value: `${currentYear}-${String(currentMonth).padStart(2, '0')}` });
        currentMonth++;
        if (currentMonth > 12) {
            currentMonth = 1;
            currentYear++;
        }
    }
    return pairs;
}

async function initializeRankingDashboard(category) {
    const scopeSelect = document.getElementById('ranking-scope-select');
    const wikiSelect = document.getElementById('ranking-wiki-select');
    const yearMonthSelect = document.getElementById('ranking-year-month-select');
    const rankingTableBody = document.querySelector('#ranking-table tbody');
    const rankingParameters = document.getElementById('ranking-parameters');
    const showAllBtn = document.getElementById('show-top-pages-all-btn');

    let dtInstance = null;
    let lastItems = [];

    // Populate year-month dropdown
    const yearMonthOptions = generateYearMonthPairs(2023, 11, 2024, 11);
    yearMonthSelect.innerHTML = yearMonthOptions.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');

    async function loadRankingData() {
        const scope = scopeSelect.value;
        const wiki = wikiSelect.value;
        const [year, month] = yearMonthSelect.value.split('-'); // Parse year and month

        // Update parameters display
        rankingParameters.textContent = `Displaying top viewed media files for category "${category.replace(/_/g, ' ')}", scope: ${scope}, wiki: ${wiki}, date: ${year}-${month}`;

        try {
            const data = await fetchTopViewedMedia(category, scope, wiki, year, month);
            const items = data.items || [];
            if (items.length === 0) throw new Error('No data returned.');
            lastItems = items; // Save data for fallback
            updateTable(items);
        } catch (error) {
            alert('No new data available. Showing previously loaded data.');
            if (lastItems.length > 0) updateTable(lastItems);
        }
    }

    async function showPagesForRow(fileName, tdPages, limit) {
        try {
            const wiki = wikiSelect.value;
            const [year, month] = yearMonthSelect.value.split('-'); // Parse year and month

            const pagesData = await fetchTopPagesForMediaFile(fileName, wiki, year, month);
            tdPages.innerHTML = '';

            let topPages = pagesData.items;
            if (limit && limit < topPages.length) {
                topPages = topPages.slice(0, limit);
            }

            if (topPages.length === 0) {
                tdPages.textContent = 'No pages found';
            } else {
                const ul = document.createElement('ul');
                topPages.forEach(p => {
                    const li = document.createElement('li');
                    const pageLink = document.createElement('a');
                    pageLink.target = '_blank';
                    pageLink.href = `https://${wiki}.org/wiki/${encodeURIComponent(p['page-title'])}`;
                    pageLink.textContent = p['page-title'].replace(/_/g, ' ');
                    li.appendChild(pageLink);
                    ul.appendChild(li);
                });
                tdPages.appendChild(ul);
            }
        } catch (err) {
            alert(`Could not fetch top pages: ${err.message}`);
        }
    }

    function updateTable(items) {
        rankingTableBody.innerHTML = '';
        items.forEach(item => {
            const tr = document.createElement('tr');
            tr.setAttribute('data-filename', item['media-file']);
            tr.innerHTML = `
                <td>${item.rank}</td>
                <td><a href="https://commons.wikimedia.org/wiki/File:${encodeURIComponent(item['media-file'])}" target="_blank">${item['media-file'].replace(/_/g, ' ')}</a></td>
                <td>${item['pageview-count']}</td>
                <td>
                    <a href="https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(item['media-file'])}?width=100" target="_blank">
                        <img src="https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(item['media-file'])}?width=100" alt="${item['media-file']}" style="max-width: 100px;">
                    </a>
                </td>
                <td><button>Show Top Pages</button></td>
            `;
            const tdPages = tr.querySelector('td:nth-child(5)');
            const showPagesBtn = tdPages.querySelector('button');
            showPagesBtn.addEventListener('click', () => showPagesForRow(item['media-file'], tdPages, 3));
            rankingTableBody.appendChild(tr);
        });

        if (!dtInstance) {
            dtInstance = $('#ranking-table').DataTable({
                pageLength: 10,
                lengthChange: false,
                searching: false,
                ordering: false,
            });
        } else {
            dtInstance.clear();
            dtInstance.rows.add($('#ranking-table tbody tr'));
            dtInstance.draw();
        }
    }

    // Event listener for "Show Top Pages for All Files" button
    showAllBtn.addEventListener('click', async () => {
        const rows = rankingTableBody.querySelectorAll('tr');
        for (const row of rows) {
            const fileName = row.getAttribute('data-filename');
            const tdPages = row.querySelector('td:nth-child(5)'); // 5th column is Top Pages
            if (fileName && tdPages) {
                await showPagesForRow(fileName, tdPages, 3);
            }
        }
    });

    // Event listeners for dropdowns
    yearMonthSelect.addEventListener('change', loadRankingData);
    scopeSelect.addEventListener('change', loadRankingData);
    wikiSelect.addEventListener('change', loadRankingData);

    loadRankingData(); // Initial data load
}
async function initializeTopEditorsDashboard(category) {
    const scopeSelect = document.getElementById('editors-scope-select');
    const typeSelect = document.getElementById('editors-type-select');
    const yearMonthSelect = document.getElementById('editors-year-month-select');
    const editorsTableBody = document.querySelector('#editors-table tbody');
    const editorsParameters = document.getElementById('editors-parameters');

    let dtInstance = null;

    // Populate year-month dropdown
    const yearMonthOptions = generateYearMonthPairs(2023, 11, 2024, 11);
    yearMonthSelect.innerHTML = yearMonthOptions.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');

    async function loadEditorsData() {
        const scope = scopeSelect.value;
        const editType = typeSelect.value;
        const [year, month] = yearMonthSelect.value.split('-'); // Parse year and month

        // Update parameters display
        editorsParameters.textContent = `Displaying top editors for category "${category.replace(/_/g, ' ')}", scope: ${scope}, edit type: ${editType}, date: ${year}-${month}`;

        try {
            const url = `https://wikimedia.org/api/rest_v1/metrics/commons-analytics/top-editors-monthly/${category}/${scope}/${editType}/${year}/${month}`;
            const response = await fetch(url, { headers: { accept: 'application/json' } });

            if (!response.ok) throw new Error('Failed to fetch data.');

            const data = await response.json();
            const items = data.items || [];
            if (items.length === 0) throw new Error('No data returned.');
            updateTable(items);
        } catch (error) {
            alert(`Failed to load top editors: ${error.message}`);
            if (dtInstance) {
                dtInstance.clear();
                dtInstance.draw();
            }
        }
    }

    function updateTable(items) {
        editorsTableBody.innerHTML = '';
        items.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.rank}</td>
                <td><a href="https://commons.wikimedia.org/wiki/User:${item['user-name']}" target="_blank"> ${item['user-name']}</a></td>
                <td>${item['edit-count']}</td>
            `;
            editorsTableBody.appendChild(tr);
        });

        if (!dtInstance) {
            dtInstance = $('#editors-table').DataTable({
                pageLength: 10,
                lengthChange: false,
                searching: false,
                ordering: false,
            });
        } else {
            dtInstance.clear();
            dtInstance.rows.add($('#editors-table tbody tr'));
            dtInstance.draw();
        }
    }

    // Event listeners for dropdowns
    scopeSelect.addEventListener('change', loadEditorsData);
    typeSelect.addEventListener('change', loadEditorsData);
    yearMonthSelect.addEventListener('change', loadEditorsData);

    loadEditorsData(); // Initial data load
}

async function initializeTopPagesDashboard(category) {
    const scopeSelect = document.getElementById('pages-scope-select');
    const wikiSelect = document.getElementById('pages-wiki-select');
    const yearMonthSelect = document.getElementById('pages-year-month-select');
    const pagesTableBody = document.querySelector('#pages-table tbody');
    const pagesParameters = document.getElementById('pages-parameters');

    let dtInstance = null;

    // Populate year-month dropdown
    const yearMonthOptions = generateYearMonthPairs(2023, 11, 2024, 11);
    yearMonthSelect.innerHTML = yearMonthOptions.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');

    async function loadPagesData() {
        const scope = scopeSelect.value;
        const wiki = wikiSelect.value;
        const [year, month] = yearMonthSelect.value.split('-'); // Parse year and month

        // Update parameters display
        pagesParameters.textContent = `Displaying top pages for category "${category.replace(/_/g, ' ')}", scope: ${scope}, wiki: ${wiki}, date: ${year}-${month}`;

        const tableNote = document.createElement('p');
        tableNote.id = "all-wikis-note";
        const noteContainer = pagesParameters.parentNode;

        // Remove any existing note
        const existingNote = document.getElementById('all-wikis-note');
        if (existingNote) existingNote.remove();

        if (wiki === "all-wikis") {
            // Add note when "all-wikis" is selected
            tableNote.classList.add('text-warning');
            tableNote.textContent = 'Note: Links are not available for all-wikis.';
            noteContainer.insertBefore(tableNote, pagesParameters.nextSibling);
        }

        try {
            const url = `https://wikimedia.org/api/rest_v1/metrics/commons-analytics/top-pages-per-category-monthly/${category}/${scope}/${wiki}/${year}/${month}`;
            const response = await fetch(url, { headers: { accept: 'application/json' } });

            if (!response.ok) throw new Error('Failed to fetch data.');

            const data = await response.json();
            const items = data.items || [];
            if (items.length === 0) throw new Error('No data returned.');
            updateTable(items, wiki);
        } catch (error) {
            alert(`Failed to load top pages: ${error.message}`);
            if (dtInstance) {
                dtInstance.clear();
                dtInstance.draw();
            }
        }
    }

    function updateTable(items, wiki) {
        pagesTableBody.innerHTML = '';
        items.forEach(item => {
            const tr = document.createElement('tr');

            // Render row with or without links based on wiki
            if (wiki === "all-wikis") {
                tr.innerHTML = `
                    <td>${item.rank}</td>
                    <td>${item['page-title'].replace(/_/g, ' ')}</td>
                    <td>${item['pageview-count']}</td>
                `;
            } else {
                tr.innerHTML = `
                    <td>${item.rank}</td>
                    <td><a href="https://${wiki}.org/wiki/${encodeURIComponent(item['page-title'])}" target="_blank">${item['page-title'].replace(/_/g, ' ')}</a></td>
                    <td>${item['pageview-count']}</td>
                `;
            }

            pagesTableBody.appendChild(tr);
        });

        if (!dtInstance) {
            dtInstance = $('#pages-table').DataTable({
                pageLength: 10,
                lengthChange: false,
                searching: false,
                ordering: false,
            });
        } else {
            dtInstance.clear();
            dtInstance.rows.add($('#pages-table tbody tr'));
            dtInstance.draw();
        }
    }

    // Event listeners for dropdowns
    scopeSelect.addEventListener('change', loadPagesData);
    wikiSelect.addEventListener('change', loadPagesData);
    yearMonthSelect.addEventListener('change', loadPagesData);

    loadPagesData(); // Initial data load
}


// --------------------- Initialization Orchestrator ---------------------
async function initializeDashboards() {
    const category = getCategoryFromURL();
    document.getElementById('category-display').textContent = `Displaying data for category: ${category.replace(/_/g, ' ')}`;

    try {
        await setupAutocomplete();
        await initializePageviewsDashboard(category);
        await initializeCategoryDashboard(category);
        await initializeRankingDashboard(category);
        await initializeTopEditorsDashboard(category);
        await initializeTopPagesDashboard(category);
    } catch (error) {
        document.body.innerHTML = `<p>Error: ${error.message}</p>`;
    }
}

// Start everything
initializeDashboards();
