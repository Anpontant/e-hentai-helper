module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    webextensions: true
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'script'
  },
  rules: {
    'no-console': 'off'
  },
  overrides: [
    {
      files: ['scripts/**/*.mjs'],
      env: {
        browser: false,
        node: true
      },
      parserOptions: {
        sourceType: 'module'
      }
    },
    {
      // UMD module shared by the content script and Node tests.
      files: ['addon/content/viewer-utils.js'],
      env: {
        browser: true,
        node: true
      }
    },
    {
      files: ['test/**/*.mjs'],
      env: {
        browser: false,
        node: true
      },
      parserOptions: {
        sourceType: 'module'
      }
    }
  ]
};
