const { compile } = require('nexe')

compile({
  input: './build/app/app.js',
  targets: ['windows-x86-12.18.2'/*, 'macos-x64-v8.4.0', 'linux-x32'*/],
}).then(() => {
  console.log('success')
})