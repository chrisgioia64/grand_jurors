const IGNORED_CATEGORIES = ['Learned About Civil Grand Jury', 'Candidate'];

function isMissingAgeSubcategory(subcat) {
    return subcat == null || subcat === '' || subcat === 'Blank' || subcat === 'null';
}

function normalizeAgeSubcategory(subcat) {
    if (subcat === '75 and over' || subcat === '75 & over') return '75 & over';
    return subcat;
}

function normalizeRaceSubcategory(subcat) {
    if (subcat.includes('Native American') || subcat.includes('American Indian') || subcat.includes('Alaska Native')) {
        return 'Native American';
    }
    if (subcat.includes('Middle Eastern')) {
        return 'Hispanic/Latino';
    }
    return subcat;
}

function compressRaceSubcategory(subcat) {
    let compressed = subcat;
    if (compressed === 'Black/African American') {
        compressed = 'Black or African American';
    }
    const allowed = ['White', 'Asian', 'Black or African American', 'Hispanic/Latino'];
    return allowed.includes(compressed) ? compressed : 'Other';
}

function compressOccupationSubcategory(subcat) {
    const allowed = ['Retired', 'Management/professional', 'Unemployed'];
    return allowed.includes(subcat) ? subcat : 'Other';
}

function emptyBucket() {
    return {
        Applicant: { total: 0, subcategories: {} },
        'Selected & Sworn': { total: 0, subcategories: {} },
        allSubcategories: new Set()
    };
}

function ensureCategory(categories, name) {
    if (!categories[name]) {
        categories[name] = emptyBucket();
    }
    return categories[name];
}

function addToBucket(bucket, source, subcat, count) {
    if (!bucket[source]) return;
    bucket[source].subcategories[subcat] = (bucket[source].subcategories[subcat] || 0) + count;
    bucket[source].total += count;
    bucket.allSubcategories.add(subcat);
}

function sortLabels(catName, labels) {
    const ageOrder = ['18-25', '26-34', '35-44', '45-64', '65-74', '75 & over', '75 and over', 'Decline to answer'];
    if (catName.startsWith('Age Range')) {
        return labels.sort((a, b) => {
            const ia = ageOrder.indexOf(a);
            const ib = ageOrder.indexOf(b);
            if (ia === -1 && ib === -1) return a.localeCompare(b);
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });
    }
    return labels.sort();
}

function yMaxForCategory(catName) {
    if (catName.startsWith('Age Range')) return 60;
    if (catName.startsWith('District')) return 45;
    if (catName.startsWith('Race or Ethnicity')) return 85;
    if (catName.startsWith('Gender')) return 70;
    return 100;
}

const TREND_DEFAULTS = {
    'Gender': 'Male',
    'Occupation': 'Retired',
    'Age Range': '65-74',
    'Race or Ethnicity': 'White',
    'District': 'D2'
};

const TREND_OPTION_ORDER = {
    'Gender': ['Male', 'Female'],
    'Occupation': ['Retired', 'Management/professional', 'Unemployed', 'Other'],
    'Age Range': ['18-25', '26-34', '35-44', '45-64', '65-74', '75 & over'],
    'Race or Ethnicity': ['White', 'Asian', 'Black or African American', 'Hispanic/Latino', 'Other'],
    'District': ['D1', 'D2', 'D3', 'D4', 'D5']
};

const TREND_OPTION_LABELS = {
    'D1': 'District 1',
    'D2': 'District 2',
    'D3': 'District 3',
    'D4': 'District 4',
    'D5': 'District 5'
};

function trendOptionLabels(catName, labels) {
    const preferred = TREND_OPTION_ORDER[catName] || [];
    const present = new Set(labels);
    const ordered = preferred.filter(label => present.has(label));
    labels.forEach(label => {
        if (!ordered.includes(label)) ordered.push(label);
    });
    return ordered;
}

function trendDisplayLabel(label) {
    return TREND_OPTION_LABELS[label] || label;
}

function paddedYMax(datasets) {
    const dataMax = Math.max(0, ...datasets.flatMap(d => d.data));
    if (dataMax >= 100) return 100;
    return Math.max(10, Math.ceil((dataMax + 1) / 10) * 10);
}

function styleToggleButton(btn) {
    btn.style.padding = '5px 10px';
    btn.style.cursor = 'pointer';
    btn.style.border = '1px solid #ccc';
    btn.style.borderRadius = '4px';
    btn.style.backgroundColor = '#f9f9f9';
}

