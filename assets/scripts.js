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
async function initializeRankingDashboard(category) {
    const scopeSelect = document.getElementById('ranking-scope-select');
    const wikiSelect = document.getElementById('ranking-wiki-select');
    const yearSelect = document.getElementById('ranking-year-select');
    const monthSelect = document.getElementById('ranking-month-select');
    const rankingTableBody = document.querySelector('#ranking-table tbody');
    const rankingParameters = document.getElementById('ranking-parameters');

    let dtInstance = null;
    let lastItems = []; // Store last successful data

    async function loadRankingData() {
        const scope = scopeSelect.value;
        const wiki = wikiSelect.value;
        const year = yearSelect.value;
        const month = monthSelect.value;

        // Update the parameters title
        rankingParameters.textContent = `Displaying top viewed media files for category "${category.replace(/_/g, ' ')}", scope: ${scope}, wiki: ${wiki}, date: ${year}-${month}`;

        let data;
        try {
            data = await fetchTopViewedMedia(category, scope, wiki, year, month);
        } catch (error) {
            // If fetch fails, show alert and revert to old data if available
            alert('No new data available. Showing previously loaded data.');
            if (lastItems.length === 0) {
                // No old data, table stays empty
                return;
            } else {
                updateTable(lastItems);
                return;
            }
        }

        const items = data.items || [];

        if (items.length === 0) {
            // If no new items, show alert and revert to old data
            alert('No new data returned. Showing previously loaded data.');
            if (lastItems.length > 0) {
                updateTable(lastItems);
            }
            return;
        }

        lastItems = items;
        updateTable(items);
    }



    async function showPagesForRow(fileName, tdPages, limit) {
        try {
            const wiki = document.getElementById('ranking-wiki-select').value;
            const year = document.getElementById('ranking-year-select').value;
            const month = document.getElementById('ranking-month-select').value;

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

    // After defining loadRankingData and updateTable:
    const showAllBtn = document.getElementById('show-top-pages-all-btn');
    showAllBtn.addEventListener('click', async () => {
        // For all rows in the current table, fetch top 3 pages
        const rows = rankingTableBody.querySelectorAll('tr');
        for (const row of rows) {
            const fileName = row.getAttribute('data-filename');
            const tdPages = row.querySelector('td:nth-child(5)'); // 5th column is Top Pages
            // Only if tdPages and fileName exist
            if (fileName && tdPages) {
                await showPagesForRow(fileName, tdPages, 3);
            }
        }
    });

    function updateTable(items) {
        rankingTableBody.innerHTML = '';

        const wiki = document.getElementById('ranking-wiki-select').value; // Get current wiki setting

        for (const item of items) {
            const tr = document.createElement('tr');
            const fileName = item['media-file'];
            tr.setAttribute('data-filename', fileName);

            // Rank
            const tdRank = document.createElement('td');
            tdRank.textContent = item.rank;
            tr.appendChild(tdRank);

            // Media File (with spaces, link to Commons)
            const commonsLink = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName)}`;
            const displayFileName = fileName.replace(/_/g, ' ');
            const tdFile = document.createElement('td');
            const fileLink = document.createElement('a');
            fileLink.href = commonsLink;
            fileLink.target = '_blank';
            fileLink.textContent = displayFileName;
            tdFile.appendChild(fileLink);
            tr.appendChild(tdFile);

            // Pageview Count
            const tdViews = document.createElement('td');
            tdViews.textContent = item['pageview-count'];
            tr.appendChild(tdViews);

            // Thumbnail (image clickable to Commons)
            const tdThumb = document.createElement('td');
            const thumbUrl = `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(fileName)}?width=100`;
            const thumbLink = document.createElement('a');
            thumbLink.href = commonsLink;
            thumbLink.target = '_blank';

            const img = document.createElement('img');
            img.src = thumbUrl;
            img.alt = displayFileName;
            img.style.maxWidth = '100px';

            thumbLink.appendChild(img);
            tdThumb.appendChild(thumbLink);
            tr.appendChild(tdThumb);

            // Top Pages column
            const tdPages = document.createElement('td');

            if (wiki === 'en.wikipedia') {
                const pagesButton = document.createElement('button');
                pagesButton.textContent = 'Show Top Pages';
                pagesButton.addEventListener('click', () => showPagesForRow(fileName, tdPages, 3));
                tdPages.appendChild(pagesButton);
            } else {
                // If not English Wikipedia, show a note instead of the button
                tdPages.textContent = 'Origin pages not available for all-wikis.';
            }

            tr.appendChild(tdPages);
            rankingTableBody.appendChild(tr);
        }

        // Initialize or update DataTable
        if (!dtInstance) {
            dtInstance = $('#ranking-table').DataTable({
                pageLength: 10,
                lengthChange: false,
                searching: false,
                ordering: false
            });
        } else {
            dtInstance.clear();
            dtInstance.rows.add($('#ranking-table tbody tr'));
            dtInstance.draw();
        }
    }

    // Event listeners
    scopeSelect.addEventListener('change', loadRankingData);
    wikiSelect.addEventListener('change', loadRankingData);
    yearSelect.addEventListener('change', loadRankingData);
    monthSelect.addEventListener('change', loadRankingData);

    // Initial load
    loadRankingData();
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
    } catch (error) {
        document.body.innerHTML = `<p>Error: ${error.message}</p>`;
    }
}

// Start everything
initializeDashboards();
