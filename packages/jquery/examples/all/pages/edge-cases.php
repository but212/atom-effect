<div class="container" style="padding: 0;">
    <div class="grid-main" style="grid-column: 1 / -1;">
        <div class="card card-red" style="text-align: left;">
            <h2 class="card-title">Edge Cases</h2>
            <div style="display: flex; gap: 20px; align-items: center; margin-bottom: 20px;">
                <input type="text" id="edge-input" class="search-input" placeholder="Type..." style="flex: 1;" />
                <button id="edge-clear" class="btn btn-black">Clear</button>
            </div>

            <div style="background: var(--grey); padding: 20px; border: 3px solid var(--black); font-family: var(--font-mono); font-weight: 700;">
                <div>Text length: <span id="edge-length">0</span></div>
                <div style="margin-top: 10px;">Uppercase: <span id="edge-upper"></span></div>
            </div>

            <div style="margin-top: 40px;">
                <h3>Dynamic Checkbox (Value coercion)</h3>
                <label style="display: flex; gap: 10px; align-items: center; margin-top: 10px; font-weight: 700;">
                    <input type="checkbox" id="edge-check" />
                    <span id="edge-check-text">OFF</span>
                </label>
            </div>
        </div>
    </div>
</div>