function attachToggle(btn, fullId, compressedId) {
    btn.onclick = () => {
        const full = document.getElementById(fullId);
        const comp = document.getElementById(compressedId);
        if (full.style.display === 'none') {
            full.style.display = 'flex';
            comp.style.display = 'none';
        } else {
            full.style.display = 'none';
            comp.style.display = 'flex';
        }
        requestAnimationFrame(() => {
            [full, comp].forEach(container => {
                container.querySelectorAll('canvas').forEach(c => {
                    const chart = Chart.getChart(c);
                    if (chart) chart.resize();
                });
            });
        });
    };
}

function groupAggregate(data) {
    const categories = {};
    data.forEach(row => {
        const cat = row.Category;
        if (IGNORED_CATEGORIES.includes(cat)) return;

        const source = row['Data Source'];
        let subcat = row.Subcategory;
        const count = row.Total_Count;

        if (cat === 'Age Range' && isMissingAgeSubcategory(subcat)) return;

        if (cat === 'Race or Ethnicity') {
            subcat = normalizeRaceSubcategory(subcat);
        }

        ensureCategory(categories, cat);
        addToBucket(categories[cat], source, subcat, count);

        if (cat === 'Race or Ethnicity') {
            const compressedCat = 'Race or Ethnicity (Compressed)';
            ensureCategory(categories, compressedCat);
            addToBucket(categories[compressedCat], source, compressRaceSubcategory(subcat), count);
        }

        if (cat === 'Occupation') {
            const compressedCat = 'Occupation (Compressed)';
            ensureCategory(categories, compressedCat);
            addToBucket(categories[compressedCat], source, compressOccupationSubcategory(subcat), count);
        }
    });
    return categories;
}

function groupYearly(data) {
    const categories = {};

    function ensureYearly(name) {
        if (!categories[name]) {
            categories[name] = {
                Applicant: {},
                'Selected & Sworn': {},
                allSubcategories: new Set(),
                years: new Set()
            };
        }
        return categories[name];
    }

    function addYearly(name, source, year, subcat, count) {
        const bucket = ensureYearly(name);
        if (!bucket[source][year]) {
            bucket[source][year] = { total: 0, subcategories: {} };
        }
        bucket[source][year].subcategories[subcat] = (bucket[source][year].subcategories[subcat] || 0) + count;
        bucket[source][year].total += count;
        bucket.allSubcategories.add(subcat);
        bucket.years.add(year);
    }

    data.forEach(row => {
        const cat = row.Category;
        if (IGNORED_CATEGORIES.includes(cat)) return;

        const source = row['Data Source'];
        let subcat = row.Subcategory;
        const count = row.Count;
        const year = row.Year;

        if (cat === 'Age Range' && isMissingAgeSubcategory(subcat)) return;
        if (cat === 'Age Range' && subcat === 'Decline to answer') return;
        if (cat === 'Age Range') {
            subcat = normalizeAgeSubcategory(subcat);
        }

        if (cat === 'Race or Ethnicity') {
            subcat = normalizeRaceSubcategory(subcat);
        }

        addYearly(cat, source, year, subcat, count);

        if (cat === 'Race or Ethnicity') {
            addYearly('Race or Ethnicity (Compressed)', source, year, compressRaceSubcategory(subcat), count);
        }
        if (cat === 'Occupation') {
            addYearly('Occupation (Compressed)', source, year, compressOccupationSubcategory(subcat), count);
        }
    });

    return categories;
}

