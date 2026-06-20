# Markdown Styling & Structure Conventions

This document outlines the conventions for creating, formatting, and structuring Markdown (`.md`) files within the `atom-effect` repository. Following these standards ensures high readability across IDEs and Git platforms, keeps formatting consistent, and aligns with `markdownlint` criteria.

---

## 1. Heading Hierarchy & Structure

To ensure semantic structure and easy outline generation, follow these rules:

1. **Single Top-Level Heading**: Every document **MUST** have exactly one top-level heading (`# [Title]`) at the very beginning of the file (aligned with `MD025` and `MD041`).
2. **Sequential Heading Levels**: Do not skip heading levels (e.g., do not go from `#` directly to `###` or `####`). Always descend sequentially: `#` ➔ `##` ➔ `###` (aligned with `MD001`).
3. **No Trailing Punctuation**: Headings must not end with punctuation marks such as periods, colons, or semicolons (aligned with `MD026`).
4. **Spacing**: Headings must be surrounded by a single blank line before and after to ensure proper rendering and compliance (aligned with `MD022`).
5. **ATX Style Headings**: Always use ATX-style headings (using `#` symbols) instead of Setext style (underlining with `=` or `-`). Ensure there is exactly one space between the `#` characters and the heading text (aligned with `MD018` and `MD019`).

---

## 2. Lists & Markers

Lists should be structured consistently to prevent rendering glitches:

- **Unordered Lists**: Use hyphens (`-`) exclusively for all unordered list items (aligned with `MD004`). Avoid using asterisks (`*`) or plus signs (`+`).
- **Ordered Lists**: Use sequential numbers (`1.`, `2.`, `3.`) for ordered lists instead of repeating `1.` (aligned with `MD029`).
- **Surrounding Space**: Unordered and ordered lists must be separated from adjacent paragraphs by a blank line (aligned with `MD032`).
- **Indentation**: Nest list items using 2 or 4 spaces consistently. Avoid mixing tabs and spaces or using irregular spacing (aligned with `MD005`, `MD007`).

---

## 3. Code Blocks & Commands

Fenced code blocks are widely used for code examples, configurations, and commands:

- **Language Specifier**: Every fenced code block **MUST** specify a language immediately after the opening backticks (e.g., ````typescript`,````bash`, ````json`, ````markdown`,````mermaid`, ````text`) (aligned with `MD040`).
- **Command Copyability**: For command-line instructions, do not prefix commands with `$` or `>` (e.g., `pnpm install` instead of `$ pnpm install`) unless the block contains command output immediately below the command (aligned with `MD014`). This enables direct copy-pasting from documentation.
- **Surrounding Space**: Always separate fenced code blocks from adjacent text or headers with a blank line (aligned with `MD031`).

---

## 4. Callouts & Alerts

Standardize on GitHub-style markdown alert blocks for technical warnings, notes, or tips. This syntax is fully supported by modern markdown engines and IDE plugins:

```markdown
> [!NOTE]
> Useful information or background context that users should be aware of.

> [!TIP]
> Helpful advice, shortcuts, performance optimization tips, or best practices.

> [!IMPORTANT]
> Crucial information that is essential to complete a task or maintain system safety.

> [!WARNING]
> Critical warnings about potential bugs, breaking changes, or deprecations.

> [!CAUTION]
> Negative consequences or high-risk actions that could cause data loss or security issues.
```

Avoid using traditional bolded blockquotes like `> **Note**: ...` when an alert block is more appropriate.

---

## 5. Internal File Links

When referencing other files or documentation in the repository, follow these conventions:

- **Relative Paths**: Always use relative paths (e.g., `[ARCHITECTURE.md](../core/docs/ARCHITECTURE.md)`) for internal repository links instead of absolute GitHub URLs. This enables offline navigation in IDEs (like VS Code) and keeps links working when browsing branches or forks.
- **Descriptive Link Text**: Provide clear, descriptive text for the link. Do not surround link text with backticks as it breaks link formatting in some renderers.
  - **Correct**: Read the [Architecture Guide](../core/docs/ARCHITECTURE.md) for details.
  - **Incorrect**: Read the [`ARCHITECTURE.md`](../core/docs/ARCHITECTURE.md) for details.

---

## 6. Tables

Use standard GitHub Flavored Markdown (GFM) tables:

- **Headers**: Separate headers from rows with a delimiter row containing hyphens (`-`).
- **Alignment**: Align columns using colons (`:`) in the delimiter row:
  - Left-aligned: `:---`
  - Right-aligned: `---:`
  - Centered: `:---:`
- **Clean Structure**: Add a blank line before and after the table to ensure correct rendering.

```markdown
| Package | Role | Description |
| :--- | :---: | :--- |
| `core` | Reactive Engine | Core atoms, computeds, and effects |
| `jquery` | Adapter | DOM integration and bindings |
```

---

## 7. Markdownlint Configuration & Exceptions

The project configures custom exceptions in the root `.markdownlint.json` to balance strict linting with documentation needs. These rules are configured as follows:

```json
{
  "MD013": false,
  "MD024": {
    "siblings_only": true
  }
}
```

- **MD013 (Line Length)**: Disabled (`false`). Markdown files are allowed to have long lines of text to ensure seamless reading and editing in editors with soft-wrap enabled.
- **MD024 (Multiple Headings with the Same Content)**: Configured with `siblings_only: true`. Identical headings are permitted in the same document as long as they reside under different parent headers (e.g., multiple different `## Examples` sections under different major headings).
