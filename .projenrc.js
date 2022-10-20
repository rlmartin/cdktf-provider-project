const { cdk } = require("projen");

const project = new cdk.JsiiProject({
  name: "@cdktf/provider-project",
  authorName: "HashiCorp",
  authorUrl: "https://hashicorp.com",
  repository: "https://github.com/hashicorp/cdktf-provider-project.git",
  authorOrganization: true,
  peerDeps: ["projen@^0.63.13"],
  deps: ["change-case", "fs-extra", "@types/fs-extra"],
  devDeps: ["glob"],
  bundledDeps: ["change-case", "fs-extra"],
  license: "MPL-2.0",
  defaultReleaseBranch: "main",
  releaseToNpm: true,
  minNodeVersion: "14.17.0",
  compileBeforeTest: true,
  mergify: false,
  scripts: {
    "eslint:fix": "eslint . --ext .ts --fix",
    "postinstall": "tsc --outDir ./lib",
  },
  prettier: true,
});

project.addFields({ publishConfig: { access: "public" } });
project.synth();