function renderAggregate(categories) {
    const dashboard = document.getElementById('dashboard');

    for (const [catName, catData] of Object.entries(categories)) {
        let labels = sortLabels(catName, Array.from(catData.allSubcategories));

        if (catName === 'Race or Ethnicity') {
            labels = labels.filter(label => {
                const applicantCount = catData.Applicant.subcategories[label] || 0;
                const swornCount = catData['Selected & Sworn'].subcategories[label] || 0;
                return applicantCount > 0 || swornCount > 0;
            });
        }

        const applicantPct = labels.map(label => {
            const count = catData.Applicant.subcategories[label] || 0;
            return catData.Applicant.total > 0 ? Math.round((count / catData.Applicant.total) * 100) : 0;
        });

        const swornPct = labels.map(label => {
            const count = catData['Selected & Sworn'].subcategories[label] || 0;
            return catData['Selected & Sworn'].total > 0 ? Math.round((count / catData['Selected & Sworn'].total) * 100) : 0;
        });

        const applicantCounts = labels.map(label => catData.Applicant.subcategories[label] || 0);
        const swornCounts = labels.map(label => catData['Selected & Sworn'].subcategories[label] || 0);

        const container = document.createElement('div');
        container.className = 'chart-container';

        if (catName === 'Race or Ethnicity') {
            container.id = 'container-race-full';
            container.style.display = 'none';
        } else if (catName === 'Race or Ethnicity (Compressed)') {
            container.id = 'container-race-compressed';
        } else if (catName === 'Occupation') {
            container.id = 'container-occupation-full';
            container.style.display = 'none';
        } else if (catName === 'Occupation (Compressed)') {
            container.id = 'container-occupation-compressed';
        }

        const titleContainer = document.createElement('div');
        titleContainer.style.display = 'flex';
        titleContainer.style.justifyContent = 'space-between';
        titleContainer.style.alignItems = 'center';
        titleContainer.style.marginBottom = '15px';

        const title = document.createElement('h2');
        title.textContent = catName.replace(' (Compressed)', '');
        title.style.margin = '0';
        titleContainer.appendChild(title);

        if (catName === 'Race or Ethnicity' || catName === 'Race or Ethnicity (Compressed)') {
            const toggleBtn = document.createElement('button');
            toggleBtn.textContent = catName === 'Race or Ethnicity (Compressed)' ? 'Show Full' : 'Show Compressed';
            styleToggleButton(toggleBtn);
            attachToggle(toggleBtn, 'container-race-full', 'container-race-compressed');
            titleContainer.appendChild(toggleBtn);
        }

        if (catName === 'Occupation' || catName === 'Occupation (Compressed)') {
            const toggleBtn = document.createElement('button');
            toggleBtn.textContent = catName === 'Occupation (Compressed)' ? 'Show Full' : 'Show Compressed';
            styleToggleButton(toggleBtn);
            attachToggle(toggleBtn, 'container-occupation-full', 'container-occupation-compressed');
            titleContainer.appendChild(toggleBtn);
        }

        const canvasWrapper = document.createElement('div');
        canvasWrapper.className = 'canvas-wrapper';
        const canvas = document.createElement('canvas');
        canvasWrapper.appendChild(canvas);

        container.appendChild(titleContainer);
        container.appendChild(canvasWrapper);
        dashboard.appendChild(container);

        new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Applicants',
                        data: applicantPct,
                        counts: applicantCounts,
                        backgroundColor: 'rgba(52, 152, 219, 0.7)',
                        borderColor: 'rgba(41, 128, 185, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Selected & Sworn',
                        data: swornPct,
                        counts: swornCounts,
                        backgroundColor: 'rgba(230, 126, 34, 0.7)',
                        borderColor: 'rgba(211, 84, 0, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'nearest',
                    intersect: false
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const count = context.dataset.counts[context.dataIndex];
                                return `${context.dataset.label}: ${context.parsed.y}% (Count: ${count})`;
                            }
                        }
                    },
                    legend: {
                        position: 'bottom'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: yMaxForCategory(catName),
                        title: {
                            display: true,
                            text: 'Percentage (%)'
                        },
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                }
            }
        });
    }
}

function buildSourceComparisonDatasets(catData, years, subcategory) {
    const sources = [
        { key: 'Applicant', label: 'Applicants', color: 'rgba(41, 128, 185, 1)' },
        { key: 'Selected & Sworn', label: 'Selected & Sworn', color: 'rgba(211, 84, 0, 1)' }
    ];
    return sources.map(source => {
        const percents = [];
        const counts = [];
        years.forEach(year => {
            const yearData = catData[source.key][year];
            const count = (yearData && yearData.subcategories[subcategory]) || 0;
            const total = (yearData && yearData.total) || 0;
            counts.push(count);
            percents.push(total > 0 ? Math.round((count / total) * 100) : 0);
        });
        return {
            label: source.label,
            data: percents,
            counts: counts,
            borderColor: source.color,
            backgroundColor: source.color,
            tension: 0.2,
            pointRadius: 4,
            pointHoverRadius: 6
        };
    });
}

function renderTrendLineChart(canvas, years, datasets) {
    return new Chart(canvas, {
        type: 'line',
        data: {
            labels: years,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'nearest',
                intersect: false
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const count = context.dataset.counts[context.dataIndex];
                            return `${context.dataset.label}: ${context.parsed.y}% (Count: ${count})`;
                        }
                    }
                },
                legend: {
                    position: 'bottom'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: paddedYMax(datasets),
                    title: {
                        display: true,
                        text: 'Percentage (%)'
                    },
                    ticks: {
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                }
            }
        }
    });
}

function trendChartData(categories, catName) {
    if (catName === 'Race or Ethnicity' && categories['Race or Ethnicity (Compressed)']) {
        return categories['Race or Ethnicity (Compressed)'];
    }
    if (catName === 'Occupation' && categories['Occupation (Compressed)']) {
        return categories['Occupation (Compressed)'];
    }
    return categories[catName];
}

