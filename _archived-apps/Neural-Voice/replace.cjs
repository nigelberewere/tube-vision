const fs = require('fs');

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace fuchsia with blue
  content = content.replace(/fuchsia/g, 'blue');
  // Replace violet with indigo
  content = content.replace(/violet/g, 'indigo');
  // Replace fuchsia RGB (217,70,239) with blue RGB (59,130,246)
  content = content.replace(/217,70,239/g, '59,130,246');
  // Replace violet RGB (139,92,246) with indigo RGB (99,102,241)
  content = content.replace(/139,92,246/g, '99,102,241');
  
  fs.writeFileSync(filePath, content);
}

replaceInFile('src/App.tsx');
replaceInFile('src/index.css');
console.log('Done');
