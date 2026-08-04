module.exports = {
  preset: '@react-native/jest-preset',
  moduleNameMapper: {
    '^lucide-react-native$':
      '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
    '^marked$': '<rootDir>/node_modules/marked/lib/marked.umd.js',
  },
};
