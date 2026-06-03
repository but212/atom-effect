<div class="container" style="padding: 0;">
    <section class="hero-section">
        <h1 class="hero-title">Recursive<br />Two-Way Sync.</h1>
        <p class="hero-description">
        Bind an entire form to a single object-based atom. Supports deep
        nested objects, structural sharing for performance, and dynamic form
        manipulation.
        </p>
    </section>

    <!-- Form Section -->
    <div class="grid-main">
        <div class="card card-blue" style="text-align: left;">
            <div class="card-title">
                <span>01 / Configuration</span>
                <div class="status status-resolved">Active</div>
            </div>

            <form id="user-form">
                <!-- Submission Status Box -->
                <div id="submission-status" style="margin-bottom: 24px; display: none">
                    <div class="card" style="padding: 15px; box-shadow: 4px 4px 0px var(--black); margin-bottom: 0;">
                        <div id="status-content"></div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px">
                    <div class="form-group">
                        <label class="form-label">First Name</label>
                        <input type="text" name="user.firstName" placeholder="Jean" />
                    </div>
                    <div class="form-group">
                        <label class="form-label">Last Name</label>
                        <input type="text" name="user.lastName" placeholder="Gravity" />
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">Email Address</label>
                    <input type="email" name="user.email" placeholder="jean@example.com" />
                </div>

                <div class="form-group">
                    <label class="form-label">Age</label>
                    <input type="number" name="user.age" min="0" max="120" />
                </div>

                <div class="form-group">
                    <label class="form-label">Role</label>
                    <select name="user.role">
                        <option value="user">Standard User</option>
                        <option value="admin">Administrator</option>
                        <option value="editor">Editor</option>
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label">Bio</label>
                    <textarea name="user.bio" rows="4" placeholder="Tell us about yourself..."></textarea>
                </div>

                <hr style="margin: 40px 0; border: none; border-top: 3px solid var(--black);" />

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px">
                    <div class="form-group">
                        <label class="form-label">Theme Preference</label>
                        <div class="radio-group">
                            <label class="radio-item"><input type="radio" name="preferences.theme" value="light" /> Light</label>
                            <label class="radio-item"><input type="radio" name="preferences.theme" value="dark" /> Dark</label>
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Newsletter</label>
                        <div class="checkbox-group">
                            <label class="checkbox-item"><input type="checkbox" name="preferences.newsletter" /> Subscribe for updates</label>
                        </div>
                    </div>
                </div>

                <div id="dynamic-container" style="margin-top: 20px"></div>

                <div style="display: flex; gap: 15px; margin-top: 40px">
                    <button type="submit" id="submitBtn" class="btn btn-success" style="flex: 2">Save Profiles</button>
                    <button type="button" id="addField" class="btn" style="flex: 1">+ Field</button>
                    <button type="button" id="resetForm" class="btn" style="flex: 1">Reset</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Preview Section -->
    <div class="grid-side">
        <div class="card card-yellow" style="text-align: left;">
            <div class="card-title">02 / Live State</div>
            <pre id="json-preview" class="json-preview">{}</pre>

            <ul class="feature-list">
                <li>Lens: Path-based binding</li>
                <li>Structural Sharing</li>
                <li>Auto-Mutation Tracking</li>
                <li><strong>Async Integration:</strong> Loading/Error/Success</li>
            </ul>
        </div>
    </div>
</div>
