/** Правила проверки исходников на базе Expo; готовый экспорт исключён из анализа. */
const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');
module.exports = defineConfig([expo, { ignores: ['dist/**'] }]);