function renderTrends(categories) {
    const dashboard = document.getElementById('trends-dashboard');

    for (const catName of Object.keys(categories)) {
        if (catName === 'Occupation (Compressed)' || catName === 'Race or Ethnicity (Compressed)') continue;

        const catData = trendChartData(categories, catName);
        const years = Array.from(catData.years).sort((a, b) => a - b);
        const labels = trendOptionLabels(catName, Array.from(catData.allSubcategories));
        const initial = labels.includes(TREND_DEFAULTS[catName]) ? TREND_DEFAULTS[catName] : labels[0];

        const container = document.createElement('div');
        container.className = 'chart-container';

        const titleContainer = document.createElement('div');
        titleContainer.style.display = 'flex';
        titleContainer.style.justifyContent = 'space-between';
        titleContainer.style.alignItems = 'center';
        titleContainer.style.marginBottom = '10px';
        titleContainer.style.gap = '12px';

        const title = document.createElement('h2');
        title.textContent = catName;
        title.style.margin = '0';
        titleContainer.appendChild(title);

        const select = document.createElement('select');
        select.setAttribute('aria-label', `${catName} item`);
        styleToggleButton(select);
        labels.forEach(label => {
            const option = document.createElement('option');
            option.value = label;
            option.textContent = trendDisplayLabel(label);
            if (label === initial) option.selected = true;
            select.appendChild(option);
        });
        titleContainer.appendChild(select);
        container.appendChild(titleContainer);

        const canvasWrapper = document.createElement('div');
        canvasWrapper.className = 'canvas-wrapper';
        const canvas = document.createElement('canvas');
        canvasWrapper.appendChild(canvas);
        container.appendChild(canvasWrapper);

        const chart = renderTrendLineChart(canvas, years, buildSourceComparisonDatasets(catData, years, initial));
        select.addEventListener('change', () => {
            const datasets = buildSourceComparisonDatasets(catData, years, select.value);
            chart.data.datasets = datasets;
            chart.options.scales.y.max = paddedYMax(datasets);
            const trendsAppCb = document.getElementById('filter-trends-applicants');
            const trendsSwornCb = document.getElementById('filter-trends-sworn');
            if (trendsAppCb && trendsSwornCb) {
                chart.setDatasetVisibility(0, trendsAppCb.checked);
                chart.setDatasetVisibility(1, trendsSwornCb.checked);
            }
            chart.update();
        });

        dashboard.appendChild(container);
    }
}

function setupFilterControls(appCbId, swornCbId, containerId) {
    const appCb = document.getElementById(appCbId);
    const swornCb = document.getElementById(swornCbId);
    if (!appCb || !swornCb) return;

    function updateVisibility() {
        const showApp = appCb.checked;
        const showSworn = swornCb.checked;

        const canvases = document.querySelectorAll(`#${containerId} canvas`);
        canvases.forEach(canvas => {
            const chart = Chart.getChart(canvas);
            if (chart && chart.data && chart.data.datasets) {
                if (chart.data.datasets.length > 0) {
                    chart.setDatasetVisibility(0, showApp);
                }
                if (chart.data.datasets.length > 1) {
                    chart.setDatasetVisibility(1, showSworn);
                }
                chart.update();
            }
        });
    }

    appCb.addEventListener('change', () => {
        if (!appCb.checked && !swornCb.checked) {
            appCb.checked = true;
            return;
        }
        updateVisibility();
    });

    swornCb.addEventListener('change', () => {
        if (!appCb.checked && !swornCb.checked) {
            swornCb.checked = true;
            return;
        }
        updateVisibility();
    });
}

function setupAggregateFilters() {
    setupFilterControls('filter-applicants', 'filter-sworn', 'dashboard');
}

function setupTrendsFilters() {
    setupFilterControls('filter-trends-applicants', 'filter-trends-sworn', 'trends-dashboard');
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const [aggRes, rawRes] = await Promise.all([
            fetch('demographics_aggregate.json'),
            fetch('demographics_raw.json')
        ]);
        const aggData = await aggRes.json();
        const rawData = await rawRes.json();

        renderAggregate(groupAggregate(aggData));
        setupAggregateFilters();
        renderTrends(groupYearly(rawData));
        setupTrendsFilters();
    } catch (error) {
        console.error("Error loading or parsing data:", error);
        document.getElementById('dashboard').innerHTML = '<p style="color:red; text-align:center;">Error loading data. Make sure you are running this through a local web server (e.g., Live Server or python -m http.server).</p>';
    }
});
