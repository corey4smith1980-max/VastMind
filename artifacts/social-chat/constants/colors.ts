/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    text: '#18332f',
    tint: '#244b42',
    background: '#f5f2e9',
    foreground: '#18332f',
    card: '#fffdf7',
    cardForeground: '#18332f',
    primary: '#244b42',
    primaryForeground: '#fffdf7',
    secondary: '#e9eee2',
    secondaryForeground: '#244b42',
    muted: '#eeeae0',
    mutedForeground: '#78847a',
    accent: '#c8e66a',
    accentForeground: '#18332f',
    destructive: '#c75b4b',
    destructiveForeground: '#fffdf7',
    border: '#e3dfd3',
    input: '#e3dfd3',
    forest: '#18332f',
    deepForest: '#102720',
    lime: '#c8e66a',
    coral: '#d77c67',
    cream: '#f5f2e9',
    sand: '#e9e3d6',
    blue: '#7da9b5',
    gold: '#d5ac5b',
  },
  dark: {
    text: '#f4f0e6',
    tint: '#c8e66a',
    background: '#102720',
    foreground: '#f4f0e6',
    card: '#18332f',
    cardForeground: '#f4f0e6',
    primary: '#c8e66a',
    primaryForeground: '#18332f',
    secondary: '#29453d',
    secondaryForeground: '#f4f0e6',
    muted: '#29453d',
    mutedForeground: '#aab6a9',
    accent: '#c8e66a',
    accentForeground: '#18332f',
    destructive: '#d77c67',
    destructiveForeground: '#18332f',
    border: '#345148',
    input: '#345148',
    forest: '#18332f',
    deepForest: '#102720',
    lime: '#c8e66a',
    coral: '#e28b76',
    cream: '#f4f0e6',
    sand: '#29453d',
    blue: '#8bb6c1',
    gold: '#dfbb6b',
  },
  radius: 18,
};

export default colors;
