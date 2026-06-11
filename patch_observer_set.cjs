const fs = require('fs');
let code = fs.readFileSync('packages/jquery/src/core/observer.ts', 'utf8');

code = code.replace(
  /const matchedElements: Element\[\] = \[\];[\s\S]*?(?=for \(const el of matchedElements\))/,
  `const matchedElements = new Set<Element>();

            for (const el of addedElements) {
              try {
                if (el.matches(record.selector)) {
                  matchedElements.add(el);
                }
                const children = el.querySelectorAll(record.selector);
                for (let i = 0; i < children.length; i++) {
                  const child = children[i];
                  if (child) matchedElements.add(child);
                }
              } catch (error) {
                console.error('Error querying or processing onNodeAdded:', error);
              }
            }

            `
);

fs.writeFileSync('packages/jquery/src/core/observer.ts', code);
