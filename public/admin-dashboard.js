let systemChart, responseTimeChart, requestRateChart;
let eventSource;

// Initialize charts
function initCharts() {
    const systemCtx = document.getElementById('systemChart').getContext('2d');
    systemChart = new Chart(systemCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'CPU %',
                data: [],
                borderColor: '#4CAF50',
                backgroundColor: 'rgba(76, 175, 80, 0.1)',
                tension: 0.4
            }, {
                label: 'Memory (MB)',
                data: [],
                borderColor: '#2196F3',
                backgroundColor: 'rgba(33, 150, 243, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });

    const responseCtx = document.getElementById('responseTimeChart').getContext('2d');
    responseTimeChart = new Chart(responseCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Response Time (ms)',
                data: [],
                borderColor: '#2196F3',
                backgroundColor: 'rgba(33, 150, 243, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });

    const requestRateCtx = document.getElementById('requestRateChart').getContext('2d');
    requestRateChart = new Chart(requestRateCtx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'İstek Sayısı',
                data: [],
                backgroundColor: '#4CAF50',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Update dashboard
function updateDashboard(data) {
    // System stats
    document.getElementById('cpuUsage').textContent = data.system.cpu.usage + '%';
    document.getElementById('cpuCores').textContent = data.system.cpu.cores + ' çekirdek';
    document.getElementById('memoryUsage').textContent = data.system.memory.current + ' MB';
    document.getElementById('memoryDetails').textContent = 'Peak: ' + data.system.memory.peak + ' MB';
    document.getElementById('uptime').textContent = data.system.uptime.appFormatted;

    // Database stats
    const totalProducts = (data.database.zaraProducts || 0) +
                        (data.database.bershkaProducts || 0) +
                        (data.database.stradivariusProducts || 0);
    document.getElementById('totalProducts').textContent = totalProducts.toLocaleString();
    document.getElementById('onSaleProducts').textContent = (data.database.onSaleProducts || 0).toLocaleString();
    document.getElementById('totalUsers').textContent = (data.database.users || 0).toLocaleString();
    document.getElementById('verifiedUsers').textContent = (data.database.verifiedUsers || 0) + ' doğrulanmış';
    document.getElementById('onlineUsers').textContent = data.onlineUsers || 0;

    // Cache stats
    document.getElementById('cacheHitRate').textContent = data.cache.hitRate + '%';
    document.getElementById('cacheStats').textContent = `${data.cache.hits} hit / ${data.cache.misses} miss`;

    // API stats
    document.getElementById('avgResponseTime').textContent = data.api.averageResponseTime + ' ms';
    document.getElementById('totalRequests').textContent = data.api.totalRequests.toLocaleString() + ' istek';

    // Update charts
    const now = new Date().toLocaleTimeString();

    // System chart
    if (systemChart.data.labels.length > 20) {
        systemChart.data.labels.shift();
        systemChart.data.datasets[0].data.shift();
        systemChart.data.datasets[1].data.shift();
    }
    systemChart.data.labels.push(now);
    systemChart.data.datasets[0].data.push(parseFloat(data.system.cpu.usage));
    systemChart.data.datasets[1].data.push(parseFloat(data.system.memory.current));
    systemChart.update('none');

    // Response time chart
    if (data.api.recentResponseTimes && data.api.recentResponseTimes.length > 0) {
        responseTimeChart.data.labels = data.api.recentResponseTimes.map((_, i) => `#${i + 1}`);
        responseTimeChart.data.datasets[0].data = data.api.recentResponseTimes;
        responseTimeChart.update('none');
    }

    // Request rate chart
    if (data.requestBuckets && data.requestBuckets.length > 0) {
        requestRateChart.data.labels = data.requestBuckets.map(bucket => {
            const date = new Date(bucket.timestamp);
            return date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
        });
        requestRateChart.data.datasets[0].data = data.requestBuckets.map(bucket => bucket.count);
        requestRateChart.update('none');
    }
}

// Start real-time monitoring
async function fetchDashboardData() {
    try {
        const res = await fetch('/admin/api/dashboard-data');
        if (!res.ok) {
            if (res.status === 401) {
                window.location.href = '/admin/login';
                return;
            }
            throw new Error('Failed to fetch dashboard data');
        }
        const result = await res.json();
        if (result.success) {
            updateDashboard(result.data);
        }
    } catch (error) {
        console.error('Dashboard data fetch error:', error);
    }
}

function startMonitoring() {
    // Initial fetch
    fetchDashboardData();

    // Refresh every 5 seconds
    setInterval(fetchDashboardData, 5000);
}

// Control functions
async function toggleScheduler() {
    try {
        const res = await fetch('/admin/api/scheduler/toggle', { method: 'POST' });
        const data = await res.json();
        alert(data.message);
        updateSchedulerStatus();
    } catch (error) {
        alert('Hata: ' + error.message);
    }
}

let progressInterval = null;
let startTime = null;

async function triggerUpdate(brand) {
    try {
        // Show progress section
        const progressDiv = document.getElementById('scraperProgress');
        progressDiv.style.display = 'block';

        // Update brand name
        const brandNames = {
            'zara': 'Zara',
            'bershka': 'Bershka',
            'stradivarius': 'Stradivarius'
        };
        document.getElementById('progressBrand').textContent = `${brandNames[brand]} Güncelleniyor...`;

        // Reset progress
        updateProgress(0, 'Başlatılıyor...', 0, 0);

        // Disable button
        const btn = document.getElementById(`${brand}UpdateBtn`);
        btn.disabled = true;
        btn.textContent = 'Güncelleniyor...';

        // Start timer
        startTime = Date.now();
        if (progressInterval) clearInterval(progressInterval);
        progressInterval = setInterval(updateTimer, 1000);

        // Start update and get jobId
        const res = await fetch(`/admin/api/trigger-update/${brand}`, { method: 'POST' });
        const data = await res.json();

        if (!data.success || !data.jobId) {
            throw new Error(data.message || 'Güncelleme başlatılamadı');
        }

        // Connect to SSE for real-time progress
        const eventSource = new EventSource(`/admin/api/scraper-progress/${data.jobId}`);
        console.log('[SSE] Connecting to:', `/admin/api/scraper-progress/${data.jobId}`);

        eventSource.onmessage = (event) => {
            console.log('[SSE] Message received:', event.data);
            const progress = JSON.parse(event.data);
            console.log('[SSE] Parsed progress:', progress);

            // Update progress bar
            updateProgress(
                progress.percentage || 0,
                progress.currentCategory || 'İşleniyor...',
                progress.processedItems || 0,
                progress.savedItems || 0
            );
            console.log('[SSE] Progress bar updated:', progress.percentage + '%');

            // If completed or failed, close connection
            if (progress.status === 'completed') {
                eventSource.close();
                clearInterval(progressInterval);
                updateProgress(100, 'Tamamlandı! ✅', progress.savedItems, progress.savedItems);

                setTimeout(() => {
                    progressDiv.style.display = 'none';
                    loadDashboard(); // Refresh stats
                }, 10000);

                btn.disabled = false;
                btn.textContent = `${brandNames[brand]} Güncelle`;
            } else if (progress.status === 'failed') {
                eventSource.close();
                clearInterval(progressInterval);
                updateProgress(0, 'Hata: ' + (progress.error || 'Bilinmeyen hata'), 0, 0);

                setTimeout(() => {
                    progressDiv.style.display = 'none';
                }, 5000);

                btn.disabled = false;
                btn.textContent = `${brandNames[brand]} Güncelle`;
            }
        };

        eventSource.onerror = (error) => {
            console.error('SSE error:', error);
            eventSource.close();
            clearInterval(progressInterval);

            // Don't show error if job might be completing
            setTimeout(() => {
                if (btn.disabled) {
                    updateProgress(0, 'Bağlantı hatası', 0, 0);
                    btn.disabled = false;
                    btn.textContent = `${brandNames[brand]} Güncelle`;
                }
            }, 2000);
        };

    } catch (error) {
        // Stop timer
        if (progressInterval) clearInterval(progressInterval);

        updateProgress(0, 'Hata: ' + error.message, 0, 0);

        // Re-enable button
        const btn = document.getElementById(`${brand}UpdateBtn`);
        btn.disabled = false;
        btn.textContent = `${brandNames[brand]} Güncelle`;

        setTimeout(() => {
            document.getElementById('scraperProgress').style.display = 'none';
        }, 5000);
    }
}

function updateProgress(percent, status, fetched, saved) {
    document.getElementById('progressBar').style.width = percent + '%';
    document.getElementById('progressPercent').textContent = Math.round(percent) + '%';
    document.getElementById('progressStatus').textContent = status;
    document.getElementById('progressFetched').textContent = fetched.toLocaleString();
    document.getElementById('progressSaved').textContent = saved.toLocaleString();
}

function updateTimer() {
    if (!startTime) return;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    document.getElementById('progressTime').textContent = timeStr;
}

async function clearCache(type) {
    try {
        const res = await fetch('/admin/api/cache/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type })
        });
        const data = await res.json();
        alert(data.message);
    } catch (error) {
        alert('Hata: ' + error.message);
    }
}

async function resetStats() {
    if (!confirm('İstatistikleri sıfırlamak istediğinize emin misiniz?')) return;
    try {
        const res = await fetch('/admin/api/stats/reset', { method: 'POST' });
        const data = await res.json();
        alert(data.message);
    } catch (error) {
        alert('Hata: ' + error.message);
    }
}

async function updateSchedulerStatus() {
    try {
        const res = await fetch('/admin/api/scheduler-status');
        const data = await res.json();
        const indicator = document.getElementById('schedulerStatus');
        indicator.className = 'status-indicator ' + (data.data.dataFetchEnabled ? 'status-active' : 'status-inactive');
    } catch (error) {
        console.error('Scheduler status error:', error);
    }
}

async function refreshLogs() {
    try {
        const res = await fetch('/admin/api/logs?lines=50');
        const data = await res.json();
        const container = document.getElementById('logsContainer');

        if (data.data.logs.length === 0) {
            container.innerHTML = '<div class="loading">' + (data.data.message || 'Log bulunamadı') + '</div>';
        } else {
            container.innerHTML = data.data.logs.map(line => {
                let className = 'log-line';
                if (line.includes('error')) className += ' log-error';
                else if (line.includes('warn')) className += ' log-warn';
                else if (line.includes('info')) className += ' log-info';
                return `<div class="${className}">${escapeHtml(line)}</div>`;
            }).join('');
        }
    } catch (error) {
        console.error('Logs error:', error);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Logout
document.getElementById('logoutBtn').addEventListener('click', async (e) => {
    e.preventDefault();
    try {
        await fetch('/admin/logout', { method: 'POST' });
        window.location.href = '/admin/login';
    } catch (error) {
        console.error('Logout error:', error);
    }
});

// Store users data globally for filtering
let allUsers = [];

// Load users data
async function loadUsers() {
    try {
        const response = await fetch('/admin/api/users');
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.message);
        }

        allUsers = data.users;
        displayUsers(allUsers);

    } catch (error) {
        console.error('Load users error:', error);
        document.getElementById('usersTableBody').innerHTML =
            '<tr><td colspan="6" class="loading">Kullanıcılar yüklenemedi</td></tr>';
    }
}

// Display users in table
function displayUsers(users) {
    const tbody = document.getElementById('usersTableBody');

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">Kullanıcı bulunamadı</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(user => {
        const createdDate = new Date(user.createdAt).toLocaleDateString('tr-TR');
        const lastLoginDate = user.lastLoginAt
            ? new Date(user.lastLoginAt).toLocaleString('tr-TR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            })
            : 'Hiç giriş yapmadı';
        const brands = Array.isArray(user.brands) ? user.brands.join(', ') : 'Yok';

        return `
            <tr>
                <td>${user.userNumber}</td>
                <td>${user.email}</td>
                <td>${createdDate}</td>
                <td>${lastLoginDate}</td>
                <td>${user.trackCount}</td>
                <td>${brands}</td>
            </tr>
        `;
    }).join('');
}

// Filter users by email
function filterUsers(searchTerm) {
    const filtered = allUsers.filter(user =>
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
    displayUsers(filtered);
}

// Initialize
window.addEventListener('load', () => {
    initCharts();
    startMonitoring();
    updateSchedulerStatus();
    refreshLogs();
    loadUsers();

    // Scraper button event listeners
    document.getElementById('toggleSchedulerBtn')?.addEventListener('click', toggleScheduler);
    document.getElementById('zaraUpdateBtn')?.addEventListener('click', () => triggerUpdate('zara'));
    document.getElementById('bershkaUpdateBtn')?.addEventListener('click', () => triggerUpdate('bershka'));
    document.getElementById('stradivariusUpdateBtn')?.addEventListener('click', () => triggerUpdate('stradivarius'));
    document.getElementById('refreshLogsBtn')?.addEventListener('click', refreshLogs);

    // Search input event listener
    const searchInput = document.getElementById('userSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterUsers(e.target.value);
        });
    }

    // Auto-refresh logs every 30 seconds
    setInterval(refreshLogs, 30000);

    // Auto-refresh users every 60 seconds
    setInterval(loadUsers, 60000);
});
