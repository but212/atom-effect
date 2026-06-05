<div class="container" style="padding: 0;">
    <!-- Main Interaction Area -->
    <section class="grid-main">
        <div class="card card-blue" style="text-align: left;">
            <h2 class="card-title">Search Engine</h2>
            <input
                type="text"
                id="search-input"
                class="search-input"
                placeholder="TYPE USERNAME..." />
            <div style="margin-top: 20px">
                <div id="status-indicator" class="status status-idle">IDLE</div>
            </div>
        </div>

        <div class="card" style="text-align: left;">
            <h2 class="card-title">Results Stream</h2>
            <div id="results-container">
                <div id="search-placeholder" class="empty-state">SEARCH KEYWORD REQUIRED</div>
                <div id="results-list" class="user-list"></div>
            </div>
        </div>
    </section>

    <!-- Sidebar / Live Data -->
    <section class="grid-side">
        <div class="card card-yellow" style="text-align: left;">
            <h2 class="card-title">System Live</h2>
            <div class="stats-grid" style="display: flex; flex-direction: column; gap: 20px; margin-bottom: 0;">
                <div class="stat-item" style="margin-bottom: 0;">
                    <div id="search-count" class="stat-value">0</div>
                    <div class="stat-label">Queries</div>
                </div>
                <div class="stat-item" style="margin-bottom: 0;">
                    <div id="current-state" class="stat-value" style="font-size: 2rem;">IDLE</div>
                    <div class="stat-label">State</div>
                </div>
                <div class="stat-item" style="margin-bottom: 0;">
                    <div id="result-count" class="stat-value">0</div>
                    <div class="stat-label">Items</div>
                </div>
                <div id="last-update-wrapper" class="stat-item" style="margin-bottom: 0;">
                    <div id="last-update" class="stat-value" style="font-size: 2rem;">--:--</div>
                    <div class="stat-label">Pulse</div>
                </div>
            </div>
        </div>
    </section>
</div>