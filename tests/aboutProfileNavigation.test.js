const fs = require('fs');
const path = require('path');

describe('About and profile navigation', () => {
  const root = path.join(__dirname, '..');
  const navigation = fs.readFileSync(path.join(root, 'src/components/Navigation.tsx'), 'utf8');
  const profile = fs.readFileSync(path.join(root, 'src/screens/ProfileScreen.tsx'), 'utf8');
  const about = fs.readFileSync(path.join(root, 'src/screens/PublicInfoScreen.tsx'), 'utf8');
  const routes = fs.readFileSync(path.join(root, 'src/utils/routes.tsx'), 'utf8');
  const compatNavigation = fs.readFileSync(path.join(root, 'src/utils/compatNavigation.tsx'), 'utf8');

  test('does not render a duplicate public text-link footer', () => {
    expect(navigation).not.toContain('PublicNavigationFooter');
    expect(navigation).not.toContain('publicFooter');
  });

  test('exposes About from Profile and resolves it to the public canonical route', () => {
    expect(profile).toContain('label: "About YoVibe"');
    expect(profile).toContain('navigation.navigate("About")');
    expect(compatNavigation).toContain("'About': () => navigate('/about')");
    expect(routes).toContain("path: '/about'");
    expect(routes).not.toContain("path: '/contact'");
  });

  test('speaks to event organisers with tools that exist in YoVibe', () => {
    expect(about).toContain('BUILT FOR EVENT ORGANISERS');
    expect(about).toContain("title: 'Get instant payouts'");
    expect(about).toContain('ticket types, capacity, and branded ticket design');
    expect(about).toContain('Track ticket sales by type in real time');
    expect(about).toContain('Validate QR tickets');
    expect(about).toContain('promotion QR code');
    expect(about).not.toContain('THE YO VIBE');
    expect(about).not.toContain('Show up for something good.');
  });
});
