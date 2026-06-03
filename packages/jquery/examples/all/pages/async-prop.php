<div class="container" style="padding: 0;">
    <div class="grid-main" style="grid-column: 1 / -1;">
        <div class="card card-blue" style="text-align: left;">
            <h2 class="card-title">Async Propagation</h2>
            <div style="margin-bottom: 20px;">
                <button id="prop-trigger" class="btn btn-black">Trigger Sequence</button>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px;">
                <div style="border: 3px solid var(--black); padding: 20px;">
                    <h3>Step 1</h3>
                    <div id="prop-step1" class="status status-idle" style="margin-top: 10px;">Idle</div>
                </div>
                <div style="border: 3px solid var(--black); padding: 20px;">
                    <h3>Step 2 (Dependent)</h3>
                    <div id="prop-step2" class="status status-idle" style="margin-top: 10px;">Idle</div>
                </div>
                <div style="border: 3px solid var(--black); padding: 20px;">
                    <h3>Step 3 (Final)</h3>
                    <div id="prop-step3" class="status status-idle" style="margin-top: 10px;">Idle</div>
                </div>
            </div>
        </div>
    </div>
</div>
