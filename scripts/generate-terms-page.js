const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const projectRoot = path.join(__dirname, '..');
const sourcePath = path.join(projectRoot, 'src', 'screens', 'auth', 'TermsAndConditionsScreen.tsx');
const outputPath = path.join(projectRoot, 'public', 'terms.html');
const sourceText = fs.readFileSync(sourcePath, 'utf8');
const sourceFile = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const normalizeText = (value) => value.replace(/\s+/g, ' ').trim();

function isTextElement(node) {
  return ts.isJsxElement(node)
    && ts.isIdentifier(node.openingElement.tagName)
    && node.openingElement.tagName.text === 'Text';
}

function textFromJsx(node) {
  return node.children.map((child) => {
    if (ts.isJsxText(child)) return child.getText(sourceFile);
    if (ts.isJsxElement(child)) return textFromJsx(child);
    if (ts.isJsxExpression(child) && child.expression) {
      if (ts.isStringLiteral(child.expression) || ts.isNoSubstitutionTemplateLiteral(child.expression)) {
        return child.expression.text;
      }
      if (child.expression.getText(sourceFile).includes('publicSiteUrl')) return 'https://yovibe.net';
    }
    return '';
  }).join('');
}

function styleName(node) {
  const styleAttribute = node.openingElement.attributes.properties.find((attribute) =>
    ts.isJsxAttribute(attribute) && attribute.name.text === 'style'
  );
  return styleAttribute?.initializer?.getText(sourceFile) || '';
}

const blocks = [];
function visit(node, insideText = false) {
  if (isTextElement(node)) {
    if (!insideText) {
      const text = normalizeText(textFromJsx(node));
      if (text) blocks.push({ text, style: styleName(node) });
    }
    return;
  }
  ts.forEachChild(node, (child) => visit(child, insideText));
}
visit(sourceFile);

if (!blocks.some(({ text }) => text.startsWith('1. INTRODUCTION AND ACCEPTANCE OF TERMS'))
  || !blocks.some(({ text }) => text.startsWith('25. CONTACT INFORMATION'))) {
  throw new Error('Could not extract the complete in-app Terms and Conditions screen.');
}

const legalBlocks = blocks
  .filter(({ style }) => !style.includes('headerTitle') && !style.includes('agreeButtonText'))
  .map(({ text, style }) => {
    if (style.includes('styles.title')) return `<h1>${escapeHtml(text)}</h1>`;
    if (style.includes('lastUpdated')) return `<p class="updated">${escapeHtml(text)}</p>`;
    if (style.includes('sectionTitle')) return `<h2>${escapeHtml(text)}</h2>`;
    return `<p>${escapeHtml(text)}</p>`;
  })
  .join('\n      ');

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="YoVibe Terms of Service for using the event discovery and ticketing platform.">
    <meta name="robots" content="index,follow">
    <link rel="canonical" href="https://yovibe.net/terms">
    <title>Terms of Service | YoVibe</title>
    <style>
      :root { color-scheme: light; font-family: Arial, Helvetica, sans-serif; color: #171923; background: #f7f7fb; }
      body { margin: 0; background: #f7f7fb; line-height: 1.6; }
      header { background: #15151d; color: #fff; padding: 22px; }
      header div, main, footer { max-width: 900px; margin: 0 auto; }
      header a { color: #fff; text-decoration: none; font-weight: 800; font-size: 21px; }
      main { background: #fff; margin-top: 32px; margin-bottom: 32px; padding: 40px; border-radius: 14px; box-shadow: 0 4px 20px rgba(20, 20, 32, .08); }
      h1, h2 { color: #11131a; line-height: 1.25; }
      h1 { margin-top: 0; font-size: 34px; }
      h2 { margin-top: 38px; font-size: 22px; }
      a { color: #b42318; }
      p { margin: 0 0 16px; }
      .updated { color: #5d6472; }
      footer { color: #5d6472; font-size: 14px; padding: 0 22px 32px; }
      footer a { margin-right: 16px; }
      @media (max-width: 640px) { main { margin: 16px; padding: 24px; } header { padding: 18px 24px; } h1 { font-size: 29px; } }
    </style>
  </head>
  <body>
    <header><div><a href="/">YoVibe</a></div></header>
    <main>
      ${legalBlocks}
      <h2>Google Sign-In notice</h2>
      <p>If you use Google Sign-In, YoVibe uses the basic profile information Google provides to create and secure your account: your email address, display name, and profile photo when available. YoVibe does not request or use Gmail, Google Drive, Google Calendar, contacts, or other Google account content. YoVibe does not sell Google user data and does not use Google APIs to generate, alter, or distribute non-consensual intimate imagery. See the <a href="/privacy">Privacy Policy</a> for further information.</p>
    </main>
    <footer>
      <a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a>
    </footer>
  </body>
</html>
`;

fs.writeFileSync(outputPath, html, 'utf8');
console.log(`[generate-terms-page] Wrote ${blocks.length} visible in-app text blocks to public/terms.html.`);
