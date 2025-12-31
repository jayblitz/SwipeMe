const { withProjectBuildGradle } = require("expo/config-plugins");

const withBouncyCastleFix = (config) => {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language === "groovy") {
      const contents = config.modResults.contents;
      
      const exclusionCode = `
// Fix BouncyCastle duplicate class conflict between XMTP and Passkeys
configurations.all {
    exclude group: 'org.bouncycastle', module: 'bcprov-jdk15on'
}
`;
      
      if (!contents.includes("exclude group: 'org.bouncycastle', module: 'bcprov-jdk15on'")) {
        const allprojectsMatch = contents.match(/allprojects\s*\{[^}]*repositories\s*\{[^}]*\}/s);
        
        if (allprojectsMatch) {
          const insertPosition = contents.indexOf(allprojectsMatch[0]) + allprojectsMatch[0].length;
          config.modResults.contents = 
            contents.slice(0, insertPosition) + 
            exclusionCode + 
            contents.slice(insertPosition);
        } else {
          config.modResults.contents = contents + "\n" + exclusionCode;
        }
      }
    }
    return config;
  });
};

module.exports = withBouncyCastleFix;
