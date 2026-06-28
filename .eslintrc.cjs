module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    webextensions: true
  },
  extends: ['eslint:recommended', 'plugin:react/recommended', 'plugin:react/jsx-runtime'],
  plugins: ['react'],
  settings: {
    react: {
      pragma: 'h',
      version: '18.0'
    }
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true
    }
  },
  rules: {
    'no-console': 'off',
    'react/prop-types': 'off',
    'react/no-unknown-property': ['error', { ignore: ['class'] }]
  },
  overrides: [
    {
      files: ['scripts/**/*.mjs'],
      env: {
        browser: false,
        node: true
      }
    },
    {
      files: ['test/**/*.mjs'],
      env: {
        browser: false,
        node: true
      }
    }
  ]
};
